import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';
const ark = 'ark:/12148/cb12345678x';
function record(languages: string[], id = ark, number = 1, year = 2020) {
  return `<record><recordData><dc><identifier>${id}</identifier><title>Série test. Tome ${number}</title><publisher>Delcourt</publisher><date>${year}</date>${languages.map(v => `<language>${v}</language>`).join('')}</dc></recordData></record>`;
}
const xml = (records: string) => new Response(`<searchRetrieveResponse><records>${records}</records></searchRetrieveResponse>`);
afterEach(() => vi.unstubAllGlobals());
const french = ['fr', 'fre', 'FRA', ' français ', 'French', 'fr-FR', 'fr_CA'];
const excluded: Array<[string, string[]]> = [
  ['English', ['eng']], ['Portuguese', ['por']], ['non-French label', ['non français']],
  ['missing', []], ['empty', ['  ']], ['undetermined', ['und']], ['multiple unspecified', ['mul']],
  ['French then English', ['fre', 'eng']], ['English then French', ['eng', 'fre']],
];
it.each(french)('accepts confirmed French in search and direct hydration: %s', async language => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record([language]))));
  expect(await searchFrenchComicSeries('Série test')).toHaveLength(1);
  expect((await getFrenchComicSeries(ark)).volumes).toHaveLength(1);
});
it.each(excluded)('rejects in search: %s', async (_label, languages) => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record(languages))));
  expect(await searchFrenchComicSeries('Série test')).toEqual([]);
});
it.each(excluded)('rejects direct hydration before fetching related notices: %s', async (_label, languages) => {
  const fetcher = vi.fn(async () => xml(record(languages)));
  vi.stubGlobal('fetch', fetcher);
  await expect(getFrenchComicSeries(ark)).rejects.toMatchObject({ name: 'BnfError', status: 422 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('filters foreign reissues before choosing an edition and excludes foreign related volumes', async () => {
  const seed = record(['fre']);
  const foreign = record(['eng'], 'ark:/12148/cb87654321z', 1, 2026) + record(['eng'], 'ark:/12148/cb87654322z', 2);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(xml(seed + foreign)).mockResolvedValueOnce(xml(seed)).mockResolvedValueOnce(xml(seed + foreign)));
  expect((await searchFrenchComicSeries('Série test'))[0]?.volumes.map(v => v.ark)).toEqual([ark]);
  expect((await getFrenchComicSeries(ark)).volumes.map(v => v.ark)).toEqual([ark]);
});
it('accepts repeated equivalent French declarations', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => xml(record(['fre', 'fra', 'Français']))));
  expect(await searchFrenchComicSeries('Série test')).toHaveLength(1);
});
