import { Hono } from "hono";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
} from "drizzle-orm";
import { createAuth } from "../auth";
import { hashPassword } from "better-auth/crypto";
import { getDb, runBatch } from "../db";
import {
  account,
  category,
  entitlement,
  merchant,
  order,
  product,
  productFile,
  productImage,
  qrCode,
  session,
  settings,
  user,
} from "../db/schema";
import { qrKey, streamR2Object } from "../r2";
import { getMaxFileSizeBytes, getSeoSettings, getSiteSettings, getStripeSettings, MAX_FILE_SIZE_CAP_BYTES, MAX_FILE_SIZE_CAP_MB } from "../settings";
import { deliverCardOrder, markOrderPaid } from "../delivery";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

export const adminRoutes = new Hono<Vars>().basePath("/api/admin");

// --- platform settings ---

adminRoutes.get("/settings", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const maxFileSizeBytes = await getMaxFileSizeBytes(db);
  const site = await getSiteSettings(db);
  const seo = await getSeoSettings(db);
  return c.json({ maxFileSizeBytes, ...site, ...seo });
});

adminRoutes.put("/settings", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    maxFileSizeMB?: number;
    siteTitle?: string;
    contact?: string;
    allowIndex?: boolean;
  }>();
  const mb = body.maxFileSizeMB;
  if (
    typeof mb !== "number" ||
    !Number.isInteger(mb) ||
    mb < 1 ||
    mb * 1024 * 1024 > MAX_FILE_SIZE_CAP_BYTES
  )
    return c.json(
      { error: `附件大小上限需为 1-${MAX_FILE_SIZE_CAP_MB} 的整数（MB）` },
      400,
    );
  const siteTitle = body.siteTitle?.trim() ?? "";
  const contact = body.contact?.trim() ?? "";
  if (siteTitle.length > 100)
    return c.json({ error: "商城标题最长 100 字" }, 400);
  if (contact.length > 2000)
    return c.json({ error: "联系方式最长 2000 字" }, 400);
  const maxFileSizeBytes = mb * 1024 * 1024;
  await db
    .insert(settings)
    .values({
      key: "upload_limits",
      value: { maxFileSizeBytes },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { maxFileSizeBytes }, updatedAt: new Date() },
    });
  await db
    .insert(settings)
    .values({
      key: "site",
      value: { siteTitle, contact },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { siteTitle, contact }, updatedAt: new Date() },
    });
  const allowIndex = body.allowIndex !== false;
  await db
    .insert(settings)
    .values({ key: "seo", value: { allowIndex }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { allowIndex }, updatedAt: new Date() },
    });
  return c.json({
    maxFileSizeBytes,
    siteTitle: siteTitle || null,
    contact: contact || null,
    allowIndex,
  });
});

// --- stripe settings ---

adminRoutes.get("/settings/stripe", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const cfg = await getStripeSettings(db);
  // never send secrets back to the client — only whether they are saved
  return c.json({
    enabled: cfg.enabled,
    hasSecretKey: !!cfg.secretKey,
    hasWebhookSecret: !!cfg.webhookSecret,
  });
});

adminRoutes.put("/settings/stripe", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    secretKey?: string;
    webhookSecret?: string;
    enabled?: boolean;
  }>();
  const cfg = await getStripeSettings(db);
  const secretKey =
    typeof body.secretKey === "string" && body.secretKey.trim()
      ? body.secretKey.trim()
      : cfg.secretKey;
  const webhookSecret =
    typeof body.webhookSecret === "string" && body.webhookSecret.trim()
      ? body.webhookSecret.trim()
      : cfg.webhookSecret;
  if (body.enabled && !secretKey)
    return c.json({ error: "请先保存 Stripe Secret Key" }, 400);
  const value = {
    secretKey: secretKey ?? "",
    webhookSecret: webhookSecret ?? "",
    enabled: body.enabled === true,
  };
  await db
    .insert(settings)
    .values({ key: "stripe", value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
  return c.json({
    enabled: value.enabled && !!secretKey,
    hasSecretKey: !!secretKey,
    hasWebhookSecret: !!webhookSecret,
  });
});

