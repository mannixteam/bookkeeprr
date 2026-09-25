import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { searchFrenchComicSeries } from '@/server/integrations/bnf';
import { searchFrenchCatalog } from '@/server/integrations/french-catalog/client';

// Actual BnF SRU records retrieved 2026-09-25 (Licence ouverte de l'État).
const fixture = readFileSync(new URL('../fixtures/bnf/legendaires-unimarc.xml', import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());
it('groups named albums by their UNIMARC parent and explicit ordinal', async () => {
  const fetcher = vi.fn(async (_url: string) => new Response(fixture));
  vi.stubGlobal('fetch', fetcher);
  const hits = await searchFrenchComicSeries('Les Légendaires');
  const main = hits.find(h => h.name.toLowerCase() === 'les légendaires' && h.publisher === 'Delcourt');
  expect(main?.volumes.map(v => v.number)).toEqual([2, 15, 22]);
  expect(main?.volumes[0]?.title).toBe('Le gardien');
  expect(main?.volumes[0]?.ean).toMatch(/^97[89]\d{10}$/);
  const origins = hits.find(h => h.name.toLowerCase() === 'les légendaires, origines' && h.publisher === 'Delcourt');
  expect(origins?.volumes.map(v => v.number)).toEqual([1, 2]);
  expect(hits.find(h => h.name.toLowerCase() === 'les légendaires : saga')?.volumes[0]?.number).toBe(1);
  expect(main?.volumes.every(v => v.number != null)).toBe(true);
  expect(new URL(fetcher.mock.calls[0]![0] as string).searchParams.get('recordSchema')).toBe('unimarcXchange');
});
it('paginates recent French editions and keeps earlier pages on later errors', async () => {
  const indexes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (String(url).includes('bnf.fr')) throw new Error('offline');
    const index = new URL(String(url)).searchParams.get('startIndex')!;
    indexes.push(index);
    if (index === '80') throw new Error('quota');
    return Response.json({ totalItems: 100, items: [{ id: `book${index}`, volumeInfo: {
      title: `Nouvelle BD - Tome ${index === '0' ? 1 : 2}`, language: 'fr', publisher: 'Delcourt', categories: ['Comics'],
      industryIdentifiers: [{ identifier: index === '0' ? '9782723488525' : '9780306406157' }],
    } }] });
  }));
  const hits = await searchFrenchCatalog('Nouvelle BD');
  expect(indexes).toEqual(['0', '40', '80']);
  expect(hits[0]?.volumes.map(v => v.number)).toEqual([1, 2]);
});
it('stops pagination when a provider repeats its page', async () => {
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (String(url).includes('bnf.fr')) throw new Error('offline');
    calls++;
    return Response.json({ totalItems: 1000, items: [{ id: 'same', volumeInfo: {
      title: 'Nouvelle BD - Tome 1', language: 'fr', publisher: 'Delcourt', categories: ['Comics'],
      industryIdentifiers: [{ identifier: '9782723488525' }],
    } }] });
  }));
  expect((await searchFrenchCatalog('Nouvelle BD'))[0]?.volumes).toHaveLength(1);
  expect(calls).toBe(2);
});
