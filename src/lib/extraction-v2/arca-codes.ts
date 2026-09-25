import { normalizeArgentineCuitOrNull } from "@/lib/cuit-argentina";

/**
 * Datos fiscales leídos del QR de ARCA (RG 4892/2020) o del código de barras ITF de
 * comprobantes electrónicos. Son exactos: no dependen del OCR del modelo.
 */
export type ArcaFiscalData = {
  source: "QR" | "ITF";
  cuit: string;
  date?: string;
  pointOfSale?: number;
  number?: number;
  comprobanteCode?: number;
  total?: number;
  currency?: string;
  exchangeRate?: number;
  authType: "CAE" | "CAEA";
  authCode: string;
};

/** Letra según el código de comprobante ARCA (tabla de comprobantes). */
const LETTER_BY_COMPROBANTE_CODE: Record<number, string> = {
  1: "A", 2: "A", 3: "A", 4: "A", 5: "A",
  6: "B", 7: "B", 8: "B", 9: "B", 10: "B",
  11: "C", 12: "C", 13: "C", 15: "C",
  19: "E", 20: "E", 21: "E",
  51: "M", 52: "M", 53: "M",
  201: "A", 202: "A", 203: "A", 206: "B", 207: "B", 208: "B", 211: "C", 212: "C", 213: "C",
};

export function letterForComprobanteCode(code: number | undefined): string | null {
  return code != null ? (LETTER_BY_COMPROBANTE_CODE[code] ?? null) : null;
}

function formatCuit(value: string | number): string | null {
  const d = String(value).replace(/\D/g, "").padStart(11, "0");
  if (d.length !== 11) return null;
  return normalizeArgentineCuitOrNull(`${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`);
}

/** Texto del QR de ARCA: https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON>. */
export function parseArcaQrText(text: string): ArcaFiscalData | null {
  const m = text.match(/[?&]p=([^&\s]+)/);
  if (!m?.[1]) return null;
  let b64 = decodeURIComponent(m[1]).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const cuit = j.cuit != null ? formatCuit(j.cuit as string | number) : null;
  const authCode = j.codAut != null ? String(j.codAut).replace(/\D/g, "") : "";
  if (!cuit || !authCode) return null;
  const fecha = typeof j.fecha === "string" ? j.fecha : "";
  const date = /^\d{2}\/\d{2}\/\d{4}$/.test(fecha)
    ? fecha.split("/").reverse().join("-")
    : /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : undefined;
  const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
  return {
    source: "QR",
    cuit,
    date,
    pointOfSale: num(j.ptoVta),
    number: num(j.nroCmp),
    comprobanteCode: num(j.tipoCmp),
    total: num(j.importe),
    currency: typeof j.moneda === "string" ? j.moneda : undefined,
    exchangeRate: num(j.ctz),
    authType: j.tipoCodAut === "A" ? "CAEA" : "CAE",
    authCode,
  };
}

/**
 * Código de barras ITF de comprobantes electrónicos:
 * CUIT (11) + tipo (2-3) + punto de venta (4-5) + CAE (14) + vencimiento AAAAMMDD (8) + DV (1).
 * Solo se toman CUIT y CAE: el ancho de tipo y punto de venta varía entre emisores.
 */
export function parseArcaItfText(text: string): ArcaFiscalData | null {
  const d = text.replace(/\D/g, "");
  if (d.length < 39 || d.length > 42) return null;
  const cuit = formatCuit(d.slice(0, 11));
  if (!cuit) return null;
  const tail = d.slice(-23);
  const expiry = tail.slice(14, 22);
  if (!/^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(expiry)) return null;
  return { source: "ITF", cuit, authType: "CAE", authCode: tail.slice(0, 14) };
}
