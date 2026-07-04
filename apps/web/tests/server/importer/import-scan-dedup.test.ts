import { afterEach, beforeEach, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import { scanLibraryRootsForImport } from '@/server/importer/import-scan';
import type { ContentType } from '@/server/content-type';

let h: SeedHandle;
let booksDir: string;

const ALL_CONTENT_TYPES: ContentType[] = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'];

function emptyPaths(): Record<ContentType, { libraryRoot: string; qbtCategory: string }> {
  return Object.fromEntries(
    ALL_CONTENT_TYPES.map((t) => [t, { libraryRoot: '', qbtCategory: '' }]),
  ) as Record<ContentType, { libraryRoot: string; qbtCategory: string }>;
}

beforeEach(async () => {
  h = await seedDb();
  booksDir = mkdtempSync(join(tmpdir(), 'bk-dedup-'));
});

afterEach(() => {
  rmSync(booksDir, { recursive: true, force: true });
  h.cleanup();
});

// Reproduces the prod bug: both `light_novel` and `ebook` map to the same
// `books` directory, so an untracked .epub there was emitted TWICE (once per
// content type) — the two identical "Solo Leveling v08" rows.
it('emits a single ScanItem per physical file even when two content types share a directory', async () => {
  const file = join(booksDir, 'Solo Leveling v08 [Yen Press] [LuCaZ].epub');
  writeFileSync(file, 'epub');

  // Point BOTH book content types at the same directory (mirrors prod, where
  // neither has a libraryRoot override so both resolve to <mediaRoot>/books).
  const paths = emptyPaths();
  paths.ebook = { libraryRoot: booksDir, qbtCategory: '' };
  paths.light_novel = { libraryRoot: booksDir, qbtCategory: '' };
  await contentTypePathsSetting.set(paths);

  const items = await scanLibraryRootsForImport();
  const forFile = items.filter((i) => i.path === file);

  expect(forFile).toHaveLength(1);
});
