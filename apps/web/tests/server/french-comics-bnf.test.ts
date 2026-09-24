import { describe, expect, it } from 'vitest';
import { parseReleaseTitle } from '@/server/parser/release';
import { titleMatches } from '@/server/matcher/titles';
import type { SeriesRow } from '@/server/db/schema';

function frenchComicSeries(): SeriesRow {
  return {
    id: 1,
    contentType: 'comic',
    titleEnglish: 'Sacrifice',
    titleRomaji: null,
    titleNative: null,
    author: null,
    extraSearchTermsJson: JSON.stringify(['@bnf:ark:/12148/cb12345678x']),
    granularity: 'volume',
    totalVolumes: 4,
  } as SeriesRow;
}

describe('French BnF comics', () => {
  it('parses French Tome notation as a volume', () => {
    const r = parseReleaseTitle(
      'Sacrifice (Urban Grand Format) - Tome 1 - Remender et Fiumara - Urban Comics - FR',
    );
    expect(r.targetKind).toBe('volume');
    expect(r.targetLow).toBe(1);
    expect(r.targetHigh).toBe(1);
  });

  it('matches recent ISBN-backed French comics without a BnF ARK', () => {
    const series = { ...frenchComicSeries(), extraSearchTermsJson: JSON.stringify(['@fr-isbn:9782723488525']) };
    expect(titleMatches(parseReleaseTitle('Sacrifice - Tome 1 - Remender et Fiumara - Urban Comics - FR'), series)).toBe(true);
  });

  it('matches verbose French publisher release names for BnF-backed comics', () => {
    expect(
      titleMatches(
        parseReleaseTitle(
          'Sacrifice (Urban Grand Format) - Tome 1 - Remender et Fiumara - Urban Comics - FR',
        ),
        frenchComicSeries(),
      ),
    ).toBe(true);
  });
});

