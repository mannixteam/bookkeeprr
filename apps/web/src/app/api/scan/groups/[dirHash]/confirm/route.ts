import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  scanMatches,
  libraryFiles,
  volumes,
  chapters,
  type ScanMatchRow,
} from '@/server/db/schema';
import { dirHash } from '@/lib/dir-hash';
import { getSeriesByAniListId, insertSeries } from '@/server/db/series';
import { createGroup, listGroups } from '@/server/db/library-groups';
import { seedDefaultQualityProfile } from '@/server/db/quality-profiles';
import { enqueueJob } from '@/server/db/jobs';
import { logger } from '@/server/logger';
import { withWriteLock } from '@/server/db/write-lock';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';
import type { ScanProposal } from '@/server/scanner/match';
import type { ContentType } from '@/server/content-type';

export const dynamic = 'force-dynamic';

type AniListStash = {
  anilistId?: number;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  coverUrl?: string | null;
  status?: 'releasing' | 'finished' | 'hiatus' | 'cancelled';
} | null;

// The library scan stashes a content-type-tagged `proposal`. Pre-upgrade manga
// scans only stashed `aniListMatch`; keep reading it for back-compat.
type Stash = { proposal?: ScanProposal | null; aniListMatch?: AniListStash };

function parseStash(json: string): Stash {
  try {
    return JSON.parse(json) as Stash;
  } catch {
    return {};
  }
}

/** Normalize either stash form (new proposal, or legacy aniListMatch) to one proposal. */
function stashProposal(stash: Stash): ScanProposal | null {
  if (stash.proposal && stash.proposal.contentType) return stash.proposal;
  const m = stash.aniListMatch;
  if (m && typeof m.anilistId === 'number') {
    return {
      contentType: 'manga',
      granularity: 'volume',
      anilistId: m.anilistId,
      titleEnglish: m.titleEnglish ?? null,
      titleRomaji: m.titleRomaji ?? null,
      titleNative: m.titleNative ?? null,
      coverUrl: m.coverUrl ?? null,
      status: m.status ?? undefined,
    };
  }
  return null;
}

type RouteContext = { params: Promise<{ dirHash: string }> };

async function findOrCreateGroup(name: string, parentId: number | null): Promise<number> {
  const find = async () =>
    (await listGroups()).find((g) => g.name === name && g.parentId === parentId);
  const existing = await find();
  if (existing) return existing.id;
  try {
    return (await createGroup(name, parentId)).id;
  } catch (err) {
    // createGroup throws on a sibling-name conflict — another confirm in the
    // same session beat us to it. Re-find; anything else is a real error.
    const raced = await find();
    if (raced) return raced.id;
    throw err;
  }
}

/**
 * Confirm-time group assignment for NEWLY created series (pre-existing matched
 * series keep their group — never moved by an import).
 * - flat (or no session params): the scan's targetGroupId (null = library root).
 * - mirror: the series directory's path relative to the scan root — minus the
 *   series folder itself — materializes as nested groups under the target.
 *   Series folders directly at the scan root land in the target itself.
 */
