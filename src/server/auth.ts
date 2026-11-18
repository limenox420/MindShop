import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { and, eq, isNull } from "drizzle-orm";
import type { Bindings } from "./env";
import type { Db } from "./db";
import { IS_PG } from "./db/dialect";
import { user } from "./db/schema";

export function createAuth(db: Db, env: Bindings) {
  return betterAuth({
    database: drizzleAdapter(db as never, { provider: IS_PG ? "pg" : "sqlite" }),
    secret: env.BETTER_AUTH_SECRET ?? "mindshop-dev-secret-change-me",
    baseURL: env.APP_URL,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "user",
          input: false,
        },
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            // bootstrap: the first registered user of a fresh instance becomes admin
            const [existingAdmin] = await db
              .select({ id: user.id })
              .from(user)
              .where(eq(user.role, "admin"))
              .limit(1);
            if (!existingAdmin) {
              await db
                .update(user)
                .set({ role: "admin" })
                .where(eq(user.id, created.id));
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Resolve the current session user from the request cookies/headers.
 * Re-reads from our table so deleted (anonymized) users are rejected.
 */
export async function getSessionUser(
  db: Db,
  auth: Auth,
  headers: Headers,
) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const rows = await db
    .select()
    .from(user)
    .where(and(eq(user.id, session.user.id), isNull(user.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export type SessionUser = typeof user.$inferSelect;
