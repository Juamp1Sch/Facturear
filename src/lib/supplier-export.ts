import * as XLSX from "xlsx";

export type SupplierExportRow = {
  Código: string;
  Nombre: string;
  CUIT: string;
  Dirección: string;
  Localidad: string;
};

export function supplierToExportRow(supplier: {
  code: string;
  name: string;
  cuit: string | null;
  address: string | null;
  locality: string | null;
}): SupplierExportRow {
  return {
    Código: supplier.code,
    Nombre: supplier.name,
    CUIT: supplier.cuit ?? "",
    Dirección: supplier.address ?? "",
    Localidad: supplier.locality ?? "",
  };
}

export function buildSuppliersXlsx(rows: SupplierExportRow[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Proveedores");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export function suppliersExportFilename(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `proveedores-${day}.xlsx`;
}
