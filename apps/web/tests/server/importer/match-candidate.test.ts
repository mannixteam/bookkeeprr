import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import type { OpenLibrarySearchHit } from '@/server/integrations/openlibrary';
import type { GoogleBooksSearchHit } from '@/server/integrations/googlebooks/client';

// Hoist mocks before any module imports
vi.mock('@/server/integrations/openlibrary', () => ({
  searchBooks: vi.fn(),
}));
vi.mock('@/server/integrations/googlebooks', () => ({
  searchVolumes: vi.fn(),
}));
vi.mock('@/server/db/settings/googlebooks', () => ({
  googleBooksApiKeySetting: { get: vi.fn().mockResolvedValue('') },
}));
vi.mock('@/server/integrations/itunes', () => ({
  searchAudiobooks: vi.fn(),
}));

import * as ol from '@/server/integrations/openlibrary';
import * as gb from '@/server/integrations/googlebooks';
import * as itunes from '@/server/integrations/itunes';
import { googleBooksApiKeySetting } from '@/server/db/settings/googlebooks';
import { matchScanItem } from '@/server/importer/match-candidate';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeHit(overrides: Partial<OpenLibrarySearchHit> & { olid: string; title: string }): OpenLibrarySearchHit {
  return {
    author: null,
    firstPublishYear: null,
    isbn: null,
    coverUrl: null,
    ...overrides,
  };
}

function makeGbHit(overrides: Partial<GoogleBooksSearchHit> & { gbid: string; title: string }): GoogleBooksSearchHit {
  return {
    author: null,
    year: null,
    isbn: null,
    coverUrl: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it('ranks the title-leading book first', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Northern Lights', author: 'Philip Pullman', firstPublishYear: 1995, coverUrl: 'https://covers.openlibrary.org/nl.jpg' }),
    makeHit({ olid: 'OL2W', title: 'Science of His Dark Materials', author: 'Mary Gribbin', firstPublishYear: 2003 }),
  ]);

  const r = await matchScanItem({
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook',
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.title).toBe('Northern Lights');
  expect(r.best?.sourceId).toBe('OL1W');
  expect(r.alternatives.length).toBeGreaterThan(0);
  // The noise entry should be in alternatives (or absent), not best
  expect(r.alternatives.some((c) => c.title === 'Science of His Dark Materials')).toBe(true);
});

it('returns best:null and empty alternatives when provider throws', async () => {
  vi.mocked(ol.searchBooks).mockRejectedValue(new Error('network error'));

  const r = await matchScanItem({
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook',
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives).toEqual([]);
});

it('returns best:null when provider returns empty array', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([]);

  const r = await matchScanItem({
    path: '/b/Unknown Book.epub',
    detectedTitle: 'Unknown Book',
    contentType: 'ebook',
    files: ['/b/Unknown Book.epub'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives).toEqual([]);
});

it('preserves ScanItem fields on the returned MatchedItem', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Northern Lights', author: 'Philip Pullman', firstPublishYear: 1995 }),
  ]);

  const item = {
    path: '/b/Northern Lights.epub',
    detectedTitle: 'Northern Lights',
    contentType: 'ebook' as const,
    files: ['/b/Northern Lights.epub'],
    sizeBytes: 12345,
  };
  const r = await matchScanItem(item);

  expect(r.path).toBe(item.path);
  expect(r.detectedTitle).toBe(item.detectedTitle);
  expect(r.contentType).toBe(item.contentType);
  expect(r.sizeBytes).toBe(item.sizeBytes);
});

it('maps OL hits to Candidate shape with source=openlibrary', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL42W', title: 'Atomic Habits', author: 'James Clear', firstPublishYear: 2018, isbn: '9780735211292', coverUrl: 'https://example.com/cover.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Atomic Habits.epub',
    detectedTitle: 'Atomic Habits',
    contentType: 'ebook',
    files: ['/b/Atomic Habits.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.source).toBe('openlibrary');
  expect(r.best?.sourceId).toBe('OL42W');
  expect(r.best?.isbn).toBe('9780735211292');
});

