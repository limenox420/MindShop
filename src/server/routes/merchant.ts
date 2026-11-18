import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, runBatch } from "../db";
import { cardItem, category, merchant, order, product, productFile, productImage } from "../db/schema";
import { goodsKey, imageKey, streamR2Object } from "../r2";
import { fmtLimit, getMaxFileSizeBytes } from "../settings";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

/**
 * Routes under /api/merchant/... are usable by the owning merchant (role
 * merchant, status active) OR by an admin acting on behalf of the merchant
 * (admin passes ?merchantId= or path merchantId).
 */
async function resolveMerchant(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: string,
  requestedMerchantId?: string,
) {
  if (role === "admin" && requestedMerchantId) {
    const [m] = await db
      .select()
      .from(merchant)
      .where(eq(merchant.id, requestedMerchantId))
      .limit(1);
    return m ?? null;
  }
  const [m] = await db
    .select()
    .from(merchant)
    .where(and(eq(merchant.userId, userId), eq(merchant.status, "active")))
    .limit(1);
  return m ?? null;
}

export const merchantRoutes = new Hono<Vars>().basePath("/api");

// apply to become a merchant (any logged-in user)
merchantRoutes.post("/merchant/apply", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ displayName?: string }>();
  const [existing] = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, u.id))
    .limit(1);
  if (existing) return c.json({ merchant: existing });
  const [m] = await db
    .insert(merchant)
    .values({
      id: crypto.randomUUID(),
      userId: u.id,
      displayName: body.displayName?.trim() || u.name || "新商户",
      status: "pending",
    })
    .returning();
  return c.json({ merchant: m }, 201);
});

merchantRoutes.get("/merchant/me", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [m] = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, u.id))
    .limit(1);
  return c.json(m ?? null);
});

// --- categories ---

merchantRoutes.get("/merchants/:merchantId/categories", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const rows = await db
    .select()
    .from(category)
    .where(eq(category.merchantId, m.id))
    .orderBy(asc(category.sortOrder));
  return c.json(rows);
});

merchantRoutes.post("/merchants/:merchantId/categories", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{ name?: string; sortOrder?: number }>();
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const [row] = await db
    .insert(category)
    .values({
      id: crypto.randomUUID(),
      merchantId: m.id,
      name: body.name.trim(),
      sortOrder: body.sortOrder ?? 0,
    })
    .returning();
  return c.json(row, 201);
});

merchantRoutes.patch("/merchants/:merchantId/categories/:id", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{ name?: string; sortOrder?: number }>();
  const [row] = await db
    .update(category)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    })
    .where(
      and(eq(category.id, c.req.param("id")), eq(category.merchantId, m.id)),
    )
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

merchantRoutes.delete("/merchants/:merchantId/categories/:id", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  await db
    .delete(category)
    .where(
      and(eq(category.id, c.req.param("id")), eq(category.merchantId, m.id)),
    );
  return c.json({ ok: true });
});

// --- products ---

merchantRoutes.get("/merchants/:merchantId/products", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const rows = await db
    .select()
    .from(product)
    .where(eq(product.merchantId, m.id))
    .orderBy(desc(product.createdAt));
  return c.json(rows);
});

merchantRoutes.post("/merchants/:merchantId/products", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{
    title?: string;
    description?: string;
    priceCents?: number;
    currency?: string;
    categoryId?: string | null;
    type?: "file" | "card";
  }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  if (body.categoryId) {
    const [cat] = await db
      .select()
      .from(category)
      .where(
        and(eq(category.id, body.categoryId), eq(category.merchantId, m.id)),
      )
      .limit(1);
    if (!cat) return c.json({ error: "invalid category" }, 400);
  }
  const [row] = await db
    .insert(product)
    .values({
      id: crypto.randomUUID(),
      merchantId: m.id,
      categoryId: body.categoryId ?? null,
      title: body.title.trim(),
      description: body.description ?? "",
      priceCents: Math.max(0, Math.round(body.priceCents ?? 0)),
      currency: body.currency ?? "CNY",
      type: body.type === "card" ? "card" : "file",
      status: "draft",
    })
    .returning();
  return c.json(row, 201);
});

