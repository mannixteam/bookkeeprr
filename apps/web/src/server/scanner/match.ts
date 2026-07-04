import type { ContentType } from '@/server/content-type';
import { searchMangaCached } from '@/server/integrations/anilist/cache';
import { searchBooks } from '@/server/integrations/openlibrary/client';
// iTunes (keyless) is the working audiobook *title search*. Audnex has no
// title-search endpoint (/books?title= 404s) — it only resolves metadata by ASIN.
import { searchAudiobooks } from '@/server/integrations/itunes/client';

export type ScanStatus = 'releasing' | 'finished' | 'hiatus' | 'cancelled';

/**
 * Content-type-tagged metadata proposal for a scanned directory. Stashed in
 * `scan_matches.parserDebugJson` and consumed by the confirm route to create a
 * series of the right kind. Exactly one external id is set per content type.
 */
export type ScanProposal = {
  contentType: ContentType;
  granularity: 'volume' | 'chapter';
  anilistId?: number | null;
  openlibraryId?: string | null;
  isbn?: string | null;
  asin?: string | null;
  titleEnglish?: string | null;
  titleRomaji?: string | null;
  titleNative?: string | null;
  author?: string | null;
  coverUrl?: string | null;
  startYear?: number | null;
  status?: ScanStatus;
  totalVolumes?: number | null;
};

/**
 * Search the metadata source appropriate to a directory's content type and
 * build a proposal. Archives default to manga (AniList), documents to ebook
 * (OpenLibrary), audio to audiobook (Audnex). Returns null when the source has
 * no hit — the files still scan, just as unmatched (the user can match by hand).
 * Never throws: a failing/timeout source yields null.
 */
export async function proposeForDirectory(
  contentType: ContentType,
  dirName: string,
): Promise<ScanProposal | null> {
  try {
    if (contentType === 'manga' || contentType === 'comic' || contentType === 'light_novel') {
      const hit = (await searchMangaCached(dirName))[0];
      if (!hit) return null;
      return {
        contentType,
        granularity: contentType === 'comic' ? 'chapter' : 'volume',
        anilistId: hit.anilistId,
        titleEnglish: hit.titleEnglish,
        titleRomaji: hit.titleRomaji,
        titleNative: hit.titleNative,
        coverUrl: hit.coverUrl,
        startYear: hit.startYear,
        status: hit.status,
      };
    }
    if (contentType === 'ebook') {
      const hit = (await searchBooks(dirName))[0];
      if (!hit) return null;
      return {
        contentType: 'ebook',
        granularity: 'volume',
        openlibraryId: hit.olid,
        isbn: hit.isbn,
        titleEnglish: hit.title,
        author: hit.author,
        coverUrl: hit.coverUrl,
        startYear: hit.firstPublishYear,
        status: 'finished',
        totalVolumes: 1,
      };
    }
    if (contentType === 'audiobook') {
      const hit = (await searchAudiobooks(dirName))[0];
      if (!hit) return null;
      return {
        contentType: 'audiobook',
        granularity: 'volume',
        // iTunes has no Amazon ASIN; audiobook_hydrate re-searches iTunes by
        // title to fill narrator/runtime, so a null asin is fine.
        titleEnglish: hit.trackName ?? hit.title,
        author: hit.author,
        coverUrl: hit.coverUrl,
        startYear: hit.releaseYear,
        status: 'finished',
        totalVolumes: 1,
      };
    }
  } catch {
    return null;
  }
  return null;
}
