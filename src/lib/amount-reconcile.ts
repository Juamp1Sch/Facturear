export type AmountFields = {
  net: number | null;
  vat: number | null;
  perceptions: number | null;
  total: number | null;
};

export type ReconcileResult = {
  reconciled: boolean;
  discrepancy: number;
  computedSum: number | null;
};

/** Alícuotas IVA habituales en facturas argentinas. */
const ARG_VAT_RATES = [0.105, 0.21, 0.27];

export function vatConsistentWithNet(net: number, vat: number): boolean {
  if (net <= 0) return false;
  const ratio = vat / net;
  return ARG_VAT_RATES.some((rate) => Math.abs(ratio - rate) <= 0.015);
}

/** Tolerancia: max(0.50, 0.5% del total). Cubre redondeos de centavos. */
export function reconcileTolerance(total: number): number {
  return Math.max(0.5, Math.abs(total) * 0.005);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function reconcileAmounts(fields: AmountFields): ReconcileResult {
  const { net, vat, perceptions, total } = fields;

  if (total == null || Number.isNaN(total)) {
    return { reconciled: false, discrepancy: 0, computedSum: null };
  }

  const components = [net, vat, perceptions].filter(
    (v): v is number => v != null && !Number.isNaN(v),
  );

  if (components.length < 2) {
    return { reconciled: false, discrepancy: 0, computedSum: null };
  }

  const computedSum = roundMoney(components.reduce((acc, v) => acc + v, 0));
  const discrepancy = roundMoney(total - computedSum);
  const reconciled = Math.abs(discrepancy) <= reconcileTolerance(total);

  return { reconciled, discrepancy, computedSum };
}

/** Despeja un único campo faltante cuando neto+iva+percepciones=total. Solo sugerencia. */
export function suggestMissingAmount(
  fields: AmountFields,
): Partial<AmountFields> {
  const { net, vat, perceptions, total } = fields;
  if (total == null || Number.isNaN(total)) return {};

  const missing: ("net" | "vat" | "perceptions")[] = [];
  if (net == null || Number.isNaN(net)) missing.push("net");
  if (vat == null || Number.isNaN(vat)) missing.push("vat");
  if (perceptions == null || Number.isNaN(perceptions)) missing.push("perceptions");

  if (missing.length !== 1) return {};

  const netVal = net ?? 0;
  const vatVal = vat ?? 0;
  const percVal = perceptions ?? 0;

  if (missing[0] === "net" && vat != null && perceptions != null) {
    return { net: roundMoney(total - vatVal - percVal) };
  }
  if (missing[0] === "vat" && net != null && perceptions != null) {
    return { vat: roundMoney(total - netVal - percVal) };
  }
  if (missing[0] === "perceptions" && net != null && vat != null) {
    return { perceptions: roundMoney(total - netVal - vatVal) };
  }

  return {};
}

/**
 * Si neto, IVA y total están bien pero percepciones no cierra la suma,
 * corrige percepciones = total - neto - IVA (caso típico: 61,38 leído como 41,38).
 */
export function tryFixPerceptionsOnly(fields: AmountFields): AmountFields | null {
  const { net, vat, perceptions, total } = fields;
  if (
    net == null ||
    vat == null ||
    perceptions == null ||
    total == null ||
    Number.isNaN(net) ||
    Number.isNaN(vat) ||
    Number.isNaN(perceptions) ||
    Number.isNaN(total)
  ) {
    return null;
  }

  const result = reconcileAmounts(fields);
  if (result.reconciled) return null;

  const derivedPerc = roundMoney(total - net - vat);
  if (derivedPerc < 0) return null;

  const fixed: AmountFields = { ...fields, perceptions: derivedPerc };
  if (!reconcileAmounts(fixed).reconciled) return null;

  const percDelta = roundMoney(derivedPerc - perceptions);
  if (Math.abs(Math.abs(result.discrepancy) - Math.abs(percDelta)) > 0.01) {
    return null;
  }

  return fixed;
}

/**
 * Cuando neto e IVA son coherentes (p. ej. IVA 21% del neto), ancla esos valores
 * y recalcula percepciones + total a partir del mejor candidato de total leído.
 * Corrige el caso en que total y percepciones fallan juntos pero cierran entre sí (1544,72 vs 1546,72).
 */
export function reanchorWithTrustedNetVat(
  primary: AmountFields,
  supplement?: AmountFields | null,
): AmountFields | null {
  const net = primary.net;
  const vat = primary.vat;
  if (net == null || vat == null || !vatConsistentWithNet(net, vat)) {
    return null;
  }

  const totals = uniqueAmountCandidates([primary.total, supplement?.total]);
  if (totals.length === 0) return null;

  // Preferir total de la 2da pasada si difiere; si no, el mayor cuando hay empate OCR (6↔4).
  const sortedTotals = [...totals].sort((a, b) => {
    const aFromSupplement = supplement?.total === a ? 1 : 0;
    const bFromSupplement = supplement?.total === b ? 1 : 0;
    if (aFromSupplement !== bFromSupplement) return bFromSupplement - aFromSupplement;
    return b - a;
  });

  for (const total of sortedTotals) {
    const derivedPerc = roundMoney(total - net - vat);
    if (derivedPerc < 0) continue;
    const fields: AmountFields = {
      net,
      vat,
      perceptions: derivedPerc,
      total,
    };
    if (!reconcileAmounts(fields).reconciled) continue;

    const unchanged =
      primary.net === net &&
      primary.vat === vat &&
      primary.perceptions === derivedPerc &&
      primary.total === total;
    if (!unchanged) return fields;
  }

  const percCandidates = uniqueAmountCandidates([
    supplement?.perceptions,
    primary.perceptions,
  ]);
  for (const perc of percCandidates) {
    const total = roundMoney(net + vat + perc);
    const fields: AmountFields = { net, vat, perceptions: perc, total };
    if (!reconcileAmounts(fields).reconciled) continue;
    const unchanged =
      primary.perceptions === perc && primary.total === total;
    if (!unchanged) return fields;
  }

  return null;
}

export function readAmountsReconcileFlag(aiPayload: unknown): {
  needsReview: boolean;
  discrepancy: number | null;
} {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return { needsReview: false, discrepancy: null };
  }
  const o = aiPayload as Record<string, unknown>;
  if (o.amounts_reconciled === false) {
    const discrepancy =
      typeof o.amounts_discrepancy === "number" ? o.amounts_discrepancy : null;
    if (discrepancy == null || Math.abs(discrepancy) < 0.01) {
      return { needsReview: false, discrepancy: null };
    }
    return { needsReview: true, discrepancy };
  }
  return { needsReview: false, discrepancy: null };
}

