import { describe, expect, it } from 'vitest';
import { contentTypeForFile, contentTypeForFiles, MEDIA_EXT_RE } from '@/server/scanner/formats';

describe('contentTypeForFile', () => {
  it('maps comic archives to manga', () => {
    for (const ext of ['cbz', 'cbr', 'zip', 'rar', '7z']) {
      expect(contentTypeForFile(`Bunny Drop v01.${ext}`)).toBe('manga');
    }
  });
  it('maps document formats to ebook', () => {
    for (const ext of ['epub', 'mobi', 'pdf', 'azw', 'azw3']) {
      expect(contentTypeForFile(`Atomic Habits.${ext}`)).toBe('ebook');
    }
  });
  it('maps audio formats to audiobook', () => {
    for (const ext of ['m4b', 'm4a', 'mp3', 'aac', 'flac', 'ogg']) {
      expect(contentTypeForFile(`Cant Hurt Me.${ext}`)).toBe('audiobook');
    }
  });
  it('is case-insensitive and returns null for non-media', () => {
    expect(contentTypeForFile('Cover.EPUB')).toBe('ebook');
    expect(contentTypeForFile('cover.jpg')).toBeNull();
    expect(contentTypeForFile('notes.txt')).toBeNull();
  });
});

describe('contentTypeForFiles', () => {
  it('returns the dominant type across a directory', () => {
    expect(contentTypeForFiles(['a.epub', 'b.epub', 'cover.jpg'])).toBe('ebook');
    expect(contentTypeForFiles(['v01.cbz', 'v02.cbz', 'extra.m4b'])).toBe('manga');
  });
  it('returns null when no media files are present', () => {
    expect(contentTypeForFiles(['cover.jpg', 'info.nfo'])).toBeNull();
    expect(contentTypeForFiles([])).toBeNull();
  });
});

describe('MEDIA_EXT_RE', () => {
  it('accepts every supported media extension and rejects others', () => {
    for (const ext of ['cbz', 'epub', 'm4b', 'pdf', 'azw3', 'flac']) {
      expect(MEDIA_EXT_RE.test(`x.${ext}`)).toBe(true);
    }
    expect(MEDIA_EXT_RE.test('x.jpg')).toBe(false);
    expect(MEDIA_EXT_RE.test('x.txt')).toBe(false);
  });
});
