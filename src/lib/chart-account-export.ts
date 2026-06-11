import * as XLSX from "xlsx";

export type ChartAccountExportRow = {
  Cuenta: string;
  Nombre: string;
  Tipo: string;
};

export function chartAccountToExportRow(account: {
  code: string;
  name: string;
  type: string | null;
}): ChartAccountExportRow {
  return {
    Cuenta: account.code,
    Nombre: account.name,
    Tipo: account.type ?? "",
  };
}

export function buildChartAccountsXlsx(rows: ChartAccountExportRow[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Plan de cuentas");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export function chartAccountsExportFilename(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `plan-de-cuentas-${day}.xlsx`;
}
