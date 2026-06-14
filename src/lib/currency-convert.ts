/** Multiplica un importe por el tipo de cambio (USD→ARS) y redondea a 2 decimales. */
export function scaleAmount(value: number, rate: number): number {
  return Math.round(value * rate * 100) / 100;
}

/** Campos numéricos de importe en el aiPayload que se escalan al convertir. */
const SCALAR_AMOUNT_KEYS = [
  "net_amount",
  "vat_amount",
  "perceptions_amount",
  "total_amount",
  "discount_amount",
] as const;

/** Arrays de renglones con `.amount` que se escalan al convertir. */
const LINE_ARRAY_KEYS = ["vat_lines", "perception_lines", "discount_lines"] as const;

/**
 * Devuelve una copia del aiPayload con todos los importes (escalares y `.amount`
 * de las líneas) escalados ×rate. No muta el original. Mantiene el resto intacto.
 */
export function convertAiPayloadToArs(
  aiPayload: unknown,
  rate: number,
): unknown {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return aiPayload;
  }
  const o = { ...(aiPayload as Record<string, unknown>) };

  for (const key of SCALAR_AMOUNT_KEYS) {
    const v = o[key];
    if (typeof v === "number" && !Number.isNaN(v)) {
      o[key] = scaleAmount(v, rate);
    }
  }

  for (const key of LINE_ARRAY_KEYS) {
    const lines = o[key];
    if (Array.isArray(lines)) {
      o[key] = lines.map((line) =>
        line &&
        typeof line === "object" &&
        typeof (line as { amount?: unknown }).amount === "number"
          ? { ...line, amount: scaleAmount((line as { amount: number }).amount, rate) }
          : line,
      );
    }
  }

  return o;
}
