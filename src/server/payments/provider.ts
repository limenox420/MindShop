import type { Storage } from "../storage/types";
import type { Db } from "../db";
import { eq } from "drizzle-orm";
import { qrCode } from "../db/schema";

export type PaymentDisplay =
  | { type: "qr"; qrUrl: string; hint?: string }
  | { type: "redirect"; url: string };

export type CreatePaymentResult = {
  provider: string;
  providerData: Record<string, unknown>;
  display: PaymentDisplay;
};

export type PaymentEnv = {
  db: Db;
  r2: Storage;
  appUrl: string;
};

export interface PaymentProvider {
  id: string;
  name: string;
  /** Create the payment for a fresh order; result is persisted & shown to the buyer. */
  createPayment(
    env: PaymentEnv,
    order: {
      id: string;
      orderNo: string;
      title: string;
      amountCents: number;
      currency: string;
    },
  ): Promise<CreatePaymentResult>;
}

/**
 * Manual QR-code payment: admin uploads static payment QR codes; the buyer
 * scans the code and pays out-of-band; an admin confirms receipt and ships.
 */
export class ManualQrProvider implements PaymentProvider {
  id = "manual-qr";
  name = "收款码转账";

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
    const rows = await env.db
      .select()
      .from(qrCode)
      .where(eq(qrCode.enabled, true))
      .limit(10);
    if (rows.length === 0) {
      throw new Error("NO_QR_CODE_CONFIGURED");
    }
    const pick = rows[Math.floor(Math.random() * rows.length)];
    return {
      provider: this.id,
      providerData: {
        qrCodeId: pick.id,
        qrObjectKey: pick.objectKey,
        orderNo: order.orderNo,
      },
      display: {
        type: "qr",
        qrUrl: `/api/payments/qr/${encodeURIComponent(pick.objectKey)}`,
        hint: `请向收款码转账 ${(order.amountCents / 100).toFixed(2)} ${order.currency}，并在备注中填写订单号 ${order.orderNo}。管理员确认收款后即可下载商品。`,
      },
    };
  }
}
