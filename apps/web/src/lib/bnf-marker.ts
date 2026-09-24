export const BNF_MARKER_PREFIX = '@bnf:';

function parseTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function extractBnfArk(raw: string | null | undefined): string | null {
  const marker = parseTerms(raw).find((term) => term.startsWith(BNF_MARKER_PREFIX));
  if (!marker) return null;
  const ark = marker.slice(BNF_MARKER_PREFIX.length).trim();
  return /^ark:\/12148\/cb[0-9a-z]+$/i.test(ark) ? ark : null;
}

export function visibleSearchTerms(raw: string | null | undefined): string[] {
  return parseTerms(raw).filter((term) => !term.startsWith(BNF_MARKER_PREFIX) && !term.startsWith('@fr-isbn:'));
}

export function withBnfArk(raw: string | null | undefined, ark: string): string {
  const visible = visibleSearchTerms(raw);
  return JSON.stringify([...visible, `${BNF_MARKER_PREFIX}${ark}`]);
}

export function serializeVisibleTermsPreservingBnf(
  raw: string | null | undefined,
  visible: string[],
): string {
  const ark = extractBnfArk(raw);
  const isbn = extractFrenchIsbn(raw);
  return JSON.stringify([...visible, ...(ark ? [`${BNF_MARKER_PREFIX}${ark}`] : []), ...(isbn ? [`@fr-isbn:${isbn}`] : [])]);
}


export function extractFrenchIsbn(raw: string | null | undefined): string | null {
  const term = parseTerms(raw).find(v => /^@fr-isbn:97[89]\d{10}$/.test(v));
  return term?.slice(9) ?? null;
}
export function withFrenchIsbn(raw: string | null | undefined, isbn: string): string {
  return JSON.stringify([...parseTerms(raw).filter(v => !v.startsWith('@fr-isbn:')), `@fr-isbn:${isbn}`]);
}
