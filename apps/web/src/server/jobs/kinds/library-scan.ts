import { z } from 'zod';
import { basename } from 'node:path';
import { walk } from '@/server/scanner/walk';
import { parseFilename } from '@/server/parser/filename';
import { contentTypeForFiles } from '@/server/scanner/formats';
import { proposeForDirectory, type ScanProposal } from '@/server/scanner/match';
import { getSeriesByAniListId } from '@/server/db/series';
import {
  getScanMatchByPath,
  insertScanMatch,
  updateScanMatchByPath,
} from '@/server/db/scan-matches';
import { getAllLibraryRoots } from '@/server/content-type/paths';
import { logger } from '@/server/logger';
import type { JobKindDescriptor } from '../types';
import { DEFAULT_TIMEOUT_MS } from '../types';

const Payload = z.object({
  rootPath: z.string().min(1),
  targetGroupId: z.number().int().positive().optional(),
  structure: z.enum(['flat', 'mirror']).optional(),
});

export const libraryScanDescriptor: JobKindDescriptor<
  { rootPath: string; targetGroupId?: number; structure?: 'flat' | 'mirror' },
  { scanned: number; matched: number }
> = {
  kind: 'library_scan',
  retryPolicy: { maxAttempts: 1 },
  timeoutMs: DEFAULT_TIMEOUT_MS,
  handler: async (rawPayload, jobId) => {
    const log = logger().child({ component: 'library_scan', jobId });
    const { rootPath, targetGroupId, structure } = Payload.parse(rawPayload);

    // Walk every configured per-type library root, plus the explicit payload root
    // (legacy single-root callers / manual scans). Deduped so a root shared by
    // several content types — or one that matches the payload — is scanned once.
    const deduped: string[] = [];
    const seenRoots = new Set<string>();
    for (const r of [rootPath, ...(await getAllLibraryRoots())]) {
      if (!seenRoots.has(r)) {
        seenRoots.add(r);
        deduped.push(r);
      }
    }
    // Drop any root that is nested under another root in the set — `walk` recurses,
    // so e.g. the default `/media/comics` is already covered by a `/media` payload
    // root. Without this, files under it would be scanned (and matched) twice.
    const roots = deduped.filter(
      (r) => !deduped.some((other) => other !== r && r.startsWith(other.replace(/\/+$/, '') + '/')),
    );

    const dirCache = new Map<string, ScanProposal | null>();
    let scanned = 0;
    let matched = 0;

    for (const root of roots) {
      let rootScanned = 0;
      let rootMatched = 0;
      try {
        for await (const { directory, files } of walk(root)) {
          const dir = basename(directory);
          // Detect the directory's content type from its files' extensions, then
          // query the matching metadata source (AniList / OpenLibrary / Audnex)
          // — not AniList for everything, which only ever recognised manga.
          let proposal = dirCache.get(directory);
          if (proposal === undefined) {
            const contentType = contentTypeForFiles(files.map((f) => basename(f)));
            proposal = contentType ? await proposeForDirectory(contentType, dir) : null;
            dirCache.set(directory, proposal);
          }
          // Reuse an existing series only via the AniList id (the one external-id
          // lookup we have). Other types create-new at confirm; a rescan is
          // deduped by scan-match status (confirmed/rejected rows skipped below).
          const existing =
            proposal?.anilistId != null ? await getSeriesByAniListId(proposal.anilistId) : null;
          const proposedSeriesId = existing?.id ?? null;
          // Single-item types (ebook/audiobook) are one file = volume 1 when the
          // filename has no number — so the file LINKS to a volume instead of
          // importing orphaned (which is why every volume read "missing").
          const singleItem =
            proposal?.contentType === 'ebook' || proposal?.contentType === 'audiobook';

          for (const file of files) {
            rootScanned++;
            const prior = await getScanMatchByPath(file);
            if (prior?.status === 'confirmed' || prior?.status === 'rejected') continue;

            const parsed = parseFilename(basename(file));
            const proposedVolume =
              parsed.volume ?? (singleItem && parsed.chapter === null ? 1 : null);
            const patch = {
              proposedSeriesId,
              proposedVolume,
              proposedChapter: parsed.chapter,
              confidence: parsed.confidence,
              parserDebugJson: JSON.stringify({ parsed, proposal, dirname: dir }),
              // Scan-session params for confirm-time group assignment. A rescan
              // refreshes them on pending rows so the LATEST scan's target/structure
              // wins (and a param-less rescan resets them to legacy behavior).
              scanRootPath: rootPath,
              targetGroupId: targetGroupId ?? null,
              structure: structure ?? null,
            };
            if (prior) {
              await updateScanMatchByPath(file, patch);
            } else {
              await insertScanMatch({ filePath: file, ...patch });
            }
            if (proposal) rootMatched++;
          }
        }
      } catch (err) {
        // A missing / unreadable root (e.g. an unmounted drive) must not abort the
        // whole scan — log and carry on with the remaining roots.
        log.warn({ root, err }, 'library scan: root failed, skipping');
        continue;
      }
      log.info({ root, scanned: rootScanned, matched: rootMatched }, 'library scan: root complete');
      scanned += rootScanned;
      matched += rootMatched;
    }

    log.info({ roots, scanned, matched }, 'library scan complete');
    return { scanned, matched };
  },
};
