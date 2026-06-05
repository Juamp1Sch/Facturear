export type LinkedPerceptionAccount = {
  code: string;
  name: string;
};

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bi\s+v\s+a\b/g, "iva")
    .replace(/\s+/g, " ")
    .trim();
}

function hasIibb(text: string): boolean {
  return (
    text.includes("iibb") ||
    text.includes("iib b") ||
    text.includes("ingresos brutos") ||
    text.includes("i i b b")
  );
}

function hasIvaPerception(text: string): boolean {
  const n = normalizeForMatch(text);
  return n.includes("iva") && (n.includes("percepcion") || n.includes("perc"));
}

/** Clasifica el tipoImpuesto contable de una percepción: PIB (IIBB) o PIV (IVA). */
export function classifyPerceptionTipoImpuesto(text: string | null): "PIB" | "PIV" {
  const normalized = normalizeForMatch(text ?? "");
  // Priorizar IVA aunque el label incluya "IIBB" de un encabezado de sección
  // (ej. bloque "PERCEPCIONES IIBB" con renglón "Perc. IVA").
  if (hasIvaPerception(normalized)) {
    return "PIV";
  }
  return "PIB";
}

/** Elige la cuenta de percepciones asociada que mejor coincide con el texto del renglón. */
export function matchPerceptionLineToAccount(
  label: string | null,
  accounts: LinkedPerceptionAccount[],
): string | null {
  if (accounts.length === 0) return null;
  if (accounts.length === 1) return accounts[0]!.code;

  const labelNorm = normalizeForMatch(label ?? "");
  let bestCode: string | null = null;
  let bestScore = 0;

  for (const acc of accounts) {
    const nameNorm = normalizeForMatch(`${acc.code} ${acc.name}`);
    let score = 0;

    if (hasIibb(labelNorm) && hasIibb(nameNorm)) score += 20;
    if (hasIvaPerception(labelNorm) && hasIvaPerception(nameNorm)) score += 20;
    if (hasIvaPerception(labelNorm) && nameNorm.includes("iva") && !hasIibb(nameNorm)) {
      score += 12;
    }

    const nameTokens = nameNorm.split(" ").filter((t) => t.length > 3);
    for (const token of nameTokens) {
      if (labelNorm.includes(token)) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCode = acc.code;
    }
  }

  return bestScore > 0 ? bestCode : accounts[0]!.code;
}
