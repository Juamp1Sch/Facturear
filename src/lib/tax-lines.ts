import type { TaxBreakdownLine } from "@/lib/schemas";

export function sumTaxLines(
  lines: TaxBreakdownLine[] | null | undefined,
): number | null {
  if (!lines?.length) return null;
  const total = lines.reduce((acc, l) => acc + l.amount, 0);
  return total > 0 ? total : null;
}
