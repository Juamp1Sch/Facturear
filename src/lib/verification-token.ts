import { createHash, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_BYTES = 24;
const VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

export function generateVerificationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verificationTokensMatch(
  storedHash: string,
  token: string,
): boolean {
  const computed = hashVerificationToken(token);
  const a = Buffer.from(storedHash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verificationTokenExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + VERIFICATION_TTL_MS);
}

export function passwordResetTokenExpiresAt(from = new Date()): Date {
  return verificationTokenExpiresAt(from);
}
