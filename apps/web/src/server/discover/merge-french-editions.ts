import { bookEan } from '@/server/integrations/bnf/identifiers';
import type { bnfFrenchEdition, openLibraryFrenchEdition } from './french-isbn';

type BnfEdition = ReturnType<typeof bnfFrenchEdition>;
type OpenLibraryEdition = ReturnType<typeof openLibraryFrenchEdition>;
export type FrenchEditionCandidate = BnfEdition | OpenLibraryEdition;

/** Merge already eligible French editions, never infer eligibility or work identity.
 * First canonical EAN wins: BnF before Open Library, then original source order.
 * A malformed/noncanonical identifier is not a verified edition candidate.
 */
export function mergeFrenchEditions(
  bnf: readonly BnfEdition[],
  openLibrary: readonly OpenLibraryEdition[],
): FrenchEditionCandidate[] {
  const seen = new Set<string>();
  const merged: FrenchEditionCandidate[] = [];
  for (const edition of [...bnf, ...openLibrary]) {
    const ean = edition.ean === null ? null : bookEan(edition.ean);
    if (!ean || ean !== edition.ean || seen.has(ean)) continue;
    seen.add(ean);
    merged.push(edition);
  }
  return merged;
}
