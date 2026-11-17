import crypto from "crypto";
import { deriveKey } from "~/.server/secret";

/** Create an HMAC-signed cookie value with expiry so it can't be forged */
export function signCookieValue(uploadId: string): string {
  const expiresAt = Date.now() + 3600 * 1000; // 1 hour
  const payload = `${uploadId}:${expiresAt}`;
  const sig = crypto.createHmac("sha256", deriveKey("file-password")).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** Verify an HMAC-signed cookie value including expiry check */
export function verifyCookieSignature(value: string, uploadId: string): boolean {
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = value.substring(0, lastDot);
  const sig = value.substring(lastDot + 1);
  const expected = crypto.createHmac("sha256", deriveKey("file-password")).update(payload).digest("hex");
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  // Verify expiry
  const parts = payload.split(":");
  if (parts.length < 2) return false;
  // The cookie must have been issued for THIS upload, otherwise a cookie from one unlocked file would open any other
  if (parts.slice(0, -1).join(":") !== uploadId) return false;
  const expiresAt = parseInt(parts[parts.length - 1], 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}
