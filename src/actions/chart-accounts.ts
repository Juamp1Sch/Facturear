"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { parseChartAccountBuffer } from "@/lib/chart-account-import-parse";
import { prisma } from "@/lib/db";
import type { SerializedChartAccount } from "@/types/chart-account";

const MAX_BYTES = 8 * 1024 * 1024;

export type ImportChartAccountsResult =
  | {
      ok: true;
      processed: number;
      created: number;
      updated: number;
      issueCount: number;
      issueSample: string[];
    }
  | { ok: false; error: string };

export async function importChartAccountsMaster(
  formData: FormData,
): Promise<ImportChartAccountsResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Falta DATABASE_URL. Configurá la base de datos primero." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }
  if (file.size === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "El archivo supera los 8 MB." };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return {
      ok: false,
      error: "Formato no soportado. Usá .xlsx, .xls o .csv.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseChartAccountBuffer(buffer);

  if (parsed.headerRowIndex < 0 && parsed.issues.length > 0) {
    return { ok: false, error: parsed.issues[0]?.reason ?? "No se pudo interpretar el archivo." };
  }
  if (parsed.rows.length === 0) {
    const hint =
      parsed.issues.length > 0
        ? parsed.issues
            .slice(0, 3)
            .map((i) => `Fila ${i.rowNumber}: ${i.reason}`)
            .join(" ")
        : "No se encontraron filas con código y nombre.";
    return { ok: false, error: `No se importó ninguna cuenta. ${hint}` };
  }

  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const r of parsed.rows) {
        const existing = await tx.chartAccount.findFirst({
          where: { userId, code: r.code },
          select: { id: true },
        });
        if (existing) {
          await tx.chartAccount.update({
            where: { id: existing.id },
            data: {
              name: r.name,
              type: r.type,
              active: r.active,
            },
          });
          updated += 1;
        } else {
          await tx.chartAccount.create({
            data: {
              userId,
              code: r.code,
              name: r.name,
              type: r.type,
              active: r.active,
            },
          });
          created += 1;
        }
      }
    },
    { timeout: 120_000 },
  );

  revalidatePath("/cuentas");
  revalidatePath("/carga-cuentas");
  revalidatePath("/history");
  revalidatePath("/upload");

  const issueSample = parsed.issues.slice(0, 8).map((i) => `Fila ${i.rowNumber}: ${i.reason}`);

  return {
    ok: true,
    processed: parsed.rows.length,
    created,
    updated,
    issueCount: parsed.issues.length,
    issueSample,
  };
}

export async function countChartAccountsForUser(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const session = await auth();
  if (!session?.user?.id) return 0;
  return prisma.chartAccount.count({ where: { userId: session.user.id, active: true } });
}

const CHART_ACCOUNTS_PAGE_SIZE = 30;

export async function listChartAccountsPageForUser(
  requestedPage: number,
  pageSize: number = CHART_ACCOUNTS_PAGE_SIZE,
): Promise<{
  accounts: SerializedChartAccount[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}> {
  if (!isDatabaseConfigured()) {
    return { accounts: [], total: 0, page: 1, totalPages: 1, pageSize };
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;
  const total = await prisma.chartAccount.count({ where: { userId, active: true } });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const skip = (page - 1) * pageSize;

  const rows = await prisma.chartAccount.findMany({
    where: { userId, active: true },
    orderBy: { code: "asc" },
    skip,
    take: pageSize,
  });

  return {
    accounts: JSON.parse(JSON.stringify(rows)) as SerializedChartAccount[],
    total,
    page,
    totalPages,
    pageSize,
  };
}
