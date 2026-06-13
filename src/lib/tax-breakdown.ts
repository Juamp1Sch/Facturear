import {
  parseDiscountResolutionFromPayload,
  resolveDiscountBreakdown,
} from "@/lib/discount-breakdown";
import type { PerceptionLine, TaxBreakdownLine } from "@/lib/schemas";
import { sumTaxLines } from "@/lib/tax-lines";

export type { TaxBreakdownLine };
export { sumTaxLines } from "@/lib/tax-lines";

function isTaxLine(value: unknown): value is TaxBreakdownLine {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    typeof (value as TaxBreakdownLine).amount === "number" &&
    !Number.isNaN((value as TaxBreakdownLine).amount)
  );
}

function parseLines(raw: unknown): TaxBreakdownLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines = raw.filter(isTaxLine).filter((l) => l.amount > 0);
  return lines.length > 0 ? lines : null;
}

/** Como parseLines pero conserva el `kind` (IVA/IIBB) de cada percepción. */
function parsePerceptionLines(raw: unknown): PerceptionLine[] | null {
  const lines = parseLines(raw);
  if (!lines) return null;
  return lines.map((l) => {
    const kindRaw = (l as { kind?: unknown }).kind;
    const kind =
      kindRaw === "IVA" || kindRaw === "IIBB" ? kindRaw : null;
    return { label: l.label, amount: l.amount, kind };
  });
}

export function parseTaxBreakdownFromPayload(aiPayload: unknown): {
  vatLines: TaxBreakdownLine[] | null;
  perceptionLines: PerceptionLine[] | null;
} {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return { vatLines: null, perceptionLines: null };
  }
  const o = aiPayload as Record<string, unknown>;
  return {
    vatLines: parseLines(o.vat_lines),
    perceptionLines: parsePerceptionLines(o.perception_lines),
  };
}

export function parseDiscountFromPayload(
  aiPayload: unknown,
  rawOcrText?: string | null,
): {
  discountLines: TaxBreakdownLine[] | null;
  discountAmount: number | null;
} {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return { discountLines: null, discountAmount: null };
  }
  const o = aiPayload as Record<string, unknown>;
  const discountLines = parseLines(o.discount_lines);
  const fromLines = sumTaxLines(discountLines);
  const rawAmount = o.discount_amount;
  const fromField =
    typeof rawAmount === "number" && !Number.isNaN(rawAmount) && rawAmount > 0
      ? rawAmount
      : null;
  const storedResolution = parseDiscountResolutionFromPayload(aiPayload);
  const amountContext = {
    net_amount:
      typeof o.net_amount === "number" && !Number.isNaN(o.net_amount)
        ? o.net_amount
        : null,
    vat_amount:
      typeof o.vat_amount === "number" && !Number.isNaN(o.vat_amount)
        ? o.vat_amount
        : null,
    perceptions_amount:
      typeof o.perceptions_amount === "number" &&
      !Number.isNaN(o.perceptions_amount)
        ? o.perceptions_amount
        : null,
    total_amount:
      typeof o.total_amount === "number" && !Number.isNaN(o.total_amount)
        ? o.total_amount
        : null,
  };
  return resolveDiscountBreakdown(
    discountLines,
    fromLines ?? fromField,
    rawOcrText,
    storedResolution,
    amountContext,
  );
}

/** Aviso cuando hay varias cuentas de percepción pero el JSON usaría solo la primera. */
export function needsPerceptionBreakdownWarning(
  aiPayload: unknown,
  perceptionsAmount: string | number | null | undefined,
  perceptionAccountCount: number,
): boolean {
  if (perceptionAccountCount <= 1) return false;
  const amount =
    perceptionsAmount != null && perceptionsAmount !== ""
      ? Number(perceptionsAmount)
      : 0;
  if (Number.isNaN(amount) || amount <= 0) return false;
  const { perceptionLines } = parseTaxBreakdownFromPayload(aiPayload);
  return !perceptionLines?.length;
}
