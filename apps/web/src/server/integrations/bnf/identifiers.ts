/** Validate book identifiers before using them to identify an edition or cover. */
export function normalizeBookIdentifier(raw: string): string | null {
  const value = raw.trim().replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) {
    const sum = [...value].reduce((total, digit, i) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0);
    return sum % 11 === 0 ? value : null;
  }
  if (!/^97[89]\d{10}$/.test(value)) return null;
  const sum = [...value].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0 ? value : null;
}

export function bookEan(raw: string): string | null {
  const isbn = normalizeBookIdentifier(raw);
  if (!isbn || isbn.length === 13) return isbn;
  const prefix = `978${isbn.slice(0, 9)}`;
  const sum = [...prefix].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

export function extractBookIdentifiers(values: string[]): { isbn: string | null; ean: string | null } {
  for (const raw of values) {
    // Bound digit counts so ISBNs separated by whitespace cannot be concatenated.
    const candidates = raw.match(/(?<![\dXx])(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])(?![\dXx])/g) ?? [];
    for (const candidate of candidates) {
      const isbn = normalizeBookIdentifier(candidate);
      if (isbn) return { isbn, ean: bookEan(isbn) };
    }
  }
  return { isbn: null, ean: null };
}