// --- merchant management ---

adminRoutes.get("/merchants", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: merchant.id,
      displayName: merchant.displayName,
      status: merchant.status,
      createdAt: merchant.createdAt,
      userEmail: user.email,
      userName: user.name,
    })
    .from(merchant)
    .innerJoin(user, eq(merchant.userId, user.id))
    .orderBy(desc(merchant.createdAt));
  return c.json(rows);
});

// list users for the "add merchant" picker & user management (searchable)
adminRoutes.get("/users", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const conditions = [isNull(user.deletedAt)];
  if (q) {
    conditions.push(or(like(user.email, `%${q}%`), like(user.name, `%${q}%`))!);
  }
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      merchantId: merchant.id,
      merchantName: merchant.displayName,
      merchantStatus: merchant.status,
    })
    .from(user)
    .leftJoin(merchant, eq(merchant.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(user.createdAt));
  return c.json(rows);
});

// create a user (admin manually registers an account)
adminRoutes.post("/users", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    email?: string;
    name?: string;
    password?: string;
    role?: "user" | "merchant" | "admin";
  }>();
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.json({ error: "邮箱格式不正确" }, 400);
  if (!body.password || body.password.length < 8)
    return c.json({ error: "密码至少 8 位" }, 400);
  const auth = createAuth(db, c.env);
  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password: body.password,
        name: body.name?.trim() || email.split("@")[0],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/user already exists|USER_ALREADY_EXISTS/i.test(msg))
      return c.json({ error: "该邮箱已注册" }, 400);
    return c.json({ error: msg }, 500);
  }
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (body.role && body.role !== "user") {
    await db
      .update(user)
      .set({ role: body.role })
      .where(eq(user.id, row.id));
  }
  return c.json({ ...row, role: body.role ?? row.role }, 201);
});

// edit user: name / role / password reset
adminRoutes.patch("/users/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    name?: string;
    role?: "user" | "merchant" | "admin";
    password?: string;
  }>();
  const [target] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, c.req.param("id")), isNull(user.deletedAt)))
    .limit(1);
  if (!target) return c.json({ error: "not found" }, 404);
  if (body.role && body.role === "user" && target.id === u.id)
    return c.json({ error: "不能修改自己的角色" }, 400);
  if (body.password !== undefined && body.password !== "" && body.password.length < 8)
    return c.json({ error: "密码至少 8 位" }, 400);

  if (body.name !== undefined && body.name.trim()) {
    await db
      .update(user)
      .set({ name: body.name.trim(), updatedAt: new Date() })
      .where(eq(user.id, target.id));
  }
  if (body.role) {
    await db
      .update(user)
      .set({ role: body.role, updatedAt: new Date() })
      .where(eq(user.id, target.id));
  }
  if (body.password) {
    const hashed = await hashPassword(body.password);
    await db
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(account.userId, target.id));
    await db.delete(session).where(eq(session.userId, target.id));
  }
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.id, target.id))
    .limit(1);
  return c.json(row);
});

// delete user: anonymize (order records kept), revoke sessions, suspend merchant
adminRoutes.delete("/users/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  if (c.req.param("id") === u.id)
    return c.json({ error: "不能删除自己" }, 400);
  const db = getDb(c.env.DB);
  const [target] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, c.req.param("id")), isNull(user.deletedAt)))
    .limit(1);
  if (!target) return c.json({ error: "not found" }, 404);
  await runBatch(db, (tx) => [
    tx
      .update(user)
      .set({
        name: "已注销用户",
        email: `deleted-${target.id}@invalid`,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, target.id)),
    tx.delete(session).where(eq(session.userId, target.id)),
    tx.delete(account).where(eq(account.userId, target.id)),
    tx
      .update(merchant)
      .set({ status: "suspended" })
      .where(and(eq(merchant.userId, target.id), eq(merchant.status, "pending"))),
  ]);
  return c.json({ ok: true });
});

