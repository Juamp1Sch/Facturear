import { resolveFechaFacturaForApi } from "@/lib/invoice-calendar-date";
import { buildCodigoComprobante, parseDocumentKind } from "@/lib/comprobante-code";
import { matchPerceptionLineToAccount } from "@/lib/tax-line-match";
import type { PerceptionChartAccount } from "@/lib/tax-chart-account";
import type { TaxBreakdownLine } from "@/lib/schemas";
import type { SerializedChartAccount } from "@/types/invoice";

export type ContableLine = {
  monto: number;
  cuenta: string | null;
  subcuenta?: string;
  centroCosto: null;
  tipoImpuesto: string | null;
};

export type MercaderiaLine = {
  precio?: number;
  cantidad: number;
  descuento: number;
  articuloId: string;
};

export type InvoiceJsonShape = {
  id: string;
  empresa: string | null;
  contable: ContableLine[];
  sucursal: string | null;
  mercaderias: MercaderiaLine[];
  proveedorId: string | null;
  fechaFactura: string | null;
  codigoComprobante: string | null;
  numeroComprobante: string | null;
};

function decimalToNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Reparte un monto en N partes iguales en centavos (suma exacta). Fallback sin desglose. */
function splitAmountInEqualParts(total: number, parts: number): number[] {
  if (parts <= 0 || total <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents % parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    out.push((base + (i < remainder ? 1 : 0)) / 100);
  }
  return out;
}

function buildVatContableLines(
  vatAmount: string | null,
  vatLines: TaxBreakdownLine[] | null | undefined,
  vatCuentaCode: string | null,
): ContableLine[] {
  const fromBreakdown = vatLines?.filter((l) => l.amount > 0) ?? [];
  if (fromBreakdown.length > 0) {
    return fromBreakdown.map((l) => ({
      monto: l.amount,
      cuenta: vatCuentaCode,
      centroCosto: null,
      tipoImpuesto: "I21",
    }));
  }

  const vat = decimalToNumber(vatAmount);
  if (vat != null && vat > 0) {
    return [
      {
        monto: vat,
        cuenta: vatCuentaCode,
        centroCosto: null,
        tipoImpuesto: "I21",
      },
    ];
  }
  return [];
}

function buildPerceptionContableLines(
  perceptionsAmount: string | null,
  perceptionLines: TaxBreakdownLine[] | null | undefined,
  perceptionsAccounts: PerceptionChartAccount[],
): ContableLine[] {
  const fromBreakdown = perceptionLines?.filter((l) => l.amount > 0) ?? [];

  if (fromBreakdown.length > 0) {
    return fromBreakdown.map((l) => ({
      monto: l.amount,
      cuenta: matchPerceptionLineToAccount(l.label, perceptionsAccounts),
      centroCosto: null,
      tipoImpuesto: "PERC",
    }));
  }

  const perceptions = decimalToNumber(perceptionsAmount);
  if (perceptions == null || perceptions <= 0 || perceptionsAccounts.length === 0) {
    return [];
  }

  if (perceptionsAccounts.length === 1) {
    return [
      {
        monto: perceptions,
        cuenta: perceptionsAccounts[0]!.code,
        centroCosto: null,
        tipoImpuesto: "PERC",
      },
    ];
  }

  const amounts = splitAmountInEqualParts(perceptions, perceptionsAccounts.length);
  return perceptionsAccounts
    .map((acc, i) => ({
      monto: amounts[i] ?? 0,
      cuenta: acc.code,
      centroCosto: null as null,
      tipoImpuesto: "PERC" as const,
    }))
    .filter((l) => l.monto > 0);
}

/** Neto gravado 21% (G21) cuando hay línea de IVA I21 (ApiSigma ImportCompras). */
function applyGravado21OnNetWhenVatI21(lines: ContableLine[]): ContableLine[] {
  if (!lines.some((l) => l.tipoImpuesto === "I21")) return lines;

  const netLineIndex = lines.findIndex((l) => l.tipoImpuesto === null);
  if (netLineIndex < 0) return lines;

  return lines.map((line, i) =>
    i === netLineIndex ? { ...line, tipoImpuesto: "G21" } : line,
  );
}

function buildContableLines(
  netAmount: string | null,
  vatAmount: string | null,
  vatLines: TaxBreakdownLine[] | null | undefined,
  perceptionsAmount: string | null,
  perceptionLines: TaxBreakdownLine[] | null | undefined,
  totalAmount: string | null,
  mainCuentaCode: string | null,
  vatCuentaCode: string | null,
  perceptionsAccounts: PerceptionChartAccount[],
): ContableLine[] {
  const lines: ContableLine[] = [];
  const net = decimalToNumber(netAmount);
  const total = decimalToNumber(totalAmount);

  if (net != null && net > 0) {
    lines.push({
      monto: net,
      cuenta: mainCuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  lines.push(...buildVatContableLines(vatAmount, vatLines, vatCuentaCode));
  lines.push(
    ...buildPerceptionContableLines(
      perceptionsAmount,
      perceptionLines,
      perceptionsAccounts,
    ),
  );

  if (lines.length === 0 && total != null && total > 0) {
    lines.push({
      monto: total,
      cuenta: mainCuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  return applyGravado21OnNetWhenVatI21(lines);
}

export type InvoiceJsonSource = {
  movementId: string | null;
  empresa: string | null;
  sucursal: string | null;
  supplierCode: string | null;
  invoiceDate: string | Date | null;
  invoiceType: string | null;
  documentKind: string | null;
  invoiceNumber: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  vatLines?: TaxBreakdownLine[] | null;
  perceptionsAmount: string | null;
  perceptionLines?: TaxBreakdownLine[] | null;
  totalAmount: string | null;
  chartAccount: SerializedChartAccount | null;
  vatChartAccountCode?: string | null;
  perceptionsAccounts?: PerceptionChartAccount[];
};

export function buildInvoiceJson(invoice: InvoiceJsonSource): InvoiceJsonShape {
  const mainCuentaCode = invoice.chartAccount?.code ?? null;
  const kind = parseDocumentKind(invoice.documentKind);

  return {
    id: invoice.movementId ?? "",
    empresa: invoice.empresa,
    contable: buildContableLines(
      invoice.netAmount,
      invoice.vatAmount,
      invoice.vatLines,
      invoice.perceptionsAmount,
      invoice.perceptionLines,
      invoice.totalAmount,
      mainCuentaCode,
      invoice.vatChartAccountCode ?? null,
      invoice.perceptionsAccounts ?? [],
    ),
    sucursal: invoice.sucursal,
    mercaderias: [],
    proveedorId: invoice.supplierCode,
    fechaFactura: resolveFechaFacturaForApi(
      invoice.invoiceDate,
      invoice.movementId,
    ),
    codigoComprobante: buildCodigoComprobante(invoice.invoiceType, kind),
    numeroComprobante: invoice.invoiceNumber,
  };
}
