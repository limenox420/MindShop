import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.pg.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
});
