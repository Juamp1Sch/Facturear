import { headers } from "next/headers";

import { prisma } from "@/lib/db";

export type RateLimitRule = { limit: number; windowMs: number };

/** Intentos fallidos de contraseña por email antes de bloquear 15 min. */
export const LOGIN_EMAIL_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60_000 };
/** Intentos fallidos por IP (credential stuffing contra muchos emails). */
export const LOGIN_IP_RULE: RateLimitRule = { limit: 30, windowMs: 15 * 60_000 };
/** Solicitudes de registro / reset por IP (cada una manda un mail al administrador). */
export const ACCOUNT_REQUEST_IP_RULE: RateLimitRule = { limit: 5, windowMs: 60 * 60_000 };

/** Milisegundos de bloqueo restantes para `key`, o 0 si puede seguir intentando. */
export async function rateLimitRemainingMs(
  key: string,
  rule: RateLimitRule,
): Promise<number> {
  const row = await prisma.authRateLimit.findUnique({ where: { key } });
  if (!row) return 0;
  const elapsed = Date.now() - row.windowStart.getTime();
  if (elapsed >= rule.windowMs) return 0;
  return row.count >= rule.limit ? rule.windowMs - elapsed : 0;
}

/** Suma un intento de forma atómica; si la ventana venció, arranca una nueva. */
export async function recordRateLimitHit(
  key: string,
  rule: RateLimitRule,
): Promise<void> {
  const windowSeconds = Math.ceil(rule.windowMs / 1000);
  // window_start es TIMESTAMP sin zona: se compara y guarda siempre en UTC (como lo lee Prisma).
  await prisma.$executeRaw`
    INSERT INTO "auth_rate_limits" ("key", "count", "window_start")
    VALUES (${key}, 1, NOW() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "auth_rate_limits"."window_start" < (NOW() AT TIME ZONE 'UTC') - ${windowSeconds}::int * INTERVAL '1 second'
        THEN 1 ELSE "auth_rate_limits"."count" + 1 END,
      "window_start" = CASE
        WHEN "auth_rate_limits"."window_start" < (NOW() AT TIME ZONE 'UTC') - ${windowSeconds}::int * INTERVAL '1 second'
        THEN NOW() AT TIME ZONE 'UTC' ELSE "auth_rate_limits"."window_start" END`;
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { key } });
}

export function rateLimitMessage(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `Demasiados intentos. Probá de nuevo en ${minutes} minuto${minutes === 1 ? "" : "s"}.`;
}

/** IP del cliente según los headers del proxy (Vercel pone x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export const loginEmailKey = (email: string) => `login:email:${email.toLowerCase()}`;
export const loginIpKey = (ip: string) => `login:ip:${ip}`;
export const accountRequestIpKey = (ip: string) => `account-request:ip:${ip}`;
