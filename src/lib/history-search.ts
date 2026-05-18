import type { Prisma } from "@prisma/client";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Medianoche del día calendario en Argentina → instante UTC (AR = UTC−3, sin DST). */
function argentinaDayStartUtc(isoDay: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 3, 0, 0));
}

/** Inicio del día siguiente en Argentina (límite exclusivo superior). */
function argentinaDayEndExclusiveUtc(isoDay: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d + 1, 3, 0, 0));
}

export function parseHistoryDateParam(
  value: string | null | undefined,
): string {
  const t = value?.trim() ?? "";
  if (!t) return "";
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(t) ? t : "";
}

/** Muestra un filtro YYYY-MM-DD como DD-MM-YYYY. */
export function formatHistoryDateParamDisplay(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!m) return isoDay;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export type HistoryListFilters = {
  q?: string | null;
  from?: string | null;
  to?: string | null;
};

export function buildHistoryWhere(
  userId: string,
  filters: HistoryListFilters,
): Prisma.InvoiceWhereInput {
  const q = filters.q?.trim() ?? "";
  const from = parseHistoryDateParam(filters.from);
  const to = parseHistoryDateParam(filters.to);

  const createdAt: Prisma.DateTimeFilter = {};
  if (from) {
    const start = argentinaDayStartUtc(from);
    if (start) createdAt.gte = start;
  }
  if (to) {
    const end = argentinaDayEndExclusiveUtc(to);
    if (end) createdAt.lt = end;
  }

  const base: Prisma.InvoiceWhereInput = {
    userId,
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
  };

  if (!q) return base;

  const or: Prisma.InvoiceWhereInput[] = [
    { providerName: { contains: q, mode: "insensitive" } },
    { providerCuit: { contains: q, mode: "insensitive" } },
    { invoiceNumber: { contains: q, mode: "insensitive" } },
    { supplierCode: { contains: q, mode: "insensitive" } },
    { chartAccount: { name: { contains: q, mode: "insensitive" } } },
    { chartAccount: { code: { contains: q, mode: "insensitive" } } },
  ];

  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && digits !== q) {
    or.push({ providerCuit: { contains: digits, mode: "insensitive" } });
  }

  return { ...base, OR: or };
}

export type HistoryUrlParams = {
  page?: number;
  q?: string;
  from?: string;
  to?: string;
};

function appendHistoryFilters(params: URLSearchParams, filters: HistoryUrlParams) {
  const q = filters.q?.trim() ?? "";
  const from = parseHistoryDateParam(filters.from);
  const to = parseHistoryDateParam(filters.to);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
}

export function historyListUrl(filters: HistoryUrlParams): string {
  const params = new URLSearchParams();
  const page = filters.page ?? 1;
  if (page > 1) params.set("page", String(page));
  appendHistoryFilters(params, filters);
  const s = params.toString();
  return s ? `/history?${s}` : "/history";
}

export type HistoryExportFormat = "csv" | "xlsx";

export function historyExportUrl(
  filters: HistoryUrlParams & { format: HistoryExportFormat },
): string {
  const params = new URLSearchParams();
  params.set("format", filters.format);
  appendHistoryFilters(params, filters);
  return `/api/history/export?${params.toString()}`;
}

/** Fecha de carga (solo día, Argentina) — coherente con el filtro por `createdAt`. */
export function formatCreatedAtDateArgentina(
  value: string | Date | null | undefined,
): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIMEZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}

/** Formato de fecha/hora de carga para export (Argentina). */
export function formatCreatedAtArgentina(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function hasActiveHistoryFilters(filters: HistoryListFilters): boolean {
  return Boolean(
    filters.q?.trim() ||
      parseHistoryDateParam(filters.from) ||
      parseHistoryDateParam(filters.to),
  );
}
