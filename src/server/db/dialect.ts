/**
 * Deployment dialect detection. Cloudflare Workers never sets DATABASE_URL;
 * the standalone Node server requires it, so its presence selects PostgreSQL.
 */
export const IS_PG =
  typeof process !== "undefined" && !!process.env?.DATABASE_URL;
