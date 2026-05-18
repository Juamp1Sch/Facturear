import * as XLSX from "xlsx";

import { formatCreatedAtArgentina } from "@/lib/history-search";
import { formatInvoiceCalendarDate } from "@/lib/invoice-calendar-date";
import { formatMoney } from "@/lib/format-money";
import type { SerializedInvoiceListItem } from "@/types/invoice";

const STATUS_LABEL: Record<string, string> = {
  PROCESSING: "Procesando",
  READY: "Listo",
  ERROR: "Error",
  CORRECTED: "Corregido",
};

export const HISTORY_EXPORT_MAX_ROWS = 5000;

export type HistoryExportRow = {
  "Fecha carga": string;
  "Fecha factura": string;
  Proveedor: string;
  CUIT: string;
  "Cód. proveedor": string;
  "Nº comprobante": string;
  Total: string;
  Estado: string;
  "Cuenta código": string;
  "Cuenta nombre": string;
  "ID movimiento": string;
};

export function invoiceToExportRow(
  inv: SerializedInvoiceListItem,
): HistoryExportRow {
  return {
    "Fecha carga": formatCreatedAtArgentina(inv.createdAt),
    "Fecha factura": formatInvoiceCalendarDate(inv.invoiceDate),
    Proveedor: inv.providerName?.trim() || "",
    CUIT: inv.providerCuit ?? "",
    "Cód. proveedor": inv.supplierCode ?? "",
    "Nº comprobante": inv.invoiceNumber ?? "",
    Total: formatMoney(inv.totalAmount),
    Estado: STATUS_LABEL[inv.status] ?? inv.status,
    "Cuenta código": inv.chartAccount?.code ?? "",
    "Cuenta nombre": inv.chartAccount?.name ?? "",
    "ID movimiento": inv.movementId ?? "",
  };
}

function escapeCsvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const EXPORT_COLUMNS: (keyof HistoryExportRow)[] = [
  "Fecha carga",
  "Fecha factura",
  "Proveedor",
  "CUIT",
  "Cód. proveedor",
  "Nº comprobante",
  "Total",
  "Estado",
  "Cuenta código",
  "Cuenta nombre",
  "ID movimiento",
];

export function buildHistoryCsv(rows: HistoryExportRow[]): Buffer {
  const headers = EXPORT_COLUMNS;
  const lines = [
    headers.join(";"),
    ...rows.map((row) =>
      headers.map((h) => escapeCsvCell(String(row[h] ?? ""))).join(";"),
    ),
  ];
  return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
}

export function buildHistoryXlsx(rows: HistoryExportRow[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Historial");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export function exportFilename(format: "csv" | "xlsx"): string {
  const day = new Date().toISOString().slice(0, 10);
  return `historial-facturas-${day}.${format}`;
}
