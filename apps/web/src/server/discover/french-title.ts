import { searchFrenchComicSeries } from '@/server/integrations/bnf';
import { searchFrenchEditionsByTitle } from '@/server/integrations/openlibrary/client';
import { bnfFrenchEdition, openLibraryFrenchEdition } from './french-isbn';
import { mergeFrenchEditions } from './merge-french-editions';

/** Read-only supplementation, deliberately separate from broad Discover/series import.
 * BnF failures/incomplete pagination must never establish absence or activate supplementation.
 */
export async function lookupFrenchTitle(input: string) {
  const title = input.trim();
  if (title.length < 2 || title.length > 200) throw new Error('Invalid title');
  const groups = await searchFrenchComicSeries(title, { requireSuccess: true });
  const bnf = groups.flatMap(group => group.volumes).map(bnfFrenchEdition);
  let editions: Awaited<ReturnType<typeof searchFrenchEditionsByTitle>>;
  try {
    editions = await searchFrenchEditionsByTitle(title);
  } catch (error) {
    const results = mergeFrenchEditions(bnf, []);
    // Preserve usable BnF evidence, but explicitly report the failed supplement.
    // Without evidence, an upstream failure must never look like an empty search.
    if (!results.length) throw error;
    return { source: 'bnf' as const, coverage: 'bounded' as const, supplement: 'failed' as const, results };
  }
  const results = mergeFrenchEditions(bnf, editions.map(openLibraryFrenchEdition));
  const hasBnf = results.some(edition => edition.source === 'bnf');
  const hasOpenLibrary = results.some(edition => edition.source === 'openlibrary');
  // Source describes retained editions; successful empty searches keep the OL label.
  const source = hasBnf ? (hasOpenLibrary ? 'mixed' as const : 'bnf' as const) : 'openlibrary' as const;
  return { source, coverage: 'bounded' as const, supplement: 'succeeded' as const, results };
}