async function resolveImportGroup(row: ScanMatchRow): Promise<number | null> {
  const target = row.targetGroupId ?? null;
  if (row.structure !== 'mirror' || !row.scanRootPath) return target;
  const seriesDir = dirname(row.filePath);
  const rel = relative(row.scanRootPath, seriesDir);
  // Files outside the scan root (e.g. another library root swept by the same
  // job) get the flat behavior — never materialize '..' segments as groups.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return target;
  const segments = rel.split(sep).filter(Boolean);
  segments.pop(); // the series folder itself is the series, not a group
  let parentId: number | null = target;
  for (const name of segments) {
    parentId = await findOrCreateGroup(name, parentId);
  }
  return parentId;
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { dirHash: targetHash } = await ctx.params;

  const allPending = (await getDb()
    .select()
    .from(scanMatches)
    .where(eq(scanMatches.status, 'pending'))) as ScanMatchRow[];
  const groupRows = allPending.filter((r) => dirHash(dirname(r.filePath)) === targetHash);
  if (groupRows.length === 0) {
    return NextResponse.json({ error: 'group not found or already resolved' }, { status: 404 });
  }

  let proposedSeriesId: number | null = null;
  let proposal: ScanProposal | null = null;

  for (const r of groupRows) {
    if (r.proposedSeriesId !== null && proposedSeriesId === null)
      proposedSeriesId = r.proposedSeriesId;
    if (proposal === null) proposal = stashProposal(parseStash(r.parserDebugJson));
  }

  if (proposedSeriesId === null && proposal === null) {
    return NextResponse.json({ error: 'match required before confirm' }, { status: 400 });
  }

  const directory = dirname(groupRows[0]!.filePath);
  const hasChapter = groupRows.some((r) => r.proposedChapter !== null);
  // Comics are issue/chapter-based; otherwise honour the proposal's granularity,
  // falling back to "chapter if any file parsed as a chapter, else volume".
  const granularity: 'volume' | 'chapter' =
    proposal?.contentType === 'comic'
      ? 'chapter'
      : (proposal?.granularity ?? (hasChapter ? 'chapter' : 'volume'));

  let seriesId: number;
  let createdNewSeries = false;
  let createdContentType: ContentType = proposal?.contentType ?? 'manga';
  if (proposedSeriesId !== null) {
    seriesId = proposedSeriesId;
  } else {
    const p = proposal!;
    const existing = p.anilistId != null ? await getSeriesByAniListId(p.anilistId) : null;
    if (existing) {
      seriesId = existing.id;
    } else {
      const qpId = await seedDefaultQualityProfile();
      const groupId = await resolveImportGroup(groupRows[0]!);
      seriesId = await insertSeries({
        groupId,
        contentType: p.contentType,
        anilistId: p.anilistId ?? null,
        openlibraryId: p.openlibraryId ?? null,
        isbn: p.isbn ?? null,
        asin: p.asin ?? null,
        author: p.author ?? null,
        startYear: p.startYear ?? null,
        status: p.status ?? 'releasing',
        rootPath: directory,
        qualityProfileId: qpId,
        titleEnglish: p.titleEnglish ?? null,
        titleRomaji: p.titleRomaji ?? null,
        titleNative: p.titleNative ?? null,
        coverUrl: p.coverUrl ?? null,
        totalVolumes: p.totalVolumes ?? null,
        monitoring: 'none',
        granularity,
      });
      createdNewSeries = true;
      createdContentType = p.contentType;
    }
  }

  // Pre-compute file sizes outside the transaction (fs.stat is async)
  const sizesByPath = new Map<string, number>();
  for (const r of groupRows) {
    try {
      const st = await fs.stat(r.filePath);
      sizesByPath.set(r.filePath, st.size);
    } catch (err) {
      logger().warn(
        { filePath: r.filePath, err },
        'confirm: fs.stat failed, falling back to sizeBytes=0',
      );
      sizesByPath.set(r.filePath, 0);
    }
  }

  let importedCount = 0;
  let skippedCount = 0;

  await withWriteLock(() =>
    getDb().transaction((tx) => {
      for (const r of groupRows) {
        let volumeId: number | null = null;
        let chapterId: number | null = null;
        if (r.proposedVolume !== null) {
          const v = tx
            .select()
            .from(volumes)
            .where(and(eq(volumes.seriesId, seriesId), eq(volumes.number, r.proposedVolume)))
            .limit(1)
            .all();
          if (v[0]) {
            volumeId = v[0].id;
          } else {
            // No volume row yet — the series was just created here, or metadata
            // hydration hasn't populated volumes. Create it (as the release
            // importer does) so the file LINKS to a volume. Without this every
            // volume reads "missing" even though the file imported fine.
            const ins = tx
              .insert(volumes)
              .values({ seriesId, number: r.proposedVolume })
              .returning({ id: volumes.id })
              .all();
            volumeId = ins[0]?.id ?? null;
          }
        } else if (r.proposedChapter !== null && /^\d+(?:\.\d+)?$/.test(r.proposedChapter)) {
          const ns = parseFloat(r.proposedChapter);
          const c = tx
            .select()
            .from(chapters)
            .where(and(eq(chapters.seriesId, seriesId), eq(chapters.numberSort, ns)))
            .limit(1)
            .all();
          chapterId = c[0]?.id ?? null;
        }

        const sizeBytes = sizesByPath.get(r.filePath) ?? 0;

        try {
          tx.insert(libraryFiles)
            .values({
              seriesId,
              volumeId,
              chapterId,
              path: r.filePath,
              sizeBytes,
              sourceReleaseId: null,
            })
            .run();
          importedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/UNIQUE constraint failed/i.test(msg)) {
            skippedCount++;
          } else {
            throw err;
          }
        }

        tx.update(scanMatches)
          .set({ status: 'confirmed', reviewedAt: new Date(), proposedSeriesId: seriesId })
          .where(eq(scanMatches.id, r.id))
          .run();
      }
    }),
  );

  if (createdNewSeries && importedCount > 0) {
    // Hydrate from the source matching the content type — previously this always
    // ran the manga pipeline, leaving ebook/audiobook/comic metadata empty.
    if (createdContentType === 'manga') {
      await enqueueJob('metadata_hydrate', { seriesId });
      await enqueueJob('mangadex_chapter_sync', { seriesId });
    } else if (createdContentType === 'light_novel') {
      await enqueueJob('metadata_hydrate', { seriesId });
    } else if (createdContentType === 'comic') {
      await enqueueJob('comicvine_hydrate', { seriesId });
    } else if (createdContentType === 'ebook') {
      await enqueueJob('ebook_hydrate', { seriesId });
    } else if (createdContentType === 'audiobook') {
      await enqueueJob('audiobook_hydrate', { seriesId });
    }
  }

  const actor = await auditActor(req);
  await recordAuditEvent({
    actor,
    action: 'scan.group_confirm',
    target: { kind: 'scan_group', id: targetHash },
    metadata: { seriesId, importedCount, skippedCount },
    context: auditContext(req),
  });

  return NextResponse.json({ seriesId, importedCount, skippedCount }, { status: 200 });
}
