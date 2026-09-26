import { afterEach, expect, it, vi } from 'vitest';
import { searchFrenchComicSeries } from '@/server/integrations/bnf';

const record = (id: number, number = id) => `<record><recordData><dc><identifier>ark:/12148/cb1234567${id}x</identifier><title>Série test. Tome ${number}</title><publisher>Delcourt</publisher><language>fre</language></dc></recordData></record>`;
const page = (records: string, next?: string, total = 500) => new Response(`<searchRetrieveResponse><numberOfRecords>${total}</numberOfRecords><records>${records}</records>${next === undefined ? '' : `<nextRecordPosition>${next}</nextRecordPosition>`}</searchRetrieveResponse>`);
const search = () => searchFrenchComicSeries('Série test');
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('follows server cursors across pages and preserves the query', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(page(record(1), '101')).mockResolvedValueOnce(page(record(2), '201')).mockResolvedValueOnce(page(record(3)));
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes.map(v => v.number)).toEqual([1, 2, 3]);
  const urls = fetcher.mock.calls.map(call => new URL(String(call[0])));
  expect(urls.map(url => url.searchParams.get('startRecord'))).toEqual(['1', '101', '201']);
  expect(new Set(urls.map(url => url.searchParams.get('query'))).size).toBe(1);
});
it.each(['101', '1', '0', '-1', '1.5', 'bad', '9007199254740992', '501'])('stops on repeated, backward or invalid cursor %s', async next => {
  const fetcher = vi.fn().mockResolvedValueOnce(page(record(1), '101')).mockImplementation(async () => page(record(2), next));
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes).toHaveLength(2);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('deduplicates ARKs across pages while retaining the first notice', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(page(record(1), '101')).mockResolvedValueOnce(page(record(1, 9) + record(2))));
  expect((await search())[0]?.volumes.map(v => v.number)).toEqual([1, 2]);
});
it.each(['network', 'http', 'body'])('retains earlier results on a later %s failure', async failure => {
  const fetcher = vi.fn().mockResolvedValueOnce(page(record(1), '101'));
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else if (failure === 'http') fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
  else fetcher.mockResolvedValueOnce({ ok: true, text: async () => { throw new Error('body interrupted'); } });
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes.map(v => v.number)).toEqual([1]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('propagates first-page failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })));
  await expect(search()).rejects.toMatchObject({ name: 'BnfError', status: 503 });
});
it('caps pagination at five pages', async () => {
  let count = 0;
  const fetcher = vi.fn(async () => { count++; return page(record(count), String(count * 100 + 1), 10000); });
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes).toHaveLength(5);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it('uses one 20-second abort budget for all pages and stops when it expires', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetcher = vi.fn().mockResolvedValueOnce(page(record(1), '101')).mockImplementationOnce(async (_url, init) => {
    expect(init.signal).toBe(controller.signal);
    controller.abort();
    throw new Error('timed out');
  });
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(timeout).toHaveBeenCalledExactlyOnceWith(20000);
});
it('stops on an empty page even if a next cursor is advertised', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(page(record(1), '101')).mockResolvedValueOnce(page('', '201'));
  vi.stubGlobal('fetch', fetcher);
  expect((await search())[0]?.volumes).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
