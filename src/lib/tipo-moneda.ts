/** Valor persistido en Invoice.tipoMoneda (null = ARS implícito). */
export type TipoMonedaStored = "usd" | null;

/** Valor del toggle ARS | USD en la UI. */
export type CurrencyValue = "ars" | "usd";

export const TIPO_MONEDA_USD = "usd" as const;

function normalizeTipoMonedaRaw(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isUsdTipoMoneda(value: string | null | undefined): boolean {
  return normalizeTipoMonedaRaw(value) === TIPO_MONEDA_USD;
}

/** Normaliza input de formulario o DB a valor persistible (null = ARS). */
export function parseTipoMonedaForStorage(
  value: string | null | undefined,
): TipoMonedaStored {
  return isUsdTipoMoneda(value) ? TIPO_MONEDA_USD : null;
}

/** Convierte valor persistido a selección del toggle. */
export function tipoMonedaToCurrencyValue(
  value: string | null | undefined,
): CurrencyValue {
  return isUsdTipoMoneda(value) ? "usd" : "ars";
}
