import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

function loadDatabaseUrlFromFile(file) {
  const content = readFileSync(file, "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (!match) return null;
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

const statements = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_token_hash" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_reset_token_expires_at" TIMESTAMP(3)`,
];

async function apply(label, databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();
  const host = databaseUrl.replace(/:[^:@]+@/, ":***@");
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User'
      AND column_name IN ('password_reset_token_hash', 'password_reset_token_expires_at')
    `;
    console.log(
      `[${label}] OK — ${host} — password_reset columns: ${cols.length}/2`,
    );
  } catch (e) {
    console.error(`[${label}] FAIL — ${host}`, e.message);
  } finally {
    await prisma.$disconnect();
  }
}

const localUrl =
  process.env.DATABASE_URL ?? loadDatabaseUrlFromFile(".env");
const neonUrl = loadDatabaseUrlFromFile(".env.production.local");

if (localUrl) await apply("local .env", localUrl);
if (neonUrl && neonUrl !== localUrl) await apply("neon .env.production.local", neonUrl);
