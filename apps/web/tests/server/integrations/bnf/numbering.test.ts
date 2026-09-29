import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';
const record = (id: number, title: string, extra = '') => `<record><recordData><dc><identifier>ark:/12148/cb1234567${id}x</identifier><title>${title}</title><publisher>Delcourt</publisher><language>fre</language><relation>Collection : Série test</relation>${extra}</dc></recordData></record>`;
const xml = (records: string) => new Response(`<searchRetrieveResponse><records>${records}</records></searchRetrieveResponse>`);
afterEach(() => vi.unstubAllGlobals());
it('keeps named albums unnumbered regardless of dates or response order', async () => {
  const a = record(1, 'Album A', '<date>2020</date>');
  const b = record(2, 'Album B', '<date>1990</date>');
  const fetcher = vi.fn().mockResolvedValueOnce(xml(a + b)).mockResolvedValueOnce(xml(b + a));
  vi.stubGlobal('fetch', fetcher);
  for (let i = 0; i < 2; i++) {
    const [hit] = await searchFrenchComicSeries('Série test');
    expect(hit?.volumes).toHaveLength(2);
    expect(hit?.volumes.map(v => v.number)).toEqual([null, null]);
    expect(hit?.volumeCount).toBe(2);
  }
});
it('retains unnumbered albums alongside explicit numbered volumes', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record(1, 'Série test. Tome 3') + record(2, 'Album spécial'))));
  const [hit] = await searchFrenchComicSeries('Série test');
  expect(hit?.volumes.map(v => v.number)).toEqual([3, null]);
  expect(hit?.volumeCount).toBe(2);
});
it('does not take a volume number mentioned in a description', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record(1, 'Album A', '<description>Suite du tome 9, publiée en 2024.</description>'))));
  const hits = await searchFrenchComicSeries('Série test');
  expect(hits[0]?.volumes[0]?.number).toBeNull();
});
it('preserves explicit title and relation ordinals', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record(1, 'Série test. Tome 4') + record(2, 'Album B', '<relation>Collection : Série test ; 7</relation>'))));
  const hits = await searchFrenchComicSeries('Série test');
  expect(hits.flatMap(h => h.volumes.map(v => v.number)).sort()).toEqual([4, 7]);
});
it('keeps the selected unnumbered notice unnumbered during hydration', async () => {
  const seed = record(1, 'Album A');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(xml(seed)).mockResolvedValueOnce(xml(seed + record(2, 'Album B'))));
  const hit = await getFrenchComicSeries('ark:/12148/cb12345671x', 'Série test');
  expect(hit.volumes.find(v => v.ark === 'ark:/12148/cb12345671x')?.number).toBeNull();
});
