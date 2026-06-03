import type { FiscalAuthType } from "@/lib/document-class";

export type DetectedFiscalAuth = {
  type: FiscalAuthType;
  code: string | null;
};

/**
 * Detecta CAE/CAEA/CAI/ticket en texto OCR o embebido cuando la IA no los extrajo.
 * Complementa la visión en remitos de imprenta (CAI al pie / esquina inferior derecha).
 */
export function detectFiscalAuthFromText(
  text: string | null | undefined,
): DetectedFiscalAuth | null {
  if (!text?.trim()) return null;
  const t = text.replace(/\s+/g, " ");

  const cai = t.match(/\bCAI\s*:?\s*(\d{10,20})\b/i);
  if (cai) {
    return { type: "CAI", code: cai[1] ?? null };
  }

  const caea = t.match(/\bCAEA\s*:?\s*(\d{8,20})\b/i);
  if (caea) {
    return { type: "CAEA", code: caea[1] ?? null };
  }

  const cae = t.match(/\bCAE\s*(?:N[°º.]?\s*)?:?\s*(\d{10,20})\b/i);
  if (cae) {
    return { type: "CAE", code: cae[1] ?? null };
  }

  if (/\b(?:controlador\s+fiscal|c\.f\.|tique\s+factura|informe\s+diario\s+de\s+cierre)\b/i.test(t)) {
    return { type: "TICKET_FISCAL", code: null };
  }

  return null;
}

/** Completa fiscal_auth_type/code de la extracción si faltan y hay señal en el texto. */
export function enrichFiscalAuthFromText<T extends {
  fiscal_auth_type: FiscalAuthType | null;
  fiscal_auth_code: string | null;
}>(
  extracted: T,
  text: string | null | undefined,
): T {
  if (extracted.fiscal_auth_type) return extracted;
  const detected = detectFiscalAuthFromText(text);
  if (!detected) return extracted;
  return {
    ...extracted,
    fiscal_auth_type: detected.type,
    fiscal_auth_code: detected.code ?? extracted.fiscal_auth_code,
  };
}