function uniqueAmountCandidates(
  values: (number | null | undefined)[],
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue;
    const rounded = roundMoney(v);
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    out.push(rounded);
  }
  return out;
}

/**
 * Combina candidatos de 1ra y 2da pasada (y despejes algebraicos) buscando el set que cierra.
 */
export function pickBestReconcilingFields(
  ...fieldSets: AmountFields[]
): AmountFields | null {
  const nets = uniqueAmountCandidates(fieldSets.map((f) => f.net));
  const vats = uniqueAmountCandidates(fieldSets.map((f) => f.vat));
  const percs = uniqueAmountCandidates(fieldSets.map((f) => f.perceptions));
  const totals = uniqueAmountCandidates(fieldSets.map((f) => f.total));

  if (totals.length === 0) return null;

  for (const total of totals) {
    for (const net of nets) {
      for (const vat of vats) {
        for (const perc of percs) {
          const fields: AmountFields = {
            net,
            vat,
            perceptions: perc,
            total,
          };
          if (reconcileAmounts(fields).reconciled) return fields;
        }
      }
    }
  }

  for (const total of totals) {
    for (const net of nets) {
      for (const vat of vats) {
        const perc = roundMoney(total - net - vat);
        if (perc >= 0) {
          const fields: AmountFields = {
            net,
            vat,
            perceptions: perc,
            total,
          };
          if (reconcileAmounts(fields).reconciled) return fields;
        }
      }
    }
    for (const net of nets) {
      for (const perc of percs) {
        const vat = roundMoney(total - net - perc);
        if (vat >= 0) {
          const fields: AmountFields = {
            net,
            vat,
            perceptions: perc,
            total,
          };
          if (reconcileAmounts(fields).reconciled) return fields;
        }
      }
    }
    for (const vat of vats) {
      for (const perc of percs) {
        const net = roundMoney(total - vat - perc);
        if (net >= 0) {
          const fields: AmountFields = {
            net,
            vat,
            perceptions: perc,
            total,
          };
          if (reconcileAmounts(fields).reconciled) return fields;
        }
      }
    }
  }

  return null;
}
