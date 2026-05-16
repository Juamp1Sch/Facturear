import { prisma } from "@/lib/db";

const MAX_HINT_CHARS = 14_000;
const MAX_ROWS = 500;

/**
 * Plan de cuentas del usuario para que la IA elija el código de cuenta más adecuado.
 */
export async function loadChartAccountHintsBlock(userId: string): Promise<string | null> {
  const rows = await prisma.chartAccount.findMany({
    where: { userId, active: true },
    select: { code: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { code: "asc" }],
    take: MAX_ROWS,
  });
  if (rows.length === 0) return null;

  const header =
    "Plan de cuentas importado del usuario. Para el campo chart_account_code elegí el código (columna Cuenta) " +
    "de UNA cuenta de esta lista que corresponda a cómo se pagará o imputará la factura del proveedor " +
    "(ej. EFECTIVO, MERCADO PAGO, GALICIA, bancos). Si en el comprobante aparece un banco, CBU, " +
    "transferencia o medio de pago, priorizá esa coincidencia. Si no hay señal clara, devolvé null. " +
    "Solo códigos de esta lista; no inventes códigos.\n\n";

  let body = "";
  for (const r of rows) {
    const typeSuffix = r.type ? ` (${r.type})` : "";
    const line = `- ${r.code}: ${r.name}${typeSuffix}\n`;
    if (header.length + body.length + line.length > MAX_HINT_CHARS) break;
    body += line;
  }
  return `${header}${body}`.trimEnd();
}
