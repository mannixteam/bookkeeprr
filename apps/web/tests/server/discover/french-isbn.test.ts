import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/discover/french-isbn/route';
import { __resetOpenLibraryForTests } from '@/server/integrations/openlibrary/client';
const isbn = '9780306406157';
const bnf = (id = '', language = 'fre', next = '') => new Response(`<searchRetrieveResponse><records>${id ? `<record><recordData><dc><identifier>ark:/12148/cb12345678x</identifier><identifier>${id}</identifier><title>Mirage. Tome 1</title><publisher>Delcourt</publisher><language>${language}</language></dc></recordData></record>` : ''}</records>${next}</searchRetrieveResponse>`);
const edition = (extra = {}) => ({ key: '/books/OL123M', title: 'Mirage', isbn_13: [isbn], languages: [{ key: '/languages/fre' }], publishers: ['Delcourt'], publish_date: '2026', ...extra });
const request = (value = isbn) => GET(new Request(`http://localhost/api/discover/french-isbn?isbn=${encodeURIComponent(value)}`));
afterEach(() => { vi.unstubAllGlobals(); __resetOpenLibraryForTests(); });
it('prefers the exact French BnF edition without calling the fallback', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf(isbn)); vi.stubGlobal('fetch', fetcher);
  const res = await request();
  expect(res.status).toBe(200);
  expect((await res.json()).result).toMatchObject({ source: 'bnf', ean: isbn, sourceId: 'ark:/12148/cb12345678x' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('falls back after a successful empty BnF lookup and retains edition attribution', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(Response.json(edition())); vi.stubGlobal('fetch', fetcher);
  const res = await request('ISBN 0-306-40615-2');
  expect(res.status).toBe(200);
  expect((await res.json()).result).toMatchObject({ source: 'openlibrary', sourceId: '/books/OL123M', sourceUrl: 'https://openlibrary.org/books/OL123M', attribution: 'Open Library', ean: isbn, language: 'fr', title: 'Mirage', number: null, coverUrl: null });
  expect(String(fetcher.mock.calls[1]![0])).toBe(`https://openlibrary.org/isbn/${isbn}.json`);
});
it.each([['different ISBN', '9782723488525', 'fre'], ['foreign edition', isbn, 'eng']])('falls back when BnF returns only %s', async (_name, id, language) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf(id, language)).mockResolvedValueOnce(Response.json(edition())));
  expect((await (await request()).json()).result?.source).toBe('openlibrary');
});
it.each([
  ['foreign', { languages: [{ key: '/languages/eng' }] }],
  ['missing language', { languages: undefined }],
  ['bilingual', { languages: [{ key: '/languages/fre' }, { key: '/languages/eng' }] }],
  ['different ISBN', { isbn_13: ['9782723488525'] }],
  ['invalid ISBN', { isbn_13: ['9780306406158'] }],
  ['missing ISBN', { isbn_13: [] }],
])('rejects fallback %s', async (_name, extra) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(Response.json(edition(extra))));
  expect((await (await request()).json()).result).toBeNull();
});
it('accepts an equivalent ISBN-10 in the returned edition', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(Response.json(edition({ isbn_13: [], isbn_10: ['0306406152'] }))));
  expect((await (await request()).json()).result?.ean).toBe(isbn);
});
it.each(['503', 'malformed', 'network'])('does not fall back after a BnF %s failure', async failure => {
  const fetcher = vi.fn();
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else fetcher.mockResolvedValueOnce(failure === '503' ? new Response('', { status: 503 }) : new Response('<broken>'));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not fall back after a later BnF page fails', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf('9782723488525', 'fre', '<nextRecordPosition>101</nextRecordPosition>')).mockResolvedValueOnce(new Response('', { status: 503 })); vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each(['503', 'malformed', 'network', 'shape'])('reports fallback %s failure explicitly', async failure => {
  const fetcher = vi.fn().mockResolvedValueOnce(bnf());
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else fetcher.mockResolvedValueOnce(failure === '503' ? new Response('', { status: 503 }) : failure === 'malformed' ? new Response('{') : Response.json({ error: 'bad' }));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
});
it('treats fallback 404 as absence', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(bnf()).mockResolvedValueOnce(new Response('', { status: 404 })));
  expect((await (await request()).json()).result).toBeNull();
});
it.each(['Mirage', '9780306406158', ''])('rejects invalid ISBN input without provider calls: %s', async value => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  expect((await request(value)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not treat a capped BnF lookup as confirmed absence', async () => {
  let page = 0;
  const fetcher = vi.fn(async () => bnf('9782723488525', 'fre', `<nextRecordPosition>${++page * 100 + 1}</nextRecordPosition>`));
  vi.stubGlobal('fetch', fetcher);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
