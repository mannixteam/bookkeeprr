import { NextResponse } from 'next/server';
import { searchNovelCached } from '@/server/integrations/anilist/cache';
import { searchMangaWithFallback } from '@/server/discover/manga-search';
import { comicVineApiKeySetting, isComicVineConfigured } from '@/server/db/settings/comicvine';
import { searchVolumes, ComicVineError } from '@/server/integrations/comicvine';
import { searchBooks, OpenLibraryError } from '@/server/integrations/openlibrary';
// iTunes (keyless) is the working audiobook TITLE search. Audnex has no
// title-search endpoint (/books?title= 404s) — it only resolves by ASIN.
import { searchAudiobooks, ITunesError } from '@/server/integrations/itunes';
import { SeriesSearchBody, SeriesSearchQuery } from '@/server/openapi/schemas/series';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const rawParams = {
    q: url.searchParams.get('q') ?? undefined,
    contentType: url.searchParams.get('contentType') ?? undefined,
  };

  const parsed = SeriesSearchQuery.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', detail: parsed.error.message },
      { status: 400 },
    );
  }

  if (parsed.data.contentType === 'comic') {
    const apiKey = await comicVineApiKeySetting.get();
    if (!isComicVineConfigured(apiKey)) {
      return NextResponse.json(
        { error: 'comicvine not configured', hint: 'configure /settings/comicvine' },
        { status: 503 },
      );
    }
    try {
      const results = await searchVolumes(apiKey, parsed.data.q);
      return NextResponse.json({ contentType: 'comic', results });
    } catch (err) {
      const message = err instanceof ComicVineError ? err.message : (err as Error).message;
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (parsed.data.contentType === 'light_novel') {
    try {
      const results = await searchNovelCached(parsed.data.q);
      return NextResponse.json({ contentType: 'light_novel', results });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  if (parsed.data.contentType === 'ebook') {
    try {
      const results = await searchBooks(parsed.data.q);
      return NextResponse.json({ contentType: 'ebook', results });
    } catch (err) {
      const message = err instanceof OpenLibraryError ? err.message : (err as Error).message;
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (parsed.data.contentType === 'audiobook') {
    try {
      // iTunes carries no Amazon ASIN, narrator, or runtime — null them. The
      // create flow (AudiobookBody.asin optional) and audiobook_hydrate
      // (iTunes-by-title) both handle a null asin.
      const hits = await searchAudiobooks(parsed.data.q);
      const results = hits.map((h) => ({
        asin: null,
        title: h.trackName ?? h.title,
        author: h.author,
        narrator: null,
        releaseYear: h.releaseYear,
        coverUrl: h.coverUrl,
        runtimeMinutes: null,
      }));
      return NextResponse.json({ contentType: 'audiobook', results });
    } catch (err) {
      const message = err instanceof ITunesError ? err.message : (err as Error).message;
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // Manga (AniList, with MangaDex completion fallback) path — default
  try {
    const hits = await searchMangaWithFallback(parsed.data.q);
    return NextResponse.json({ contentType: 'manga', hits });
  } catch (err) {
    return NextResponse.json(
      { error: 'upstream failure', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let parsed;
  try {
    parsed = SeriesSearchBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid payload', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  try {
    const hits = await searchMangaWithFallback(parsed.query);
    return NextResponse.json({ hits });
  } catch (err) {
    return NextResponse.json(
      { error: 'upstream failure', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
