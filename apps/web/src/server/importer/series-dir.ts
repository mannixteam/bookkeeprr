import { dirname } from 'node:path';

/**
 * Derive the current series folder from existing library files. Each file lives
 * directly under either the series dir or a `volume_subfolder` level beneath it,
 * so strip a single trailing subfolder level when the templates declare one.
 * Falls back to `fallback` (typically `series.rootPath`) when there are no files.
 */
export function deriveCurrentSeriesDir(
  filePaths: string[],
  hasVolumeSubfolder: boolean,
  fallback: string,
): string {
  if (filePaths.length === 0) return fallback;
  // Each file's series dir: its containing folder, minus one level when a
  // volume_subfolder is configured (the file sits under <seriesDir>/<subfolder>).
  // Strip per-file BEFORE the common-prefix reduction — stripping the prefix
  // afterwards would over-strip when files span multiple subfolders.
  const seriesDirOf = (p: string): string =>
    hasVolumeSubfolder ? dirname(dirname(p)) : dirname(p);
  let common = seriesDirOf(filePaths[0]!);
  for (const p of filePaths.slice(1)) {
    common = commonPrefixDir(common, seriesDirOf(p));
  }
  return common;
}

export function commonPrefixDir(a: string, b: string): string {
  if (a === b) return a;
  const as = a.split('/');
  const bs = b.split('/');
  const out: string[] = [];
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] === bs[i]) out.push(as[i]!);
    else break;
  }
  return out.join('/') || '/';
}