adminRoutes.post("/merchants", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    userId?: string;
    displayName?: string;
    status?: "pending" | "active" | "suspended";
  }>();
  if (!body.userId) return c.json({ error: "userId required" }, 400);
  const [target] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, body.userId), isNull(user.deletedAt)))
    .limit(1);
  if (!target) return c.json({ error: "user not found" }, 404);
  const [existing] = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, target.id))
    .limit(1);
  if (existing) return c.json({ error: "该用户已是商户" }, 400);
  const [row] = await db
    .insert(merchant)
    .values({
      id: crypto.randomUUID(),
      userId: target.id,
      displayName: body.displayName?.trim() || target.name,
      status: body.status ?? "active",
    })
    .returning();
  if (target.role === "user") {
    await db
      .update(user)
      .set({ role: "merchant", updatedAt: new Date() })
      .where(eq(user.id, target.id));
  }
  return c.json(row, 201);
});

adminRoutes.patch("/merchants/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{
    status?: "pending" | "active" | "suspended";
    displayName?: string;
  }>();
  const [row] = await db
    .update(merchant)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.displayName !== undefined && body.displayName.trim()
        ? { displayName: body.displayName.trim() }
        : {}),
    })
    .where(eq(merchant.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  if (body.status === "active") {
    const [owner] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, row.userId))
      .limit(1);
    if (owner?.role === "user") {
      await db
        .update(user)
        .set({ role: "merchant", updatedAt: new Date() })
        .where(eq(user.id, row.userId));
    }
  }
  return c.json(row);
});

adminRoutes.delete("/merchants/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [m] = await db
    .select()
    .from(merchant)
    .where(eq(merchant.id, c.req.param("id")))
    .limit(1);
  if (!m) return c.json({ error: "not found" }, 404);
  const [ord] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.merchantId, m.id))
    .limit(1);
  if (ord)
    return c.json(
      { error: "该商户已有订单记录，无法删除，请使用停用" },
      400,
    );
  const products = await db
    .select({ id: product.id })
    .from(product)
    .where(eq(product.merchantId, m.id));
  const productIds = products.map((p) => p.id);
  const files = await db
    .select({ objectKey: productFile.objectKey })
    .from(productFile)
    .where(
      productIds.length
        ? inArray(productFile.productId, productIds)
        : undefined,
    );
  const images = await db
    .select({ objectKey: productImage.objectKey })
    .from(productImage)
    .where(
      productIds.length
        ? inArray(productImage.productId, productIds)
        : undefined,
    );
  if (productIds.length) {
    await runBatch(db, (tx) => [
      tx.delete(productFile).where(inArray(productFile.productId, productIds)),
      tx.delete(productImage).where(inArray(productImage.productId, productIds)),
      tx.delete(product).where(inArray(product.id, productIds)),
      tx.delete(category).where(eq(category.merchantId, m.id)),
      tx.delete(merchant).where(eq(merchant.id, m.id)),
    ]);
  } else {
    await runBatch(db, (tx) => [
      tx.delete(category).where(eq(category.merchantId, m.id)),
      tx.delete(merchant).where(eq(merchant.id, m.id)),
    ]);
  }
  await db
    .update(user)
    .set({ role: "user", updatedAt: new Date() })
    .where(and(eq(user.id, m.userId), eq(user.role, "merchant")));
  await Promise.all(
    [...files, ...images].map((f) => c.env.R2.delete(f.objectKey)),
  );
  return c.json({ ok: true });
});

// --- order confirmation & manual shipping ---

