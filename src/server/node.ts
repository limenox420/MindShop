/**
 * Standalone (single-machine) entry point: PostgreSQL + S3-compatible object
 * storage (RustFS, MinIO, AWS S3, ...) instead of Cloudflare D1/R2.
 *
 * Required env (from environment or a .env file next to package.json):
 *   DATABASE_URL          postgres connection string
 *   S3_ENDPOINT           e.g. http://127.0.0.1:9000
 *   S3_BUCKET             e.g. mindshop
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * Optional:
 *   S3_REGION (default us-east-1), S3_FORCE_PATH_STYLE (default true)
 *   APP_NAME, APP_URL, BETTER_AUTH_SECRET, PORT (default 8787)
 *
 * Run: npm run start
 */
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { serve } from "@hono/node-server";
import app from "./index";
import type { Bindings } from "./env";
import { S3Storage } from "./storage/s3";
import * as pgSchema from "./db/schema.pg";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

const DATABASE_URL = requiredEnv("DATABASE_URL");
const S3_ENDPOINT = requiredEnv("S3_ENDPOINT");
const S3_BUCKET = requiredEnv("S3_BUCKET");
const S3_ACCESS_KEY_ID = requiredEnv("S3_ACCESS_KEY_ID");
const S3_SECRET_ACCESS_KEY = requiredEnv("S3_SECRET_ACCESS_KEY");

const port = Number(process.env.PORT ?? 8787);
const appUrl = process.env.APP_URL ?? `http://localhost:${port}`;
const clientDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../dist/client",
);

// --- PostgreSQL ---
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const pgDb = drizzle(pool, { schema: pgSchema });
await migrate(pgDb, {
  migrationsFolder: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../drizzle-pg",
  ),
});

// --- S3-compatible object storage ---
const storage = new S3Storage({
  endpoint: S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  bucket: S3_BUCKET,
  accessKeyId: S3_ACCESS_KEY_ID,
  secretAccessKey: S3_SECRET_ACCESS_KEY,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
});

// --- static client assets (replaces the Workers ASSETS binding, SPA fallback) ---
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

async function serveFile(path: string): Promise<Response | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    const data = await readFile(path);
    const ext = path.slice(path.lastIndexOf("."));
    return new Response(data, {
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        // vite emits content-hashed filenames under /assets/
        "cache-control": path.includes(`${join("dist", "client")}`) && path.includes("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  } catch {
    return null;
  }
}

const assets = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = url.pathname;
    }
    const root = resolve(clientDir);
    const target = resolve(root, "." + pathname);
    if (!target.startsWith(root + "/") && target !== root) {
      return new Response("forbidden", { status: 403 });
    }
    const exact = await serveFile(target);
    if (exact) return exact;
    const index = await serveFile(join(root, "index.html"));
    if (index) return index;
    return new Response("not found", { status: 404 });
  },
};

// --- build the bindings Hono expects and serve ---
const bindings: Bindings = {
  DB: pgDb as unknown as Bindings["DB"],
  R2: storage,
  ASSETS: assets as unknown as Bindings["ASSETS"],
  APP_NAME: process.env.APP_NAME ?? "MindShop",
  APP_URL: appUrl,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
};

serve({ fetch: (req) => app.fetch(req, bindings), port }, (info) => {
  console.log(
    `MindShop (standalone) listening on http://localhost:${info.port} — serving ${clientDir}`,
  );
});
