/**
 * Fechas de factura son "solo día" (sin hora). Evitamos medianoche UTC + toLocale
 * que desplazan el día en zonas como America/Argentina/Buenos_Aires.
 */

export function parseAiInvoiceDate(iso: string | null): Date | null {
  if (!iso?.trim()) return null;
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;
const YYYY_MM_DD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function isValidCalendarParts(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

function formatYmd(y: number, mo: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Día calendario en Argentina (coherente con comprobantes locales). */
export function formatCalendarDateArgentina(
  value: string | Date | null | undefined,
): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const t = value.trim();
    const prefix = YYYY_MM_DD_PREFIX.exec(t);
    if (prefix) {
      const y = Number(prefix[1]);
      const mo = Number(prefix[2]);
      const d = Number(prefix[3]);
      if (isValidCalendarParts(y, mo, d)) return formatYmd(y, mo, d);
    }
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!isValidCalendarParts(y, mo, day)) return "";
  return formatYmd(y, mo, day);
}

export function todayCalendarDateArgentina(): string {
  return formatCalendarDateArgentina(new Date());
}

/** Valor para `<input type="date">` (día calendario en UTC, coherente con `parseAiInvoiceDate`). */
export function invoiceDateToInputValue(
  value: string | Date | null | undefined,
): string {
  return formatCalendarDateArgentina(value);
}

/**
 * Fecha para ApiSigma ImportCompras (`yyyy-mm-dd`).
 * Usa la fecha de la factura; si falta, la infiere del prefijo YYYYMMDD del movementId.
 */
export function resolveFechaFacturaForApi(
  invoiceDate: string | Date | null | undefined,
  movementId: string | null | undefined,
): string | null {
  const fromField = formatCalendarDateArgentina(invoiceDate);
  if (fromField.length > 0) return fromField;

  const mid = movementId?.trim() ?? "";
  const m = /^(\d{4})(\d{2})(\d{2})AGILE/i.exec(mid);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidCalendarParts(y, mo, d)) return null;
  return formatYmd(y, mo, d);
}

export function formatInvoiceCalendarDate(
  value: string | Date | null | undefined,
): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}
