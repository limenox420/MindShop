/**
 * Loads .env (project root) into process.env. Must be imported before any
 * module that reads environment at evaluation time (e.g. db/dialect.ts).
 * Existing environment variables win over .env values.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const envFile = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../.env"),
    "utf8",
  );
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // no .env file — rely on the real environment
}
