import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { insertSeries } from '@/server/db/series.js';
import { insertLibraryFile } from '@/server/db/library-files.js';
import { setAllNamingTemplates } from '@/server/db/settings/naming.js';
import {
  deleteSeriesFilesAndTorrents,
  SeriesFileDeletionError,
} from '@/server/series/delete-files.js';
import { seedDefaultIndexer } from '@/server/db/indexers.js';
import { insertRelease } from '@/server/db/releases.js';
import { insertDownload } from '@/server/db/downloads.js';
import { qbtConnectionSetting } from '@/server/db/settings/qbt.js';
import {
  __resetQbtForTests,
  __setQbtFetcherForTests,
} from '@/server/integrations/qbittorrent/client.js';

let tmp: string;
let qpId: number;
let root: string; // effective manga library dir: <media root>/comics
let prevMediaRoot: string | undefined;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-delfiles-'));
  process.env.BOOKKEEPRR_DB_PATH = join(tmp, 'test.db');
  prevMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = join(tmp, 'media');
  root = join(tmp, 'media', 'comics');
  mkdirSync(root, { recursive: true });
  migrate(getDb(), { migrationsFolder: './drizzle' });
  qpId = await seedDefaultQualityProfile();
});

afterEach(() => {
  closeDb();
  if (prevMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = prevMediaRoot;
  __resetQbtForTests();
  rmSync(tmp, { recursive: true, force: true });
});

async function seedSeries(rootPath: string, anilistId: number): Promise<number> {
  return insertSeries({
    anilistId,
    status: 'releasing',
    rootPath,
    qualityProfileId: qpId,
  });
}

/** Creates the file on disk (with parent dirs) and tracks it in library_files. */
async function addFile(seriesId: number, path: string): Promise<void> {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'x');
  await insertLibraryFile({ seriesId, path, sizeBytes: 1 });
}

describe('deleteSeriesFilesAndTorrents - disk rules', () => {
  it('removes the series folder recursively, strays included', async () => {
    const dir = join(root, 'Solo Leveling');
    const id = await seedSeries(dir, 1);
    await addFile(id, join(dir, 'v01.cbz'));
    await addFile(id, join(dir, 'v02.cbz'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'cover.jpg'), 'stray');

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(existsSync(dir)).toBe(false);
    expect(res.filesDeleted).toBe(2);
    expect(res.errors).toEqual([]);
  });

  it('handles a volume_subfolder level when deriving the folder', async () => {
    await setAllNamingTemplates('manga', { volume_subfolder: 'Volume {volume:00}' });
    const dir = join(root, 'Subbed Title');
    const id = await seedSeries(dir, 2);
    await addFile(id, join(dir, 'Volume 01', 'a.cbz'));
    await addFile(id, join(dir, 'Volume 02', 'b.cbz'));

    await deleteSeriesFilesAndTorrents(id);

    expect(existsSync(dir)).toBe(false);
  });

  it('falls back to per-file unlink when files sit flat in the library root', async () => {
    const id = await seedSeries(root, 3);
    await addFile(id, join(root, 'one.cbz'));
    await addFile(id, join(root, 'two.cbz'));
    writeFileSync(join(root, 'keep.cbz'), 'unrelated');

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, 'one.cbz'))).toBe(false);
    expect(existsSync(join(root, 'two.cbz'))).toBe(false);
    expect(existsSync(join(root, 'keep.cbz'))).toBe(true);
    expect(res.filesDeleted).toBe(2);
  });

  it('unlinks an outside-root file individually and leaves its folder', async () => {
    const outside = join(tmp, 'elsewhere');
    const id = await seedSeries(outside, 4);
    await addFile(id, join(outside, 'book.epub'));
    writeFileSync(join(outside, 'other.txt'), 'not ours');

    await deleteSeriesFilesAndTorrents(id);

    expect(existsSync(join(outside, 'book.epub'))).toBe(false);
    expect(existsSync(join(outside, 'other.txt'))).toBe(true);
    expect(existsSync(outside)).toBe(true);
  });

  it('falls back to per-file unlink when another series tracks files in the folder', async () => {
    const dir = join(root, 'Shared');
    const a = await seedSeries(dir, 5);
    const b = await seedSeries(dir, 6);
    await addFile(a, join(dir, 'a.cbz'));
    await addFile(b, join(dir, 'b.cbz'));

    await deleteSeriesFilesAndTorrents(a);

    expect(existsSync(join(dir, 'a.cbz'))).toBe(false);
    expect(existsSync(join(dir, 'b.cbz'))).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });

  it('skips already-missing files silently', async () => {
    const id = await seedSeries(root, 7);
    // Tracked but never written to disk; flat-in-root forces per-file mode.
    await insertLibraryFile({ seriesId: id, path: join(root, 'gone.cbz'), sizeBytes: 1 });

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(res.filesDeleted).toBe(0);
    expect(res.errors).toEqual([]);
  });

  it('throws SeriesFileDeletionError on a non-ENOENT failure', async () => {
    const id = await seedSeries(root, 8);
    // Tracked path is a DIRECTORY sitting flat in the root: per-file mode
    // unlink() fails with EISDIR (not ENOENT) -> hard failure.
    const evil = join(root, 'actually-a-dir');
    mkdirSync(evil, { recursive: true });
    await insertLibraryFile({ seriesId: id, path: evil, sizeBytes: 1 });

    await expect(deleteSeriesFilesAndTorrents(id)).rejects.toThrow(SeriesFileDeletionError);
  });

  it('is a no-op for a series with no files', async () => {
    const id = await seedSeries(join(root, 'Empty'), 9);
    const res = await deleteSeriesFilesAndTorrents(id);
    expect(res).toEqual({ filesDeleted: 0, torrentsDeleted: 0, errors: [] });
  });

  it('is a no-op for an unknown series id', async () => {
    const res = await deleteSeriesFilesAndTorrents(999999);
    expect(res).toEqual({ filesDeleted: 0, torrentsDeleted: 0, errors: [] });
  });
});

