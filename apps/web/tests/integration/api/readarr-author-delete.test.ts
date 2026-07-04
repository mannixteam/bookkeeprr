import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { getSeries, insertSeries } from '@/server/db/series.js';
import { insertLibraryFile } from '@/server/db/library-files.js';
import { DELETE as authorDelete } from '@/app/api/readarr/v1/author/[id]/route.js';

let tmp: string;
let qpId: number;
let root: string;
let prevMediaRoot: string | undefined;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-readarr-del-'));
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
  rmSync(tmp, { recursive: true, force: true });
});

async function seedSeriesWithFile(anilistId: number): Promise<{ id: number; dir: string }> {
  const dir = join(root, `Author ${anilistId}`);
  const id = await insertSeries({
    anilistId,
    status: 'releasing',
    rootPath: dir,
    qualityProfileId: qpId,
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'book.epub'), 'x');
  await insertLibraryFile({ seriesId: id, path: join(dir, 'book.epub'), sizeBytes: 1 });
  return { id, dir };
}

function delReq(id: number, qs = ''): Request {
  return new Request(`http://localhost/api/readarr/v1/author/${id}${qs}`, { method: 'DELETE' });
}

describe('DELETE /api/readarr/v1/author/[id] deleteFiles', () => {
  it('deleteFiles=true removes the folder and the series', async () => {
    const { id, dir } = await seedSeriesWithFile(41);
    const res = await authorDelete(delReq(id, '?deleteFiles=true'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(dir)).toBe(false);
    expect(await getSeries(id)).toBeNull();
  });

  it('deleteFiles=false (Readarr default) leaves files alone', async () => {
    const { id, dir } = await seedSeriesWithFile(42);
    const res = await authorDelete(delReq(id, '?deleteFiles=false'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(join(dir, 'book.epub'))).toBe(true);
    expect(await getSeries(id)).toBeNull();
  });

  it('returns 500 and keeps the series when disk deletion fails', async () => {
    const id = await insertSeries({
      anilistId: 43,
      status: 'releasing',
      rootPath: root,
      qualityProfileId: qpId,
    });
    const evil = join(root, 'a-directory');
    mkdirSync(evil, { recursive: true });
    await insertLibraryFile({ seriesId: id, path: evil, sizeBytes: 1 });

    const res = await authorDelete(delReq(id, '?deleteFiles=true'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(500);
    expect(await getSeries(id)).not.toBeNull();
  });
});
