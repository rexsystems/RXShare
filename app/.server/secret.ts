import crypto from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const KNOWN_DEFAULTS = new Set(["change-this-secret-key-in-production", "change-me", ""]);
let fileSecret: string | null = null;

/**
 * Returns the secret used to sign sessions and cookies.
 *
 * Read lazily (not at import time) because the setup wizard writes JWT_SECRET
 * into process.env after the server has started. If no usable JWT_SECRET is
 * configured we generate a random one and persist it in the data directory,
 * so we never fall back to a publicly known value.
 */
export function getSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && !KNOWN_DEFAULTS.has(fromEnv)) return fromEnv;
  if (fileSecret) return fileSecret;

  const dir = join(process.cwd(), "data");
  const file = join(dir, ".jwt_secret");
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8").trim();
      if (existing.length >= 32) return (fileSecret = existing);
    }
    mkdirSync(dir, { recursive: true });
    const generated = crypto.randomBytes(48).toString("hex");
    writeFileSync(file, generated, { mode: 0o600 });
    console.warn("[rxshare] JWT_SECRET is not set - generated a random one at data/.jwt_secret. Set JWT_SECRET in .env to manage it yourself.");
    return (fileSecret = generated);
  } catch {
    // Read-only filesystem: use an ephemeral secret (sessions reset on restart).
    console.warn("[rxshare] JWT_SECRET is not set and data/ is not writable - using an ephemeral secret.");
    return (fileSecret = crypto.randomBytes(48).toString("hex"));
  }
}

/** Derive a purpose-specific key so one leaked token type can't be reused as another. */
export function deriveKey(purpose: string): Buffer {
  return crypto.createHmac("sha256", getSecret()).update(`rxshare:${purpose}`).digest();
}
