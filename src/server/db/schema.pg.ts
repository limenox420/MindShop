import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- better-auth tables (kept in sync with auth config) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // MindShop extension
  role: text("role").$type<"user" | "merchant" | "admin">()
    .notNull()
    .default("user"),
  deletedAt: timestamp("deleted_at"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// --- MindShop business tables ---

export const merchant = pgTable(
  "merchant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    status: text("status").$type<"pending" | "active" | "suspended">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("merchant_user_id_uq").on(t.userId)],
);

export const category = pgTable(
  "category",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("category_merchant_idx").on(t.merchantId)],
);

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // price stored in cents
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency").notNull().default("CNY"),
    // "file": download delivery; "card": auto-delivered card keys (卡密)
    type: text("type").$type<"file" | "card">().notNull().default("file"),
    // payment channel: null = buyer chooses (qr or stripe), "qr" / "stripe" locks it (admin-only)
    payMethod: text("pay_method").$type<"qr" | "stripe">(),
    status: text("status").$type<"draft" | "on_sale" | "off_sale">()
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("product_merchant_idx").on(t.merchantId),
    index("product_status_idx").on(t.status),
  ],
);

export const productFile = pgTable(
  "product_file",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // R2 object key, e.g. goods/{merchantId}/{productId}/{uuid}-{filename}
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    contentType: text("content_type"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("product_file_product_idx").on(t.productId)],
);

export const productImage = pgTable(
  "product_image",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // R2 object key, e.g. images/{merchantId}/{productId}/{uuid}.{ext}
    objectKey: text("object_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("product_image_product_idx").on(t.productId)],
);

export const order = pgTable(
  "order",
  {
    id: text("id").primaryKey(),
    orderNo: text("order_no").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id),
    productId: text("product_id")
      .notNull()
      .references(() => product.id),
    productTitle: text("product_title").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("CNY"),
    status: text("status").$type<
      | "pending_payment"
      | "paid"
      | "delivered"
      | "completed"
      | "cancelled"
    >()
      .notNull()
      .default("pending_payment"),
    // payment provider id, e.g. "manual-qr", "stripe"
    provider: text("provider").notNull(),
    // provider-specific payload (e.g. qr code object key snapshot)
    providerData: jsonb("provider_data"),
    paidAt: timestamp("paid_at"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("order_no_uq").on(t.orderNo),
    index("order_user_idx").on(t.userId),
    index("order_merchant_status_idx").on(t.merchantId, t.status),
    index("order_status_idx").on(t.status),
  ],
);

// purchased access rights: one row per order delivery
export const entitlement = pgTable(
  "entitlement",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id),
    orderId: text("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("entitlement_order_uq").on(t.orderId),
    index("entitlement_user_product_idx").on(t.userId, t.productId),
  ],
);

// card-key inventory for card-type products: one row per key
export const cardItem = pgTable(
  "card_item",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status").$type<"unsold" | "sold">().notNull().default("unsold"),
    orderId: text("order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    soldAt: timestamp("sold_at"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("card_item_product_status_idx").on(t.productId, t.status)],
);

// admin-uploaded static payment QR codes
export const qrCode = pgTable("qr_code", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  // R2 object key, e.g. qr-codes/{uuid}.png
  objectKey: text("object_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- relations ---

export const merchantRelations = relations(merchant, ({ one, many }) => ({
  user: one(user, { fields: [merchant.userId], references: [user.id] }),
  products: many(product),
  categories: many(category),
}));

export const productRelations = relations(product, ({ one, many }) => ({
  merchant: one(merchant, { fields: [product.merchantId], references: [merchant.id] }),
  category: one(category, { fields: [product.categoryId], references: [category.id] }),
  files: many(productFile),
}));

export const orderRelations = relations(order, ({ one }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  product: one(product, { fields: [order.productId], references: [product.id] }),
  merchant: one(merchant, { fields: [order.merchantId], references: [merchant.id] }),
}));
