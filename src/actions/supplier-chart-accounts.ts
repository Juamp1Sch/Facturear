"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";

export type SerializedSupplierChartLink = {
  id: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  chartAccountId: string;
  chartAccountCode: string;
  chartAccountName: string;
};

export type AssociationFormData = {
  accounts: { id: string; code: string; name: string; type: string | null }[];
  suppliers: { id: string; code: string; name: string; cuit: string | null }[];
  links: SerializedSupplierChartLink[];
};

export async function getSupplierChartAssociationFormData(): Promise<AssociationFormData> {
  if (!isDatabaseConfigured()) {
    return { accounts: [], suppliers: [], links: [] };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const [accounts, suppliers, links] = await Promise.all([
    prisma.chartAccount.findMany({
      where: { userId, active: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    prisma.supplier.findMany({
      where: { userId },
      select: { id: true, code: true, name: true, cuit: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplierChartAccountLink.findMany({
      where: { userId },
      include: {
        supplier: { select: { code: true, name: true } },
        chartAccount: { select: { code: true, name: true } },
      },
      orderBy: { supplier: { name: "asc" } },
    }),
  ]);

  return {
    accounts,
    suppliers,
    links: links.map((l) => ({
      id: l.id,
      supplierId: l.supplierId,
      supplierCode: l.supplier.code,
      supplierName: l.supplier.name,
      chartAccountId: l.chartAccountId,
      chartAccountCode: l.chartAccount.code,
      chartAccountName: l.chartAccount.name,
    })),
  };
}

export type SaveSupplierChartLinksResult =
  | { ok: true; linked: number }
  | { ok: false; error: string };

export async function saveSupplierChartAccountLinks(
  formData: FormData,
): Promise<SaveSupplierChartLinksResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;

  const chartAccountId = String(formData.get("chartAccountId") ?? "").trim();
  if (!chartAccountId) {
    return { ok: false, error: "Elegí una cuenta del plan." };
  }

  const account = await prisma.chartAccount.findFirst({
    where: { id: chartAccountId, userId, active: true },
    select: { id: true },
  });
  if (!account) {
    return { ok: false, error: "La cuenta seleccionada no existe." };
  }

  const supplierIds = formData
    .getAll("supplierIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (supplierIds.length === 0) {
    return { ok: false, error: "Seleccioná al menos un proveedor." };
  }

  const validSuppliers = await prisma.supplier.findMany({
    where: { userId, id: { in: supplierIds } },
    select: { id: true },
  });
  if (validSuppliers.length !== supplierIds.length) {
    return { ok: false, error: "Uno o más proveedores no son válidos." };
  }

  await prisma.$transaction(
    validSuppliers.map((s) =>
      prisma.supplierChartAccountLink.upsert({
        where: { supplierId: s.id },
        create: {
          userId,
          supplierId: s.id,
          chartAccountId: account.id,
        },
        update: {
          chartAccountId: account.id,
        },
      }),
    ),
  );

  revalidatePath("/cuentas/asociar-proveedores");
  revalidatePath("/cuentas");
  revalidatePath("/history");
  revalidatePath("/upload");

  return { ok: true, linked: validSuppliers.length };
}

export type RemoveSupplierChartLinkResult = { ok: true } | { ok: false; error: string };

export async function removeSupplierChartAccountLink(
  formData: FormData,
): Promise<RemoveSupplierChartLinkResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const linkId = String(formData.get("linkId") ?? "").trim();
  if (!linkId) {
    return { ok: false, error: "Falta la asociación." };
  }

  const existing = await prisma.supplierChartAccountLink.findFirst({
    where: { id: linkId, userId: session.user.id },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró la asociación." };
  }

  await prisma.supplierChartAccountLink.delete({ where: { id: linkId } });

  revalidatePath("/cuentas/asociar-proveedores");
  revalidatePath("/history");
  revalidatePath("/upload");

  return { ok: true };
}
