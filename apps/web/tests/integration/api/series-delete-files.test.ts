import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb } from '@/server/db/client.js';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles.js';
import { getSeries, insertSeries } from '@/server/db/series.js';
import { insertLibraryFile } from '@/server/db/library-files.js';
import { DELETE as seriesDelete } from '@/app/api/series/[id]/route.js';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';

let tmp: string;
let qpId: number;
let root: string;
let prevMediaRoot: string | undefined;

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'bk-api-delfiles-'));
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

function delReq(id: number, qs = ''): NextRequest {
  return new NextRequest(`http://localhost/api/series/${id}${qs}`, { method: 'DELETE' });
}

async function seedSeriesWithFile(anilistId: number): Promise<{ id: number; dir: string }> {
  const dir = join(root, `Title ${anilistId}`);
  const id = await insertSeries({
    anilistId,
    status: 'releasing',
    rootPath: dir,
    qualityProfileId: qpId,
  });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'v01.cbz'), 'x');
  await insertLibraryFile({ seriesId: id, path: join(dir, 'v01.cbz'), sizeBytes: 1 });
  return { id, dir };
}

describe('DELETE /api/series/[id] deleteFiles', () => {
  it('deleteFiles=true removes the series folder and the row', async () => {
    const { id, dir } = await seedSeriesWithFile(31);
    const res = await seriesDelete(delReq(id, '?deleteFiles=true'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(dir)).toBe(false);
    expect(await getSeries(id)).toBeNull();
  });

  it('without the param, files on disk are untouched (existing behavior)', async () => {
    const { id, dir } = await seedSeriesWithFile(32);
    const res = await seriesDelete(delReq(id), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(join(dir, 'v01.cbz'))).toBe(true);
    expect(await getSeries(id)).toBeNull();
  });

  it('deleteFiles=false behaves like the param being absent', async () => {
    const { id, dir } = await seedSeriesWithFile(33);
    const res = await seriesDelete(delReq(id, '?deleteFiles=false'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(204);
    expect(existsSync(join(dir, 'v01.cbz'))).toBe(true);
  });

  it('returns 500 and keeps the series when disk deletion fails', async () => {
    // Tracked path is a directory flat in the library root: per-file unlink
    // fails with EISDIR -> hard failure -> 500, series intact.
    const id = await insertSeries({
      anilistId: 34,
      status: 'releasing',
      rootPath: root,
      qualityProfileId: qpId,
    });
    const evil = join(root, 'actually-a-dir');
    mkdirSync(evil, { recursive: true });
    await insertLibraryFile({ seriesId: id, path: evil, sizeBytes: 1 });

    const res = await seriesDelete(delReq(id, '?deleteFiles=true'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(500);
    await expectShape(ErrorResponse, res, 'DELETE /api/series/{id}');
    expect(await getSeries(id)).not.toBeNull();
  });

  it('rejects a malformed deleteFiles value with 400', async () => {
    const { id } = await seedSeriesWithFile(35);
    const res = await seriesDelete(delReq(id, '?deleteFiles=yes'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'DELETE /api/series/{id}');
  });
});
