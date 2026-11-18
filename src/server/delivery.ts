import { and, asc, eq } from "drizzle-orm";
import { runBatch } from "./db";
import { cardItem, entitlement, order, product } from "./db/schema";
import type { Db } from "./db";

type OrderRow = typeof order.$inferSelect;

/**
 * Auto-deliver a card-type order: atomically claim the oldest unsold key,
 * grant the entitlement and mark the order delivered. Returns null when the
 * inventory is empty (caller decides how to surface that).
 */
export async function deliverCardOrder(
  db: Db,
  o: OrderRow,
): Promise<typeof cardItem.$inferSelect | null> {
  const [card] = await db
    .select()
    .from(cardItem)
    .where(and(eq(cardItem.productId, o.productId), eq(cardItem.status, "unsold")))
    .orderBy(asc(cardItem.createdAt), asc(cardItem.id))
    .limit(1);
  if (!card) return null;
  await runBatch(db, (tx) => [
    tx
      .update(cardItem)
      .set({ status: "sold", orderId: o.id, soldAt: new Date() })
      .where(and(eq(cardItem.id, card.id), eq(cardItem.status, "unsold"))),
    tx
      .insert(entitlement)
      .values({
        id: crypto.randomUUID(),
        userId: o.userId,
        productId: o.productId,
        orderId: o.id,
      })
      .onConflictDoNothing(),
    tx
      .update(order)
      .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(order.id, o.id)),
  ]);
  return card;
}

/**
 * Confirm payment for an order and auto-deliver card-type products in one go.
 * Shared by the admin confirm-paid endpoint (manual QR flow) and the Stripe
 * webhook — both payment channels end here. Idempotent: orders that are not
 * pending_payment are left untouched and returned as-is.
 *
 * Stripe orders pass `autoDeliverFile` so file products are granted without
 * a manual ship step; the manual QR flow keeps files waiting for the admin.
 */
export async function markOrderPaid(
  db: Db,
  orderId: string,
  opts: { autoDeliverFile?: boolean } = {},
): Promise<{ order: OrderRow; cardDelivered: boolean } | null> {
  const [o] = await db.select().from(order).where(eq(order.id, orderId)).limit(1);
  if (!o) return null;
  if (o.status !== "pending_payment") return { order: o, cardDelivered: false };
  const [row] = await db
    .update(order)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(eq(order.id, o.id))
    .returning();
  // card-type orders are delivered automatically right after payment
  const [p] = await db
    .select({ type: product.type })
    .from(product)
    .where(eq(product.id, row.productId))
    .limit(1);
  let cardDelivered = false;
  let fresh = row;
  if (p?.type === "card") {
    const card = await deliverCardOrder(db, row);
    cardDelivered = !!card;
    const [updated] = await db
      .select()
      .from(order)
      .where(eq(order.id, o.id))
      .limit(1);
    fresh = updated;
  } else if (opts.autoDeliverFile) {
    await runBatch(db, (tx) => [
      tx
        .insert(entitlement)
        .values({
          id: crypto.randomUUID(),
          userId: row.userId,
          productId: row.productId,
          orderId: row.id,
        })
        .onConflictDoNothing(),
      tx
        .update(order)
        .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(order.id, o.id)),
    ]);
    const [updated] = await db
      .select()
      .from(order)
      .where(eq(order.id, o.id))
      .limit(1);
    fresh = updated;
  }
  return { order: fresh, cardDelivered };
}
