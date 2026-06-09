import { resolveFechaFacturaForApi } from "@/lib/invoice-calendar-date";
import { buildCodigoComprobante, parseDocumentKind } from "@/lib/comprobante-code";
import { matchPerceptionLineToAccount, classifyPerceptionTipoImpuesto } from "@/lib/tax-line-match";
import type { PerceptionChartAccount } from "@/lib/tax-chart-account";
import type { TaxBreakdownLine } from "@/lib/schemas";
import {
  computeGrossBasesByRate,
  groupVatLinesByRate,
} from "@/lib/vat-rate";
import type { SerializedChartAccount } from "@/types/invoice";

/** tipoImpuesto contable para presupuestos (no gravado). */
export const PRESUPUESTO_TIPO_IMPUESTO = "NGR";

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
  tipoMoneda?: "usd";
};

function decimalToNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildVatAndGravadoContableLines(
  netAmount: number | null,
  vatAmount: string | null,
  vatLines: TaxBreakdownLine[] | null | undefined,
  mainCuentaCode: string | null,
  vatCuentaCode: string | null,
): ContableLine[] {
  const fromBreakdown = vatLines?.filter((l) => l.amount > 0) ?? [];

  if (fromBreakdown.length > 0) {
    const groups = computeGrossBasesByRate(
      groupVatLinesByRate(fromBreakdown),
      netAmount,
    );
    const lines: ContableLine[] = [];

    for (const group of groups) {
      if (
        netAmount != null &&
        netAmount > 0 &&
        group.grossAmount != null &&
        group.grossAmount > 0
      ) {
        lines.push({
          monto: group.grossAmount,
          cuenta: mainCuentaCode,
          centroCosto: null,
          tipoImpuesto: group.gravCode,
        });
      }
      lines.push({
        monto: group.vatAmount,
        cuenta: vatCuentaCode,
        centroCosto: null,
        tipoImpuesto: group.ivaCode,
      });
    }

    return lines;
  }

  const lines: ContableLine[] = [];
  const vat = decimalToNumber(vatAmount);

  if (netAmount != null && netAmount > 0) {
    lines.push({
      monto: netAmount,
      cuenta: mainCuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  if (vat != null && vat > 0) {
    lines.push({
      monto: vat,
      cuenta: vatCuentaCode,
      centroCosto: null,
      tipoImpuesto: "I21",
    });
  }

  return applyGravado21OnNetWhenVatI21(lines);
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
      tipoImpuesto: classifyPerceptionTipoImpuesto(l.label),
    }));
  }

  const perceptions = decimalToNumber(perceptionsAmount);
  if (perceptions == null || perceptions <= 0 || perceptionsAccounts.length === 0) {
    return [];
  }

  // Sin desglose: emitimos UNA sola línea con el total (no repartir entre
  // cuentas, porque una factura puede tener solo PIB o solo PIV, no ambos).
  // La cuenta y el tipo se deducen de la única cuenta asociada; con varias
  // cuentas tomamos la primera (el desglose real define PIB/PIV cuando existe).
  const account = perceptionsAccounts[0]!;
  return [
    {
      monto: perceptions,
      cuenta: account.code,
      centroCosto: null,
      tipoImpuesto: classifyPerceptionTipoImpuesto(account.name),
    },
  ];
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

function buildBonificacionContableLines(
  discountAmount: string | null,
  discountLines: TaxBreakdownLine[] | null | undefined,
  bonificacionAccountCode: string | null,
): ContableLine[] {
  if (!bonificacionAccountCode) return [];

  const fromLines = discountLines?.filter((l) => l.amount > 0) ?? [];
  const totalFromLines =
    fromLines.length > 0
      ? fromLines.reduce((acc, l) => acc + l.amount, 0)
      : null;
  const discount =
    totalFromLines != null && totalFromLines > 0
      ? totalFromLines
      : decimalToNumber(discountAmount);

  if (discount == null || discount <= 0) return [];

  return [
    {
      monto: Math.round(discount * 100) / 100,
      cuenta: bonificacionAccountCode,
      centroCosto: null,
      tipoImpuesto: "EXE",
    },
  ];
}

