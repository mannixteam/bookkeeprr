import { afterEach, describe, expect, it, vi } from 'vitest';
import { proposeForDirectory } from '@/server/scanner/match';
import * as anilist from '@/server/integrations/anilist/cache';
import * as openlibrary from '@/server/integrations/openlibrary/client';
import * as itunes from '@/server/integrations/itunes/client';

afterEach(() => vi.restoreAllMocks());

describe('proposeForDirectory', () => {
  it('manga -> AniList proposal', async () => {
    vi.spyOn(anilist, 'searchMangaCached').mockResolvedValue([
      {
        anilistId: 105778,
        titleEnglish: 'Bunny Drop',
        titleRomaji: 'Usagi Drop',
        titleNative: null,
        coverUrl: 'c.jpg',
        status: 'finished',
        format: 'MANGA',
        startYear: 2005,
      },
    ]);
    const p = await proposeForDirectory('manga', 'Bunny Drop');
    expect(p?.contentType).toBe('manga');
    expect(p?.anilistId).toBe(105778);
    expect(p?.titleRomaji).toBe('Usagi Drop');
    expect(p?.granularity).toBe('volume');
  });

  it('ebook -> OpenLibrary proposal', async () => {
    vi.spyOn(openlibrary, 'searchBooks').mockResolvedValue([
      {
        olid: 'OL123W',
        title: 'Atomic Habits',
        author: 'James Clear',
        firstPublishYear: 2018,
        isbn: '9780735211292',
        coverUrl: 'c.jpg',
      },
    ]);
    const p = await proposeForDirectory('ebook', 'Atomic Habits');
    expect(p?.contentType).toBe('ebook');
    expect(p?.openlibraryId).toBe('OL123W');
    expect(p?.titleEnglish).toBe('Atomic Habits');
    expect(p?.totalVolumes).toBe(1);
  });

  it('audiobook -> iTunes proposal (NOT the broken Audnex title search)', async () => {
    const spy = vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([
      {
        id: 'it1',
        title: 'Sabriel (Unabridged)',
        author: 'Garth Nix',
        releaseYear: 2002,
        coverUrl: 'c.jpg',
        collectionId: 111,
        collectionName: 'Sabriel (Unabridged)',
        trackName: null,
        description: null,
      },
    ]);
    const p = await proposeForDirectory('audiobook', 'Sabriel');
    expect(spy).toHaveBeenCalledWith('Sabriel');
    expect(p?.contentType).toBe('audiobook');
    expect(p?.titleEnglish).toBe('Sabriel (Unabridged)');
    expect(p?.author).toBe('Garth Nix');
    expect(p?.startYear).toBe(2002);
    expect(p?.totalVolumes).toBe(1);
  });

  it('returns null when the source has no hit', async () => {
    vi.spyOn(itunes, 'searchAudiobooks').mockResolvedValue([]);
    expect(await proposeForDirectory('audiobook', 'Nonexistent')).toBeNull();
  });

  it('swallows a source error and returns null', async () => {
    vi.spyOn(openlibrary, 'searchBooks').mockRejectedValue(new Error('upstream down'));
    expect(await proposeForDirectory('ebook', 'Anything')).toBeNull();
  });
});