merchantRoutes.patch("/merchants/:merchantId/products/:id", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json<{
    title?: string;
    description?: string;
    priceCents?: number;
    categoryId?: string | null;
    status?: "draft" | "on_sale" | "off_sale";
    payMethod?: "qr" | "stripe" | null;
  }>();
  const [current] = await db
    .select({ type: product.type })
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (body.status === "on_sale") {
    if (!current) return c.json({ error: "not found" }, 404);
    if (current.type === "card") {
      const [{ value: cards }] = await db
        .select({ value: count() })
        .from(cardItem)
        .where(
          and(
            eq(cardItem.productId, c.req.param("id")),
            eq(cardItem.status, "unsold"),
          ),
        );
      if (cards === 0)
        return c.json({ error: "卡密商品上架前需至少导入一条卡密" }, 400);
    } else {
      const files = await db
        .select({ id: productFile.id })
        .from(productFile)
        .where(eq(productFile.productId, c.req.param("id")))
        .limit(1);
      if (files.length === 0)
        return c.json({ error: "cannot put on sale without at least one file" }, 400);
    }
  }
  const [row] = await db
    .update(product)
    .set({
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.priceCents !== undefined
        ? { priceCents: Math.max(0, Math.round(body.priceCents)) }
        : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      // payment channel is an admin-only decision; merchants cannot set it
      ...(body.payMethod !== undefined && u.role === "admin"
        ? { payMethod: body.payMethod }
        : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

merchantRoutes.delete("/merchants/:merchantId/products/:id", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)))
    .limit(1);
  if (!p) return c.json({ error: "not found" }, 404);
  const [ord] = await db
    .select({ id: order.id })
    .from(order)
    .where(eq(order.productId, p.id))
    .limit(1);
  if (ord)
    return c.json(
      { error: "商品已有订单记录，无法删除，可改为下架" },
      400,
    );
  const files = await db
    .select({ objectKey: productFile.objectKey })
    .from(productFile)
    .where(eq(productFile.productId, p.id));
  const images = await db
    .select({ objectKey: productImage.objectKey })
    .from(productImage)
    .where(eq(productImage.productId, p.id));
  await runBatch(db, (tx) => [
    tx.delete(productFile).where(eq(productFile.productId, p.id)),
    tx.delete(productImage).where(eq(productImage.productId, p.id)),
    tx.delete(product).where(eq(product.id, p.id)),
  ]);
  await Promise.all(
    [...files, ...images].map((f) => c.env.R2.delete(f.objectKey)),
  );
  return c.json({ ok: true });
});

// upload a goods file to R2 for a product
merchantRoutes.post("/merchants/:merchantId/products/:id/files", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select()
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (!p) return c.json({ error: "product not found" }, 404);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);

  const maxBytes = await getMaxFileSizeBytes(db);
  if (file.size > maxBytes)
    return c.json({ error: `文件大小不能超过 ${fmtLimit(maxBytes)}` }, 400);

  const key = goodsKey(m.id, p.id, file.name);
  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const [row] = await db
    .insert(productFile)
    .values({
      id: crypto.randomUUID(),
      productId: p.id,
      objectKey: key,
      fileName: file.name,
      sizeBytes: file.size,
      contentType: file.type || "application/octet-stream",
    })
    .returning();
  return c.json(row, 201);
});

// --- multipart upload for large files (Workers body limit is ~100MB, so
// files bigger than the threshold are uploaded in parts and assembled in R2) ---

