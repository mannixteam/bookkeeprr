import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';
const ark = (n: number) => `ark:/12148/cb1234567${n}x`;
const record = (n: number, isbn = '', title = 'Mirage. Tome 1') => `<record><recordData><dc><identifier>${ark(n)}</identifier><identifier>${isbn}</identifier><title>${title}</title><publisher>Delcourt</publisher><language>fre</language><relation>Titre d’ensemble : Mirage</relation></dc></recordData></record>`;
const response = (xml: string) => new Response(`<searchRetrieveResponse><records>${xml}</records></searchRetrieveResponse>`);
async function search(xml: string) { vi.stubGlobal('fetch', vi.fn(async () => response(xml))); return (await searchFrenchComicSeries('Mirage'))[0]!; }
afterEach(() => vi.unstubAllGlobals());
it.each(['Mirage. Tome 1', 'Mirage', 'Mirage. Intégrale'])('collapses proven ISBN-10/EAN duplicate editions: %s', async title => {
  expect((await search(record(1, '0306406152', title) + record(2, '9780306406157', title))).volumes).toHaveLength(1);
});
it.each(['Mirage. Tome 1', 'Mirage'])('retains distinct valid ISBNs sharing an ordinal/title: %s', async title => {
  const hit = await search(record(1, '9780306406157', title) + record(2, '9782723488525', title));
  expect(hit.volumes.map(v => v.ean).sort()).toEqual(['9780306406157', '9782723488525']);
  if (title.includes('Tome')) expect(hit.volumeCount).toBe(1);
});
it.each(['', '9780306406158'])('does not merge different ARKs on title/ordinal without valid ISBN: %s', async isbn => {
  expect((await search(record(1, isbn) + record(2, isbn))).volumes).toHaveLength(2);
});
it('does not collapse conflicting ordinals even with the same ISBN', async () => {
  expect((await search(record(1, '9780306406157') + record(2, '9780306406157', 'Mirage. Tome 2'))).volumes.map(v => v.number)).toEqual([1, 2]);
});
it('selects the same duplicate representative regardless of response order', async () => {
  const a = record(1, '9780306406157'); const b = record(2, '9780306406157');
  expect((await search(a + b)).bnfArk).toBe((await search(b + a)).bnfArk);
});
it('pins the selected ARK among duplicate and distinct editions during hydration', async () => {
  const seed = record(2, '0306406152');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(seed)).mockResolvedValueOnce(response(record(1, '9780306406157') + seed + record(3, '9782723488525'))));
  const hit = await getFrenchComicSeries(ark(2), 'Mirage');
  expect(hit.bnfArk).toBe(ark(2));
  expect(hit.volumes.map(v => v.ark).sort()).toEqual([ark(2), ark(3)]);
  expect(hit.volumes.find(v => v.ark === ark(2))?.isbn).toBe('0306406152');
});
