import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { settings } from "./db/schema";

// single-request uploads go through the Worker, whose body limit is ~100MB;
// larger files use R2 multipart upload in chunks, so the configurable cap
// can go up to 10GB
export const MAX_FILE_SIZE_CAP_BYTES = 10 * 1024 * 1024 * 1024;
export const DEFAULT_MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_CAP_BYTES;
export const MAX_FILE_SIZE_CAP_MB = 10240;

export function fmtLimit(bytes: number): string {
  if (bytes >= 1024 ** 3 && bytes % 1024 ** 3 === 0)
    return `${bytes / 1024 ** 3} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export async function getMaxFileSizeBytes(
  db: ReturnType<typeof getDb>,
): Promise<number> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "upload_limits"))
    .limit(1);
  const v = row?.value as { maxFileSizeBytes?: number } | undefined;
  if (typeof v?.maxFileSizeBytes === "number" && v.maxFileSizeBytes > 0)
    return v.maxFileSizeBytes;
  return DEFAULT_MAX_FILE_SIZE_BYTES;
}

export type SiteSettings = { siteTitle: string | null; contact: string | null };

export async function getSiteSettings(
  db: ReturnType<typeof getDb>,
): Promise<SiteSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "site"))
    .limit(1);
  const v = row?.value as { siteTitle?: string; contact?: string } | undefined;
  const clean = (s: unknown) =>
    typeof s === "string" && s.trim() ? s.trim() : null;
  return { siteTitle: clean(v?.siteTitle), contact: clean(v?.contact) };
}

export type StripeSettings = {
  secretKey: string | null;
  webhookSecret: string | null;
  enabled: boolean;
};

export async function getSeoSettings(
  db: ReturnType<typeof getDb>,
): Promise<{ allowIndex: boolean }> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "seo"))
    .limit(1);
  const v = row?.value as { allowIndex?: boolean } | undefined;
  return { allowIndex: v?.allowIndex !== false };
}export async function getStripeSettings(
  db: ReturnType<typeof getDb>,
): Promise<StripeSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "stripe"))
    .limit(1);
  const v = row?.value as
    | { secretKey?: string; webhookSecret?: string; enabled?: boolean }
    | undefined;
  return {
    secretKey: typeof v?.secretKey === "string" && v.secretKey ? v.secretKey : null,
    webhookSecret:
      typeof v?.webhookSecret === "string" && v.webhookSecret
        ? v.webhookSecret
        : null,
    enabled: v?.enabled === true && !!v.secretKey,
  };
}
