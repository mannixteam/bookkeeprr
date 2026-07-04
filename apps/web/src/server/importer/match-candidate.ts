import { searchBooks } from '@/server/integrations/openlibrary';
import { searchVolumes } from '@/server/integrations/googlebooks';
import { searchAudiobooks } from '@/server/integrations/itunes';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { titleMatches } from '@/server/matcher/titles';
import { parseReleaseTitle } from '@/server/parser/release';
import { tokenize, tokensExcludingQualifiers } from '@/server/parser/tokens';
import type { ScanItem } from '@/server/importer/import-scan';
import type { ExistingSeriesMatch } from '@/server/importer/owned-check';
import type { SeriesRow } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Public types (consumed by the grid + adopt tasks)
// ---------------------------------------------------------------------------

export type Candidate = {
  sourceId: string;
  title: string;
  author: string | null;
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
  source: 'openlibrary' | 'googlebooks' | 'itunes';
};

export type MatchedItem = ScanItem & {
  best: Candidate | null;
  alternatives: Candidate[];
  /**
   * Set when the item was recognised as a volume of a series already in the
   * library. The grid offers "add to <series>" and adopt links the file into
   * that series/volume — no external provider match is needed in this case.
   */
  existingSeries: ExistingSeriesMatch | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_ALTERNATIVES = 4;

/**
 * Build a throwaway SeriesRow-shaped object whose only purpose is to let
 * `titleMatches` compare a candidate against the detected title. The non-
 * essential fields carry harmless defaults — they are never written to the DB.
 */
function syntheticSeries(
  detectedTitle: string,
  author: string | null,
  contentType: SeriesRow['contentType'],
): SeriesRow {
  return {
    id: 0,
    contentType,
    titleEnglish: detectedTitle,
    titleRomaji: null,
    titleNative: null,
    author,
    extraSearchTermsJson: '[]',
    status: 'releasing',
    monitoring: 'all',
    granularity: 'volume',
    rootPath: '',
    qualityProfileId: 0,
    groupId: null,
    addedAt: new Date(0),
    updatedAt: new Date(0),
    // Provider / enrichment fields — irrelevant for ranking
    anilistId: null,
    malId: null,
    comicvineId: null,
    publisher: null,
    startYear: null,
    pageCount: null,
    runtimeMinutes: null,
    openlibraryId: null,
    isbn: null,
    asin: null,
    narrator: null,
    mangadexId: null,
    novelUpdatesSlug: null,
    novelUpdatesId: null,
    googleBooksVolumeId: null,
    googleBooksQuery: null,
    coverUrl: null,
    description: null,
    totalVolumes: null,
    totalChapters: null,
  };
}

/**
 * Title interpretations of a scanned folder/file name. Audiobook and book
 * folders commonly follow the "Author - Title" convention — often with extra
 * trailing edition/format segments ("J.K. Rowling - Harry Potter and the
 * Philosopher's Stone - Headphone Surround") — while the candidate providers
 * return the bare title. So alongside the full detected name, treat the first
 * " - " segment as the author and try the rest as the title, progressively
 * dropping trailing segments.
 */
function detectedTitleVariants(
  detectedTitle: string,
): { title: string; author: string | null }[] {
  const variants: { title: string; author: string | null }[] = [
    { title: detectedTitle, author: null },
  ];
  const segments = detectedTitle.split(/\s+-\s+/);
  if (segments.length >= 2) {
    const author = segments[0]!;
    for (let end = segments.length; end >= 2; end--) {
      variants.push({ title: segments.slice(1, end).join(' - '), author });
    }
  }
  return variants;
}

/** Identity tokens of a title: qualifier/format/numeric tokens removed. */
function coreTokens(s: string): string[] {
  return tokensExcludingQualifiers(tokenize(s));
}

/** Order-insensitive token-set equality; empty sets never match. */
function sameTokenSet(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((t) => setB.has(t));
}

/**
 * Match quality of a candidate against the detected title, using the same
 * token-based logic as the release matcher. Constructing a synthetic SeriesRow
 * per candidate is cheap — this runs in-process with no I/O.
 *
 *   2 — exact: the candidate's identity tokens equal the detected title's
 *       (either the full name or its "Author - Title" split). Separates
 *       "The Stand (Unabridged)" from the also-matching "The Stand - Das
 *       letzte Gefecht" so the exact edition wins.
 *   1 — title-leading match via titleMatches.
 *   0 — no match.
 */
function candidateScore(
  candidate: Candidate,
  detectedTitle: string,
  contentType: SeriesRow['contentType'],
): number {
  const variants = detectedTitleVariants(detectedTitle);
  const candidateCore = coreTokens(candidate.title);
  if (variants.some((v) => sameTokenSet(candidateCore, coreTokens(v.title)))) return 2;

  const parsed = parseReleaseTitle(
    candidate.title + (candidate.author ? ' ' + candidate.author : ''),
  );
  for (const v of variants) {
    const series = syntheticSeries(v.title, v.author ?? candidate.author, contentType);
    if (titleMatches(parsed, series)) return 1;
  }
  return 0;
}

/**
 * Rank candidates: exact title first, then title-leading matches, then by
 * cover presence, then by year descending (most recent). Within each group the
 * order is stable with respect to provider order (OL results precede GB
 * results in the input).
 */
function rankCandidates(
  candidates: Candidate[],
  detectedTitle: string,
  contentType: SeriesRow['contentType'],
): Candidate[] {
  const scores = new Map<Candidate, number>(
    candidates.map((c) => [c, candidateScore(c, detectedTitle, contentType)]),
  );
  return candidates.slice().sort((a, b) => {
    const scoreA = scores.get(a) ?? 0;
    const scoreB = scores.get(b) ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // Nothing title-matched in this group: keep the provider's own relevance
    // order (sort is stable) — re-sorting junk by cover/year just promotes the
    // newest unrelated book over the provider's best guess.
    if (scoreA === 0) return 0;

    // Within a matched group: prefer a present cover
    const coverA = a.coverUrl ? 1 : 0;
    const coverB = b.coverUrl ? 1 : 0;
    if (coverA !== coverB) return coverB - coverA;

    // Then prefer more-recent year (higher year = smaller sort index)
    const yearA = a.year ?? 0;
    const yearB = b.year ?? 0;
    return yearB - yearA;
  });
}

/**
 * Normalize a title+author pair for dedup: lowercase + trim.  Keying on both
 * fields prevents two different books that share a title (different authors)
 * from wrongly collapsing into one candidate.
 */
function normalizeForDedup(title: string, author?: string | null): string {
  return `${title.toLowerCase().trim()}||${(author ?? '').toLowerCase().trim()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query metadata providers for `item.detectedTitle`, map results to
 * `Candidate`, rank them using the same title-matching core as the release
 * matcher, and return the best match plus up to 4 alternatives.
 *
 * Provider failures are caught and ignored — if nothing is found `best` is
 * null and `alternatives` is empty, letting the import grid fall back to
 * manual search.
 */
export async function matchScanItem(item: ScanItem): Promise<MatchedItem> {
  const { detectedTitle, contentType } = item;

  // Query providers with the parser-cleaned title (brackets/parens stripped) —
  // the raw detectedTitle carries publisher/scanlator tags like
  // "[Yen Press] [LuCaZ]" that make providers return nothing. Audiobook folders
  // are commonly "Author - Title"; collapse the " - " so the term reads as a
  // plain title+author phrase for iTunes.
  const cleaned = parseReleaseTitle(detectedTitle).cleanTitle || detectedTitle;
  const query = cleaned.replace(/\s+-\s+/g, ' ').trim() || detectedTitle;

  const candidates: Candidate[] = [];

  if (contentType === 'audiobook') {
    // Audiobooks live in Apple's audiobook catalog, not the book databases —
    // searching OpenLibrary/Google Books for an audiobook returns unrelated
    // books (e.g. "The Stand" → "Pandemics in American Popular Culture"). Use
    // the iTunes audiobook search instead.
    try {
      const hits = await searchAudiobooks(query);
      for (const h of hits) {
        candidates.push({
          sourceId: `itunes:${h.id}`,
          title: h.title,
          author: h.author,
          year: h.releaseYear,
          isbn: null,
          coverUrl: h.coverUrl,
          source: 'itunes',
        });
      }
    } catch {
      // Provider failure → empty candidates → best:null (manual search fallback).
    }
  } else {
    // Books (ebook/light_novel and the manga/comic fallthrough): fan out to the
    // book providers in parallel — OL always; GB only when an API key is set.
    const [olOut, gbOut] = await Promise.allSettled([
      searchBooks(query),
      (async () => {
        const rawKey = await googleBooksApiKeySetting.get();
        const key = rawKey.length > 0 ? rawKey : null;
        if (!key) return null;
        return searchVolumes(query, key);
      })(),
    ]);

    if (olOut.status === 'fulfilled') {
      for (const h of olOut.value) {
        candidates.push({
          sourceId: h.olid,
          title: h.title,
          author: h.author,
          year: h.firstPublishYear,
          isbn: h.isbn,
          coverUrl: h.coverUrl,
          source: 'openlibrary',
        });
      }
    }
    // OL errors are silently swallowed — `candidates` stays empty for OL.

    if (gbOut.status === 'fulfilled' && gbOut.value) {
      // Dedup against already-collected OL titles (OL wins on collision).
      const seen = new Set(candidates.map((c) => normalizeForDedup(c.title, c.author)));
      for (const h of gbOut.value) {
        const key = normalizeForDedup(h.title, h.author);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            sourceId: `gb:${h.gbid}`,
            title: h.title,
            author: h.author,
            year: h.year,
            isbn: h.isbn,
            coverUrl: h.coverUrl,
            source: 'googlebooks',
          });
        } else {
          // OL entry exists — graft GB cover when OL lacks one.
          const idx = candidates.findIndex((c) => normalizeForDedup(c.title, c.author) === key);
          if (idx !== -1 && !candidates[idx]!.coverUrl && h.coverUrl) {
            candidates[idx] = { ...candidates[idx]!, coverUrl: h.coverUrl };
          }
        }
      }
    }
    // GB errors are silently swallowed.
  }

  if (candidates.length === 0) {
    return { ...item, best: null, alternatives: [], existingSeries: null };
  }

  const ranked = rankCandidates(
    candidates,
    detectedTitle,
    contentType as SeriesRow['contentType'],
  );
  const top = ranked[0]!;
  const topScore = candidateScore(top, detectedTitle, contentType as SeriesRow['contentType']);

  // Nothing title-matches (common for short-story files whose providers only
  // know the containing anthologies): pre-filling the provider's guess as
  // `best` risks importing junk on an unreviewed confirm. Surface "no match";
  // keep the provider-ordered hits as dropdown alternatives.
  if (topScore === 0) {
    return {
      ...item,
      best: null,
      alternatives: ranked.slice(0, MAX_ALTERNATIVES),
      existingSeries: null,
    };
  }

  return {
    ...item,
    best: top,
    alternatives: ranked.slice(1, 1 + MAX_ALTERNATIVES),
    existingSeries: null,
  };
}
