import { prisma } from "@/lib/db";

const MAX_HINT_CHARS = 12_000;
const MAX_ROWS = 400;

/**
 * Texto opcional para el prompt de extracción: solo proveedores con CUIT en el maestro.
 * Si no hay ninguno, la IA sigue solo con el comprobante.
 */
export async function loadSupplierMaestroCuitHintsBlock(
  userId: string,
): Promise<string | null> {
  const rows = await prisma.supplier.findMany({
    where: { userId, cuit: { not: null } },
    select: { code: true, name: true, cuit: true },
    orderBy: { name: "asc" },
    take: MAX_ROWS,
  });
  if (rows.length === 0) return null;

  const header =
    "Referencia opcional — maestro de proveedores del usuario (solo filas con CUIT cargado). " +
    "Si el nombre del EMISOR en la factura coincide de forma razonable con alguno de estos y el CUIT visible en la cabecera del comprobante coincide con el CUIT de la lista, podés usar ese CUIT en el campo \"cuit\". " +
    "Si no hay coincidencia clara con lo que se ve en el documento, ignorá por completo esta lista y seguí las reglas habituales (solo membrete del emisor).\n\n";

  let body = "";
  for (const r of rows) {
    const line = `- Código ${r.code}: ${r.name} → CUIT ${r.cuit}\n`;
    if (header.length + body.length + line.length > MAX_HINT_CHARS) break;
    body += line;
  }
  return `${header}${body}`.trimEnd();
}
