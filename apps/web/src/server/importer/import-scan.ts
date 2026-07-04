import { readdir, stat, lstat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { CONTENT_TYPES, type ContentType } from '@/server/content-type';
import { getLibraryDir } from '@/server/content-type/paths';
import { listAllLibraryFilePaths } from '@/server/db/library-files';

const EXT: Record<ContentType, Set<string>> = {
  ebook: new Set(['.epub', '.mobi', '.azw3', '.pdf']),
  light_novel: new Set(['.epub', '.mobi', '.azw3', '.pdf']),
  audiobook: new Set(['.mp3', '.m4b', '.m4a', '.flac', '.ogg']),
  manga: new Set(['.cbz', '.cbr', '.zip', '.rar']),
  comic: new Set(['.cbz', '.cbr', '.zip', '.rar']),
};
const PER_FILE: ReadonlySet<ContentType> = new Set(['ebook', 'light_novel']);

function cleanTitle(name: string, opts?: { isFile?: boolean }): string {
  // Only files carry an extension — stripping "the last dot onwards" from a
  // directory name eats real content ("H.P. Lovecraft - The Complete Omnibus"
  // would collapse to "H.P").
  const base = opts?.isFile ? name.replace(/\.[^.]+$/, '') : name;
  return base
    .replace(/[._]+/g, ' ')
    // Trailing volume suffix ("Foo Saga - v02"). Whitespace before the dash is
    // required so a dash INSIDE a token — the codec tag "[EC-3]", a year range
    // "1917-1926" — never truncates the name mid-way.
    .replace(/\s+-\s*v?\d+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ScanItem = {
  path: string;
  detectedTitle: string;
  contentType: ContentType;
  files: string[];
  sizeBytes: number;
};

export async function scanLibraryRootsForImport(): Promise<ScanItem[]> {
  const tracked = new Set(await listAllLibraryFilePaths());
  const out: ScanItem[] = [];

  // Walk each unique library directory ONCE. `light_novel`+`ebook` both resolve
  // to <mediaRoot>/books and `manga`+`comic` both resolve to <mediaRoot>/comics,
  // so without this dedup a book/comic file is emitted twice (once per content
  // type) — the duplicate import rows. The content types that share a directory
  // also share EXT/PER_FILE, so a single walk under the first-listed type is
  // lossless; a genuine local-series match later corrects the content type.
  const seenDir = new Set<string>();
  const targets: { ct: ContentType; root: string }[] = [];
  for (const ct of CONTENT_TYPES) {
    const root = await getLibraryDir(ct);
    if (seenDir.has(root)) continue;
    seenDir.add(root);
    targets.push({ ct, root });
  }

  for (const { ct, root } of targets) {
    let top: string[];
    try {
      top = await readdir(root);
    } catch {
      continue;
    }

    if (PER_FILE.has(ct)) {
      // one item per ebook file (recurse one level into per-book folders too)
      for (const entry of top) {
        const p = join(root, entry);
        const st = await stat(p).catch(() => null);
        if (!st) continue;
        const files = st.isDirectory()
          ? await filesIn(p, EXT[ct])
          : EXT[ct].has(extname(entry).toLowerCase())
            ? [p]
            : [];
        for (const f of files) {
          if (tracked.has(f)) continue;
          const fst = await stat(f);
          out.push({
            path: f,
            detectedTitle: cleanTitle(basename(f), { isFile: true }),
            contentType: ct,
            files: [f],
            sizeBytes: fst.size,
          });
        }
      }
    } else {
      // one item per immediate subfolder (audiobook/manga/comic)
      for (const entry of top) {
        const dir = join(root, entry);
        const st = await stat(dir).catch(() => null);
        if (!st?.isDirectory()) continue;
        const files = (await filesIn(dir, EXT[ct])).filter((f) => !tracked.has(f));
        if (files.length === 0) continue;
        let size = 0;
        for (const f of files) size += (await stat(f)).size;
        out.push({
          path: dir,
          detectedTitle: cleanTitle(entry),
          contentType: ct,
          files,
          sizeBytes: size,
        });
      }
    }
  }

  return out;
}

async function filesIn(dir: string, exts: Set<string>): Promise<string[]> {
  const acc: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: string[];
    try {
      entries = await readdir(d);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const p = join(d, e);
      // lstat (not stat) so we never follow symlinks — a circular symlink in the
      // library tree would otherwise re-enqueue an ancestor dir forever.
      const st = await lstat(p).catch(() => null);
      if (!st) continue;
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) stack.push(p);
      else if (exts.has(extname(e).toLowerCase())) acc.push(p);
    }
  }
  return acc;
}
