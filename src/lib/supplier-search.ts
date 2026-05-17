import type { Prisma } from "@prisma/client";

/** Filtro Prisma para el listado de proveedores (código, nombre, CUIT, dirección, localidad). */
export function buildSupplierSearchWhere(
  userId: string,
  rawQuery: string | null | undefined,
): Prisma.SupplierWhereInput {
  const q = rawQuery?.trim() ?? "";
  if (!q) return { userId };

  const or: Prisma.SupplierWhereInput[] = [
    { code: { contains: q, mode: "insensitive" } },
    { name: { contains: q, mode: "insensitive" } },
    { cuit: { contains: q, mode: "insensitive" } },
    { address: { contains: q, mode: "insensitive" } },
    { locality: { contains: q, mode: "insensitive" } },
  ];

  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits !== q) {
    or.push({ cuit: { contains: digits, mode: "insensitive" } });
  }

  return { userId, OR: or };
}

export function proveedoresListUrl(page: number, searchQuery: string): string {
  const params = new URLSearchParams();
  const q = searchQuery.trim();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/proveedores?${s}` : "/proveedores";
}
