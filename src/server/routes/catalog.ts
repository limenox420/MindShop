import { Hono } from "hono";
import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { getSeoSettings, getSiteSettings } from "../settings";
import { category, merchant, product, productImage } from "../db/schema";
import { streamR2Object } from "../r2";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

// first image id of a product (as its cover)
const coverImageId = sql<string | null>`(
  SELECT pi.id FROM product_image pi
  WHERE pi.product_id = ${product.id}
  ORDER BY pi.sort_order ASC, pi.created_at ASC
  LIMIT 1
)`;

// unsold card-key count (only meaningful for card-type products)
const cardStock = sql<number>`(
  SELECT COUNT(*) FROM card_item ci
  WHERE ci.product_id = ${product.id} AND ci.status = 'unsold'
)`.mapWith(Number);

export const catalogRoutes = new Hono<Vars>().basePath("/api/catalog");

// public storefront branding / contact info (admin-editable)
catalogRoutes.get("/site", async (c) => {
  const db = getDb(c.env.DB);
  const [site, seo] = await Promise.all([
    getSiteSettings(db),
    getSeoSettings(db),
  ]);
  return c.json({ ...site, ...seo });
});

// public storefront: on-sale products from active merchants
catalogRoutes.get("/products", async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const categoryId = c.req.query("category");
  const conditions = [eq(product.status, "on_sale"), eq(merchant.status, "active")];
  if (categoryId) conditions.push(eq(product.categoryId, categoryId));
  if (q) {
    conditions.push(
      or(like(product.title, `%${q}%`), like(product.description, `%${q}%`))!,
    );
  }
  const rows = await db
    .select({
      id: product.id,
      title: product.title,
      description: product.description,
      priceCents: product.priceCents,
      currency: product.currency,
      type: product.type,
      payMethod: product.payMethod,
      cardStock,
      merchantName: merchant.displayName,
      categoryName: category.name,
      coverImageId,
    })
    .from(product)
    .innerJoin(merchant, eq(product.merchantId, merchant.id))
    .leftJoin(category, eq(product.categoryId, category.id))
    .where(and(...conditions))
    .orderBy(desc(product.createdAt))
    .limit(200);
  return c.json(rows);
});

catalogRoutes.get("/products/:id", async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .select({
      id: product.id,
      title: product.title,
      description: product.description,
      priceCents: product.priceCents,
      currency: product.currency,
      type: product.type,
      payMethod: product.payMethod,
      cardStock,
      merchantId: product.merchantId,
      merchantName: merchant.displayName,
      categoryName: category.name,
      coverImageId,
    })
    .from(product)
    .innerJoin(merchant, eq(product.merchantId, merchant.id))
    .leftJoin(category, eq(product.categoryId, category.id))
    .where(and(eq(product.id, c.req.param("id")), eq(product.status, "on_sale")))
    .limit(1);
  if (!row) return c.json({ error: "not found" }, 404);
  const images = await db
    .select({ id: productImage.id })
    .from(productImage)
    .where(eq(productImage.productId, row.id))
    .orderBy(asc(productImage.sortOrder), asc(productImage.createdAt));
  return c.json({ ...row, images: images.map((i) => i.id) });
});

// public preview image of a catalog product
catalogRoutes.get("/products/:id/images/:imageId", async (c) => {
  const db = getDb(c.env.DB);
  const [img] = await db
    .select({ objectKey: productImage.objectKey })
    .from(productImage)
    .innerJoin(
      product,
      and(
        eq(productImage.productId, product.id),
        eq(product.id, c.req.param("id")),
        eq(product.status, "on_sale"),
      ),
    )
    .where(eq(productImage.id, c.req.param("imageId")))
    .limit(1);
  if (!img) return c.json({ error: "not found" }, 404);
  const obj = await c.env.R2.get(img.objectKey);
  if (!obj) return c.json({ error: "object missing" }, 404);
  return streamR2Object(obj, { "cache-control": "public, max-age=86400" });
});

// public categories of active merchants
catalogRoutes.get("/categories", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: category.id,
      name: category.name,
      merchantId: category.merchantId,
      merchantName: merchant.displayName,
    })
    .from(category)
    .innerJoin(merchant, eq(category.merchantId, merchant.id))
    .where(eq(merchant.status, "active"))
    .orderBy(asc(category.sortOrder));
  return c.json(rows);
});
