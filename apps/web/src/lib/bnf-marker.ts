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
  return parseTerms(raw).filter((term) => !term.startsWith(BNF_MARKER_PREFIX));
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
  return JSON.stringify(ark ? [...visible, `${BNF_MARKER_PREFIX}${ark}`] : visible);
}
