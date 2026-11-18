import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb, runBatch } from "../db";
import { account, merchant, session, user } from "../db/schema";
import type { AppEnv } from "../env";
import type { Variables } from "../middleware";

type Vars = { Bindings: AppEnv["Bindings"]; Variables: Variables };

export const accountRoutes = new Hono<Vars>().basePath("/api/account");

/**
 * 注销账号：anonymizes the user (keeps order/financial records intact),
 * revokes all sessions, and detaches any pending merchant application.
 */
accountRoutes.post("/delete", async (c) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const db = getDb(c.env.DB);

  // anonymize + revoke sessions atomically
  await runBatch(db, (tx) => [
    tx
      .update(user)
      .set({
        name: `已注销用户`,
        email: `deleted-${u.id}@invalid`,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, u.id)),
    tx.delete(session).where(eq(session.userId, u.id)),
    tx.delete(account).where(eq(account.userId, u.id)),
    tx
      .update(merchant)
      .set({ status: "suspended", displayName: "已注销商户" })
      .where(and(eq(merchant.userId, u.id), eq(merchant.status, "pending"))),
  ]);

  return c.json({ ok: true });
});
