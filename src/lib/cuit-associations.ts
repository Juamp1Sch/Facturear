import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

function normalizeValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeValue(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export async function getCuitEmpresas(
  userId: string,
  cuit: string | null | undefined,
): Promise<string[]> {
  if (!cuit?.trim()) return [];
  const rows = await prisma.cuitEmpresa.findMany({
    where: { userId, cuit },
    orderBy: { createdAt: "asc" },
    select: { value: true },
  });
  return rows.map((r) => r.value);
}

export async function getCuitSucursales(
  userId: string,
  cuit: string | null | undefined,
): Promise<string[]> {
  if (!cuit?.trim()) return [];
  const rows = await prisma.cuitSucursal.findMany({
    where: { userId, cuit },
    orderBy: { createdAt: "asc" },
    select: { value: true },
  });
  return rows.map((r) => r.value);
}

export async function getCuitAssociationsForCuits(
  userId: string,
  cuits: (string | null | undefined)[],
): Promise<{
  empresasByCuit: Map<string, string[]>;
  sucursalesByCuit: Map<string, string[]>;
}> {
  const uniqueCuits = [
    ...new Set(cuits.filter((c): c is string => Boolean(c?.trim()))),
  ];
  const empresasByCuit = new Map<string, string[]>();
  const sucursalesByCuit = new Map<string, string[]>();
  if (uniqueCuits.length === 0) {
    return { empresasByCuit, sucursalesByCuit };
  }

  const [empresaRows, sucursalRows] = await Promise.all([
    prisma.cuitEmpresa.findMany({
      where: { userId, cuit: { in: uniqueCuits } },
      orderBy: { createdAt: "asc" },
      select: { cuit: true, value: true },
    }),
    prisma.cuitSucursal.findMany({
      where: { userId, cuit: { in: uniqueCuits } },
      orderBy: { createdAt: "asc" },
      select: { cuit: true, value: true },
    }),
  ]);

  for (const c of uniqueCuits) {
    empresasByCuit.set(c, []);
    sucursalesByCuit.set(c, []);
  }
  for (const row of empresaRows) {
    empresasByCuit.get(row.cuit)?.push(row.value);
  }
  for (const row of sucursalRows) {
    sucursalesByCuit.get(row.cuit)?.push(row.value);
  }

  return { empresasByCuit, sucursalesByCuit };
}

export async function upsertCuitEmpresa(
  userId: string,
  cuit: string | null | undefined,
  value: string | null | undefined,
): Promise<void> {
  const normalizedCuit = cuit?.trim();
  const normalizedValue = normalizeValue(value);
  if (!normalizedCuit || !normalizedValue) return;

  await prisma.cuitEmpresa.upsert({
    where: {
      userId_cuit_value: {
        userId,
        cuit: normalizedCuit,
        value: normalizedValue,
      },
    },
    create: { userId, cuit: normalizedCuit, value: normalizedValue },
    update: {},
  });
}

export async function upsertCuitSucursal(
  userId: string,
  cuit: string | null | undefined,
  value: string | null | undefined,
): Promise<void> {
  const normalizedCuit = cuit?.trim();
  const normalizedValue = normalizeValue(value);
  if (!normalizedCuit || !normalizedValue) return;

  await prisma.cuitSucursal.upsert({
    where: {
      userId_cuit_value: {
        userId,
        cuit: normalizedCuit,
        value: normalizedValue,
      },
    },
    create: { userId, cuit: normalizedCuit, value: normalizedValue },
    update: {},
  });
}

export type ResolvedEmpresaSucursal = {
  empresas: string[];
  sucursales: string[];
  autoEmpresa: string | null;
  autoSucursal: string | null;
};

export async function resolveEmpresaSucursalForInvoice(
  userId: string,
  cuit: string | null | undefined,
): Promise<ResolvedEmpresaSucursal> {
  const [empresas, sucursales] = await Promise.all([
    getCuitEmpresas(userId, cuit),
    getCuitSucursales(userId, cuit),
  ]);

  return {
    empresas,
    sucursales,
    autoEmpresa: empresas.length === 1 ? empresas[0]! : null,
    autoSucursal: sucursales.length === 1 ? sucursales[0]! : null,
  };
}

async function replaceCuitValues(
  tx: Prisma.TransactionClient,
  userId: string,
  cuit: string,
  model: "empresa" | "sucursal",
  values: string[],
): Promise<void> {
  const normalized = normalizeValues(values);
  if (model === "empresa") {
    if (normalized.length === 0) {
      await tx.cuitEmpresa.deleteMany({ where: { userId, cuit } });
      return;
    }
    await tx.cuitEmpresa.deleteMany({
      where: { userId, cuit, NOT: { value: { in: normalized } } },
    });
    for (const value of normalized) {
      await tx.cuitEmpresa.upsert({
        where: { userId_cuit_value: { userId, cuit, value } },
        create: { userId, cuit, value },
        update: {},
      });
    }
    return;
  }

  if (normalized.length === 0) {
    await tx.cuitSucursal.deleteMany({ where: { userId, cuit } });
    return;
  }
  await tx.cuitSucursal.deleteMany({
    where: { userId, cuit, NOT: { value: { in: normalized } } },
  });
  for (const value of normalized) {
    await tx.cuitSucursal.upsert({
      where: { userId_cuit_value: { userId, cuit, value } },
      create: { userId, cuit, value },
      update: {},
    });
  }
}

export async function setCuitEmpresas(
  userId: string,
  cuit: string | null | undefined,
  values: string[],
): Promise<void> {
  const normalizedCuit = cuit?.trim();
  if (!normalizedCuit) return;

  await prisma.$transaction(async (tx) => {
    await replaceCuitValues(tx, userId, normalizedCuit, "empresa", values);
  });
}

export async function setCuitSucursales(
  userId: string,
  cuit: string | null | undefined,
  values: string[],
): Promise<void> {
  const normalizedCuit = cuit?.trim();
  if (!normalizedCuit) return;

  await prisma.$transaction(async (tx) => {
    await replaceCuitValues(tx, userId, normalizedCuit, "sucursal", values);
  });
}

export async function setCuitAssociations(
  userId: string,
  cuit: string | null | undefined,
  empresas: string[],
  sucursales: string[],
): Promise<void> {
  const normalizedCuit = cuit?.trim();
  if (!normalizedCuit) return;

  await prisma.$transaction(async (tx) => {
    await replaceCuitValues(tx, userId, normalizedCuit, "empresa", empresas);
    await replaceCuitValues(tx, userId, normalizedCuit, "sucursal", sucursales);
  });
}
