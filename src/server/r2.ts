import type { StorageObject } from "./storage/types";

/**
 * v1 serves R2 objects through the Worker with permission checks (streaming,
 * no size limit issues for typical digital goods). If R2 API credentials are
 * later added as secrets (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY), presigned
 * URLs via aws4fetch can offload bandwidth from the Worker.
 */

export function goodsKey(merchantId: string, productId: string, fileName: string) {
  const safe = fileName.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "_");
  return `goods/${merchantId}/${productId}/${crypto.randomUUID()}-${safe}`;
}

export function qrKey(fileName: string) {
  const ext = fileName.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? "png";
  return `qr-codes/${crypto.randomUUID()}.${ext}`;
}

export function imageKey(merchantId: string, productId: string, fileName: string) {
  const ext = fileName.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? "png";
  return `images/${merchantId}/${productId}/${crypto.randomUUID()}.${ext}`;
}

export function r2PublicUrl(_env: unknown, key: string) {
  return `/api/files/qr/${encodeURIComponent(key)}`;
}

export async function streamR2Object(obj: StorageObject, headers: HeadersInit = {}) {
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(obj.size),
      "cache-control": "private, no-store",
      ...headers,
    },
  });
}