function buildPresupuestoContableLines(
  netAmount: number | null,
  totalAmount: number | null,
  discountAmount: string | null,
  discountLines: TaxBreakdownLine[] | null | undefined,
  mainCuentaCode: string | null,
  bonificacionAccountCode: string | null,
): ContableLine[] {
  const amount = totalAmount ?? netAmount;
  const lines: ContableLine[] = [];

  if (amount != null && amount > 0) {
    lines.push({
      monto: amount,
      cuenta: mainCuentaCode,
      centroCosto: null,
      tipoImpuesto: PRESUPUESTO_TIPO_IMPUESTO,
    });
  }

  lines.push(
    ...buildBonificacionContableLines(
      discountAmount,
      discountLines,
      bonificacionAccountCode,
    ),
  );

  return lines;
}

function buildContableLines(
  netAmount: string | null,
  vatAmount: string | null,
  vatLines: TaxBreakdownLine[] | null | undefined,
  perceptionsAmount: string | null,
  perceptionLines: TaxBreakdownLine[] | null | undefined,
  totalAmount: string | null,
  discountAmount: string | null,
  discountLines: TaxBreakdownLine[] | null | undefined,
  mainCuentaCode: string | null,
  vatCuentaCode: string | null,
  perceptionsAccounts: PerceptionChartAccount[],
  bonificacionAccountCode: string | null,
  isPresupuesto: boolean,
): ContableLine[] {
  const net = decimalToNumber(netAmount);
  const total = decimalToNumber(totalAmount);

  if (isPresupuesto) {
    return buildPresupuestoContableLines(
      net,
      total,
      discountAmount,
      discountLines,
      mainCuentaCode,
      bonificacionAccountCode,
    );
  }

  const lines: ContableLine[] = [
    ...buildVatAndGravadoContableLines(
      net,
      vatAmount,
      vatLines,
      mainCuentaCode,
      vatCuentaCode,
    ),
    ...buildPerceptionContableLines(
      perceptionsAmount,
      perceptionLines,
      perceptionsAccounts,
    ),
  ];

  if (lines.length === 0 && total != null && total > 0) {
    lines.push({
      monto: total,
      cuenta: mainCuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  lines.push(
    ...buildBonificacionContableLines(
      discountAmount,
      discountLines,
      bonificacionAccountCode,
    ),
  );

  return lines;
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
  discountAmount?: string | null;
  discountLines?: TaxBreakdownLine[] | null;
  totalAmount: string | null;
  chartAccount: SerializedChartAccount | null;
  vatChartAccountCode?: string | null;
  perceptionsAccounts?: PerceptionChartAccount[];
  bonificacionAccountCode?: string | null;
  tipoMoneda?: string | null;
};

function isUsdTipoMoneda(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "usd";
}

export function buildInvoiceJson(invoice: InvoiceJsonSource): InvoiceJsonShape {
  const mainCuentaCode = invoice.chartAccount?.code ?? null;
  const kind = parseDocumentKind(invoice.documentKind);
  const isPresupuesto = kind === "PRESUPUESTO";

  const base: InvoiceJsonShape = {
    id: invoice.movementId ?? "",
    empresa: invoice.empresa,
    contable: buildContableLines(
      invoice.netAmount,
      invoice.vatAmount,
      invoice.vatLines,
      invoice.perceptionsAmount,
      invoice.perceptionLines,
      invoice.totalAmount,
      invoice.discountAmount ?? null,
      invoice.discountLines,
      mainCuentaCode,
      invoice.vatChartAccountCode ?? null,
      invoice.perceptionsAccounts ?? [],
      invoice.bonificacionAccountCode ?? null,
      isPresupuesto,
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

  if (isUsdTipoMoneda(invoice.tipoMoneda)) {
    base.tipoMoneda = "usd";
  }

  return base;
}
