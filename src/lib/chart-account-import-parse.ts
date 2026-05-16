import * as XLSX from "xlsx";

import { decodeBasicHtmlEntities } from "@/lib/html-entities";

export type ChartAccountImportRow = {
  code: string;
  name: string;
  type: string | null;
  active: boolean;
};

export type ChartAccountParseIssue = { rowNumber: number; reason: string };

export type ChartAccountParseResult = {
  rows: ChartAccountImportRow[];
  issues: ChartAccountParseIssue[];
  headerRowIndex: number;
};

const MAX_ROWS = 50_000;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeHeaderKey(cell: unknown): string {
  return stripDiacritics(String(cell ?? "").trim().toLowerCase()).replace(/\s+/g, "");
}

function findHeaderRowIndex(aoa: unknown[][]): number {
  const limit = Math.min(aoa.length, 50);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    let hasCode = false;
    let hasName = false;
    for (const cell of row) {
      const key = normalizeHeaderKey(cell);
      if (key === "cuenta" || key === "codigo" || key === "código" || key === "code") {
        hasCode = true;
      }
      if (key === "nombre" || key === "denominacion" || key === "denominación") {
        hasName = true;
      }
    }
    if (hasCode && hasName) return i;
  }
  return -1;
}

function buildHeaderMap(headerRow: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let j = 0; j < headerRow.length; j++) {
    const key = normalizeHeaderKey(headerRow[j]);
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

function normalizeAccountCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const digits = t.replace(/\D/g, "");
  if (digits.length > 0 && digits === t.replace(/[.\s]/g, "")) {
    return String(parseInt(digits, 10));
  }
  return t;
}

function isInactiveFlag(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "S" || v === "SI" || v === "YES" || v === "1" || v === "TRUE";
}

function sheetToAoa(buffer: Buffer): unknown[][] {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    codepage: 65001,
    raw: false,
    cellDates: false,
  });
  const sheetName =
    wb.SheetNames.find((n) => {
      const l = n.toLowerCase();
      return l.includes("cuenta") || l.includes("plan");
    }) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
}

export function parseChartAccountBuffer(buffer: Buffer): ChartAccountParseResult {
  const issues: ChartAccountParseIssue[] = [];
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
            "No se encontró la fila de encabezados (se esperan columnas «Cuenta» o «Codigo» y «Nombre»).",
        },
      ],
      headerRowIndex: -1,
    };
  }

  const col = buildHeaderMap(aoa[hi] as unknown[]);
  const codeKey = col.has("cuenta")
    ? "cuenta"
    : col.has("codigo")
      ? "codigo"
      : col.has("código")
        ? "código"
        : col.has("code")
          ? "code"
          : null;

  if (!codeKey) {
    return {
      rows: [],
      issues: [{ rowNumber: hi + 1, reason: "Falta la columna Cuenta o Codigo en la fila de títulos." }],
      headerRowIndex: hi,
    };
  }

  const rows: ChartAccountImportRow[] = [];
  const dataStart = hi + 1;

  for (let r = dataStart; r < aoa.length && rows.length < MAX_ROWS; r++) {
    const row = aoa[r] as unknown[];
    if (!Array.isArray(row)) continue;

    const codeRaw = cellAt(row, col, codeKey, "cuenta", "codigo", "código", "code");
    const name = cellAt(row, col, "nombre", "denominacion", "denominación", "descripcion", "descripción");
    const type = cellAt(row, col, "tipo", "clasificacion", "clasificación") || null;
    const deactivated = cellAt(row, col, "desactivada", "inactiva", "activa");

    if (!codeRaw && !name) continue;

    const code = normalizeAccountCode(codeRaw);
    if (!code) {
      issues.push({ rowNumber: r + 1, reason: "Fila sin código de cuenta; se omitió." });
      continue;
    }
    if (!name) {
      issues.push({ rowNumber: r + 1, reason: `Cuenta ${code}: falta nombre; se omitió.` });
      continue;
    }

    const active = deactivated ? !isInactiveFlag(deactivated) : true;

    rows.push({ code, name, type, active });
  }

  return { rows, issues, headerRowIndex: hi };
}