merchantRoutes.post(
  "/merchants/:merchantId/products/:id/files/init",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [p] = await db
      .select({ id: product.id })
      .from(product)
      .where(
        and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
      )
      .limit(1);
    if (!p) return c.json({ error: "product not found" }, 404);

    const body = await c.req.json<{
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
    }>();
    if (!body.fileName?.trim()) return c.json({ error: "file required" }, 400);
    if (typeof body.sizeBytes !== "number" || body.sizeBytes <= 0)
      return c.json({ error: "size required" }, 400);
    const maxBytes = await getMaxFileSizeBytes(db);
    if (body.sizeBytes > maxBytes)
      return c.json({ error: `文件大小不能超过 ${fmtLimit(maxBytes)}` }, 400);

    const key = goodsKey(m.id, p.id, body.fileName.trim());
    const mpu = await c.env.R2.createMultipartUpload(key, {
      httpMetadata: {
        contentType: body.contentType || "application/octet-stream",
      },
    });
    return c.json({ key: mpu.key, uploadId: mpu.uploadId }, 201);
  },
);

merchantRoutes.put(
  "/merchants/:merchantId/products/:id/files/part",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [p] = await db
      .select({ id: product.id })
      .from(product)
      .where(
        and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
      )
      .limit(1);
    if (!p) return c.json({ error: "product not found" }, 404);

    const key = c.req.query("key");
    const uploadId = c.req.query("uploadId");
    const partNumber = Number(c.req.query("partNumber"));
    if (!key || !uploadId) return c.json({ error: "key and uploadId required" }, 400);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000)
      return c.json({ error: "invalid partNumber" }, 400);
    if (!key.startsWith(`goods/${m.id}/${p.id}/`))
      return c.json({ error: "forbidden" }, 403);
    if (!c.req.raw.body) return c.json({ error: "body required" }, 400);

    const mpu = c.env.R2.resumeMultipartUpload(key, uploadId);
    try {
      const part = await mpu.uploadPart(partNumber, c.req.raw.body);
      return c.json({ partNumber, etag: part.etag });
    } catch {
      return c.json({ error: "invalid multipart upload" }, 400);
    }
  },
);

merchantRoutes.post(
  "/merchants/:merchantId/products/:id/files/complete",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [p] = await db
      .select({ id: product.id })
      .from(product)
      .where(
        and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
      )
      .limit(1);
    if (!p) return c.json({ error: "product not found" }, 404);

    const body = await c.req.json<{
      fileName?: string;
      contentType?: string;
      key?: string;
      uploadId?: string;
      parts?: { partNumber: number; etag: string }[];
    }>();
    const { key, uploadId } = body;
    if (!key || !uploadId || !body.fileName?.trim())
      return c.json({ error: "key, uploadId and fileName required" }, 400);
    if (!key.startsWith(`goods/${m.id}/${p.id}/`))
      return c.json({ error: "forbidden" }, 403);
    const parts = (body.parts ?? [])
      .filter(
        (x) =>
          Number.isInteger(x.partNumber) &&
          x.partNumber >= 1 &&
          typeof x.etag === "string",
      )
      .sort((a, b) => a.partNumber - b.partNumber);
    if (parts.length === 0)
      return c.json({ error: "parts required" }, 400);

    const mpu = c.env.R2.resumeMultipartUpload(key, uploadId);
    try {
      const obj = await mpu.complete(parts);
      const [row] = await db
        .insert(productFile)
        .values({
          id: crypto.randomUUID(),
          productId: p.id,
          objectKey: key,
          fileName: body.fileName.trim(),
          sizeBytes: obj.size,
          contentType: body.contentType || "application/octet-stream",
        })
        .returning();
      return c.json(row, 201);
    } catch {
      return c.json({ error: "invalid multipart upload" }, 400);
    }
  },
);