it('alternatives are capped at 4', async () => {
  const hits: OpenLibrarySearchHit[] = Array.from({ length: 10 }, (_, i) =>
    makeHit({ olid: `OL${i}W`, title: i === 0 ? 'Dune' : `Dune noise ${i}`, author: 'Frank Herbert', firstPublishYear: 1965 + i }),
  );
  vi.mocked(ol.searchBooks).mockResolvedValue(hits);

  const r = await matchScanItem({
    path: '/b/Dune.epub',
    detectedTitle: 'Dune',
    contentType: 'ebook',
    files: ['/b/Dune.epub'],
    sizeBytes: 1,
  });

  expect(r.best).not.toBeNull();
  expect(r.alternatives.length).toBeLessThanOrEqual(4);
});

// ---------------------------------------------------------------------------
// Google Books code path (I1)
// ---------------------------------------------------------------------------

it('deduplicates GB hit that matches OL title+author — OL entry kept; GB cover grafted when OL cover is null', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Atomic Habits', author: 'James Clear', firstPublishYear: 2018, coverUrl: null }),
  ]);
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB1', title: 'Atomic Habits', author: 'James Clear', year: 2018, coverUrl: 'https://books.google.com/cover.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Atomic Habits.epub',
    detectedTitle: 'Atomic Habits',
    contentType: 'ebook',
    files: ['/b/Atomic Habits.epub'],
    sizeBytes: 1,
  });

  // Exactly 1 candidate after dedup — OL wins
  const all = [r.best, ...r.alternatives].filter(Boolean);
  expect(all.length).toBe(1);
  expect(r.best?.source).toBe('openlibrary');
  expect(r.best?.sourceId).toBe('OL1W');
  // GB cover was grafted onto the OL entry
  expect(r.best?.coverUrl).toBe('https://books.google.com/cover.jpg');
});

it('returns GB hit as best when OL throws', async () => {
  vi.mocked(ol.searchBooks).mockRejectedValue(new Error('OL network error'));
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB42', title: 'Dune', author: 'Frank Herbert', year: 1965, isbn: '9780441013593', coverUrl: 'https://books.google.com/dune.jpg' }),
  ]);

  const r = await matchScanItem({
    path: '/b/Dune.epub',
    detectedTitle: 'Dune',
    contentType: 'ebook',
    files: ['/b/Dune.epub'],
    sizeBytes: 1,
  });

  expect(r.best?.source).toBe('googlebooks');
  expect(r.best?.sourceId).toBe('gb:GB42');
  expect(r.best?.title).toBe('Dune');
  expect(r.alternatives).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// M1: dedup key includes author — same title, different authors are both kept
// ---------------------------------------------------------------------------

it('retains both candidates when title matches but authors differ', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'Foundation', author: 'Isaac Asimov', firstPublishYear: 1951 }),
  ]);
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('fake-api-key');
  vi.mocked(gb.searchVolumes).mockResolvedValue([
    makeGbHit({ gbid: 'GB1', title: 'Foundation', author: 'Another Author', year: 2020 }),
  ]);

  const r = await matchScanItem({
    path: '/b/Foundation.epub',
    detectedTitle: 'Foundation',
    contentType: 'ebook',
    files: ['/b/Foundation.epub'],
    sizeBytes: 1,
  });

  const all = [r.best, ...r.alternatives].filter(Boolean);
  expect(all.length).toBe(2);
  expect(all.some((c) => c?.source === 'openlibrary')).toBe(true);
  expect(all.some((c) => c?.source === 'googlebooks')).toBe(true);
});

