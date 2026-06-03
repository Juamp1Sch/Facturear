import {
  AFIP_COMPROBANTE_CODES,
  isKnownAfipComprobanteCode,
  normalizeAfipComprobanteCode,
} from "@/lib/afip-comprobante-codes";
import {
  parseDocumentKind,
  type DocumentKind,
} from "@/lib/comprobante-code";
import { enrichFiscalAuthFromText } from "@/lib/fiscal-auth-detect";
import type { InvoiceExtraction } from "@/lib/schemas";

/**
 * Subtipo fiscal (solo comprobantes con señal AFIP/CAE/CAI/ticket).
 * Los presupuestos van en documentKind = PRESUPUESTO, no aquí.
 */
export type FiscalDocumentClass =
  | "FACTURA_FISCAL"
  | "REMITO_FISCAL"
  | "TICKET_FISCAL";

/** @deprecated Usar FiscalDocumentClass; se mantiene para filas legacy con PRESUPUESTO. */
export type DocumentClass = FiscalDocumentClass | "PRESUPUESTO";

export type FiscalAuthType = "CAE" | "CAEA" | "CAI" | "TICKET_FISCAL";

export const DOCUMENT_CLASS_OPTIONS: {
  value: FiscalDocumentClass;
  label: string;
}[] = [
  { value: "FACTURA_FISCAL", label: "Factura fiscal" },
  { value: "REMITO_FISCAL", label: "Remito fiscal" },
  { value: "TICKET_FISCAL", label: "Ticket fiscal" },
];

const TICKET_AFIP_CODES = new Set([
  "080",
  "081",
  "082",
  "083",
  "109",
  "110",
  "111",
  "112",
  "113",
  "114",
  "115",
  "116",
  "117",
]);

const REMITO_AFIP_CODES = new Set([
  "088",
  "091",
  "991",
  "992",
  "993",
  "994",
  "995",
  "997",
  "998",
]);

const FISCAL_AUTH_TYPES = new Set<FiscalAuthType>([
  "CAE",
  "CAEA",
  "CAI",
  "TICKET_FISCAL",
]);

export function parseFiscalAuthType(
  value: string | null | undefined,
): FiscalAuthType | null {
  if (!value) return null;
  const v = value.trim().toUpperCase() as FiscalAuthType;
  return FISCAL_AUTH_TYPES.has(v) ? v : null;
}

export function parseFiscalDocumentClass(
  value: string | null | undefined,
): FiscalDocumentClass | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "COMPROBANTE") return "FACTURA_FISCAL";
  if (
    v === "FACTURA_FISCAL" ||
    v === "REMITO_FISCAL" ||
    v === "TICKET_FISCAL"
  ) {
    return v;
  }
  return null;
}

/** Compat legacy: PRESUPUESTO en documentClass se trata como sin clase fiscal. */
export function parseDocumentClass(
  value: string | null | undefined,
): DocumentClass | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "PRESUPUESTO") return "PRESUPUESTO";
  return parseFiscalDocumentClass(v);
}

function isAfipTicketCode(code: string | null): boolean {
  return code != null && TICKET_AFIP_CODES.has(code);
}

function isAfipRemitoCode(code: string | null): boolean {
  if (code == null) return false;
  if (REMITO_AFIP_CODES.has(code)) return true;
  const desc = AFIP_COMPROBANTE_CODES[code];
  return desc != null && /^REMITO/i.test(desc);
}

function hasFiscalSignal(
  afipCode: string | null,
  fiscalAuthType: FiscalAuthType | null,
): boolean {
  return isKnownAfipComprobanteCode(afipCode) || fiscalAuthType != null;
}

/**
 * Subtipo fiscal según señales AFIP/CAE/CAEA/CAI/ticket. null si no es fiscal.
 */
export function deriveFiscalDocumentClass(
  afipCodeRaw: string | null | undefined,
  fiscalAuthTypeRaw: string | null | undefined,
): FiscalDocumentClass | null {
  const afipCode = normalizeAfipCodeForStorage(afipCodeRaw);
  const fiscalAuthType = parseFiscalAuthType(fiscalAuthTypeRaw);

  if (!hasFiscalSignal(afipCode, fiscalAuthType)) {
    return null;
  }

  if (fiscalAuthType === "TICKET_FISCAL" || isAfipTicketCode(afipCode)) {
    return "TICKET_FISCAL";
  }

  if (fiscalAuthType === "CAI" || isAfipRemitoCode(afipCode)) {
    return "REMITO_FISCAL";
  }

  return "FACTURA_FISCAL";
}