merchantRoutes.post(
  "/merchants/:merchantId/products/:id/files/abort",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const body = await c.req.json<{ key?: string; uploadId?: string }>();
    if (!body.key || !body.uploadId)
      return c.json({ error: "key and uploadId required" }, 400);
    if (!body.key.startsWith(`goods/${m.id}/${c.req.param("id")}/`))
      return c.json({ error: "forbidden" }, 403);
    try {
      const mpu = c.env.R2.resumeMultipartUpload(body.key, body.uploadId);
      await mpu.abort();
    } catch {
      /* already completed or aborted */
    }
    return c.json({ ok: true });
  },
);

merchantRoutes.delete("/merchants/:merchantId/products/:id/files/:fileId", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [f] = await db
    .select()
    .from(productFile)
    .where(
      and(
        eq(productFile.id, c.req.param("fileId")),
        eq(productFile.productId, c.req.param("id")),
      ),
    )
    .limit(1);
  if (!f) return c.json({ error: "not found" }, 404);
  await db.delete(productFile).where(eq(productFile.id, f.id));
  await c.env.R2.delete(f.objectKey);
  return c.json({ ok: true });
});

merchantRoutes.get("/merchants/:merchantId/products/:id/files", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const rows = await db
    .select()
    .from(productFile)
    .where(eq(productFile.productId, c.req.param("id")));
  return c.json(rows);
});

// --- card keys (卡密) inventory ---

const MAX_CARDS_PER_IMPORT = 5000;

// unsold card count per product of this merchant (for the products table)
merchantRoutes.get("/merchants/:merchantId/card-stock", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const rows = await db
    .select({
      productId: cardItem.productId,
      unsold: count().mapWith(Number),
    })
    .from(cardItem)
    .where(
      and(
        eq(cardItem.status, "unsold"),
        inArray(
          cardItem.productId,
          db.select({ id: product.id }).from(product).where(eq(product.merchantId, m.id)),
        ),
      ),
    )
    .groupBy(cardItem.productId);
  return c.json(rows);
});

merchantRoutes.get("/merchants/:merchantId/products/:id/cards", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (!p) return c.json({ error: "product not found" }, 404);
  const rows = await db
    .select()
    .from(cardItem)
    .where(eq(cardItem.productId, p.id))
    .orderBy(asc(cardItem.status), desc(cardItem.createdAt))
    .limit(10000);
  return c.json(rows);
});

// bulk import: one key per line, blank lines ignored, duplicates skipped
merchantRoutes.post("/merchants/:merchantId/products/:id/cards", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (!p) return c.json({ error: "product not found" }, 404);
  const body = await c.req.json<{ content?: string }>();
  const keys = [
    ...new Set(
      (body.content ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (keys.length === 0) return c.json({ error: "content required" }, 400);
  if (keys.length > MAX_CARDS_PER_IMPORT)
    return c.json({ error: `单次最多导入 ${MAX_CARDS_PER_IMPORT} 条卡密` }, 400);
  const existing = await db
    .select({ content: cardItem.content })
    .from(cardItem)
    .where(eq(cardItem.productId, p.id));
  const existingSet = new Set(existing.map((r) => r.content));
  const fresh = keys.filter((k) => !existingSet.has(k));
  if (fresh.length === 0) return c.json({ added: 0 });
  await db.insert(cardItem).values(
    fresh.map((content) => ({
      id: crypto.randomUUID(),
      productId: p.id,
      content,
    })),
  );
  return c.json({ added: fresh.length }, 201);
});

merchantRoutes.delete(
  "/merchants/:merchantId/products/:id/cards/:cardId",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [card] = await db
      .select({ id: cardItem.id, status: cardItem.status })
      .from(cardItem)
      .where(
        and(
          eq(cardItem.id, c.req.param("cardId")),
          eq(cardItem.productId, c.req.param("id")),
        ),
      )
      .limit(1);
    if (!card) return c.json({ error: "not found" }, 404);
    if (card.status !== "unsold")
      return c.json({ error: "已售出的卡密不可删除" }, 400);
    await db.delete(cardItem).where(eq(cardItem.id, card.id));
    return c.json({ ok: true });
  },
);

// --- preview images ---

const MAX_IMAGES_PER_PRODUCT = 9;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

merchantRoutes.get("/merchants/:merchantId/products/:id/images", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (!p) return c.json({ error: "product not found" }, 404);
  const rows = await db
    .select()
    .from(productImage)
    .where(eq(productImage.productId, p.id))
    .orderBy(asc(productImage.sortOrder), asc(productImage.createdAt));
  return c.json(rows);
});

