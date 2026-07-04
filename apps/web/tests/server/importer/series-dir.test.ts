import { describe, expect, it } from 'vitest';
import { commonPrefixDir, deriveCurrentSeriesDir } from '@/server/importer/series-dir.js';

describe('commonPrefixDir', () => {
  it('returns the shared directory prefix', () => {
    expect(commonPrefixDir('/media/comics/A/x', '/media/comics/A/y')).toBe('/media/comics/A');
  });
  it('returns the path itself when equal', () => {
    expect(commonPrefixDir('/media/comics/A', '/media/comics/A')).toBe('/media/comics/A');
  });
  it('falls back to / when nothing is shared', () => {
    expect(commonPrefixDir('/a/b', '/c/d')).toBe('/');
  });
});

describe('deriveCurrentSeriesDir', () => {
  it('returns the fallback when there are no files', () => {
    expect(deriveCurrentSeriesDir([], false, '/media/comics/Fallback')).toBe(
      '/media/comics/Fallback',
    );
  });
  it('derives the common parent without a volume subfolder', () => {
    expect(
      deriveCurrentSeriesDir(
        ['/media/comics/Title/v01.cbz', '/media/comics/Title/v02.cbz'],
        false,
        '/x',
      ),
    ).toBe('/media/comics/Title');
  });
  it('strips one level per file when a volume subfolder is configured', () => {
    expect(
      deriveCurrentSeriesDir(
        ['/media/comics/Title/Volume 01/a.cbz', '/media/comics/Title/Volume 02/b.cbz'],
        true,
        '/x',
      ),
    ).toBe('/media/comics/Title');
  });
});
