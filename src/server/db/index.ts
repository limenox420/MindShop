import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/**
 * On Cloudflare Workers `raw` is the raw D1 binding and gets wrapped in a
 * drizzle instance. The standalone Node server passes an already-constructed
 * drizzle (PostgreSQL) instance, which is returned as-is.
 */
export function getDb(raw: D1Database): Db {
  if ("select" in raw) return raw as unknown as Db;
  return drizzle(raw, { schema });
}

/**
 * Atomic batch of prebuilt queries. D1 executes db.batch() server-side in one
 * transaction; drizzle PostgreSQL has no batch(), so the ops are built inside
 * and awaited within a real transaction instead.
 */
export async function runBatch(
  db: Db,
  build: (tx: Db) => unknown[],
): Promise<unknown[]> {
  const anyDb = db as unknown as {
    batch?: (ops: unknown[]) => Promise<unknown[]>;
    transaction?: (
      fn: (tx: unknown) => Promise<unknown[]>,
    ) => Promise<unknown[]>;
  };
  if (typeof anyDb.batch === "function") {
    return anyDb.batch(build(db));
  }
  if (typeof anyDb.transaction !== "function") {
    throw new Error("db supports neither batch() nor transaction()");
  }
  return anyDb.transaction(async (tx) => {
    const ops = build(tx as unknown as Db);
    const results: unknown[] = [];
    for (const op of ops) results.push(await op);
    return results;
  });
}
