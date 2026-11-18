import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.sqlite.ts",
  out: "./migrations",
  dialect: "sqlite",
});
