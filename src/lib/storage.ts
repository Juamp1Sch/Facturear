import { mkdir, writeFile } from "fs/promises";
import path from "path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type UploadResult = {
  key: string;
  /** URL usable in <img> / <iframe> / redirect */
  publicUrl: string;
};

function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET &&
      process.env.AWS_REGION,
  );
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

export async function uploadBuffer(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const { key, buffer, contentType } = params;

  if (isS3Configured()) {
    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET!;
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

  const fullPath = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const publicUrl = `${base}/api/files/${encodeURIComponent(key)}`;
  return { key, publicUrl };
}

export async function getSignedReadUrl(key: string): Promise<string> {
  if (isS3Configured()) {
    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET!;
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, cmd, { expiresIn: 60 * 60 });
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/api/files/${encodeURIComponent(key)}`;
}
