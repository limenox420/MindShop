import { Hono } from "hono";
import type { AppEnv } from "./env";
import { getDb } from "./db";
import { createAuth } from "./auth";
import { authMiddleware, type Variables } from "./middleware";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { merchantRoutes } from "./routes/merchant";
import { adminRoutes } from "./routes/admin";
import { accountRoutes } from "./routes/account";
import { webhookRoutes } from "./routes/webhooks";
import { getSeoSettings } from "./settings";

type Env = { Bindings: AppEnv["Bindings"]; Variables: Variables };

const app = new Hono<Env>();

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "FacebookBot",
  "Meta-ExternalAgent",
  "YouBot",
];

app.get("/robots.txt", async (c) => {
  const db = getDb(c.env.DB);
  const { allowIndex } = await getSeoSettings(db);
  const lines = AI_CRAWLERS.flatMap((ua) => [
    `User-agent: ${ua}`,
    "Disallow: /",
  ]);
  lines.push("User-agent: *", allowIndex ? "Allow: /" : "Disallow: /");
  return c.text(lines.join("\n") + "\n", 200, {
    "cache-control": "public, max-age=300",
  });
});

// better-auth handles register/login/logout/session under /api/auth/*
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const db = getDb(c.env.DB);
  const auth = createAuth(db, c.env);
  return auth.handler(c.req.raw);
});

// Stripe webhook is public and authenticated by signature verification
app.route("/", webhookRoutes);

// authenticated API routes
const api = new Hono<Env>();
api.use("*", authMiddleware);
api.route("/", catalogRoutes);
api.route("/", orderRoutes);
api.route("/", merchantRoutes);
api.route("/", adminRoutes);
api.route("/", accountRoutes);
app.route("/", api);

// API 404
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

// SPA fallback for client-side routes
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
