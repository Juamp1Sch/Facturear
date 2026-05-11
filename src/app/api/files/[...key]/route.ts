import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

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
  const { key: segments } = await ctx.params;
  const joined = segments?.join("/") ?? "";
  const key = decodeURIComponent(joined);

  const resolved = path.resolve(ROOT, key);
  const rootResolved = path.resolve(ROOT);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!existsSync(resolved)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readFile(resolved);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
