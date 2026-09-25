// Aplica las migraciones de Prisma en el build de Vercel, SOLO en producción y ANTES de
// `next build`: el código nuevo nunca sale a servir contra un schema viejo.
//
// - Previews y builds locales: no migran (comparten o no la base de prod; no se toca).
// - Usa la conexión directa de Neon (DATABASE_URL_UNPOOLED, la define la integración
//   Neon ↔ Vercel) porque `prisma migrate` no funciona a través del pooler (PgBouncer).
// - Si la migración falla, el build falla y Vercel mantiene el deploy anterior.
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[migrate-on-deploy] VERCEL_ENV=${env ?? "(local)"}: se omiten las migraciones.`);
  process.exit(0);
}

const directUrl =
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();
if (!directUrl) {
  console.error("[migrate-on-deploy] No hay DATABASE_URL_UNPOOLED / DIRECT_URL / DATABASE_URL.");
  process.exit(1);
}
if (directUrl === process.env.DATABASE_URL?.trim() && /-pooler\./.test(directUrl)) {
  console.warn(
    "[migrate-on-deploy] Usando la URL con pooler: configurá DATABASE_URL_UNPOOLED para migrar por conexión directa.",
  );
}

console.log("[migrate-on-deploy] Producción: aplicando migraciones pendientes (prisma migrate deploy)…");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: directUrl },
});

if (result.status !== 0) {
  console.error("[migrate-on-deploy] Falló `prisma migrate deploy`: se corta el build (queda el deploy anterior).");
  process.exit(result.status ?? 1);
}
console.log("[migrate-on-deploy] Migraciones al día.");
