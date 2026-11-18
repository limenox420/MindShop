import { createAuthClient } from "better-auth/react";
import i18n, { translateServerError } from "./i18n";

export const authClient = createAuthClient();
export const { useSession, signOut } = authClient;

// better-auth client infers user type without the server-side additionalFields,
// so read the extra field with a cast
export function userRole(user: unknown): string {
  return (user as { role?: string } | null)?.role ?? "user";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = translateServerError(data.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function money(cents: number, currency = "CNY") {
  const symbol = currency === "CNY" ? "¥" : currency + " ";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function orderStatus(status: string): string {
  return i18n.t(`status.${status}`);
}

export function fmtDate(v: string | number | Date): string {
  return new Date(v).toLocaleString(i18n.language);
}