it('matches an audiobook against iTunes (not the book providers) and collapses "Author - Title"', async () => {
  vi.mocked(itunes.searchAudiobooks).mockResolvedValue([
    {
      id: '123',
      title: 'The Stand',
      author: 'Stephen King',
      releaseYear: 2012,
      coverUrl: 'https://itunes/cover.jpg',
      collectionId: 123,
      collectionName: 'The Stand',
      trackName: null,
      description: null,
    },
  ]);

  const r = await matchScanItem({
    path: '/media/audiobooks/Stephen King - The Stand',
    detectedTitle: 'Stephen King - The Stand',
    contentType: 'audiobook',
    files: ['/media/audiobooks/Stephen King - The Stand/book.m4b'],
    sizeBytes: 1,
  });

  // Queried iTunes with the "Author - " separator collapsed to a plain phrase.
  expect(itunes.searchAudiobooks).toHaveBeenCalledWith('Stephen King The Stand');
  // Must NOT touch the book providers for an audiobook.
  expect(ol.searchBooks).not.toHaveBeenCalled();
  expect(gb.searchVolumes).not.toHaveBeenCalled();

  expect(r.best?.title).toBe('The Stand');
  expect(r.best?.source).toBe('itunes');
  expect(r.best?.sourceId).toBe('itunes:123');
  expect(r.best?.coverUrl).toBe('https://itunes/cover.jpg');
});

it('ranks the actual title first for an "Author - Title" folder — not the newest release', async () => {
  // Real-world iTunes response shape for "Stephen King The Stand": the right
  // book is present but OLDER than several unrelated King titles. The ranker
  // must prefer the title match over the year-descending fallback.
  const base = { collectionId: null, collectionName: null, trackName: null, description: null };
  vi.mocked(itunes.searchAudiobooks).mockResolvedValue([
    { id: '1', title: 'The Stand (Unabridged)', author: 'Stephen King', releaseYear: 2012, coverUrl: 'https://c/1.jpg', ...base },
    { id: '2', title: 'The Body (Unabridged)', author: 'Stephen King', releaseYear: 2026, coverUrl: 'https://c/2.jpg', ...base },
    { id: '3', title: 'The Stand - Das letzte Gefecht (ungekürzt)', author: 'Stephen King', releaseYear: 2014, coverUrl: 'https://c/3.jpg', ...base },
    { id: '4', title: 'The Life of Chuck (Unabridged)', author: 'Stephen King', releaseYear: 2025, coverUrl: 'https://c/4.jpg', ...base },
  ]);

  const r = await matchScanItem({
    path: '/media/audiobooks/Stephen King - The Stand',
    detectedTitle: 'Stephen King - The Stand',
    contentType: 'audiobook',
    files: ['/media/audiobooks/Stephen King - The Stand/The Stand, Part 1.m4b'],
    sizeBytes: 1,
  });

  expect(r.best?.sourceId).toBe('itunes:1');
  // The exact title beats the title-matching German edition too.
  expect(r.best?.title).toBe('The Stand (Unabridged)');
});

it('matches an "Author - Title - Edition tag" folder to the bare product title', async () => {
  // Modeled on the real iTunes response for "J K Rowling Harry Potter and the
  // Philosopher's Stone Headphone Surround": the right book is hit #1 but older
  // than unrelated noise further down. The trailing "Headphone Surround"
  // edition tag must not prevent the title match.
  const base = { collectionId: null, collectionName: null, trackName: null, description: null };
  vi.mocked(itunes.searchAudiobooks).mockResolvedValue([
    { id: '1', title: "Harry Potter and the Philosopher's Stone", author: 'J.K. Rowling', releaseYear: 2024, coverUrl: 'https://c/1.jpg', ...base },
    { id: '2', title: "Harry Potter and the Philosopher's Stone by J.K. Rowling (Book Analysis)", author: 'Bright Summaries', releaseYear: 2022, coverUrl: 'https://c/2.jpg', ...base },
    { id: '3', title: "Cognitive Dominance: A Brain Surgeon's Quest to Out-Think Fear (Unabridged)", author: 'Mark McLaughlin, MD & Shawn Coyne', releaseYear: 2025, coverUrl: 'https://c/3.jpg', ...base },
  ]);

  const r = await matchScanItem({
    path: "/media/audiobooks/J.K. Rowling - Harry Potter and the Philosopher's Stone - Headphone Surround",
    detectedTitle: "J K Rowling - Harry Potter and the Philosopher's Stone - Headphone Surround",
    contentType: 'audiobook',
    files: ["/media/audiobooks/J.K. Rowling - Harry Potter and the Philosopher's Stone - Headphone Surround/book.m4b"],
    sizeBytes: 1,
  });

  expect(r.best?.sourceId).toBe('itunes:1');
  expect(r.best?.title).toBe("Harry Potter and the Philosopher's Stone");
});