adminRoutes.get("/orders", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const status = c.req.query("status");
  const rows = await db
    .select({
      order: order,
      buyerEmail: user.email,
      buyerName: user.name,
    })
    .from(order)
    .innerJoin(user, eq(order.userId, user.id))
    .where(status ? eq(order.status, status as never) : undefined)
    .orderBy(desc(order.createdAt))
    .limit(200);
  return c.json(rows);
});

adminRoutes.post("/orders/:id/confirm-paid", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(eq(order.id, c.req.param("id")))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  if (o.status !== "pending_payment")
    return c.json({ error: `order is ${o.status}` }, 400);
  const result = await markOrderPaid(db, o.id);
  if (!result) return c.json({ error: "not found" }, 404);
  if (result.cardDelivered)
    return c.json({ order: result.order, cardDelivered: true });
  return c.json(result.order);
});

adminRoutes.post("/orders/:id/deliver", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [o] = await db
    .select()
    .from(order)
    .where(eq(order.id, c.req.param("id")))
    .limit(1);
  if (!o) return c.json({ error: "not found" }, 404);
  if (o.status !== "paid")
    return c.json({ error: "confirm payment before shipping" }, 400);
  const [p] = await db
    .select({ type: product.type })
    .from(product)
    .where(eq(product.id, o.productId))
    .limit(1);
  if (p?.type === "card") {
    const card = await deliverCardOrder(db, o);
    if (!card) return c.json({ error: "无可用卡密，请先补货后重试" }, 400);
    const [fresh] = await db
      .select()
      .from(order)
      .where(eq(order.id, o.id))
      .limit(1);
    return c.json(fresh);
  }
  await db
    .insert(entitlement)
    .values({
      id: crypto.randomUUID(),
      userId: o.userId,
      productId: o.productId,
      orderId: o.id,
    })
    .onConflictDoNothing();
  const [row] = await db
    .update(order)
    .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
    .where(eq(order.id, o.id))
    .returning();
  return c.json(row);
});

adminRoutes.post("/orders/:id/cancel", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [row] = await db
    .update(order)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(order.id, c.req.param("id")), eq(order.status, "pending_payment")))
    .returning();
  if (!row) return c.json({ error: "not found or not cancellable" }, 400);
  return c.json(row);
});

// --- payment QR code management ---

adminRoutes.get("/qr-codes", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(qrCode).orderBy(desc(qrCode.createdAt));
  return c.json(rows);
});

adminRoutes.post("/qr-codes", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const form = await c.req.formData();
  const file = form.get("file");
  const label = (form.get("label") as string) || "收款码";
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  const key = qrKey(file.name);
  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/png" },
  });
  const [row] = await db
    .insert(qrCode)
    .values({ id: crypto.randomUUID(), label, objectKey: key })
    .returning();
  return c.json(row, 201);
});

adminRoutes.patch("/qr-codes/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ enabled?: boolean; label?: string }>();
  const [row] = await db
    .update(qrCode)
    .set({
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
    })
    .where(eq(qrCode.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

adminRoutes.delete("/qr-codes/:id", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [row] = await db
    .delete(qrCode)
    .where(eq(qrCode.id, c.req.param("id")))
    .returning();
  if (row) await c.env.R2.delete(row.objectKey);
  return c.json({ ok: true });
});

// QR image preview for the admin panel
adminRoutes.get("/qr-codes/:id/image", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const [row] = await db
    .select()
    .from(qrCode)
    .where(eq(qrCode.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json({ error: "not found" }, 404);
  const obj = await c.env.R2.get(row.objectKey);
  if (!obj) return c.json({ error: "object missing" }, 404);
  return streamR2Object(obj);
});

// --- product oversight (admin manages on behalf of merchants) ---

adminRoutes.get("/products", async (c) => {
  const u = c.get("user");
  if (u?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ product: product, merchantName: merchant.displayName })
    .from(product)
    .innerJoin(merchant, eq(product.merchantId, merchant.id))
    .orderBy(desc(product.createdAt));
  return c.json(rows);
});
