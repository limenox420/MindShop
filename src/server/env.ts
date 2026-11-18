import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import type { Storage } from "./storage/types";

export type Bindings = {
  DB: D1Database;
  R2: Storage;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  BETTER_AUTH_SECRET?: string;
};

export type AppEnv = { Bindings: Bindings };
