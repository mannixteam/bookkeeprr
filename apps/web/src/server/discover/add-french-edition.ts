import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series, qualityProfiles } from '@/server/db/schema';
import { withWriteLock } from '@/server/db/write-lock';
import { getMediaRoot, contentTypeSubdir } from '@/server/content-type/paths';
import { sanitizeForFs } from '@/server/importer/series-helpers';
import { lookupFrenchIsbn } from './french-isbn';

export class EditionAddError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function addFrenchEdition(input: { isbn: string; source: string; sourceId: string; qualityProfileId: number }) {
  const edition = await lookupFrenchIsbn(input.isbn);
  if (!edition || edition.source !== input.source || edition.sourceId !== input.sourceId) {
    throw new EditionAddError('Édition modifiée ou indisponible : relancez la recherche.', 409);
  }
  const root = await getMediaRoot();
  return withWriteLock(async () => {
    const db = getDb();
    const [profile] = await db.select().from(qualityProfiles).where(eq(qualityProfiles.id, input.qualityProfileId));
    if (!profile) throw new EditionAddError('Profil de qualité invalide.', 400);
    const [existing] = await db.select().from(series).where(and(eq(series.contentType, 'comic'), eq(series.isbn, edition.ean!)));
    if (existing) return { id: existing.id, created: false };
    // An edition is not evidence of a complete series or of numbered volumes.
    // Preserve provenance in the persistent description and canonical ISBN field.
    const [row] = await db.insert(series).values({
      contentType: 'comic', titleEnglish: edition.title, isbn: edition.ean,
      publisher: edition.publisher, status: 'releasing', monitoring: 'none',
      granularity: 'volume', totalVolumes: null, totalChapters: null,
      description: `Édition française (fr)\nISBN/EAN : ${edition.ean}\nSource : ${edition.attribution}\nIdentifiant : ${edition.sourceId}\n${edition.sourceUrl}`,
      rootPath: `${root}/${contentTypeSubdir('comic')}/${sanitizeForFs(edition.title)} [${edition.ean}]`,
      qualityProfileId: input.qualityProfileId,
      // No BnF series marker or work-level OLID: no automatic series hydration.
      extraSearchTermsJson: '[]',
    }).returning({ id: series.id });
    return { id: row!.id, created: true };
  });
}
