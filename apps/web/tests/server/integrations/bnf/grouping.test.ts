import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';

function record(id: number, options: { title?: string; creator?: string; publisher?: string; relation?: string; contributor?: string } = {}) {
  return `<record><recordData><dc><identifier>ark:/12148/cb1234567${id}x</identifier><title>${options.title ?? `Mirage. Tome ${id}`}</title><publisher>${options.publisher ?? 'Delcourt'}</publisher><language>fre</language>${options.creator ? `<creator>${options.creator}</creator>` : ''}${options.contributor ? `<contributor>${options.contributor}</contributor>` : ''}${options.relation ? `<relation>${options.relation}</relation>` : ''}</dc></recordData></record>`;
}
const response = (xml: string) => new Response(`<searchRetrieveResponse><records>${xml}</records></searchRetrieveResponse>`);
async function search(xml: string) {
  vi.stubGlobal('fetch', vi.fn(async () => response(xml)));
  return searchFrenchComicSeries('Mirage');
}
afterEach(() => vi.unstubAllGlobals());

it('separates same-title works with conflicting creators before selecting an edition', async () => {
  const hits = await search(record(1, { title: 'Mirage. Tome 1', creator: 'Alice Martin' }) + record(2, { title: 'Mirage. Tome 1', creator: 'Bruno Petit' }));
  expect(hits).toHaveLength(2);
  expect(hits.flatMap(h => h.volumes).map(v => v.ark).sort()).toEqual(['ark:/12148/cb12345671x', 'ark:/12148/cb12345672x']);
});
it('keeps conflicting publishers separate even with the same creator and series relation', async () => {
  const common = { creator: 'Alice Martin', relation: 'Collection : Mirage' };
  expect(await search(record(1, common) + record(2, { ...common, publisher: 'Dargaud' }))).toHaveLength(2);
});
it('prioritizes explicit series relations over numbered album titles and the search query', async () => {
  const hits = await search(record(1, { title: 'Premier album. Tome 1', relation: "Titre d’ensemble : Mirage ; 1" }) + record(2, { title: 'Deuxième album. Tome 2', relation: 'Appartient à : Mirage ; 2' }));
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ name: 'Mirage', volumeCount: 2 });
});
it('separates conflicting explicit series relations despite identical album titles', async () => {
  const hits = await search(record(1, { title: 'Mirage. Tome 1', relation: 'Titre d’ensemble : Cycle rouge' }) + record(2, { title: 'Mirage. Tome 1', relation: 'Titre d’ensemble : Cycle bleu' }));
  expect(hits.map(h => h.name).sort()).toEqual(['Cycle bleu', 'Cycle rouge']);
});
it('does not let missing creators bridge conflicting groups regardless of response order', async () => {
  const a = record(1, { creator: 'Alice Martin' });
  const b = record(2);
  const c = record(3, { creator: 'Bruno Petit' });
  for (const xml of [a + b + c, c + b + a, b + a + c]) {
    const hits = await search(xml);
    expect(hits).toHaveLength(3);
    expect(hits.every(h => h.volumeCount === 1)).toBe(true);
  }
});
it('keeps matching normalized creators together', async () => {
  const hits = await search(record(1, { creator: 'Élodie Martin' }) + record(2, { creator: ' elodie MARTIN ' }));
  expect(hits).toHaveLength(1);
  expect(hits[0]?.volumeCount).toBe(2);
});
it('a common contributor does not erase conflicting primary creators', async () => {
  const hits = await search(record(1, { creator: 'Alice Martin', contributor: 'Coloriste commun' }) + record(2, { creator: 'Bruno Petit', contributor: 'Coloriste commun' }));
  expect(hits).toHaveLength(2);
});
it('hydrates only the selected work while preserving its selected ARK', async () => {
  const seed = record(1, { creator: 'Alice Martin' });
  const sequel = record(2, { creator: 'Alice Martin' });
  const unrelated = record(3, { creator: 'Bruno Petit' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(seed)).mockResolvedValueOnce(response(unrelated + sequel + seed)));
  const hit = await getFrenchComicSeries('ark:/12148/cb12345671x', 'Mirage');
  expect(hit.volumes.map(v => v.ark)).toEqual(['ark:/12148/cb12345671x', 'ark:/12148/cb12345672x']);
});
it('does not mistake a shared publisher collection for a numbered series', async () => {
  const common = { creator: 'Alice Martin', relation: 'Collection : Romans graphiques' };
  const hits = await search(record(1, { ...common, title: 'Mirage. Tome 1' }) + record(2, { ...common, title: 'Autre œuvre. Tome 1' }));
  expect(hits.map(h => h.name).sort()).toEqual(['Autre œuvre', 'Mirage']);
});
