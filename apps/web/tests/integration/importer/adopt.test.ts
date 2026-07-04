import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { adoptImportRows, type AdoptRow } from '@/server/importer/adopt';
import { getSeries, insertSeries } from '@/server/db/series';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { listVolumesBySeries, insertVolume } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { series as seriesTable } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('adoptImportRows — ebook', () => {
  it('creates a series + volume 1 + library_file for an untracked ebook file', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Sabriel.epub',
        detectedTitle: 'Sabriel',
        contentType: 'ebook',
        files: ['/books/Sabriel.epub'],
        sizeBytes: 1_234_567,
      },
      match: {
        sourceId: 'OL12345W',
        title: 'Sabriel',
        author: 'Garth Nix',
        year: 1995,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const result = await adoptImportRows([row]);

    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);

    const seriesId = result.seriesIds[0]!;
    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Sabriel');
    expect(s?.contentType).toBe('ebook');
    expect(s?.openlibraryId).toBe('OL12345W');
    expect(s?.monitoring).toBe('all');

    // Volume 1 must exist
    const vols = await listVolumesBySeries(seriesId);
    expect(vols.some((v) => v.number === 1)).toBe(true);

    // Library file must be recorded
    const files = await listLibraryFilesBySeries(seriesId);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/books/Sabriel.epub');
    expect(files[0]!.sizeBytes).toBe(1_234_567);

    // rootPath reflects where the adopted file actually lives, not the
    // conventional <root>/<Author>/<Title> path from series creation.
    expect(s?.rootPath).toBe('/books');
  });

  it('is idempotent — re-running adopts nothing new', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Sabriel.epub',
        detectedTitle: 'Sabriel',
        contentType: 'ebook',
        files: ['/books/Sabriel.epub'],
        sizeBytes: 1_234_567,
      },
      match: {
        sourceId: 'OL12345W',
        title: 'Sabriel',
        author: 'Garth Nix',
        year: 1995,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const first = await adoptImportRows([row]);
    expect(first.imported).toBe(1);
    expect(first.seriesIds).toHaveLength(1);

    const second = await adoptImportRows([row]);
    expect(second.imported).toBe(0);
    expect(second.seriesIds).toHaveLength(1);
    expect(second.seriesIds[0]).toBe(first.seriesIds[0]);

    // Still exactly one library_file
    const files = await listLibraryFilesBySeries(first.seriesIds[0]!);
    expect(files).toHaveLength(1);
  });
});