describe('deleteSeriesFilesAndTorrents - torrents', () => {
  // Unique per call (not per hash): a hash can be seeded more than once in a
  // test to model "second grab of the same torrent" as two distinct releases
  // sharing one qbtHash. The releases table has a real unique index on
  // (indexer_id, indexer_guid), so the guid itself must stay unique per call.
  let seedCallCount = 0;

  async function seedDownload(seriesId: number, hash: string): Promise<void> {
    const indexerId = await seedDefaultIndexer();
    seedCallCount++;
    const releaseId = await insertRelease({
      seriesId,
      indexerId,
      indexerGuid: `guid-${hash}-${seedCallCount}`,
      title: 't',
      link: 'http://x/t.torrent',
      targetKind: 'volume',
      sizeBytes: 1,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId, qbtHash: hash });
  }

  function mockQbt(deleteCalls: string[], opts?: { failDeletes?: boolean }): void {
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      if (url.endsWith('/api/v2/torrents/delete')) {
        if (opts?.failDeletes) {
          return { ok: false, status: 500, headers: {}, text: async () => 'boom' };
        }
        deleteCalls.push(String(init?.body ?? ''));
        return { ok: true, status: 200, headers: {}, text: async () => '' };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '' };
    });
  }

  async function configureQbt(): Promise<void> {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    __resetQbtForTests();
  }

  it('deletes the series torrents with their data, deduped', async () => {
    const dir = join(root, 'Torrented');
    const id = await seedSeries(dir, 20);
    await addFile(id, join(dir, 'v01.cbz'));
    // downloads.qbtHash carries a real unique index (schema.ts), so two rows
    // can never share a hash - the dedup pass over hashRows is defensive only.
    // Two distinct grabs still exercise "every hash the series grabbed".
    await seedDownload(id, 'aaa111');
    await seedDownload(id, 'bbb222');
    await configureQbt();
    const calls: string[] = [];
    mockQbt(calls);

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(res.torrentsDeleted).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.join('&')).toContain('deleteFiles=true');
    expect(calls.some((c) => c.includes('aaa111'))).toBe(true);
    expect(calls.some((c) => c.includes('bbb222'))).toBe(true);
    expect(existsSync(dir)).toBe(false); // disk deletion still ran
  });

  it('records torrent failures without blocking the delete', async () => {
    const dir = join(root, 'TorrentFail');
    const id = await seedSeries(dir, 21);
    await addFile(id, join(dir, 'v01.cbz'));
    await seedDownload(id, 'ccc333');
    await configureQbt();
    mockQbt([], { failDeletes: true });

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(res.torrentsDeleted).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('ccc333');
    expect(existsSync(dir)).toBe(false); // disk deletion still ran
  });

  it('skips torrent removal entirely when qBittorrent is not configured', async () => {
    const dir = join(root, 'NoQbt');
    const id = await seedSeries(dir, 22);
    await addFile(id, join(dir, 'v01.cbz'));
    await seedDownload(id, 'ddd444');
    // No qbtConnectionSetting.set -> defaults -> isQbtConfigured false.

    const res = await deleteSeriesFilesAndTorrents(id);

    expect(res.torrentsDeleted).toBe(0);
    expect(res.errors).toEqual([]);
    expect(existsSync(dir)).toBe(false);
  });
});
