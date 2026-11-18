import type { Db } from "../db";
import type { PaymentProvider, PaymentEnv, CreatePaymentResult } from "./provider";
import { ManualQrProvider } from "./provider";
import { StripeProvider } from "./stripe";
import { getStripeSettings } from "../settings";

export function getPaymentProviders(): PaymentProvider[] {
  return [new ManualQrProvider()];
}

/**
 * Providers actually usable right now: manual QR always, Stripe only when
 * configured (secret key saved + enabled) in platform settings.
 */
export async function getAvailablePaymentProviders(db: Db): Promise<PaymentProvider[]> {
  const providers: PaymentProvider[] = [new ManualQrProvider()];
  const cfg = await getStripeSettings(db);
  if (cfg.enabled) providers.push(new StripeProvider());
  return providers;
}

export async function getAvailablePaymentProvider(
  db: Db,
  id: string,
): Promise<PaymentProvider | undefined> {
  return getAvailablePaymentProviders(db).then((ps) => ps.find((p) => p.id === id));
}

export { ManualQrProvider, StripeProvider };
export type { PaymentProvider, PaymentEnv, CreatePaymentResult };