merchantRoutes.post("/merchants/:merchantId/products/:id/images", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
  if (!m) return c.json({ error: "forbidden" }, 403);
  const [p] = await db
    .select({ id: product.id })
    .from(product)
    .where(
      and(eq(product.id, c.req.param("id")), eq(product.merchantId, m.id)),
    )
    .limit(1);
  if (!p) return c.json({ error: "product not found" }, 404);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
  if (!file.type.startsWith("image/"))
    return c.json({ error: "仅支持图片文件" }, 400);
  if (file.size > MAX_IMAGE_SIZE)
    return c.json({ error: "图片不能超过 5MB" }, 400);
  const existing = await db
    .select({ id: productImage.id })
    .from(productImage)
    .where(eq(productImage.productId, p.id));
  if (existing.length >= MAX_IMAGES_PER_PRODUCT)
    return c.json({ error: `最多上传 ${MAX_IMAGES_PER_PRODUCT} 张预览图` }, 400);

  const key = imageKey(m.id, p.id, file.name);
  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  const [row] = await db
    .insert(productImage)
    .values({
      id: crypto.randomUUID(),
      productId: p.id,
      objectKey: key,
      sortOrder: existing.length,
    })
    .returning();
  return c.json(row, 201);
});

merchantRoutes.delete(
  "/merchants/:merchantId/products/:id/images/:imageId",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [img] = await db
      .select()
      .from(productImage)
      .where(
        and(
          eq(productImage.id, c.req.param("imageId")),
          eq(productImage.productId, c.req.param("id")),
        ),
      )
      .limit(1);
    if (!img) return c.json({ error: "not found" }, 404);
    await db.delete(productImage).where(eq(productImage.id, img.id));
    await c.env.R2.delete(img.objectKey);
    return c.json({ ok: true });
  },
);

// management-side image preview (works for draft/off-sale products too)
merchantRoutes.get(
  "/merchants/:merchantId/products/:id/images/:imageId/raw",
  async (c) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const db = getDb(c.env.DB);
    const m = await resolveMerchant(db, u.id, u.role, c.req.param("merchantId"));
    if (!m) return c.json({ error: "forbidden" }, 403);
    const [img] = await db
      .select({ objectKey: productImage.objectKey })
      .from(productImage)
      .where(
        and(
          eq(productImage.id, c.req.param("imageId")),
          eq(productImage.productId, c.req.param("id")),
        ),
      )
      .limit(1);
    if (!img) return c.json({ error: "not found" }, 404);
    const obj = await c.env.R2.get(img.objectKey);
    if (!obj) return c.json({ error: "object missing" }, 404);
    return streamR2Object(obj, { "cache-control": "private, max-age=3600" });
  },
);

// current upload limits, readable by any logged-in user (used by upload UIs)
merchantRoutes.get("/upload-limits", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const maxFileSizeBytes = await getMaxFileSizeBytes(db);
  return c.json({ maxFileSizeBytes });
});

// merchant's own orders (read-only view)
merchantRoutes.get("/merchant/orders", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);
  const [m] = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, u.id))
    .limit(1);
  if (!m) return c.json({ error: "forbidden" }, 403);
  const rows = await db
    .select()
    .from(order)
    .where(eq(order.merchantId, m.id))
    .orderBy(desc(order.createdAt))
    .limit(200);
  return c.json(rows);
});
