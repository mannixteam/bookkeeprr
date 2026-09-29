import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/discover/french-title/route';
import { __resetOpenLibraryForTests } from '@/server/integrations/openlibrary/client';
const ean = '9780306406157';
const bnf = (id = '', language = 'fre', next = '') => new Response(`<searchRetrieveResponse><records>${id ? `<record><recordData><dc><identifier>ark:/12148/cb12345678x</identifier><identifier>${id}</identifier><title>Mirage. Tome 1</title><publisher>Delcourt</publisher><language>${language}</language></dc></recordData></record>` : ''}</records>${next}</searchRetrieveResponse>`);
const request = (query = 'title=Mirage') => GET(new Request(`http://localhost/api/discover/french-title?${query}`));
afterEach(() => { vi.unstubAllGlobals(); __resetOpenLibraryForTests(); });
it('prefers verified BnF editions without calling Open Library', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf(ean)); vi.stubGlobal('fetch', fetcher);
  const res = await request();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ source: 'bnf', coverage: 'bounded', results: [{ source: 'bnf', sourceId: 'ark:/12148/cb12345678x', ean, language: 'fr' }] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([['empty', '', 'fre'], ['foreign', ean, 'eng'], ['invalid ISBN', '9780306406158', 'fre']])('falls back after successful %s BnF results, preserving edition provenance', async (_name, id, language) => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf(id, language))
    .mockResolvedValueOnce(Response.json({ docs: [{ editions: { docs: [{ key: '/books/OL1M' }] } }] }))
    .mockResolvedValueOnce(Response.json({ key: '/books/OL1M', title: 'Mirage', languages: [{ key: '/languages/fre' }], isbn_10: ['0306406152'] }));
  vi.stubGlobal('fetch', fetcher);
  const res = await request();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ source: 'openlibrary', coverage: 'bounded', results: [{ source: 'openlibrary', sourceId: '/books/OL1M', sourceUrl: 'https://openlibrary.org/books/OL1M', attribution: 'Open Library', title: 'Mirage', language: 'fr', ean, isbn: ean, number: null, coverUrl: null, publisher: null, publishDate: null }] });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each(['HTTP', 'XML', 'network'])('does not use fallback for a BnF %s failure', async failure => {
  const fetcher = vi.fn();
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else fetcher.mockResolvedValueOnce(failure === 'HTTP' ? new Response('', { status: 503 }) : new Response('<broken>'));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not treat a later BnF page failure as absence', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf(ean, 'eng', '<nextRecordPosition>101</nextRecordPosition>')).mockResolvedValueOnce(new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not fall back when BnF pagination hits its cap', async () => {
  let page = 0;
  const fetcher = vi.fn(async () => bnf(ean, 'eng', `<nextRecordPosition>${++page * 100 + 1}</nextRecordPosition>`));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it('reports Open Library failure as 502, not an empty bibliography', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(new Response('', { status: 503 })));
  expect((await request()).status).toBe(502);
});
it('returns a bounded empty result when both searches succeed without editions', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(Response.json({ docs: [] })));
  expect(await (await request()).json()).toEqual({ source: 'openlibrary', coverage: 'bounded', results: [] });
});
it.each(['', 'title=', 'title=a', `title=${'a'.repeat(201)}`, 'title=Mirage&title=Autre'])('rejects invalid/ambiguous queries without network access: %s', async query => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect((await request(query)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
