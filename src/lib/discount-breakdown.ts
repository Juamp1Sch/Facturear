import type {
  DiscountSupplement,
  InvoiceExtraction,
  TaxBreakdownLine,
} from "@/lib/schemas";
import { sumTaxLines } from "@/lib/tax-breakdown";

export type DiscountSourceId = "computed" | "ia" | "supplement" | "ocr";

export type DiscountPercentageStep = {
  label: string;
  percentage: number;
};
export type DiscountLineProvenance = {
  label: string;
  amount: number;
  sources: DiscountSourceId[];
};

export type DiscountResolutionDebug = {
  sources: {
    ia: TaxBreakdownLine[];
    supplement: DiscountPercentageStep[];
    ocr: TaxBreakdownLine[];
    computed: TaxBreakdownLine[];
  };
  chosenSource: DiscountSourceId | null;
  merged: DiscountLineProvenance[];
  total: number;
};

const SOURCE_LABELS: Record<DiscountSourceId, string> = {
  computed: "Cálculo (neto + % secuenciales)",
  ia: "Extracción principal (IA)",
  supplement: "Relectura visión (porcentajes)",
  ocr: "Texto PDF / OCR",
};
export function formatDiscountSource(source: DiscountSourceId): string {
  return SOURCE_LABELS[source];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseArgentineMoney(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n) || n <= 0) return null;
  return roundMoney(n);
}

/** Extrae renglones BONIFICACION / Descuento desde texto OCR o PDF embebido. */
export function parseBonificacionLinesFromText(
  text: string | null | undefined,
): TaxBreakdownLine[] {
  if (!text?.trim()) return [];

  const lines: TaxBreakdownLine[] = [];
  const seen = new Set<string>();

  const bonificacionPattern =
    /BONIFICACI[ÓO]N[^:\n]{0,40}:\s*[\d.,]+\s*%\s*-?\s*([\d.]+,\d{2})/gi;
  for (const match of text.matchAll(bonificacionPattern)) {
    const label = match[0].split(":")[0]?.trim() ?? "Bonificación";
    const amount = parseArgentineMoney(match[1] ?? "");
    if (amount == null) continue;
    const key = `${label.toLowerCase()}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ label, amount });
  }

  const descPattern =
    /(?:^|\n)\s*(Desc(?:uento)?\s*\d*)\s*:?\s*[\d.,]+\s*%\s*-?\s*([\d.]+,\d{2})/gi;
  for (const match of text.matchAll(descPattern)) {
    const label = match[1]?.trim() ?? "Descuento";
    const amount = parseArgentineMoney(match[2] ?? "");
    if (amount == null) continue;
    const key = `${label.toLowerCase()}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ label, amount });
  }

  return lines;
}

/** Calcula importes de bonificaciones secuenciales a partir del neto gravado y los %. */
export function computeSequentialDiscountLines(
  netAmount: number,
  steps: DiscountPercentageStep[],
): TaxBreakdownLine[] | null {
  if (netAmount <= 0 || steps.length === 0) return null;

  const factor = steps.reduce(
    (acc, step) => acc * (1 - step.percentage / 100),
    1,
  );
  if (factor <= 0 || factor >= 1) return null;

  const gross = roundMoney(netAmount / factor);
  let base = gross;
  const lines: TaxBreakdownLine[] = [];

  for (const step of steps) {
    const amount = roundMoney(base * (step.percentage / 100));
    if (amount <= 0) return null;
    lines.push({
      label: step.label.trim() || "Bonificación",
      amount,
    });
    base = roundMoney(base - amount);
  }

  const impliedNet = roundMoney(gross - sumTaxLines(lines)!);
  if (Math.abs(impliedNet - netAmount) > 0.05) return null;

  return lines;
}

function parseSupplementPercentageSteps(
  supplement: DiscountSupplement | null | undefined,
): DiscountPercentageStep[] {
  return (
    supplement?.discount_lines
      ?.filter((line) => line.percentage > 0 && line.percentage < 100)
      .map((line) => ({
        label: line.label?.trim() || "Bonificación",
        percentage: line.percentage,
      })) ?? []
  );
}

