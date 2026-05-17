import { mkdir, writeFile } from "fs/promises";
import path from "path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";

export type UploadResult = {
  key: string;
  /** URL usable in <img> / <iframe> / redirect */
  publicUrl: string;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

function s3BucketName(): string | undefined {
  const raw = env("AWS_S3_BUCKET") ?? env("S3_BUCKET_NAME");
  if (!raw) return undefined;
  return raw.replace(/^s3:\/\//, "").split("/")[0];
}

export function isS3Configured(): boolean {
  return Boolean(
    env("AWS_ACCESS_KEY_ID") &&
      env("AWS_SECRET_ACCESS_KEY") &&
      s3BucketName() &&
      env("AWS_REGION"),
  );
}

/** Lista variables S3 faltantes (para mensajes de error en producción). */
export function missingS3EnvVars(): string[] {
  const missing: string[] = [];
  if (!env("AWS_ACCESS_KEY_ID")) missing.push("AWS_ACCESS_KEY_ID");
  if (!env("AWS_SECRET_ACCESS_KEY")) missing.push("AWS_SECRET_ACCESS_KEY");
  if (!s3BucketName()) missing.push("AWS_S3_BUCKET (o S3_BUCKET_NAME)");
  if (!env("AWS_REGION")) missing.push("AWS_REGION");
  return missing;
}

function useDatabaseStorage(): boolean {
  return !isS3Configured() && isDatabaseConfigured();
}

function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

function userIdFromStorageKey(key: string): string | null {
  const match = /^invoices\/([^/]+)\//.exec(key);
  return match?.[1] ?? null;
}

function appBaseUrl(): string {
  return env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

function publicUrlForAppFile(key: string): string {
  return `${appBaseUrl()}/api/files/${encodeURIComponent(key)}`;
}

function getS3Client(): S3Client {
  return new S3Client({
    region: env("AWS_REGION")!,
    credentials: {
      accessKeyId: env("AWS_ACCESS_KEY_ID")!,
      secretAccessKey: env("AWS_SECRET_ACCESS_KEY")!,
    },
  });
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

function storageNotConfiguredMessage(): string {
  const missing = missingS3EnvVars();
  if (missing.length > 0) {
    return (
      `Almacenamiento no configurado en Vercel. Faltan en Environment Variables: ${missing.join(", ")}. ` +
      "O bien usá solo DATABASE_URL (Neon) sin S3: las facturas se guardan en la base."
    );
  }
  if (isDatabaseConfigured()) {
    return "No se pudo usar S3 ni la base de datos para guardar el archivo.";
  }
  return "Configurá las 4 variables AWS_* en Vercel o DATABASE_URL (Neon).";
}

async function uploadToDatabase(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const userId = userIdFromStorageKey(params.key);
  if (!userId) {
    throw new Error("Clave de archivo inválida.");
  }

  await prisma.storedFile.upsert({
    where: { key: params.key },
    create: {
      key: params.key,
      userId,
      contentType: params.contentType,
      data: params.buffer,
    },
    update: {
      contentType: params.contentType,
      data: params.buffer,
    },
  });

  return { key: params.key, publicUrl: publicUrlForAppFile(params.key) };
}

async function uploadToLocalDisk(params: {
  key: string;
  buffer: Buffer;
}): Promise<UploadResult> {
  const fullPath = path.join(LOCAL_ROOT, params.key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, params.buffer);
  return { key: params.key, publicUrl: publicUrlForAppFile(params.key) };
}

export async function uploadBuffer(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const { key, buffer, contentType } = params;

  if (isS3Configured()) {
    const client = getS3Client();
    const bucket = s3BucketName()!;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    const signed = await getSignedReadUrl(key);
    return { key, publicUrl: signed };
  }

  if (useDatabaseStorage()) {
    return uploadToDatabase({ key, buffer, contentType });
  }

  if (isVercel()) {
    throw new Error(storageNotConfiguredMessage());
  }

  return uploadToLocalDisk({ key, buffer });
}

export async function readStoredFile(key: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  if (!useDatabaseStorage()) return null;
  const row = await prisma.storedFile.findUnique({ where: { key } });
  if (!row) return null;
  return {
    buffer: Buffer.from(row.data),
    contentType: row.contentType,
  };
}

export async function getSignedReadUrl(key: string): Promise<string> {
  if (isS3Configured()) {
    const client = getS3Client();
    const bucket = s3BucketName()!;
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn: 60 * 60 });
  }

  return publicUrlForAppFile(key);
}
