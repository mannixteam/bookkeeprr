import { expect, it } from 'vitest';
import { mergeFrenchEditions, type FrenchEditionCandidate } from '@/server/discover/merge-french-editions';
type Bnf = Extract<FrenchEditionCandidate, { source: 'bnf' }>;
type OL = Extract<FrenchEditionCandidate, { source: 'openlibrary' }>;
const a = '9780306406157', b = '9782723488525';
function bnf(ean: string | null = a): Bnf {
  return { ark: 'ark:/12148/cb12345678x', sourceId: 'ark:/12148/cb12345678x',
    source: 'bnf', sourceUrl: 'https://catalogue.bnf.fr/ark:/12148/cb12345678x',
    attribution: 'Bibliothèque nationale de France', language: 'fr', title: 'Mirage',
    ean, isbn: ean, number: 2, publisher: 'Delcourt', year: 2024,
    coverUrl: '/api/img?bnfArk=ark%3A%2F12148%2Fcb12345678x', description: 'Notice BnF', creators: ['Auteur'] };
}
function ol(ean = a): OL {
  return { source: 'openlibrary', sourceId: '/books/OL1M',
    sourceUrl: 'https://openlibrary.org/books/OL1M', attribution: 'Open Library',
    language: 'fr', title: 'Mirage', ean, isbn: ean, number: null,
    coverUrl: null, publisher: null, publishDate: '2025' };
}
it('keeps all BnF metadata and object identity for a shared EAN', () => {
  const primary = Object.freeze(bnf()), supplement = Object.freeze(ol());
  expect(mergeFrenchEditions([primary], [supplement])).toEqual([primary]);
  expect(mergeFrenchEditions([primary], [supplement])[0]).toBe(primary);
});
it('preserves BnF order and appends distinct same-title editions', () => {
  const primary = bnf(b), supplement = ol(a);
  expect(mergeFrenchEditions([primary], [ol(b), supplement])).toEqual([primary, supplement]);
  expect(mergeFrenchEditions([bnf(b), bnf(a)], [])).toEqual([bnf(b), bnf(a)]);
});
it('retains the first candidate per EAN within either provider', () => {
  const primary = bnf(), supplement = ol(b);
  expect(mergeFrenchEditions([primary, { ...primary, title: 'Autre notice' }],
    [supplement, { ...supplement, sourceId: '/books/OL2M' }, ol()])).toEqual([primary, supplement]);
});
it('handles empty sources and preserves Open Library order', () => {
  expect(mergeFrenchEditions([], [])).toEqual([]);
  expect(mergeFrenchEditions([], [ol(b), ol(a)])).toEqual([ol(b), ol(a)]);
});
it('does not mutate either input array or candidates', () => {
  const primary = Object.freeze(bnf()), supplement = Object.freeze(ol(b));
  const first = Object.freeze([primary]), second = Object.freeze([supplement]);
  const merged = mergeFrenchEditions(first, second);
  merged.reverse();
  expect(first).toEqual([primary]); expect(second).toEqual([supplement]);
  expect(merged[1]).toBe(primary); expect(merged[0]).toBe(supplement);
});
it('excludes missing, invalid and noncanonical identifiers without title deduplication', () => {
  const invalid = ['', '9780306406158', '4006381333931', '0306406152', '978-0-306-40615-7'];
  expect(mergeFrenchEditions([bnf(null), ...invalid.map(id => bnf(id)), bnf(a)],
    [...invalid.map(id => ol(id)), ol(b)]).map(x => x.ean)).toEqual([a, b]);
});
