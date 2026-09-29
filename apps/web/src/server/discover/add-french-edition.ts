import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { series, qualityProfiles, volumes } from '@/server/db/schema';
import { withWriteLock } from '@/server/db/write-lock';
import { getMediaRoot, contentTypeSubdir } from '@/server/content-type/paths';
import { sanitizeForFs } from '@/server/importer/series-helpers';
import { bookEan } from '@/server/integrations/bnf/identifiers';
import { lookupFrenchIsbn } from './french-isbn';

/** A malformed or contradictory legacy record cannot establish edition identity. */
function volumeEan(metadataJson: string): string | null {
  let metadata: unknown;
  try { metadata = JSON.parse(metadataJson); } catch { return null; }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const fields = metadata as Record<string, unknown>;
  const isbn = typeof fields.isbn === 'string' ? bookEan(fields.isbn) : null;
  const ean = typeof fields.ean === 'string' ? bookEan(fields.ean) : null;
  if (isbn && ean && isbn !== ean) return null;
  return ean ?? isbn;
}

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
    // Stay inside the same write lock as the series duplicate check/insert.
    // Only a volume-level identifier proves this edition is already represented;
    // a matching title or a parent series with another ISBN does not.
    const libraryVolumes = await db.select({ seriesId: volumes.seriesId, metadataJson: volumes.metadataJson })
      .from(volumes).innerJoin(series, eq(volumes.seriesId, series.id))
      .where(eq(series.contentType, 'comic')).orderBy(series.id, volumes.id);
    const matchingVolume = libraryVolumes.find(volume => volumeEan(volume.metadataJson) === edition.ean);
    if (matchingVolume) return { id: matchingVolume.seriesId, created: false };
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
