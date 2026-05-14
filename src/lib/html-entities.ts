/** Decodifica entidades HTML numéricas y algunas nominales (p. ej. export ERP). */
export function decodeBasicHtmlEntities(input: string): string {
  if (!input) return input;
  let s = input.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  s = s.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  return s;
}
