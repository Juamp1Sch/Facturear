import type { TaxBreakdownLine } from "@/lib/schemas";

export type { TaxBreakdownLine };

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

export function parseTaxBreakdownFromPayload(aiPayload: unknown): {
  vatLines: TaxBreakdownLine[] | null;
  perceptionLines: TaxBreakdownLine[] | null;
} {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return { vatLines: null, perceptionLines: null };
  }
  const o = aiPayload as Record<string, unknown>;
  return {
    vatLines: parseLines(o.vat_lines),
    perceptionLines: parseLines(o.perception_lines),
  };
}

export function sumTaxLines(lines: TaxBreakdownLine[] | null | undefined): number | null {
  if (!lines?.length) return null;
  const total = lines.reduce((acc, l) => acc + l.amount, 0);
  return total > 0 ? total : null;
}
