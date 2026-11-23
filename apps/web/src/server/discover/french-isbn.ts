import { lookupFrenchComicByIsbn, type BnfComicVolume } from '@/server/integrations/bnf';
import { bookEan } from '@/server/integrations/bnf/identifiers';
import { getFrenchEditionByIsbn } from '@/server/integrations/openlibrary/client';

/** Read-only exact-edition lookup; no title fallback, grouping or library writes. */
export async function lookupFrenchIsbn(input: string) {
  const ean = bookEan(input);
  if (!ean) throw new Error('Invalid ISBN');
  const bnf = await lookupFrenchComicByIsbn(ean);
  if (bnf) return bnfFrenchEdition(bnf);
  const edition = await getFrenchEditionByIsbn(ean);
  if (!edition) return null;
  return openLibraryFrenchEdition(edition);
}

export function bnfFrenchEdition(bnf: BnfComicVolume) {
  return {
    ...bnf, source: 'bnf' as const, sourceId: bnf.ark,
    sourceUrl: `https://catalogue.bnf.fr/${bnf.ark}`,
    attribution: 'Bibliothèque nationale de France', language: 'fr' as const,
  };
}

export function openLibraryFrenchEdition(edition: NonNullable<Awaited<ReturnType<typeof getFrenchEditionByIsbn>>>) {
  return {
    source: 'openlibrary' as const, sourceId: edition.key,
    sourceUrl: `https://openlibrary.org${edition.key}`, attribution: 'Open Library',
    language: 'fr' as const, ean: edition.ean, isbn: edition.ean, title: edition.title,
    publisher: edition.publishers?.[0] ?? null, publishDate: edition.publish_date ?? null,
    number: null, coverUrl: null,
  };
}
