import { prisma } from "@/lib/db";

export type ResolvedChartAccount = {
  id: string;
  code: string;
  name: string;
  type: string | null;
};

function normalizeCodeForLookup(code: string): string {
  const t = code.trim();
  const digits = t.replace(/\D/g, "");
  if (digits.length > 0 && /^\d+([.,]\d+)?$/.test(t.replace(/\s/g, ""))) {
    return String(parseInt(digits, 10));
  }
  return t;
}

export async function resolveChartAccountByCode(
  userId: string,
  code: string | null | undefined,
): Promise<ResolvedChartAccount | null> {
  if (!code?.trim()) return null;
  const normalized = normalizeCodeForLookup(code);
  if (!normalized) return null;

  const row = await prisma.chartAccount.findFirst({
    where: { userId, code: normalized, active: true },
    select: { id: true, code: true, name: true, type: true },
  });
  if (row) return row;

  return prisma.chartAccount.findFirst({
    where: { userId, code: code.trim(), active: true },
    select: { id: true, code: true, name: true, type: true },
  });
}

export async function resolveChartAccountByName(
  userId: string,
  name: string | null | undefined,
): Promise<ResolvedChartAccount | null> {
  if (!name?.trim()) return null;
  const needle = name.trim();

  const exact = await prisma.chartAccount.findFirst({
    where: { userId, name: { equals: needle, mode: "insensitive" }, active: true },
    select: { id: true, code: true, name: true, type: true },
  });
  if (exact) return exact;

  const partial = await prisma.chartAccount.findFirst({
    where: {
      userId,
      active: true,
      OR: [
        { name: { contains: needle.slice(0, 24), mode: "insensitive" } },
        { name: { startsWith: needle.slice(0, 12), mode: "insensitive" } },
      ],
    },
    select: { id: true, code: true, name: true, type: true },
  });
  return partial;
}

export async function resolveChartAccountForExtraction(
  userId: string,
  code: string | null | undefined,
  nameHint: string | null | undefined,
): Promise<ResolvedChartAccount | null> {
  const byCode = await resolveChartAccountByCode(userId, code);
  if (byCode) return byCode;
  return resolveChartAccountByName(userId, nameHint);
}
