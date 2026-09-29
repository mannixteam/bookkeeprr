import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';

const ark = (id: number) => `ark:/12148/cb1234567${id}x`;
const record = (id: number, title: string, extra = '') => `<record><recordData><dc><identifier>${ark(id)}</identifier><title>${title}</title><publisher>Delcourt</publisher><language>fre</language><relation>Titre d’ensemble : Mirage ; 1</relation>${extra}</dc></recordData></record>`;
const response = (xml: string) => new Response(`<searchRetrieveResponse><records>${xml}</records></searchRetrieveResponse>`);
const standard = record(1, 'Mirage. Tome 1');
async function search(xml: string) {
  vi.stubGlobal('fetch', vi.fn(async () => response(xml)));
  return searchFrenchComicSeries('Mirage');
}
afterEach(() => vi.unstubAllGlobals());
it.each(['Mirage. Intégrale. Tome 1', 'Mirage. INTEGRALE 1', 'Mirage. Omnibus. Tome 1'])('separates compilation %s from ordinary tome 1', async title => {
  const hits = await search(standard + record(2, title));
  expect(hits).toHaveLength(2);
  const regular = hits.find(h => h.volumes.some(v => v.ark === ark(1)))!;
  const compilation = hits.find(h => h.volumes.some(v => v.ark === ark(2)))!;
  expect(regular.volumes.map(v => v.number)).toEqual([1]);
  expect(compilation.volumes.map(v => v.number)).toEqual([null]);
  expect(compilation.name).not.toBe(regular.name);
  expect(compilation.volumes[0]?.title).toBe(title);
});
it('distinguishes identical titles when the record type identifies an omnibus', async () => {
  const hits = await search(standard + record(2, 'Mirage. Tome 1', '<type>Omnibus</type>'));
  expect(hits).toHaveLength(2);
  expect(hits.flatMap(h => h.volumes).find(v => v.ark === ark(2))?.number).toBeNull();
});
it('never expands a compilation range into individual volume ordinals', async () => {
  const hits = await search(record(2, 'Mirage. Intégrale des tomes 1 à 3'));
  expect(hits[0]?.volumes).toHaveLength(1);
  expect(hits[0]?.volumes[0]?.number).toBeNull();
});
it('does not hide distinct compilations sharing a title but carrying different ISBNs', async () => {
  const hits = await search(record(2, 'Mirage. Intégrale', '<identifier>9780306406157</identifier>') + record(3, 'Mirage. Intégrale', '<identifier>9782723488525</identifier>'));
  expect(hits.flatMap(h => h.volumes).map(v => v.ean).sort()).toEqual(['9780306406157', '9782723488525']);
});
it('does not classify an ordinary album from a description mentioning another integral', async () => {
  const [hit] = await search(record(1, 'Mirage. Tome 1', '<description>Existe aussi dans une intégrale omnibus.</description>'));
  expect(hit?.volumes[0]?.number).toBe(1);
});
it.each([false, true])('preserves the selected ARK and isolates its edition kind during hydration (compilation=%s)', async compilationSelected => {
  const compilation = record(2, 'Mirage. Intégrale. Tome 1', '<identifier>9780306406157</identifier>');
  const seed = compilationSelected ? compilation : standard;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(seed)).mockResolvedValueOnce(response(standard + compilation)));
  const hit = await getFrenchComicSeries(ark(compilationSelected ? 2 : 1), 'Mirage');
  expect(hit.volumes).toHaveLength(1);
  expect(hit.volumes[0]).toMatchObject({ ark: ark(compilationSelected ? 2 : 1), number: compilationSelected ? null : 1 });
  if (compilationSelected) expect(hit.volumes[0]?.ean).toBe('9780306406157');
});
it('does not send the display-only compilation label to BnF during hydration', async () => {
  const compilation = record(2, 'Mirage. Intégrale. Tome 1');
  const [hit] = await search(compilation);
  const fetcher = vi.fn().mockResolvedValueOnce(response(compilation)).mockResolvedValueOnce(response(compilation));
  vi.stubGlobal('fetch', fetcher);
  await getFrenchComicSeries(ark(2), hit!.name);
  const query = new URL(String(fetcher.mock.calls[1]![0])).searchParams.get('query');
  expect(query).toBe('(bib.title all "Mirage") and (bib.recordtype any "mon")');
});
