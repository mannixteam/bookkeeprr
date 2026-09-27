import { searchFrenchComicSeries } from '@/server/integrations/bnf';
import { bookEan } from '@/server/integrations/bnf/identifiers';
import { searchFrenchEditionsByTitle } from '@/server/integrations/openlibrary/client';
import { bnfFrenchEdition, openLibraryFrenchEdition } from './french-isbn';

/** Read-only fallback, deliberately separate from broad Discover/series import.
 * BnF failures/incomplete pagination must never establish absence for fallback.
 */
export async function lookupFrenchTitle(input: string) {
  const title = input.trim();
  if (title.length < 2 || title.length > 200) throw new Error('Invalid title');
  const groups = await searchFrenchComicSeries(title, { requireSuccess: true });
  const results = groups.flatMap(group => group.volumes)
    .filter(volume => volume.ean !== null && bookEan(volume.ean) === volume.ean)
    .map(bnfFrenchEdition);
  if (results.length) return { source: 'bnf' as const, coverage: 'bounded' as const, results };
  const editions = await searchFrenchEditionsByTitle(title);
  return { source: 'openlibrary' as const, coverage: 'bounded' as const, results: editions.map(openLibraryFrenchEdition) };
}
