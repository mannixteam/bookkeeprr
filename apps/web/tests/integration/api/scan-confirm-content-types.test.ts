import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertScanMatch } from '@/server/db/scan-matches';
import { getDb } from '@/server/db/client';
import { series, volumes, libraryFiles } from '@/server/db/schema';
import { POST } from '@/app/api/scan/groups/[dirHash]/confirm/route';
import { dirHash } from '@/lib/dir-hash';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

function confirm(dir: string): Promise<Response> {
  return POST(new Request('http://x/confirm', { method: 'POST' }), {
    params: Promise.resolve({ dirHash: dirHash(dir) }),
  });
}

describe('POST /api/scan/groups/[dirHash]/confirm — content types + volume linking', () => {
  it('imports an ebook: creates an ebook series and LINKS the file to volume 1', async () => {
    const dir = '/media/Atomic Habits';
    await insertScanMatch({
      filePath: dir + '/Atomic Habits.epub',
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({
        proposal: {
          contentType: 'ebook',
          granularity: 'volume',
          openlibraryId: 'OL123W',
          isbn: '9780735211292',
          titleEnglish: 'Atomic Habits',
          author: 'James Clear',
          status: 'finished',
          totalVolumes: 1,
        },
      }),
    });

    const res = await confirm(dir);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seriesId: number; importedCount: number };
    expect(body.importedCount).toBe(1);

    const s = (await getDb().select().from(series).where(eq(series.id, body.seriesId)))[0]!;
    expect(s.contentType).toBe('ebook');
    expect(s.openlibraryId).toBe('OL123W');
    expect(s.titleEnglish).toBe('Atomic Habits');
    expect(s.author).toBe('James Clear');
    expect(s.granularity).toBe('volume');

    const vols = await getDb().select().from(volumes).where(eq(volumes.seriesId, body.seriesId));
    expect(vols).toHaveLength(1);
    expect(vols[0]!.number).toBe(1);

    const files = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.seriesId, body.seriesId));
    expect(files).toHaveLength(1);
    // The crux of the bug: the file must be linked to the volume (not NULL),
    // otherwise the volume reads "missing" despite the file existing.
    expect(files[0]!.volumeId).toBe(vols[0]!.id);
  });

  it('manga: auto-creates the missing volume so the file links (was "missing")', async () => {
    const dir = '/media/Bunny Drop';
    // proposedVolume 1 (e.g. recovered by the new "(N)" parser fallback) but NO
    // volume row exists yet — the confirm route must create it, not orphan the file.
    await insertScanMatch({
      filePath: dir + '/Bunny Drop - c [] (1).cbz',
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({
        proposal: {
          contentType: 'manga',
          granularity: 'volume',
          anilistId: 424242,
          titleRomaji: 'Bunny Drop',
          status: 'finished',
        },
      }),
    });

    const res = await confirm(dir);
    expect(res.status).toBe(200);
    const { seriesId } = (await res.json()) as { seriesId: number };

    const vols = await getDb().select().from(volumes).where(eq(volumes.seriesId, seriesId));
    expect(vols).toHaveLength(1);
    expect(vols[0]!.number).toBe(1);
    const files = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.seriesId, seriesId));
    expect(files[0]!.volumeId).toBe(vols[0]!.id);
  });

  it('audiobook: creates an audiobook series carrying the ASIN', async () => {
    const dir = '/media/Cant Hurt Me';
    await insertScanMatch({
      filePath: dir + '/Cant Hurt Me.m4b',
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({
        proposal: {
          contentType: 'audiobook',
          granularity: 'volume',
          asin: 'B07XYZ1234',
          titleEnglish: 'Cant Hurt Me',
          author: 'David Goggins',
          status: 'finished',
          totalVolumes: 1,
        },
      }),
    });

    const res = await confirm(dir);
    expect(res.status).toBe(200);
    const { seriesId } = (await res.json()) as { seriesId: number };
    const s = (await getDb().select().from(series).where(eq(series.id, seriesId)))[0]!;
    expect(s.contentType).toBe('audiobook');
    expect(s.asin).toBe('B07XYZ1234');
  });

  it('still imports a legacy manga scan that only stashed aniListMatch', async () => {
    const dir = '/media/comics/Old Scan';
    await insertScanMatch({
      filePath: dir + '/Old Scan v01.cbz',
      proposedVolume: 1,
      parserDebugJson: JSON.stringify({ aniListMatch: { anilistId: 555, titleRomaji: 'Old Scan' } }),
    });
    const res = await confirm(dir);
    expect(res.status).toBe(200);
    const { seriesId } = (await res.json()) as { seriesId: number };
    const s = (await getDb().select().from(series).where(eq(series.id, seriesId)))[0]!;
    expect(s.contentType).toBe('manga');
    expect(s.anilistId).toBe(555);
  });
});
