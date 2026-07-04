import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFilename } from '@/server/parser/filename';

type Case = {
  input: string;
  expected: {
    volume: number | null;
    chapter: string | null;
    group: string | null;
    confidence: number;
  };
};

const cases: Case[] = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../src/server/parser/__fixtures__/filenames.json'),
    'utf8',
  ),
);

describe('parseFilename', () => {
  for (const c of cases) {
    it(`parses: ${c.input}`, () => {
      const r = parseFilename(c.input);
      expect(r.volume).toBe(c.expected.volume);
      expect(r.chapter).toBe(c.expected.chapter);
      expect(r.group).toBe(c.expected.group);
      expect(r.confidence).toBeCloseTo(c.expected.confidence, 2);
    });
  }

  it('returns debug metadata', () => {
    const r = parseFilename('Series - v01 [GRP].cbz');
    expect(r.debug.matchedPattern).toBeTruthy();
    expect(r.debug.stripped).not.toContain('[');
    expect(r.debug.stripped).not.toContain('.cbz');
  });

  describe('trailing (N) counter fallback', () => {
    it('recovers a degraded name whose number survives only as "(N)"', () => {
      const r = parseFilename('Bunny Drop - c [] (1).cbz');
      expect(r.volume).toBe(1);
      expect(r.chapter).toBeNull();
      expect(r.confidence).toBeCloseTo(0.3, 2);
      expect(r.debug.matchedPattern).toBe('paren-counter');
    });

    it('reads a plain trailing "(N)" as the volume', () => {
      expect(parseFilename('Some Series (7).cbz').volume).toBe(7);
    });

    it('ignores 4-digit years like "(2021)"', () => {
      const r = parseFilename('Some Series (2021).cbz');
      expect(r.volume).toBeNull();
      expect(r.chapter).toBeNull();
    });

    it('does not override a real v/ch match', () => {
      const r = parseFilename('Series v05 (2021).cbz');
      expect(r.volume).toBe(5);
      expect(r.debug.matchedPattern).not.toBe('paren-counter');
    });
  });
});
