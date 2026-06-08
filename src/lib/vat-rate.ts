import type { TaxBreakdownLine } from "@/lib/schemas";

export type VatRateClassification = {
  rate: number;
  ivaCode: "I21" | "I10";
  gravCode: "G21" | "G10";
  label: string;
};

export type VatRateGroup = VatRateClassification & {
  vatAmount: number;
  grossAmount?: number;
};

const DEFAULT_VAT_RATE: VatRateClassification = {
  rate: 0.21,
  ivaCode: "I21",
  gravCode: "G21",
  label: "IVA 21%",
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePercentFromLabel(label: string | null): number | null {
  if (!label) return null;
  const match = label.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match?.[1]) return null;
  const pct = Number(match[1].replace(",", "."));
  return Number.isNaN(pct) ? null : pct;
}

/** Clasifica una línea de IVA según el porcentaje en su label. */
export function classifyVatRate(label: string | null): VatRateClassification {
  const pct = parsePercentFromLabel(label);
  if (pct == null) return DEFAULT_VAT_RATE;

  if (Math.abs(pct - 21) <= 1) {
    return DEFAULT_VAT_RATE;
  }

  if (Math.abs(pct - 10.5) <= 0.5) {
    return {
      rate: 0.105,
      ivaCode: "I10",
      gravCode: "G10",
      label: "IVA 10,5%",
    };
  }

  return DEFAULT_VAT_RATE;
}

/** Agrupa importes de IVA por alícuota (G21/I21 vs G10/I10), ordenados de mayor a menor. */
export function groupVatLinesByRate(
  vatLines: TaxBreakdownLine[],
): VatRateGroup[] {
  const map = new Map<string, VatRateGroup>();

  for (const line of vatLines) {
    if (line.amount <= 0) continue;
    const classification = classifyVatRate(line.label);
    const key = classification.gravCode;
    const existing = map.get(key);

    if (existing) {
      existing.vatAmount = roundMoney(existing.vatAmount + line.amount);
    } else {
      map.set(key, {
        ...classification,
        vatAmount: roundMoney(line.amount),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
}

/**
 * Deriva el neto gravado por alícuota (base = IVA ÷ alícuota) y ancla la suma
 * al net_amount real asignando centavos de redondeo a la alícuota mayor.
 */
export function computeGrossBasesByRate(
  groups: VatRateGroup[],
  netAmount: number | null,
): VatRateGroup[] {
  if (groups.length === 0) return [];

  const withBases = groups.map((group) => ({
    ...group,
    grossAmount: roundMoney(group.vatAmount / group.rate),
  }));

  if (netAmount == null || netAmount <= 0) return withBases;

  const sumBases = withBases.reduce(
    (acc, group) => acc + (group.grossAmount ?? 0),
    0,
  );
  const remainder = roundMoney(netAmount - sumBases);

  if (Math.abs(remainder) > 0.001 && withBases.length > 0) {
    withBases[0] = {
      ...withBases[0]!,
      grossAmount: roundMoney((withBases[0]!.grossAmount ?? 0) + remainder),
    };
  }

  return withBases;
}

export function getVatAmountForCode(
  groups: VatRateGroup[],
  ivaCode: "I21" | "I10",
): number | null {
  const group = groups.find((g) => g.ivaCode === ivaCode);
  return group?.vatAmount ?? null;
}

export function buildVatLinesFromRates(
  vat21: number | null,
  vat105: number | null,
): TaxBreakdownLine[] | null {
  const lines: TaxBreakdownLine[] = [];
  if (vat21 != null && vat21 > 0) {
    lines.push({ label: "IVA 21%", amount: roundMoney(vat21) });
  }
  if (vat105 != null && vat105 > 0) {
    lines.push({ label: "IVA 10,5%", amount: roundMoney(vat105) });
  }
  return lines.length > 0 ? lines : null;
}

export function sumVatFromRates(
  vat21: number | null,
  vat105: number | null,
): number | null {
  const lines = buildVatLinesFromRates(vat21, vat105);
  if (!lines) return null;
  return roundMoney(lines.reduce((acc, line) => acc + line.amount, 0));
}
