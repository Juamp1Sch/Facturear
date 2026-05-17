import { invoiceDateToInputValue } from "@/lib/invoice-calendar-date";
import { buildCodigoComprobante, parseDocumentKind } from "@/lib/comprobante-code";
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

function buildContableLines(
  netAmount: string | null,
  vatAmount: string | null,
  totalAmount: string | null,
  cuentaCode: string | null,
): ContableLine[] {
  const lines: ContableLine[] = [];
  const net = decimalToNumber(netAmount);
  const vat = decimalToNumber(vatAmount);
  const total = decimalToNumber(totalAmount);

  if (net != null && net > 0) {
    lines.push({
      monto: net,
      cuenta: cuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  if (vat != null && vat > 0) {
    lines.push({
      monto: vat,
      cuenta: null,
      centroCosto: null,
      tipoImpuesto: "I21",
    });
  }

  if (lines.length === 0 && total != null && total > 0) {
    lines.push({
      monto: total,
      cuenta: cuentaCode,
      centroCosto: null,
      tipoImpuesto: null,
    });
  }

  return lines;
}

export type InvoiceJsonSource = {
  movementId: string | null;
  empresa: string | null;
  sucursal: string | null;
  supplierCode: string | null;
  invoiceDate: string | null;
  invoiceType: string | null;
  documentKind: string | null;
  invoiceNumber: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  chartAccount: SerializedChartAccount | null;
};

export function buildInvoiceJson(invoice: InvoiceJsonSource): InvoiceJsonShape {
  const cuentaCode = invoice.chartAccount?.code ?? null;
  const kind = parseDocumentKind(invoice.documentKind);

  return {
    id: invoice.movementId ?? "",
    empresa: invoice.empresa,
    contable: buildContableLines(
      invoice.netAmount,
      invoice.vatAmount,
      invoice.totalAmount,
      cuentaCode,
    ),
    sucursal: invoice.sucursal,
    mercaderias: [],
    proveedorId: invoice.supplierCode,
    fechaFactura: (() => {
      const iso = invoiceDateToInputValue(invoice.invoiceDate);
      return iso.length > 0 ? iso : null;
    })(),
    codigoComprobante: buildCodigoComprobante(invoice.invoiceType, kind),
    numeroComprobante: invoice.invoiceNumber,
  };
}
