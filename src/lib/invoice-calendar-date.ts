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