function discountLinesFromExtraction(
  lines: TaxBreakdownLine[] | null | undefined,
): TaxBreakdownLine[] {
  return lines?.filter((l) => l.amount > 0) ?? [];
}
function dedupeWithinSource(lines: TaxBreakdownLine[]): TaxBreakdownLine[] {
  const byAmount = new Map<number, TaxBreakdownLine>();
  for (const line of lines) {
    if (line.amount <= 0) continue;
    const amount = roundMoney(line.amount);
    const existing = byAmount.get(amount);
    if (!existing || line.label.trim().length > existing.label.trim().length) {
      byAmount.set(amount, { label: line.label.trim() || "Bonificación", amount });
    }
  }
  return Array.from(byAmount.values()).sort((a, b) => b.amount - a.amount);
}

/**
 * Elige UNA sola fuente en vez de unir todas: unir importes mal leídos (cada fuente
 * confunde dígitos distintos) infla el total. Preferimos OCR de texto (exacto), luego
 * la relectura de visión recortada, y por último la extracción principal; a igual
 * prioridad gana la que tenga más renglones.
 */
function chooseDiscountSource(
  fromComputed: TaxBreakdownLine[],
  fromAi: TaxBreakdownLine[],
  fromText: TaxBreakdownLine[],
): { source: DiscountSourceId | null; lines: TaxBreakdownLine[] } {
  if (fromComputed.length > 0) {
    return { source: "computed", lines: fromComputed };
  }

  const candidates: { source: DiscountSourceId; lines: TaxBreakdownLine[]; priority: number }[] = [
    { source: "ocr", lines: dedupeWithinSource(fromText), priority: 3 },
    { source: "ia", lines: dedupeWithinSource(fromAi), priority: 1 },
  ].filter((c) => c.lines.length > 0);

  if (candidates.length === 0) return { source: null, lines: [] };

  candidates.sort((a, b) => {
    if (b.lines.length !== a.lines.length) return b.lines.length - a.lines.length;
    return b.priority - a.priority;
  });

  const best = candidates[0]!;
  return { source: best.source, lines: best.lines };
}

function buildDiscountDebug(
  fromAi: TaxBreakdownLine[],
  fromText: TaxBreakdownLine[],
  supplementSteps: DiscountPercentageStep[],
  fromComputed: TaxBreakdownLine[],
  chosenSource: DiscountSourceId | null,
  chosenLines: TaxBreakdownLine[],
  total: number,
): DiscountResolutionDebug {
  const matchesAmount = (lines: TaxBreakdownLine[], amount: number) =>
    lines.some((l) => roundMoney(l.amount) === amount);

  const merged: DiscountLineProvenance[] = chosenLines.map((line) => {
    const amount = roundMoney(line.amount);
    const sources: DiscountSourceId[] = [];
    if (chosenSource === "computed") sources.push("computed");
    if (matchesAmount(fromAi, amount)) sources.push("ia");
    if (matchesAmount(fromText, amount)) sources.push("ocr");
    if (chosenSource === "computed" && supplementSteps.length > 0) {
      sources.push("supplement");
    }
    return { label: line.label, amount, sources: [...new Set(sources)].sort() };
  });

  return {
    sources: {
      ia: fromAi,
      supplement: supplementSteps,
      ocr: fromText,
      computed: fromComputed,
    },
    chosenSource,
    merged,
    total,
  };
}
export type DiscountEnrichmentResult = {
  extracted: InvoiceExtraction;
  debug: DiscountResolutionDebug | null;
};

/** Unifica discount_lines/discount_amount desde IA, OCR y/o supplement de visión. */
export function enrichExtractedDiscounts(
  extracted: InvoiceExtraction,
  options?: {
    rawOcrText?: string | null;
    supplement?: DiscountSupplement | null;
  },
): DiscountEnrichmentResult {
  const fromAi = discountLinesFromExtraction(extracted.discount_lines);
  const fromText = parseBonificacionLinesFromText(options?.rawOcrText);
  const supplementSteps = parseSupplementPercentageSteps(options?.supplement);

  const netAmount = extracted.net_amount;
  const fromComputed =
    netAmount != null && netAmount > 0 && supplementSteps.length > 0
      ? (computeSequentialDiscountLines(netAmount, supplementSteps) ?? [])
      : [];

  const { source, lines } = chooseDiscountSource(fromComputed, fromAi, fromText);

  if (lines.length === 0) {
    return {
      extracted: {
        ...extracted,
        discount_lines: null,
        discount_amount: null,
      },
      debug: null,
    };
  }

  const sum = sumTaxLines(lines);
  const debug = buildDiscountDebug(
    fromAi,
    fromText,
    supplementSteps,
    fromComputed,
    source,
    lines,
    sum ?? 0,
  );

  return {
    extracted: {
      ...extracted,
      discount_lines: lines,
      discount_amount: sum,
    },
    debug,
  };
}

