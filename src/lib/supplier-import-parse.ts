import * as XLSX from "xlsx";

import { decodeBasicHtmlEntities } from "@/lib/html-entities";
import { normalizeArgentineCuitFromAiOrNull } from "@/lib/cuit-argentina";

export type SupplierImportRow = {
  code: string;
  name: string;
  address: string | null;
  locality: string | null;
  cuit: string | null;
};

export type SupplierParseIssue = { rowNumber: number; reason: string };

export type SupplierParseResult = {
  rows: SupplierImportRow[];
  issues: SupplierParseIssue[];
  headerRowIndex: number;
};

const MAX_ROWS = 50_000;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Clave de encabezado: minúsculas, sin acentos, sin espacios. */
function normalizeSupplierHeaderKey(cell: unknown): string {
  return stripDiacritics(String(cell ?? "").trim().toLowerCase()).replace(/\s+/g, "");
}

function findHeaderRowIndex(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 50);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (normalizeSupplierHeaderKey(cell) === "codigo") {
        return i;
      }
    }
  }
  return -1;
}

function buildHeaderMap(headerRow: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let j = 0; j < headerRow.length; j++) {
    const key = normalizeSupplierHeaderKey(headerRow[j]);
    if (key && !m.has(key)) m.set(key, j);
  }
  return m;
}

function cellAt(row: unknown[], col: Map<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const idx = col.get(k);
    if (idx == null) continue;
    const v = row[idx];
    if (v == null) continue;
    const t = String(v).trim();
    if (t) return decodeBasicHtmlEntities(t);
  }
  return "";
}

function resolveCuitRaw(row: unknown[], col: Map<string, number>): string {
  const direct = cellAt(row, col, "cuit", "nrocuit", "numerocuit");
  if (direct) return direct.replace(/\s/g, "");
  const tipo = cellAt(row, col, "tipodocumento", "tipodoc", "tdoc").toLowerCase();
  const numero = cellAt(row, col, "numero", "numerodocumento", "documento");
  if (tipo === "cuit" && numero) return numero.replace(/\s/g, "");
  const digits = numero.replace(/\D/g, "");
  if (digits.length >= 11) return numero.replace(/\s/g, "");
  return "";
}

function sheetToAoa(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    codepage: 65001,
    raw: false,
    cellDates: false,
  });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("proveedor")) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
}

export function parseSupplierMasterBuffer(buffer: Buffer): SupplierParseResult {
  const issues: SupplierParseIssue[] = [];
  let aoa: unknown[][];

  try {
    aoa = sheetToAoa(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo leer el archivo.";
    return {
      rows: [],
      issues: [{ rowNumber: 0, reason: msg }],
      headerRowIndex: -1,
    };
  }

  if (aoa.length === 0) {
    return { rows: [], issues: [{ rowNumber: 0, reason: "El archivo está vacío." }], headerRowIndex: -1 };
  }

  const hi = findHeaderRowIndex(aoa);
  if (hi < 0) {
    return {
      rows: [],
      issues: [
        {
          rowNumber: 0,
          reason:
            "No se encontró la fila de encabezados (se espera una columna «Codigo» o «Código»).",
        },
      ],
      headerRowIndex: -1,
    };
  }

  const col = buildHeaderMap(aoa[hi] as unknown[]);
  if (!col.has("codigo")) {
    return {
      rows: [],
      issues: [{ rowNumber: hi + 1, reason: "Falta la columna Codigo en la fila de títulos." }],
      headerRowIndex: hi,
    };
  }

  const rows: SupplierImportRow[] = [];
  const dataStart = hi + 1;

  for (let r = dataStart; r < aoa.length && rows.length < MAX_ROWS; r++) {
    const row = aoa[r] as unknown[];
    if (!Array.isArray(row)) continue;
    const code = cellAt(row, col, "codigo", "código", "code");
    const name = cellAt(row, col, "nombre", "razonsocial", "razón social", "proveedor");
    const cuitRaw = resolveCuitRaw(row, col);
    let cuit = normalizeArgentineCuitFromAiOrNull(cuitRaw);
    if (cuitRaw && !cuit && code) {
      issues.push({
        rowNumber: r + 1,
        reason: `Código ${code}: CUIT no válido (${cuitRaw}); se importó sin CUIT.`,
      });
    }

    if (!code && !cuitRaw && !name) continue;

    if (!code) {
      issues.push({ rowNumber: r + 1, reason: "Fila sin código; se omitió." });
      continue;
    }
    if (!name) {
      issues.push({ rowNumber: r + 1, reason: `Código ${code}: falta nombre; se omitió.` });
      continue;
    }

    const addressRaw = cellAt(row, col, "direccion", "dirección", "domicilio", "calle");
    const localityRaw = cellAt(row, col, "localidad", "ciudad", "partido");

    rows.push({
      code,
      name,
      address: addressRaw || null,
      locality: localityRaw || null,
      cuit,
    });
  }

  return { rows, issues, headerRowIndex: hi };
}
