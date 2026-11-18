# MindShop

[English](./README.en.md) | 简体中文

自托管数字商品商城：**文件下载 / 自动发卡**，**收款码 + Stripe** 双支付通道，**Cloudflare Workers 与单机**双部署方案，业务代码完全共用。

## 功能一览

- **商品**：文件下载（手动发货）与自动发卡（批量导入卡密、实时库存、售罄拦截）两种交付类型；最多 9 张预览图、分类管理
- **支付**：收款码转账（管理员确认收款）+ Stripe Checkout 在线支付；可按商品锁定渠道（仅收款码 / 仅 Stripe），未锁定则买家自选
- **自动发货**：Stripe webhook 验签确认后自动交付——卡密商品发卡密、文件商品直接开放下载；收款码流程保持手动
- **角色体系**：普通用户 / 商户（申请制）/ 管理员；管理后台可代商户管理商品、确认收款、用户与商户管理
- **运营设置**：商城标题、联系方式、附件大小上限（默认 10 GB）、搜索引擎收录开关（robots.txt + noindex，AI 爬虫恒定屏蔽）
- **其他**：多语言（中 / 英 / 法 / 德 / 西 / 俄）、账号注销（匿名化）、大文件分片上传（>90 MB 走 8 MB 分片，上限 10 GB）

## 部署方式一：Cloudflare Workers

依赖：D1 数据库、R2 存储桶。

```bash
npm install
npm run db:migrate:local      # 本地 D1 迁移
npm run dev                   # wrangler dev，http://localhost:8787
```

部署到 Cloudflare：

```bash
wrangler d1 create mindshop   # 把返回的 database_id 填入 wrangler.jsonc
wrangler r2 bucket create mindshop
npm run db:migrate:remote
npm run deploy
```

## 部署方式二：单机（PostgreSQL + S3 兼容存储）

任意 S3 兼容存储均可（RustFS、MinIO、AWS S3 等）。以 RustFS 为例：

```bash
# RustFS（默认监听 :9000）
RUSTFS_ACCESS_KEY=mindshop RUSTFS_SECRET_KEY=mindshop123 ./rustfs ./data
# 创建存储桶（项目内置辅助脚本）
node scripts/mk-bucket.mjs
```

在项目根目录建 `.env`：

```ini
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/mindshop
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=mindshop
S3_ACCESS_KEY_ID=mindshop
S3_SECRET_ACCESS_KEY=mindshop123
APP_NAME=MindShop
APP_URL=http://localhost:8790
BETTER_AUTH_SECRET=请换成随机长密钥
PORT=8790
```

```bash
npm run build:client          # 前端产物 dist/client
npm run start                 # 启动并自动执行 PostgreSQL 迁移（drizzle-pg/）
```

PG 表结构变更流程：改 `src/server/db/schema.pg.ts` 后运行 `npm run migrate:pg` 生成迁移 SQL，重启服务即自动应用。

> 首个注册用户自动成为管理员。

## 开发

- `npm run dev` / `npm run dev:node`：两种部署的热重载开发
- `npm run typecheck`：服务端 + 客户端类型检查
- `npm run build`：客户端 + 服务端完整构建

## 架构说明

- 业务代码（`src/server/routes/`）与部署平台解耦：数据库访问经由运行时方言选择（`db/schema.ts`），对象存储经由 `storage/` 抽象——Workers 下直连 R2 binding，单机下走 `@aws-sdk/client-s3`
- D1 无交互事务，多语句写入统一走 `db/index.ts` 的 `runBatch` 抽象，保证两种部署下原子性一致
- 支付层为 Provider 抽象（`src/server/payments/`）：`manual-qr` 与 `stripe` 两个实现，Stripe 用纯 REST 调用 + 手写签名验证（`crypto.subtle`，Workers / Node 通用），无 SDK 依赖

## 测试

- `bash scripts/e2e-standalone.sh`：单机模式端到端冒烟测试（需服务运行于 :8790）
- `bash scripts/e2e-cards.sh`：发卡链路冒烟测试（`BASE=http://localhost:8787` 可测 Workers 路线；管理员凭据 `ADMIN_EMAIL=...`）
- `bash scripts/e2e-stripe.sh`：Stripe 链路冒烟测试（无需真实 Stripe 账号：渠道锁定、webhook 验签、模拟 `checkout.session.completed` 自动发货）

## Stripe 支付（可选）

在管理后台「设置 → Stripe 支付」填入 Secret Key 与 Webhook 签名密钥并启用后，买家可选择 Stripe Checkout 在线支付：

- **自动发货**：Stripe webhook（`/api/webhooks/stripe`，需在 Stripe Dashboard 配置该地址）确认收款后自动完成交付——卡密商品发放卡密，文件商品直接开放下载
- **收款码**：保持原有手动流程（管理员确认收款、手动发货）
- **按商品设置渠道**：管理后台「商品管理」编辑商品时可选“仅收款码 / 仅 Stripe”，留空则买家下单时自选；商户无法修改
- 接入真实账号：使用 Stripe Dashboard 的 Test keys 先行验证，再切 Live keys；商品币种需为 Stripe 支持的币种（默认 CNY 要求海外主体账号）

## License

见 [LICENSE](./LICENSE)。
