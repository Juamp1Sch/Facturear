import { normalizeArgentineCuitOrNull } from "@/lib/cuit-argentina";
import type { VerifiedField } from "@/lib/extraction-v2/review";
import type { InvoiceExtraction } from "@/lib/schemas";

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

const ARCA_QR_HOSTS = /(^|\.)(afip|arca)\.gob\.ar$/i;

/**
 * Texto del QR de ARCA: https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON>.
 * Solo se acepta si el host es de ARCA/AFIP; nunca tira (un QR ilegible no corta la búsqueda).
 */
export function parseArcaQrText(text: string): ArcaFiscalData | null {
  try {
    const url = new URL(text.trim());
    if (!ARCA_QR_HOSTS.test(url.hostname)) return null;
    const p = url.searchParams.get("p");
    if (!p) return null;
    let b64 = p.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const j: unknown = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    const o = j as Record<string, unknown>;
    const cuit = o.cuit != null ? formatCuit(o.cuit as string | number) : null;
    const authCode = o.codAut != null ? String(o.codAut).replace(/\D/g, "") : "";
    // CAE/CAEA tienen 14 dígitos: si no, el QR no se toma como confiable.
    if (!cuit || authCode.length !== 14) return null;
    const fecha = typeof o.fecha === "string" ? o.fecha : "";
    const date = /^\d{2}\/\d{2}\/\d{4}$/.test(fecha)
      ? fecha.split("/").reverse().join("-")
      : /^\d{4}-\d{2}-\d{2}$/.test(fecha)
        ? fecha
        : undefined;
    const num = (v: unknown) => {
      if (typeof v !== "number" && typeof v !== "string") return undefined;
      const n = Number(v);
      return v === "" || !Number.isFinite(n) ? undefined : n; // descarta NaN e Infinity ("1e999")
    };
    const positiveInt = (v: unknown) => {
      const n = num(v);
      return n != null && Number.isInteger(n) && n > 0 ? n : undefined;
    };
    return {
      source: "QR",
      cuit,
      date,
      pointOfSale: positiveInt(o.ptoVta),
      number: positiveInt(o.nroCmp),
      comprobanteCode: positiveInt(o.tipoCmp),
      total: num(o.importe),
      currency: typeof o.moneda === "string" ? o.moneda : undefined,
      exchangeRate: num(o.ctz),
      authType: o.tipoCodAut === "A" ? "CAEA" : "CAE",
      authCode,
    };
  } catch {
    return null;
  }
}

/** Dígito verificador del código de barras de comprobantes (RG 1702). */
export function arcaBarcodeCheckDigit(body: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < body.length; i++) {
    if (i % 2 === 0) odd += Number(body[i]);
    else even += Number(body[i]);
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

/**
 * Código de barras ITF de comprobantes electrónicos:
 * CUIT (11) + tipo (2-3) + punto de venta (4-5) + CAE (14) + vencimiento AAAAMMDD (8) + DV (1).
 * ITF detecta pocos errores de lectura: se exige el dígito verificador de ARCA (RG 1702).
 * Solo se toman CUIT y CAE: el ancho de tipo y punto de venta varía entre emisores.
 */
export function parseArcaItfText(text: string): ArcaFiscalData | null {
  const d = text.replace(/\D/g, "");
  if (d.length < 40 || d.length > 42) return null;
  if (arcaBarcodeCheckDigit(d.slice(0, -1)) !== Number(d.slice(-1))) return null;
  const cuit = formatCuit(d.slice(0, 11));
  if (!cuit) return null;
  const tail = d.slice(-23);
  const expiry = tail.slice(14, 22);
  if (!/^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(expiry)) return null;
  return { source: "ITF", cuit, authType: "CAE", authCode: tail.slice(0, 14) };
}

/** Clase de documento según el código de comprobante ARCA (dato exacto del QR). */
export function documentKindForComprobanteCode(
  code: number | undefined,
): "FACTURA" | "NOTA_DEBITO" | "NOTA_CREDITO" | null {
  if (code == null) return null;
  if ([1, 6, 11, 19, 51, 201, 206, 211].includes(code)) return "FACTURA";
  if ([2, 7, 12, 20, 52, 202, 207, 212].includes(code)) return "NOTA_DEBITO";
  if ([3, 8, 13, 21, 53, 203, 208, 213].includes(code)) return "NOTA_CREDITO";
  return null;
}

/** Pisa la lectura del modelo con los datos exactos del código y devuelve qué campos aplicó. */
export function applyFiscalData<T extends InvoiceExtraction>(
  e: T,
  fiscal: ArcaFiscalData,
): { extracted: T; verifiedFields: VerifiedField[] } {
  const out = { ...e, cuit: fiscal.cuit, fiscal_auth_type: fiscal.authType, fiscal_auth_code: fiscal.authCode };
  const verifiedFields: VerifiedField[] = ["cuit", "fiscal_auth"];
  if (fiscal.date) {
    out.invoice_date = fiscal.date;
    verifiedFields.push("invoice_date");
  }
  if (fiscal.pointOfSale != null && fiscal.number != null) {
    out.invoice_number = `${String(fiscal.pointOfSale).padStart(5, "0")}-${String(fiscal.number).padStart(8, "0")}`;
    verifiedFields.push("invoice_number");
  }
  const letter = letterForComprobanteCode(fiscal.comprobanteCode);
  if (letter) {
    out.invoice_type = letter;
    verifiedFields.push("invoice_type");
  }
  if (fiscal.comprobanteCode != null) out.afip_comprobante_code = String(fiscal.comprobanteCode).padStart(2, "0");
  const kind = documentKindForComprobanteCode(fiscal.comprobanteCode);
  if (kind) out.document_kind = kind;
  if (fiscal.total != null) {
    out.total_amount = fiscal.total;
    verifiedFields.push("total");
  }
  // Solo dólares: la app convierte USD→ARS. Otras monedas (p. ej. EUR "060") no se soportan aún.
  if (fiscal.currency === "DOL" && fiscal.exchangeRate != null && fiscal.exchangeRate > 1) {
    out.exchange_rate = fiscal.exchangeRate;
  } else if (fiscal.currency === "PES") {
    // El QR prueba que está en pesos: un "tipo de cambio de referencia" impreso no aplica.
    out.exchange_rate = null;
  }
  return { extracted: out, verifiedFields };
}
