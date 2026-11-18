import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { order } from "../db/schema";
import { getStripeSettings } from "../settings";
import { markOrderPaid } from "../delivery";
import { verifyStripeSignature } from "../payments/stripe";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

export const webhookRoutes = new Hono<Vars>().basePath("/api/webhooks");

// Stripe calls this after payment completes; public route, authenticated by
// signature verification instead of a session.
webhookRoutes.post("/stripe", async (c) => {
  const db = getDb(c.env.DB);
  const cfg = await getStripeSettings(db);
  if (!cfg.enabled || !cfg.webhookSecret)
    return c.json({ error: "stripe not configured" }, 400);

  const payload = await c.req.text();
  const event = await verifyStripeSignature(
    payload,
    c.req.header("Stripe-Signature"),
    cfg.webhookSecret,
  );
  if (!event) return c.json({ error: "invalid signature" }, 400);

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as {
      metadata?: { orderId?: string };
      client_reference_id?: string;
    };
    const orderId = session.metadata?.orderId ?? session.client_reference_id;
    if (orderId) {
      const [o] = await db
        .select({ id: order.id })
        .from(order)
        .where(eq(order.id, orderId))
        .limit(1);
      // idempotent: markOrderPaid skips orders that are not pending_payment;
      // Stripe is fully automatic, so file products deliver without a manual step
      if (o) await markOrderPaid(db, o.id, { autoDeliverFile: true });
    }
  }
  // always 200 for verified events so Stripe stops retrying
  return c.json({ received: true });
});
