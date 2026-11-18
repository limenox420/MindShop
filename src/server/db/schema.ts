// Single source of truth for table objects: the sqlite schema defines the
// canonical TypeScript types, the pg schema provides the runtime tables for
// standalone (PostgreSQL) deployment. Route code only ever sees sqlite types.
import * as sqlite from "./schema.sqlite";
import * as pg from "./schema.pg";
import { IS_PG } from "./dialect";

const pick = <T>(sqliteVal: T, pgVal: unknown): T =>
  IS_PG ? (pgVal as T) : sqliteVal;

// --- better-auth tables ---

export const user = pick(sqlite.user, pg.user);
export const session = pick(sqlite.session, pg.session);
export const account = pick(sqlite.account, pg.account);
export const verification = pick(sqlite.verification, pg.verification);

// --- MindShop business tables ---

export const merchant = pick(sqlite.merchant, pg.merchant);
export const category = pick(sqlite.category, pg.category);
export const product = pick(sqlite.product, pg.product);
export const productFile = pick(sqlite.productFile, pg.productFile);
export const productImage = pick(sqlite.productImage, pg.productImage);
export const order = pick(sqlite.order, pg.order);
export const cardItem = pick(sqlite.cardItem, pg.cardItem);
export const entitlement = pick(sqlite.entitlement, pg.entitlement);
export const qrCode = pick(sqlite.qrCode, pg.qrCode);
export const settings = pick(sqlite.settings, pg.settings);

// --- relations ---

export const merchantRelations = pick(
  sqlite.merchantRelations,
  pg.merchantRelations,
);
export const productRelations = pick(
  sqlite.productRelations,
  pg.productRelations,
);
export const orderRelations = pick(sqlite.orderRelations, pg.orderRelations);
