import { rm, unlink } from 'node:fs/promises';
import { eq, ne } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { downloads, libraryFiles, releases } from '@/server/db/schema';
import { getSeries } from '@/server/db/series';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { getAllNamingTemplates } from '@/server/db/settings/naming';
import { getLibraryDir } from '@/server/content-type/paths';
import { deriveCurrentSeriesDir } from '@/server/importer/series-dir';
import { qbtConnectionSetting, isQbtConfigured } from '@/server/db/settings/qbt';
import { deleteTorrent } from '@/server/integrations/qbittorrent/client';

export type DeleteSeriesFilesResult = {
  filesDeleted: number;
  torrentsDeleted: number;
  errors: string[];
};

/**
 * Thrown when disk deletion hits a non-ENOENT failure. The caller must abort
 * the series delete (keep the DB rows) so the operation can be retried -
 * already-deleted files are skipped on retry, making it idempotent.
 */
export class SeriesFileDeletionError extends Error {
  constructor(
    public readonly failures: string[],
    public readonly partial: DeleteSeriesFilesResult,
  ) {
    super(`file deletion failed: ${failures.join('; ')}`);
    this.name = 'SeriesFileDeletionError';
  }
}

function isEnoent(err: unknown): boolean {
  return (
    err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Best-effort torrent removal + guarded disk deletion for a series. Called by
 * the DELETE routes BEFORE the DB cascade so nothing on disk is orphaned:
 *
 * 1. Torrents: every qBittorrent hash the series ever grabbed is deleted with
 *    its data. Failures (qBt down, per-hash errors) go into `errors` and never
 *    block the delete.
 * 2. Disk: the series folder (derived from the tracked file paths, same logic
 *    as the rename engine) is removed recursively ONLY when it is strictly
 *    under the content type's library root and no other series tracks a file
 *    inside it. Otherwise each tracked path is unlinked individually and
 *    parent directories are left alone. Missing files are skipped; any other
 *    failure throws SeriesFileDeletionError.
 *
 * Residual risk (accepted by the spec): when a series' tracked files span
 * sibling folders (e.g. after a crashed rename), the derived dir is their
 * common ancestor, and folder mode removes untracked strays under it. Other
 * series' tracked files remain protected by the ownership check.
 */
export async function deleteSeriesFilesAndTorrents(
  seriesId: number,
): Promise<DeleteSeriesFilesResult> {
  const result: DeleteSeriesFilesResult = { filesDeleted: 0, torrentsDeleted: 0, errors: [] };
  const series = await getSeries(seriesId);
  if (!series) return result;

  // 1. Torrents (best-effort). Every hash the series ever grabbed, deduped -
  // imported torrents may still be seeding. Failures never block the delete.
  const hashRows = await getDb()
    .select({ qbtHash: downloads.qbtHash })
    .from(downloads)
    .innerJoin(releases, eq(downloads.releaseId, releases.id))
    .where(eq(releases.seriesId, seriesId));
  const hashes = [...new Set(hashRows.map((r) => r.qbtHash))];
  if (hashes.length > 0) {
    const cfg = await qbtConnectionSetting.get();
    if (isQbtConfigured(cfg)) {
      for (const hash of hashes) {
        try {
          await deleteTorrent(cfg, hash, { deleteFiles: true });
          result.torrentsDeleted++;
        } catch (err) {
          result.errors.push(`torrent ${hash}: ${errMsg(err)}`);
        }
      }
    }
  }

  const files = await listLibraryFilesBySeries(seriesId);
  if (files.length === 0) return result;
  const paths = files.map((f) => f.path);

  const libraryDir = await getLibraryDir(series.contentType);
  const templates = await getAllNamingTemplates(series.contentType);
  const hasVolumeSubfolder = templates.volume_subfolder.trim().length > 0;
  const candidateDir = deriveCurrentSeriesDir(paths, hasVolumeSubfolder, series.rootPath);

  // Folder mode: only when the derived dir is strictly INSIDE the library root
  // (never the root itself, never outside it) and no other series tracks a
  // file under it. String-prefix ownership check runs in JS to avoid SQL LIKE
  // escaping pitfalls with % and _ in folder names.
  const strictlyUnderRoot =
    candidateDir !== libraryDir && candidateDir.startsWith(libraryDir + '/');
  let sharedWithOtherSeries = false;
  if (strictlyUnderRoot) {
    const others = await getDb()
      .select({ path: libraryFiles.path })
      .from(libraryFiles)
      .where(ne(libraryFiles.seriesId, seriesId));
    sharedWithOtherSeries = others.some((o) => o.path.startsWith(candidateDir + '/'));
  }

  if (strictlyUnderRoot && !sharedWithOtherSeries) {
    try {
      // force: true tolerates a folder someone already removed by hand.
      await rm(candidateDir, { recursive: true, force: true });
      result.filesDeleted = paths.length;
    } catch (err) {
      throw new SeriesFileDeletionError([`rm ${candidateDir}: ${errMsg(err)}`], result);
    }
    return result;
  }

  // Per-file fallback: flat-in-root, outside-root, or shared folders.
  const failures: string[] = [];
  for (const p of paths) {
    try {
      await unlink(p);
      result.filesDeleted++;
    } catch (err) {
      if (isEnoent(err)) continue;
      failures.push(`unlink ${p}: ${errMsg(err)}`);
    }
  }
  if (failures.length > 0) throw new SeriesFileDeletionError(failures, result);
  return result;
}
