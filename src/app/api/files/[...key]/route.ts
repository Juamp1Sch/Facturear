import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { readStoredFile } from "@/lib/storage";

const ROOT = path.join(process.cwd(), ".data", "uploads");

function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { key: segments } = await ctx.params;
  const joined = segments?.join("/") ?? "";
  const key = decodeURIComponent(joined);

  const allowedPrefix = `invoices/${session.user.id}/`;
  if (!key.startsWith(allowedPrefix)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const fromDb = await readStoredFile(key);
  if (fromDb) {
    return new NextResponse(new Uint8Array(fromDb.buffer), {
      headers: {
        "Content-Type": fromDb.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const resolved = path.resolve(ROOT, key);
  const rootResolved = path.resolve(ROOT);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!existsSync(resolved)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readFile(resolved);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