function isDiscountSourceId(value: string): value is DiscountSourceId {
  return (
    value === "computed" ||
    value === "ia" ||
    value === "supplement" ||
    value === "ocr"
  );
}

function parsePercentageSteps(raw: unknown): DiscountPercentageStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: DiscountPercentageStep[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.percentage !== "number" || Number.isNaN(e.percentage)) continue;
    steps.push({
      label: typeof e.label === "string" ? e.label : "Bonificación",
      percentage: e.percentage,
    });
  }
  return steps;
}
function parseTaxLines(raw: unknown): TaxBreakdownLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (line): line is TaxBreakdownLine =>
      typeof line === "object" &&
      line !== null &&
      typeof (line as TaxBreakdownLine).amount === "number" &&
      !Number.isNaN((line as TaxBreakdownLine).amount),
  );
}

export function parseDiscountResolutionFromPayload(
  aiPayload: unknown,
): DiscountResolutionDebug | null {
  if (!aiPayload || typeof aiPayload !== "object" || Array.isArray(aiPayload)) {
    return null;
  }
  const raw = (aiPayload as Record<string, unknown>).discount_resolution;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const o = raw as Record<string, unknown>;
  const sourcesRaw = o.sources;
  if (!sourcesRaw || typeof sourcesRaw !== "object" || Array.isArray(sourcesRaw)) {
    return null;
  }
  const sourcesObj = sourcesRaw as Record<string, unknown>;

  const mergedRaw = o.merged;
  if (!Array.isArray(mergedRaw)) return null;

  const merged: DiscountLineProvenance[] = [];
  for (const entry of mergedRaw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.amount !== "number" || Number.isNaN(e.amount)) continue;
    const label = typeof e.label === "string" ? e.label : "Bonificación";
    const sources = Array.isArray(e.sources)
      ? e.sources.filter((s): s is DiscountSourceId => typeof s === "string" && isDiscountSourceId(s))
      : [];
    merged.push({ label, amount: e.amount, sources });
  }

  if (merged.length === 0) return null;

  const total = typeof o.total === "number" && !Number.isNaN(o.total) ? o.total : sumTaxLines(merged) ?? 0;
  const chosenSource =
    typeof o.chosenSource === "string" && isDiscountSourceId(o.chosenSource)
      ? o.chosenSource
      : null;

  return {
    sources: {
      ia: parseTaxLines(sourcesObj.ia),
      supplement: parsePercentageSteps(sourcesObj.supplement),
      ocr: parseTaxLines(sourcesObj.ocr),
      computed: parseTaxLines(sourcesObj.computed),
    },
    chosenSource,
    merged,
    total,
  };
}
export function logDiscountResolution(
  context: string,
  debug: DiscountResolutionDebug | null,
): void {
  if (!debug) return;
  const payload = {
    context,
    chosenSource: debug.chosenSource,
    lineCount: debug.merged.length,
    total: debug.total,
    sources: {
      ia: debug.sources.ia.length,
      supplement: debug.sources.supplement.length,
      ocr: debug.sources.ocr.length,
      computed: debug.sources.computed.length,
    },
    merged: debug.merged.map((line) => ({
      label: line.label,
      amount: line.amount,
      sources: line.sources.map(formatDiscountSource),
    })),
  };
  console.info("[discount-resolution]", JSON.stringify(payload, null, 2));
}

/** Resuelve bonificaciones al leer aiPayload, complementando con OCR si hay más renglones. */
export function resolveDiscountBreakdown(
  discountLines: TaxBreakdownLine[] | null,
  discountAmount: number | null,
  rawOcrText?: string | null,
  storedResolution?: DiscountResolutionDebug | null,
): { discountLines: TaxBreakdownLine[] | null; discountAmount: number | null } {
  if (storedResolution?.merged.length) {
    return {
      discountLines: storedResolution.merged.map((line) => ({
        label: line.label,
        amount: line.amount,
      })),
      discountAmount: storedResolution.total,
    };
  }

  const fromPayload = discountLinesFromExtraction(discountLines);
  const fromText = parseBonificacionLinesFromText(rawOcrText);
  const { lines } = chooseDiscountSource([], fromPayload, fromText);

  if (lines.length === 0) {
    return {
      discountLines: null,
      discountAmount:
        discountAmount != null && discountAmount > 0 ? discountAmount : null,
    };
  }

  return {
    discountLines: lines,
    discountAmount: sumTaxLines(lines),
  };
}
