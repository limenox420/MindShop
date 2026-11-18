import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { cardItem, entitlement, order, product, productFile } from "../db/schema";
import { getAvailablePaymentProviders, getAvailablePaymentProvider } from "../payments";
import { streamR2Object } from "../r2";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

function newOrderNo() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `MS${t}${r}`;
}

export const orderRoutes = new Hono<Vars>().basePath("/api");

// list available payment providers (public info for the checkout UI)
orderRoutes.get("/payments/providers", async (c) => {
  const db = getDb(c.env.DB);
  const providers = await getAvailablePaymentProviders(db);
  return c.json(
    providers.map((p) => ({ id: p.id, name: p.name })),
  );
});

// serve an admin-uploaded QR code image (login required)
orderRoutes.get("/files/qr/*", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const key = decodeURIComponent(c.req.path.split("/files/qr/")[1] ?? "");
  if (!key) return c.json({ error: "bad key" }, 400);
  const obj = await c.env.R2.get(key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return streamR2Object(obj);
});

// create a new order for a product
orderRoutes.post("/orders", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const body = await c.req.json<{ productId?: string; provider?: string }>();
  if (!body.productId) return c.json({ error: "productId required" }, 400);

  const db = getDb(c.env.DB);
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, body.productId), eq(product.status, "on_sale")))
    .limit(1);
  if (!p) return c.json({ error: "product not on sale" }, 404);

  if (p.type === "card") {
    const [{ value: stock }] = await db
      .select({ value: count() })
      .from(cardItem)
      .where(
        and(eq(cardItem.productId, p.id), eq(cardItem.status, "unsold")),
      );
    if (stock === 0) return c.json({ error: "商品库存不足" }, 400);
  }

  const providerId = body.provider ?? "manual-qr";
  // admin-set per-product payment channel: null = buyer chooses, otherwise locked
  const expectedProvider = p.payMethod === "stripe" ? "stripe" : "manual-qr";
  if (p.payMethod && providerId !== expectedProvider)
    return c.json({ error: "该商品仅支持指定支付方式" }, 400);
  const provider = await getAvailablePaymentProvider(db, providerId);
  if (!provider) return c.json({ error: "unknown provider" }, 400);

  const orderNo = newOrderNo();
  const [created] = await db
    .insert(order)
    .values({
      id: crypto.randomUUID(),
      orderNo,
      userId: u.id,
      merchantId: p.merchantId,
      productId: p.id,
      productTitle: p.title,
      amountCents: p.priceCents,
      currency: p.currency,
      provider: providerId,
    })
    .returning();

  try {
    const result = await provider.createPayment(
      { db, r2: c.env.R2, appUrl: c.env.APP_URL },
      {
        id: created.id,
        orderNo: created.orderNo,
        title: p.title,
        amountCents: created.amountCents,
        currency: created.currency,
      },
    );
    const [updated] = await db
      .update(order)
      .set({ providerData: result.providerData, updatedAt: new Date() })
      .where(eq(order.id, created.id))
      .returning();
    return c.json({ order: updated, display: result.display }, 201);
  } catch (e) {
    await db
      .update(order)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(order.id, created.id));
    const msg = e instanceof Error ? e.message : "payment setup failed";
    return c.json({ error: msg }, 400);
  }
});

// my orders
orderRoutes.get("/orders", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(order)
    .where(eq(order.userId, u.id))
    .orderBy(desc(order.createdAt))
    .limit(100);
  return c.json(rows);
});

orderRoutes.get("/orders/:id", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, c.req.param("id")), eq(order.userId, u.id)))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  return c.json(o);
});

// card-key content of a delivered card-type order (owner only)
orderRoutes.get("/orders/:id/card", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, c.req.param("id")), eq(order.userId, u.id)))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  if (o.status !== "delivered" && o.status !== "completed")
    return c.json({ error: "order not delivered yet" }, 400);
  const [card] = await db
    .select()
    .from(cardItem)
    .where(eq(cardItem.orderId, o.id))
    .limit(1);
  if (!card) return c.json({ error: "no card assigned" }, 404);
  return c.json({ content: card.content, soldAt: card.soldAt });
});

// (re)create the Stripe checkout session for a pending stripe order
orderRoutes.post("/orders/:id/checkout", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, c.req.param("id")), eq(order.userId, u.id)))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  if (o.status !== "pending_payment")
    return c.json({ error: "order is not pending payment" }, 400);
  const provider = await getAvailablePaymentProvider(db, o.provider);
  if (!provider) return c.json({ error: "unknown provider" }, 400);
  try {
    const result = await provider.createPayment(
      { db, r2: c.env.R2, appUrl: c.env.APP_URL },
      {
        id: o.id,
        orderNo: o.orderNo,
        title: o.productTitle,
        amountCents: o.amountCents,
        currency: o.currency,
      },
    );
    await db
      .update(order)
      .set({ providerData: result.providerData, updatedAt: new Date() })
      .where(eq(order.id, o.id));
    return c.json({ display: result.display });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "payment setup failed";
    return c.json({ error: msg }, 400);
  }
});

// buyer cancels a pending order
orderRoutes.post("/orders/:id/cancel", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, c.req.param("id")), eq(order.userId, u.id)))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  if (o.status !== "pending_payment")
    return c.json({ error: "only pending orders can be cancelled" }, 400);
  await db
    .update(order)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(order.id, o.id));
  return c.json({ ok: true });
});

// products the user owns (delivered entitlements)
orderRoutes.get("/my/products", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      productId: entitlement.productId,
      orderId: entitlement.orderId,
      grantedAt: entitlement.grantedAt,
      title: product.title,
      merchantId: product.merchantId,
    })
    .from(entitlement)
    .innerJoin(product, eq(entitlement.productId, product.id))
    .where(eq(entitlement.userId, u.id))
    .orderBy(desc(entitlement.grantedAt));
  return c.json(rows);
});

// download list for an owned product
orderRoutes.get("/my/products/:productId/files", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [ent] = await db
    .select()
    .from(entitlement)
    .where(
      and(
        eq(entitlement.userId, u.id),
        eq(entitlement.productId, c.req.param("productId")),
      ),
    )
    .limit(1);
  if (!ent) return c.json({ error: "not entitled" }, 403);
  const files = await db
    .select()
    .from(productFile)
    .where(eq(productFile.productId, ent.productId));
  return c.json(files);
});

// guarded download stream
orderRoutes.get("/files/download/:fileId", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [f] = await db
    .select()
    .from(productFile)
    .where(eq(productFile.id, c.req.param("fileId")))
    .limit(1);
  if (!f) return c.json({ error: "not found" }, 404);
  const [ent] = await db
    .select()
    .from(entitlement)
    .where(
      and(
        eq(entitlement.userId, u.id),
        eq(entitlement.productId, f.productId),
      ),
    )
    .limit(1);
  if (!ent) return c.json({ error: "not entitled" }, 403);
  const obj = await c.env.R2.get(f.objectKey);
  if (!obj) return c.json({ error: "object missing" }, 404);
  return streamR2Object(obj, {
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
  });
});
