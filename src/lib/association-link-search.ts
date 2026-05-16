type AssociationLinkSearchFields = {
  supplierName: string;
  supplierCode: string;
  chartAccountName: string;
  chartAccountCode: string;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

/** Cada token coincide como prefijo de una palabra consecutiva (ej. "a c" → "A Completar"). */
function nameMatchesWordPrefixes(name: string, tokens: string[]): boolean {
  const words = normalizeSearchText(name).split(" ");
  if (tokens.length === 0) return true;
  if (words.length < tokens.length) return false;
  for (let i = 0; i < tokens.length; i++) {
    if (!words[i]!.startsWith(tokens[i]!)) return false;
  }
  return true;
}

/** Todos los tokens aparecen en el texto (código, cuenta, etc.). */
function textIncludesAllTokens(text: string, tokens: string[]): boolean {
  const hay = normalizeSearchText(text);
  return tokens.every((t) => hay.includes(t));
}

export function associationLinkMatchesSearch(
  link: AssociationLinkSearchFields,
  rawQuery: string,
): boolean {
  const tokens = searchTokens(rawQuery);
  if (tokens.length === 0) return true;

  if (nameMatchesWordPrefixes(link.supplierName, tokens)) return true;

  const supplierHay = `${link.supplierName} ${link.supplierCode}`;
  if (textIncludesAllTokens(supplierHay, tokens)) return true;

  const accountHay = `${link.chartAccountCode} ${link.chartAccountName}`;
  if (nameMatchesWordPrefixes(link.chartAccountName, tokens)) return true;
  if (textIncludesAllTokens(accountHay, tokens)) return true;

  return false;
}