describe('adoptImportRows — existing series (new volume)', () => {
  it('adopts a new volume into an existing series at the PARSED volume number', async () => {
    // Arrange: an existing light_novel series that owns volume 1 only.
    const seriesId = await insertSeries({
      contentType: 'light_novel',
      titleEnglish: 'Solo Leveling',
      status: 'releasing',
      rootPath: '/media/books/Solo Leveling',
      qualityProfileId: h.qpId,
      granularity: 'volume',
      monitoring: 'all',
    });
    await insertVolume({ seriesId, number: 1 });

    const row: AdoptRow = {
      item: {
        path: '/media/books/Solo Leveling/Solo Leveling v08 [Yen Press] [LuCaZ].epub',
        detectedTitle: 'Solo Leveling v08 [Yen Press] [LuCaZ]',
        contentType: 'light_novel',
        files: ['/media/books/Solo Leveling/Solo Leveling v08 [Yen Press] [LuCaZ].epub'],
        sizeBytes: 10_268_614,
      },
      match: null,
      existingSeries: { seriesId, title: 'Solo Leveling', contentType: 'light_novel', volume: 8 },
      monitor: false, // must NOT flip the existing series' monitoring
      qualityProfileId: h.qpId,
    };

    // Act
    const result = await adoptImportRows([row]);

    // Assert: adopted into the SAME series (no new series created).
    expect(result.imported).toBe(1);
    expect(result.seriesIds).toEqual([seriesId]);

    // Volume 8 was created (volume 1 still present).
    const vols = await listVolumesBySeries(seriesId);
    expect(vols.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 8]);
    const vol8 = vols.find((v) => v.number === 8)!;

    // The file is linked to volume 8, not volume 1.
    const files = await listLibraryFilesBySeries(seriesId);
    expect(files).toHaveLength(1);
    expect(files[0]!.volumeId).toBe(vol8.id);
    expect(files[0]!.path).toBe(row.item.files[0]);

    // Monitoring untouched (still 'all' despite monitor:false on the row).
    const s = await getSeries(seriesId);
    expect(s?.monitoring).toBe('all');

    // The file lives in the series' own folder, so rootPath is unchanged.
    expect(s?.rootPath).toBe('/media/books/Solo Leveling');
  });

  it('reconciles a stale conventional rootPath with where the adopted files actually live', async () => {
    // Arrange: a series added via the add flow — rootPath is the conventional
    // <root>/<Author>/<Title> path, but no files exist there. The real files
    // sit in a torrent-named sibling folder and are adopted in place.
    const seriesId = await insertSeries({
      contentType: 'audiobook',
      titleEnglish: 'Sabriel',
      author: 'Garth Nix',
      status: 'finished',
      rootPath: '/media/audiobooks/Garth Nix/Sabriel',
      qualityProfileId: h.qpId,
      granularity: 'volume',
      monitoring: 'all',
    });

    const row: AdoptRow = {
      item: {
        path: '/media/audiobooks/Garth Nix - Sabriel/Garth Nix - Sabriel.m4b',
        detectedTitle: 'Garth Nix - Sabriel',
        contentType: 'audiobook',
        files: ['/media/audiobooks/Garth Nix - Sabriel/Garth Nix - Sabriel.m4b'],
        sizeBytes: 400_000_000,
      },
      match: null,
      existingSeries: { seriesId, title: 'Sabriel', contentType: 'audiobook', volume: 1 },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const result = await adoptImportRows([row]);
    expect(result.imported).toBe(1);

    const s = await getSeries(seriesId);
    expect(s?.rootPath).toBe('/media/audiobooks/Garth Nix - Sabriel');
  });

  it('is idempotent — re-adopting the same existing-series row adds nothing', async () => {
    const seriesId = await insertSeries({
      contentType: 'light_novel',
      titleEnglish: 'Solo Leveling',
      status: 'releasing',
      rootPath: '/media/books/Solo Leveling',
      qualityProfileId: h.qpId,
      granularity: 'volume',
      monitoring: 'all',
    });
    const row: AdoptRow = {
      item: {
        path: '/media/books/Solo Leveling/Solo Leveling v08.epub',
        detectedTitle: 'Solo Leveling v08',
        contentType: 'light_novel',
        files: ['/media/books/Solo Leveling/Solo Leveling v08.epub'],
        sizeBytes: 100,
      },
      match: null,
      existingSeries: { seriesId, title: 'Solo Leveling', contentType: 'light_novel', volume: 8 },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    expect((await adoptImportRows([row])).imported).toBe(1);
    expect((await adoptImportRows([row])).imported).toBe(0);
    expect(await listLibraryFilesBySeries(seriesId)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('adoptImportRows — light_novel', () => {
  it('creates a series + volume 1 + library_file for an untracked light novel file', async () => {
    const row: AdoptRow = {
      item: {
        path: '/books/Overlord.epub',
        detectedTitle: 'Overlord',
        contentType: 'light_novel',
        files: ['/books/Overlord.epub'],
        sizeBytes: 2_000_000,
      },
      match: {
        sourceId: 'gb-abc123',
        title: 'Overlord',
        author: 'Kugane Maruyama',
        year: 2012,
        isbn: null,
        coverUrl: null,
        source: 'googlebooks',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const result = await adoptImportRows([row]);

    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const seriesId = result.seriesIds[0]!;
    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Overlord');
    expect(s?.contentType).toBe('light_novel');
    expect(s?.googleBooksVolumeId).toBe('gb-abc123');
    expect(s?.monitoring).toBe('all');

    // Volume 1 must exist
    const vols = await listVolumesBySeries(seriesId);
    expect(vols.some((v) => v.number === 1)).toBe(true);

    // Library file must be recorded
    const files = await listLibraryFilesBySeries(seriesId);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('/books/Overlord.epub');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('adoptImportRows — per-row error resilience', () => {
  it('skips a manga row (unsupported) without aborting the batch; valid rows still adopt', async () => {
    const mangaRow: AdoptRow = {
      item: {
        path: '/manga/Berserk',
        detectedTitle: 'Berserk',
        contentType: 'manga',
        files: ['/manga/Berserk/vol1.cbz'],
        sizeBytes: 50_000_000,
      },
      match: {
        sourceId: 'OL_MANGA_1',
        title: 'Berserk',
        author: 'Kentaro Miura',
        year: 1989,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: true,
      qualityProfileId: h.qpId,
    };

    const ebookRow: AdoptRow = {
      item: {
        path: '/books/Dune.epub',
        detectedTitle: 'Dune',
        contentType: 'ebook',
        files: ['/books/Dune.epub'],
        sizeBytes: 3_000_000,
      },
      match: {
        sourceId: 'OL99W',
        title: 'Dune',
        author: 'Frank Herbert',
        year: 1965,
        isbn: null,
        coverUrl: null,
        source: 'openlibrary',
      },
      monitor: false,
      qualityProfileId: h.qpId,
    };

    // Must NOT throw
    const result = await adoptImportRows([mangaRow, ebookRow]);

    // manga row is skipped
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.path).toBe('/manga/Berserk');
    expect(result.skipped[0]!.reason).toMatch(/unsupported/i);

    // ebook row still adopts
    expect(result.imported).toBe(1);
    expect(result.seriesIds).toHaveLength(1);

    const seriesId = result.seriesIds[0]!;
    const dbRow = await getDb()
      .select({ contentType: seriesTable.contentType })
      .from(seriesTable)
      .where(eq(seriesTable.id, seriesId))
      .limit(1);
    expect(dbRow[0]?.contentType).toBe('ebook');

    // manga series must NOT have been created
    const allSeries = await getDb().select().from(seriesTable);
    expect(allSeries.every((s) => s.contentType !== 'manga')).toBe(true);
  });
});
