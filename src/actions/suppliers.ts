"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { validateArgentineCuitForEntry } from "@/lib/cuit-argentina";
import { isDatabaseConfigured } from "@/lib/database-config";
import { prisma } from "@/lib/db";
import { parseSupplierMasterBuffer } from "@/lib/supplier-import-parse";
import { buildSupplierSearchWhere } from "@/lib/supplier-search";
import {
  getCuitAssociationsForCuits,
  normalizeCuitKey,
  setCuitAssociations,
} from "@/lib/cuit-associations";
import { syncInvoiceSupplierCodesForUser } from "@/lib/supplier-sync";
import type { SerializedSupplier } from "@/types/supplier";

const MAX_BYTES = 8 * 1024 * 1024;

export type ImportSuppliersResult =
  | {
      ok: true;
      /** Filas del archivo aplicadas (crear o actualizar por código). */
      processed: number;
      created: number;
      updated: number;
      issueCount: number;
      issueSample: string[];
    }
  | { ok: false; error: string };

export async function importSuppliersMaster(formData: FormData): Promise<ImportSuppliersResult> {
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
  const parsed = parseSupplierMasterBuffer(buffer);

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
    return { ok: false, error: `No se importó ningún proveedor. ${hint}` };
  }

  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const r of parsed.rows) {
        const existing = await tx.supplier.findFirst({
          where: { userId, code: r.code },
          select: { id: true },
        });
        if (existing) {
          await tx.supplier.update({
            where: { id: existing.id },
            data: {
              cuit: r.cuit,
              name: r.name,
              address: r.address,
              locality: r.locality,
            },
          });
          updated += 1;
        } else {
          await tx.supplier.create({
            data: {
              userId,
              code: r.code,
              cuit: r.cuit,
              name: r.name,
              address: r.address,
              locality: r.locality,
            },
          });
          created += 1;
        }
      }
    },
    { timeout: 120_000 },
  );

  await syncInvoiceSupplierCodesForUser(userId);

  revalidatePath("/proveedores");
  revalidatePath("/carga-proveedores");
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

export async function countSuppliersForUser(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const session = await auth();
  if (!session?.user?.id) return 0;
  return prisma.supplier.count({ where: { userId: session.user.id } });
}

const SUPPLIERS_PAGE_SIZE = 25;

export async function listSuppliersPageForUser(
  requestedPage: number,
  pageSize: number = SUPPLIERS_PAGE_SIZE,
  searchQuery?: string | null,
): Promise<{
  suppliers: SerializedSupplier[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  searchQuery: string;
}> {
  if (!isDatabaseConfigured()) {
    return { suppliers: [], total: 0, page: 1, totalPages: 1, pageSize, searchQuery: "" };
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }
  const userId = session.user.id;
  const search = searchQuery?.trim() ?? "";
  const where = buildSupplierSearchWhere(userId, search);
  const total = await prisma.supplier.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const skip = (page - 1) * pageSize;

  const rows = await prisma.supplier.findMany({
    where,
    orderBy: { code: "asc" },
    skip,
    take: pageSize,
  });

  const { empresasByCuit, sucursalesByCuit } =
    await getCuitAssociationsForCuits(
      userId,
      rows.map((r) => r.cuit),
    );

  const suppliers: SerializedSupplier[] = rows.map((row) => {
    const cuitKey = normalizeCuitKey(row.cuit);
    return {
      ...(JSON.parse(JSON.stringify(row)) as Omit<
        SerializedSupplier,
        "empresas" | "sucursales"
      >),
      empresas: cuitKey ? (empresasByCuit.get(cuitKey) ?? []).slice() : [],
      sucursales: cuitKey
        ? (sucursalesByCuit.get(cuitKey) ?? []).slice()
        : [],
    };
  });

  return {
    suppliers,
    total,
    page,
    totalPages,
    pageSize,
    searchQuery: search,
  };
}

export type UpdateSupplierResult = { ok: true } | { ok: false; error: string };

function formText(value: FormDataEntryValue | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseAssociationsJson(formDataEntry: FormDataEntryValue | null): string[] | null {
  if (formDataEntry == null) return null;
  if (typeof formDataEntry !== "string") return null;
  const raw = formDataEntry.trim();
  if (raw === "") return null;
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return null;
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export async function updateSupplier(formData: FormData): Promise<UpdateSupplierResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Base de datos no configurada." };
  }

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/iniciar-sesion");
  }

  const supplierId = formText(formData.get("supplierId"));
  if (!supplierId) {
    return { ok: false, error: "Falta el proveedor." };
  }

  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, userId: session.user.id },
  });
  if (!existing) {
    return { ok: false, error: "No se encontró el proveedor." };
  }

  const code = formText(formData.get("code"));
  if (!code) {
    return { ok: false, error: "El código es obligatorio." };
  }

  const name = formText(formData.get("name"));
  if (!name) {
    return { ok: false, error: "El nombre es obligatorio." };
  }

  const cuitRaw = formData.get("cuit");
  const cuitStr = typeof cuitRaw === "string" ? cuitRaw : "";
  const cuitValidation = validateArgentineCuitForEntry(cuitStr, { requireVerifier: false });
  if (!cuitValidation.ok) {
    return { ok: false, error: cuitValidation.message };
  }

  const address = formText(formData.get("address"));
  const locality = formText(formData.get("locality"));

  const empresasRaw = formData.get("empresasJson");
  const sucursalesRaw = formData.get("sucursalesJson");
  const assocFieldsBothStrings =
    typeof empresasRaw === "string" && typeof sucursalesRaw === "string";

  if (assocFieldsBothStrings) {
    const assocEmpresasParsed = parseAssociationsJson(empresasRaw);
    const assocSucursalesParsed = parseAssociationsJson(sucursalesRaw);
    if (
      assocEmpresasParsed == null ||
      assocSucursalesParsed == null
    ) {
      return {
        ok: false,
        error:
          "Los datos de empresas o sucursales asociadas no tienen formato válido.",
      };
    }
    if (!cuitValidation.normalized) {
      return {
        ok: false,
        error:
          "Para asociar empresa y sucursal al CUIT, el campo CUIT debe estar completo.",
      };
    }
  }

  const codeChanged = code !== existing.code;
  if (codeChanged) {
    const duplicate = await prisma.supplier.findFirst({
      where: { userId: session.user.id, code, NOT: { id: supplierId } },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false, error: `Ya existe un proveedor con el código «${code}».` };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplier.update({
      where: { id: supplierId },
      data: {
        code,
        name,
        cuit: cuitValidation.normalized,
        address,
        locality,
      },
    });

    if (codeChanged) {
      await tx.invoice.updateMany({
        where: { userId: session.user.id, supplierCode: existing.code },
        data: { supplierCode: code },
      });
    }
  });

  await syncInvoiceSupplierCodesForUser(session.user.id);

  if (assocFieldsBothStrings && cuitValidation.normalized) {
    const assocEmpresasParsed = parseAssociationsJson(
      empresasRaw as string,
    );
    const assocSucursalesParsed = parseAssociationsJson(
      sucursalesRaw as string,
    );
    if (
      assocEmpresasParsed != null &&
      assocSucursalesParsed != null
    ) {
      await setCuitAssociations(
        session.user.id,
        cuitValidation.normalized,
        assocEmpresasParsed,
        assocSucursalesParsed,
      );
    }
  }

  revalidatePath("/proveedores");
  revalidatePath("/carga-proveedores");
  revalidatePath("/history");
  revalidatePath("/upload");

  return { ok: true };
}
