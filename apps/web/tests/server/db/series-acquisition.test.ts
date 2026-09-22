import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { insertChapter } from '@/server/db/chapters';
import { insertVolume } from '@/server/db/volumes';
import {
  getAcquisitionCounts,
  getSeriesHealth,
  insertSeries,
} from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => h.cleanup());

describe('getAcquisitionCounts', () => {
  it('counts chapter-granularity comic files as owned', async () => {
    const seriesId = await insertSeries({
      contentType: 'comic',
      titleEnglish: 'Ekhö Monde Miroir',
      status: 'finished',
      rootPath: '/media/comics/Ekhö Monde Miroir',
      qualityProfileId: h.qpId,
      granularity: 'chapter',
      totalChapters: 2,
    });

    const chapter12 = await insertChapter({
      seriesId,
      numberText: '12',
      numberSort: 12,
      title: 'La Walkyrie des fjords',
    });

    const chapter13 = await insertChapter({
      seriesId,
      numberText: '13',
      numberSort: 13,
      title: 'Les Chimères de Venise',
    });

    await getDb().insert(libraryFiles).values([
      {
        seriesId,
        chapterId: chapter12,
        path: '/media/comics/Ekho/c12.cbz',
        sizeBytes: 100,
      },
      {
        seriesId,
        chapterId: chapter13,
        path: '/media/comics/Ekho/c13.cbz',
        sizeBytes: 100,
      },
    ]);

    const counts = await getAcquisitionCounts();
    expect(counts.get(seriesId)).toEqual({ owned: 2, total: 2 });

    const health = await getSeriesHealth();
    expect(health.get(seriesId)).toBe('complete');
  });

  it('keeps volume-granularity counting unchanged', async () => {
    const seriesId = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Volume Test',
      status: 'finished',
      rootPath: '/media/comics/Volume Test',
      qualityProfileId: h.qpId,
      granularity: 'volume',
      totalVolumes: 2,
    });

    const volume1 = await insertVolume({
      seriesId,
      number: 1,
      title: 'Volume 1',
    });

    await insertVolume({
      seriesId,
      number: 2,
      title: 'Volume 2',
    });

    await getDb().insert(libraryFiles).values({
      seriesId,
      volumeId: volume1,
      path: '/media/comics/Volume Test/v01.cbz',
      sizeBytes: 100,
    });

    const counts = await getAcquisitionCounts();
    expect(counts.get(seriesId)).toEqual({ owned: 1, total: 2 });
  });
});
