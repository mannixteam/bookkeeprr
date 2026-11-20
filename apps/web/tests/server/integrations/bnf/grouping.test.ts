import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';

function record(id: number, options: { title?: string; creator?: string; publisher?: string; relation?: string | string[]; contributor?: string } = {}) {
  const relations = [options.relation ?? []].flat().map(value => `<relation>${value}</relation>`).join('');
  return `<record><recordData><dc><identifier>ark:/12148/cb1234567${id}x</identifier><title>${options.title ?? `Mirage. Tome ${id}`}</title><publisher>${options.publisher ?? 'Delcourt'}</publisher><language>fre</language>${options.creator ? `<creator>${options.creator}</creator>` : ''}${options.contributor ? `<contributor>${options.contributor}</contributor>` : ''}${relations}</dc></recordData></record>`;
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

const red = 'Titre d’ensemble : Cycle rouge';
const blue = 'Appartient à : Cycle bleu';
it.each([[red, blue], [blue, red]])('isolates a notice claiming both %s and %s', async (first, second) => {
  const confirmed = record(1, { relation: red }) + record(2, { relation: blue });
  // Even the album's own base title collides with one claimed series.
  const ambiguous = record(3, { title: 'Cycle bleu. Tome 3', relation: [first, second] });
  const hits = await search(confirmed + ambiguous);
  const baseline = await search(confirmed);
  for (const group of baseline) {
    expect(hits.find(hit => hit.bnfArk === group.bnfArk)).toEqual(group);
  }
  expect(hits).toHaveLength(3);
  const isolated = hits.find(hit => hit.bnfArk === 'ark:/12148/cb12345673x');
  expect(isolated?.volumes.map(v => v.ark)).toEqual(['ark:/12148/cb12345673x']);
});

it('accepts equivalent explicit series labels as one title', async () => {
  const hits = await search(record(1, { relation: red }) + record(2, {
    relation: [red, 'Appartient à : CYCLE ROUGE ; 2'],
  }));
  expect(hits).toHaveLength(1);
  expect(hits[0]?.volumeCount).toBe(2);
});

it.each(['Collection : Mirage', '  collection: Mirage romans graphiques'])('does not group unnumbered works solely by a query-matching publisher collection: %s', async relation => {
  const common = { creator: 'Alice Martin', relation };
  const a = record(1, { ...common, title: 'La traversée' });
  const b = record(2, { ...common, title: 'Le retour' });
  for (const xml of [a + b, b + a]) {
    const hits = await search(xml);
    expect(hits.map(hit => hit.name).sort()).toEqual(['La traversée', 'Le retour']);
    expect(hits.map(hit => hit.volumeCount)).toEqual([1, 1]);
    expect(hits.flatMap(hit => hit.volumes).map(volume => volume.number)).toEqual([null, null]);
    expect(hits.flatMap(hit => hit.volumes).map(volume => volume.ark).sort())
      .toEqual(['ark:/12148/cb12345671x', 'ark:/12148/cb12345672x']);
  }
});
it('retains an explicit series for unnumbered albums despite a query-matching collection', async () => {
  const common = { creator: 'Alice Martin', relation: ['Collection : Mirage', 'Titre d’ensemble : Cycle bleu'] };
  const hits = await search(record(1, { ...common, title: 'La traversée' }) + record(2, { ...common, title: 'Le retour' }));
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ name: 'Cycle bleu', volumeCount: 2 });
  expect(hits[0]?.volumes.map(volume => volume.number)).toEqual([null, null]);
});