/** @deprecated Usar deriveFiscalDocumentClass + resolveDocumentClassification. */
export function deriveDocumentClass(
  afipCodeRaw: string | null | undefined,
  fiscalAuthTypeRaw: string | null | undefined,
): DocumentClass {
  const fiscal = deriveFiscalDocumentClass(afipCodeRaw, fiscalAuthTypeRaw);
  return fiscal ?? "PRESUPUESTO";
}

export type ResolvedDocumentClassification = {
  documentKind: DocumentKind;
  documentClass: FiscalDocumentClass | null;
  afipCode: string | null;
  fiscalAuthType: FiscalAuthType | null;
  fiscalAuthCode: string | null;
};

/**
 * Resuelve tipo de documento (incl. Presupuesto) y clase fiscal a partir de la
 * extracción IA, enriquecida con detección de CAE/CAI en texto OCR.
 */
export function resolveDocumentClassification(
  extracted: InvoiceExtraction,
  rawOcrText: string | null | undefined,
): ResolvedDocumentClassification {
  const enriched = enrichFiscalAuthFromText(extracted, rawOcrText);

  const afipCode = normalizeAfipCodeForStorage(enriched.afip_comprobante_code);
  const fiscalAuthType = parseFiscalAuthType(enriched.fiscal_auth_type);
  const fiscalAuthCode = normalizeFiscalAuthCodeForStorage(
    fiscalAuthType,
    enriched.fiscal_auth_code,
  );

  const documentClass = deriveFiscalDocumentClass(
    enriched.afip_comprobante_code,
    enriched.fiscal_auth_type,
  );

  if (!documentClass) {
    const letterR = enriched.invoice_type?.trim().toUpperCase() === "R";
    if (letterR) {
      return {
        documentKind: "REMITO",
        documentClass: "REMITO_FISCAL",
        afipCode,
        fiscalAuthType,
        fiscalAuthCode,
      };
    }

    return {
      documentKind: "PRESUPUESTO",
      documentClass: null,
      afipCode,
      fiscalAuthType,
      fiscalAuthCode,
    };
  }

  let documentKind = parseDocumentKind(enriched.document_kind);
  if (documentClass === "REMITO_FISCAL") {
    documentKind = "REMITO";
  } else if (!documentKind || documentKind === "PRESUPUESTO" || documentKind === "REMITO") {
    documentKind = "FACTURA";
  }

  return {
    documentKind,
    documentClass,
    afipCode,
    fiscalAuthType,
    fiscalAuthCode,
  };
}

/** Código AFIP normalizado a guardar (3 dígitos) o null si no es válido. */
export function normalizeAfipCodeForStorage(
  afipCodeRaw: string | null | undefined,
): string | null {
  const code = normalizeAfipComprobanteCode(afipCodeRaw);
  if (!code) return null;
  return isKnownAfipComprobanteCode(code) ? code : null;
}

/** Código de autorización fiscal normalizado para guardar. */
export function normalizeFiscalAuthCodeForStorage(
  fiscalAuthType: FiscalAuthType | null,
  fiscalAuthCodeRaw: string | null | undefined,
): string | null {
  if (!fiscalAuthType || fiscalAuthType === "TICKET_FISCAL") return null;
  const raw = fiscalAuthCodeRaw?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length > 0 ? digits : raw;
}

export function fiscalAuthTypeLabel(
  value: string | null | undefined,
): string {
  const parsed = parseFiscalAuthType(value);
  if (parsed === "CAE") return "CAE";
  if (parsed === "CAEA") return "CAEA";
  if (parsed === "CAI") return "CAI";
  if (parsed === "TICKET_FISCAL") return "Ticket fiscal";
  return "";
}

export function documentClassLabel(value: string | null | undefined): string {
  const parsed = parseFiscalDocumentClass(value);
  if (parsed === "REMITO_FISCAL") return "Remito fiscal";
  if (parsed === "TICKET_FISCAL") return "Ticket fiscal";
  if (parsed === "FACTURA_FISCAL") return "Factura fiscal";
  return "";
}

export function isPresupuestoDocument(
  documentKind: string | null | undefined,
  documentClass: string | null | undefined,
): boolean {
  if (parseDocumentKind(documentKind) === "PRESUPUESTO") return true;
  return parseDocumentClass(documentClass) === "PRESUPUESTO";
}

/** @deprecated Usar isPresupuestoDocument */
export function isPresupuestoClass(value: string | null | undefined): boolean {
  return parseDocumentClass(value) === "PRESUPUESTO";
}
