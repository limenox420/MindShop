import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { getDb } from "./db";
import { createAuth, getSessionUser, type SessionUser } from "./auth";
import type { AppEnv } from "./env";

export type Variables = {
  user: SessionUser;
};

export const authMiddleware = createMiddleware<{
  Bindings: AppEnv["Bindings"];
  Variables: Variables;
}>(async (c, next) => {
  const db = getDb(c.env.DB);
  const auth = createAuth(db, c.env);
  const u = await getSessionUser(db, auth, c.req.raw.headers);
  c.set("user", u as SessionUser);
  await next();
});

export function requireUser(c: Context<{ Bindings: AppEnv["Bindings"]; Variables: Variables }>) {
  const u = c.get("user");
  if (!u) {
    return null;
  }
  return u;
}

export function requireRole(
  c: Context<{ Bindings: AppEnv["Bindings"]; Variables: Variables }>,
  ...roles: Array<"user" | "merchant" | "admin">
) {
  const u = requireUser(c);
  if (!u) {
    return null;
  }
  if (roles.length > 0 && !roles.includes(u.role)) {
    return null;
  }
  return u;
}