it('returns best:null when nothing title-matches; alternatives keep provider order', async () => {
  // When the ranker cannot title-match ANY candidate, pre-filling the
  // provider's guess as `best` risks importing junk on an unreviewed confirm.
  // Surface "no match" instead, keeping the provider-ordered hits available in
  // the dropdown (no newest-first reshuffle).
  const base = { collectionId: null, collectionName: null, trackName: null, description: null };
  vi.mocked(itunes.searchAudiobooks).mockResolvedValue([
    { id: '1', title: 'Some Plausible First Hit', author: 'Author A', releaseYear: 2010, coverUrl: 'https://c/1.jpg', ...base },
    { id: '2', title: 'Unrelated Newest Noise', author: 'Author B', releaseYear: 2026, coverUrl: 'https://c/2.jpg', ...base },
  ]);

  const r = await matchScanItem({
    path: '/media/audiobooks/Completely Different Folder Name',
    detectedTitle: 'Completely Different Folder Name',
    contentType: 'audiobook',
    files: ['/media/audiobooks/Completely Different Folder Name/book.m4b'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives.map((c) => c.sourceId)).toEqual(['itunes:1', 'itunes:2']);
});

it('does not pre-fill a containing anthology as best for a short-story file', async () => {
  // Real case: "Garth Nix - Bad Luck.pdf" is a short story; OpenLibrary only
  // has the anthologies it appeared in. Matching the file to a 700-page
  // anthology would create a wrong series — the row must show "no match".
  vi.mocked(ol.searchBooks).mockResolvedValue([
    makeHit({ olid: 'OL1W', title: 'The Mammoth Book of Best New SF 21', author: 'Gardner Dozois', firstPublishYear: 2008, coverUrl: 'https://c/1.jpg' }),
    makeHit({ olid: 'OL2W', title: 'Wizards', author: 'Jack Dann', firstPublishYear: 2007, coverUrl: 'https://c/2.jpg' }),
  ]);
  // GB off for this test — implementations set by earlier tests survive clearAllMocks.
  vi.mocked(googleBooksApiKeySetting.get).mockResolvedValue('');

  const r = await matchScanItem({
    path: '/media/books/Garth Nix - 17 novels/Garth Nix - Bad Luck.pdf',
    detectedTitle: 'Garth Nix - Bad Luck',
    contentType: 'light_novel',
    files: ['/media/books/Garth Nix - 17 novels/Garth Nix - Bad Luck.pdf'],
    sizeBytes: 1,
  });

  expect(r.best).toBeNull();
  expect(r.alternatives).toHaveLength(2);
});

it('does NOT use iTunes for a book (ebook) item', async () => {
  vi.mocked(ol.searchBooks).mockResolvedValue([makeHit({ olid: 'OLx', title: 'Dune' })]);

  await matchScanItem({
    path: '/b/Dune.epub',
    detectedTitle: 'Dune',
    contentType: 'ebook',
    files: ['/b/Dune.epub'],
    sizeBytes: 1,
  });

  expect(ol.searchBooks).toHaveBeenCalled();
  expect(itunes.searchAudiobooks).not.toHaveBeenCalled();
});
