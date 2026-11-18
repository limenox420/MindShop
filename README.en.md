# MindShop

English | [简体中文](./README.md)

Self-hostable digital goods store: **file downloads / card-key (autodelivery) products**, **QR-code + Stripe** payments, with **dual deployment** — Cloudflare Workers or a single server — sharing the exact same business code.

## Features

- **Products**: two delivery types — file download (manual fulfillment) and card keys (batch import, live stock, sold-out guard); up to 9 preview images per product, category management
- **Payments**: bank QR-code transfer (admin confirms receipt) + Stripe Checkout; per-product channel lock (QR only / Stripe only), buyers choose when unlocked
- **Auto fulfillment**: after webhook signature verification, Stripe orders are delivered automatically — card products release a card key, file products unlock download immediately; QR flow stays manual
- **Roles**: user / merchant (application-based) / admin; admin panel can manage products on behalf of merchants, confirm payments, and manage users & merchants
- **Operations settings**: store title, contact info, attachment size cap (default 10 GB), search-engine indexing toggle (robots.txt + noindex; AI crawlers are always blocked)
- **Extras**: i18n (EN / ZH / FR / DE / ES / RU), account deletion with anonymization, multipart upload for large files (>90 MB in 8 MB chunks, up to 10 GB)

## Deployment option 1: Cloudflare Workers

Requires a D1 database and an R2 bucket.

```bash
npm install
npm run db:migrate:local      # local D1 migrations
npm run dev                   # wrangler dev, http://localhost:8787
```

Deploy to Cloudflare:

```bash
wrangler d1 create mindshop   # put the returned database_id into wrangler.jsonc
wrangler r2 bucket create mindshop
npm run db:migrate:remote
npm run deploy
```

## Deployment option 2: single server (PostgreSQL + S3-compatible storage)

Any S3-compatible storage works (RustFS, MinIO, AWS S3, etc.). Using RustFS as an example:

```bash
# RustFS (listens on :9000 by default)
RUSTFS_ACCESS_KEY=mindshop RUSTFS_SECRET_KEY=mindshop123 ./rustfs ./data
# create the bucket (helper script included)
node scripts/mk-bucket.mjs
```

Create a `.env` file in the project root:

```ini
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/mindshop
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=mindshop
S3_ACCESS_KEY_ID=mindshop
S3_SECRET_ACCESS_KEY=mindshop123
APP_NAME=MindShop
APP_URL=http://localhost:8790
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
PORT=8790
```

```bash
npm run build:client          # client bundle goes to dist/client
npm run start                 # starts and auto-applies PostgreSQL migrations (drizzle-pg/)
```

PG schema changes: edit `src/server/db/schema.pg.ts`, run `npm run migrate:pg` to generate migration SQL, then restart — migrations apply automatically.

> The first registered user automatically becomes an admin.

## Development

- `npm run dev` / `npm run dev:node`: hot-reload dev servers for both deployment modes
- `npm run typecheck`: server + client type checking
- `npm run build`: full client + server build

## Architecture

- Business code (`src/server/routes/`) is decoupled from the hosting platform: database access goes through runtime dialect selection (`db/schema.ts`), object storage through the `storage/` abstraction — R2 binding on Workers, `@aws-sdk/client-s3` on a single server
- D1 has no interactive transactions, so multi-statement writes go through the `runBatch` abstraction in `db/index.ts` to keep atomicity identical on both deployments
- The payment layer is a Provider abstraction (`src/server/payments/`): `manual-qr` and `stripe` implementations; Stripe uses plain REST calls plus hand-written signature verification (`crypto.subtle`, works on Workers and Node) with no SDK dependency

## Tests

- `bash scripts/e2e-standalone.sh`: end-to-end smoke test, standalone mode (service expected on :8790)
- `bash scripts/e2e-cards.sh`: card-key flow smoke test (`BASE=http://localhost:8787` targets the Workers route; pass admin credentials via `ADMIN_EMAIL=...`)
- `bash scripts/e2e-stripe.sh`: Stripe flow smoke test (no real Stripe account needed: channel locking, webhook signature verification, simulated `checkout.session.completed` auto-fulfillment)

## Stripe payments (optional)

After entering the Secret Key and Webhook signing secret in Admin → Settings → Stripe and enabling it, buyers can pay via Stripe Checkout:

- **Auto fulfillment**: the Stripe webhook (`/api/webhooks/stripe`, configure this URL in the Stripe Dashboard) confirms payment and delivers automatically — card products release a card key, file products unlock download
- **QR code**: keeps the original manual flow (admin confirms receipt, ships manually)
- **Per-product channel**: when editing a product in Admin → Products, choose “QR only / Stripe only”; leave empty to let buyers choose — merchants cannot change this
- Going live: verify with Stripe Test keys first, then switch to Live keys; product currency must be supported by Stripe (the default CNY requires an overseas-registered Stripe account)

## License

See [LICENSE](./LICENSE).
