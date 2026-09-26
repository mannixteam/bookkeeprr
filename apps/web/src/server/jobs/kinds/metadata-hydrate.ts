import { z } from 'zod';
import { getManga } from '@/server/integrations/anilist/client';
import { getSeriesBySlug } from '@/server/integrations/novelupdates';
import { getSeries, updateSeries, updateSeriesMetadata } from '@/server/db/series';
import { insertVolume, listVolumesBySeries, updateVolume } from '@/server/db/volumes';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';
import { getFrenchComicSeries } from '@/server/integrations/bnf';
import { extractBnfArk } from '@/lib/bnf-marker';
import { bookEan } from '@/server/integrations/bnf/identifiers';

/** Maps a NovelUpdates `statusInCoo` string onto our series status enum. */
function nuStatus(raw: string | null): 'releasing' | 'finished' | 'hiatus' | 'cancelled' | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/(ongoing|publishing|releasing)/.test(s)) return 'releasing';
  if (/(complete|finished|completed)/.test(s)) return 'finished';
  if (/hiatus/.test(s)) return 'hiatus';
  if (/(cancel|dropped)/.test(s)) return 'cancelled';
  return null;
}

const HydratePayload = z.object({ seriesId: z.number().int().positive() });

export const metadataHydrateDescriptor: JobKindDescriptor<
  { seriesId: number },
  { volumesAdded: number }
> = {
  kind: 'metadata_hydrate',
  retryPolicy: { maxAttempts: 5 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'metadata_hydrate', jobId });
    const payload = HydratePayload.parse(rawPayload);
    const series = await getSeries(payload.seriesId);
    if (!series) {
      log.warn({ seriesId: payload.seriesId }, 'series not found; skipping');
      return { volumesAdded: 0 };
    }
    const bnfArk = series.contentType === 'comic' ? extractBnfArk(series.extraSearchTermsJson) : null;
    if (bnfArk) {
      const detail = await getFrenchComicSeries(bnfArk, series.titleEnglish);
      await updateSeries(series.id, {
        titleEnglish: detail.name,
        publisher: detail.publisher,
        startYear: detail.startYear,
        coverUrl: detail.coverUrl,
        description: detail.description,
        // Unknown ordinals must not invent numbered slots or shrink known totals.
        totalVolumes: Math.max(series.totalVolumes ?? 0, ...detail.volumes.map(v => v.number ?? 0)) || null,
        granularity: 'volume',
      });

      const existing = await listVolumesBySeries(series.id);
      const byNumber = new Map(existing.map((v) => [v.number, v]));
      // The library has one row per ordinal, while the catalog retains editions.
      const candidates = new Map<number, typeof detail.volumes>();
      for (const volume of detail.volumes) {
        if (volume.number == null) continue;
        const list = candidates.get(volume.number) ?? [];
        list.push(volume);
        candidates.set(volume.number, list);
      }
      let added = 0;
      for (const [number, editions] of candidates) {
        const existingRow = byNumber.get(number);
        let meta: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(existingRow?.metadataJson ?? '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
        } catch { /* Unidentified local metadata does not assert an edition. */ }
        const existingArk = typeof meta.bnfArk === 'string' ? meta.bnfArk.toLowerCase() : null;
        const existingEan = bookEan(typeof meta.ean === 'string' ? meta.ean : '')
          ?? bookEan(typeof meta.isbn === 'string' ? meta.isbn : '');
        const volume = editions.find(v => v.ark.toLowerCase() === bnfArk.toLowerCase())
          ?? editions.find(v => v.ark.toLowerCase() === existingArk)
          ?? editions.find(v => existingEan != null && v.ean === existingEan)
          ?? (existingArk || existingEan ? undefined : editions[0]);
        // An absent known edition must not be replaced by another reissue.
        if (!volume) continue;
        const metadataJson = JSON.stringify({
          source: 'bnf',
          bnfArk: volume.ark,
          isbn: volume.isbn,
          ean: volume.ean,
          coverUrl: volume.coverUrl,
          publisher: volume.publisher,
          creators: volume.creators,
          coverSource: 'Bibliothèque nationale de France',
          coverRetrievedAt: new Date().toISOString().slice(0, 10),
        });
        const releaseDate = volume.year ? new Date(`${volume.year}-01-01T00:00:00Z`) : null;
        const row = byNumber.get(number);
        if (row) {
          await updateVolume(row.id, { title: volume.title, releaseDate, metadataJson });
        } else {
          await insertVolume({
            seriesId: series.id,
            number,
            title: volume.title,
            releaseDate,
            metadataJson,
          });
          added++;
        }
      }
      log.info({ seriesId: series.id, bnfArk, volumesAdded: added }, 'BnF comic hydrate complete');
      return { volumesAdded: added };
    }

    if (series.anilistId == null) {
      // NovelUpdates-anchored novel (no AniList id, but a NU slug): re-hydrate
      // title/cover/description/status from the NU client. NU yields no volume
      // count, so we seed no volume rows here — they auto-create on import.
      if (series.contentType === 'light_novel' && series.novelUpdatesSlug) {
        try {
          const nu = await getSeriesBySlug(series.novelUpdatesSlug);
          await updateSeriesMetadata(series.id, {
            titleEnglish: nu.title,
            description: nu.description,
            coverUrl: nu.coverUrl,
            ...(nuStatus(nu.statusInCoo) ? { status: nuStatus(nu.statusInCoo)! } : {}),
          });
          log.info({ seriesId: series.id }, 'NU-anchored hydrate complete');
        } catch (err) {
          log.warn(
            { seriesId: series.id, slug: series.novelUpdatesSlug, err: (err as Error).message },
            'NU-anchored hydrate fetch failed',
          );
        }
        return { volumesAdded: 0 };
      }
      log.warn({ seriesId: series.id }, 'series has no anilistId; skipping hydrate');
      return { volumesAdded: 0 };
    }

    const detail = await getManga(series.anilistId);

    await updateSeriesMetadata(series.id, {
      titleEnglish: detail.titleEnglish,
      titleRomaji: detail.titleRomaji,
      titleNative: detail.titleNative,
      status: detail.status,
      coverUrl: detail.coverUrl,
      description: detail.description,
      totalVolumes: detail.totalVolumes,
      totalChapters: detail.totalChapters,
    });

    const existing = await listVolumesBySeries(series.id);
    const existingNumbers = new Set(existing.map((v) => v.number));
    let added = 0;
    if (detail.totalVolumes && detail.totalVolumes > 0) {
      for (let n = 1; n <= detail.totalVolumes; n++) {
        if (!existingNumbers.has(n)) {
          await insertVolume({ seriesId: series.id, number: n });
          added++;
        }
      }
    }

    log.info({ seriesId: series.id, volumesAdded: added }, 'hydrate complete');

    // Chain: trigger chapter sync + per-volume hydrate after hydrate succeeds
    const { enqueueJob } = await import('@/server/db/jobs');
    await enqueueJob('mangadex_chapter_sync', { seriesId: series.id });
    await enqueueJob('mangadex_volume_hydrate', { seriesId: series.id });

    return { volumesAdded: added };
  },
};
