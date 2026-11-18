import type { PaymentProvider, PaymentEnv, CreatePaymentResult } from "./provider";
import { getStripeSettings } from "../settings";

/**
 * Stripe Checkout via the official REST API (no SDK dependency).
 * See https://docs.stripe.com/api/checkout/sessions/create
 */
export class StripeProvider implements PaymentProvider {
  id = "stripe";
  name = "Stripe";

  async createPayment(
    env: PaymentEnv,
    order: {
      id: string;
      orderNo: string;
      title: string;
      amountCents: number;
      currency: string;
    },
  ): Promise<CreatePaymentResult> {
    const cfg = await getStripeSettings(env.db);
    if (!cfg.enabled || !cfg.secretKey)
      throw new Error("PROVIDER_NOT_CONFIGURED");

    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: order.id,
      "metadata[orderId]": order.id,
      "metadata[orderNo]": order.orderNo,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(order.amountCents),
      "line_items[0][price_data][product_data][name]": order.title,
      success_url: `${env.appUrl}/order/${order.id}?stripe=return`,
      cancel_url: `${env.appUrl}/order/${order.id}?stripe=cancel`,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = (await res.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.url || !data.id) {
      throw new Error(data.error?.message || "stripe checkout failed");
    }
    return {
      provider: this.id,
      providerData: { sessionId: data.id },
      display: { type: "redirect", url: data.url },
    };
  }
}

// --- webhook signature verification (Stripe-Signature header) ---

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/**
 * Verify the Stripe-Signature header (t=timestamp,v1=hmac) against the raw
 * request body using the webhook signing secret. Rejects stale timestamps
 * beyond `tolerance` seconds.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  tolerance = 300,
): Promise<StripeEvent | null> {
  if (!header) return null;
  const parts = header.split(",").reduce<Record<string, string[]>>(
    (acc, kv) => {
      const [k, v] = kv.split("=");
      if (k && v) (acc[k] ??= []).push(v);
      return acc;
    },
    {},
  );
  const t = parts.t?.[0];
  const v1 = parts.v1 ?? [];
  if (!t || v1.length === 0) return null;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > tolerance) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${t}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!v1.some((sig) => timingSafeEqual(expected, sig))) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}
