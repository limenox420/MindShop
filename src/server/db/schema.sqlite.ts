import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// --- better-auth tables (kept in sync with auth config) ---

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // MindShop extension
  role: text("role", { enum: ["user", "merchant", "admin"] })
    .notNull()
    .default("user"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// --- MindShop business tables ---

export const merchant = sqliteTable(
  "merchant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["pending", "active", "suspended"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("merchant_user_id_uq").on(t.userId)],
);

export const category = sqliteTable(
  "category",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("category_merchant_idx").on(t.merchantId)],
);

export const product = sqliteTable(
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
    type: text("type", { enum: ["file", "card"] }).notNull().default("file"),
    // payment channel: null = buyer chooses (qr or stripe), "qr" / "stripe" locks it (admin-only)
    payMethod: text("pay_method", { enum: ["qr", "stripe"] }),
    status: text("status", { enum: ["draft", "on_sale", "off_sale"] })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("product_merchant_idx").on(t.merchantId),
    index("product_status_idx").on(t.status),
  ],
);

export const productFile = sqliteTable(
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
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("product_file_product_idx").on(t.productId)],
);

export const productImage = sqliteTable(
  "product_image",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // R2 object key, e.g. images/{merchantId}/{productId}/{uuid}.{ext}
    objectKey: text("object_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("product_image_product_idx").on(t.productId)],
);

export const order = sqliteTable(
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
    status: text("status", {
      enum: [
        "pending_payment",
        "paid",
        "delivered",
        "completed",
        "cancelled",
      ],
    })
      .notNull()
      .default("pending_payment"),
    // payment provider id, e.g. "manual-qr", "stripe"
    provider: text("provider").notNull(),
    // provider-specific payload (e.g. qr code object key snapshot)
    providerData: text("provider_data", { mode: "json" }),
    paidAt: integer("paid_at", { mode: "timestamp" }),
    deliveredAt: integer("delivered_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
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
export const entitlement = sqliteTable(
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
    grantedAt: integer("granted_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("entitlement_order_uq").on(t.orderId),
    index("entitlement_user_product_idx").on(t.userId, t.productId),
  ],
);

// card-key inventory for card-type products: one row per key
export const cardItem = sqliteTable(
  "card_item",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    status: text("status", { enum: ["unsold", "sold"] })
      .notNull()
      .default("unsold"),
    orderId: text("order_id").references(() => order.id, {
      onDelete: "set null",
    }),
    soldAt: integer("sold_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("card_item_product_status_idx").on(t.productId, t.status)],
);

// admin-uploaded static payment QR codes
export const qrCode = sqliteTable("qr_code", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  // R2 object key, e.g. qr-codes/{uuid}.png
  objectKey: text("object_key").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
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
