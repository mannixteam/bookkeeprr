import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { __resetOpenLibraryForTests, __setOpenLibraryFetcherForTests, searchFrenchEditionsByTitle } from '@/server/integrations/openlibrary/client';

const ean = '9780306406157';
const edition = (extra = {}) => ({ key: '/books/OL1M', title: 'Mirage français', languages: [{ key: '/languages/fre' }], isbn_13: [ean], publishers: ['Delcourt'], publish_date: '2026', ...extra });
const search = (keys = ['/books/OL1M']) => ({ docs: keys.map(key => ({ title: 'Work title', language: ['fre'], isbn: [ean], editions: { docs: [{ key }] } })) });
const response = (value: unknown, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(value) });
async function settle<T>(pending: Promise<T>): Promise<T> {
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  await vi.runAllTimersAsync();
  const result = await outcome;
  if ('error' in result) throw result.error;
  return result.value;
}
beforeEach(() => { vi.useFakeTimers(); __resetOpenLibraryForTests(); });
afterEach(() => { __resetOpenLibraryForTests(); vi.useRealTimers(); });

it('uses literal title search and fetches the edition, retaining only its metadata', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(search())).mockResolvedValueOnce(response(edition()));
  __setOpenLibraryFetcherForTests(fetcher);
  expect(await settle(searchFrenchEditionsByTitle('  Mirage & language:eng  '))).toEqual([{ ...edition(), ean }]);
  const url = new URL(fetcher.mock.calls[0]![0]);
  expect(url.searchParams.get('title')).toBe('Mirage & language:eng');
  expect(url.searchParams.get('q')).toBeNull();
  expect(url.searchParams.get('lang')).toBe('fr');
  expect(url.searchParams.get('limit')).toBe('5');
  expect(url.searchParams.get('fields')).toBe('key,editions,editions.key');
  expect(fetcher.mock.calls[1]![0]).toBe('https://openlibrary.org/books/OL1M.json');
});
it.each([
  ['missing language', { languages: undefined }], ['empty language', { languages: [] }],
  ['English', { languages: [{ key: '/languages/eng' }] }],
  ['bilingual', { languages: [{ key: '/languages/fre' }, { key: '/languages/eng' }] }],
  ['unknown', { languages: [{ key: '/languages/und' }] }],
  ['missing ISBN', { isbn_13: undefined }], ['invalid ISBN', { isbn_13: ['9780306406158'] }],
  ['non-book EAN', { isbn_13: ['4006381333931'] }],
  ['contradictory ISBNs', { isbn_10: ['2723488527'] }],
  ['work key', { key: '/works/OL1W' }], ['changed edition', { key: '/books/OL2M' }],
  ['blank title', { title: ' ' }], ['malformed language', { languages: ['fre'] }],
])('rejects %s despite French work metadata', async (_name, extra) => {
  __setOpenLibraryFetcherForTests(vi.fn().mockResolvedValueOnce(response(search())).mockResolvedValueOnce(response(edition(extra))));
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toEqual([]);
});
it('normalizes ISBN-10 and accepts repeated French declarations and equivalent identifiers', async () => {
  __setOpenLibraryFetcherForTests(vi.fn().mockResolvedValueOnce(response(search())).mockResolvedValueOnce(response(edition({ isbn_13: ['invalid'], isbn_10: ['0-306-40615-2'], languages: [{ key: '/languages/fra' }, { key: '/languages/fre' }] }))));
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toMatchObject([{ ean }]);
});
it('fetches each edition once, deduplicates canonical ISBNs and retains distinct editions of the same title', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(search(['/books/OL1M', '/books/OL1M', '/books/OL2M', '/books/OL3M'])))
    .mockResolvedValueOnce(response(edition()))
    .mockResolvedValueOnce(response(edition({ key: '/books/OL2M', isbn_13: [], isbn_10: ['0306406152'] })))
    .mockResolvedValueOnce(response(edition({ key: '/books/OL3M', isbn_13: ['9782723488525'] })));
  __setOpenLibraryFetcherForTests(fetcher);
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toMatchObject([{ key: '/books/OL1M', ean }, { key: '/books/OL3M', ean: '9782723488525' }]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('bounds search docs and candidate lookups even if the provider ignores limit', async () => {
  const keys = Array.from({ length: 20 }, (_, i) => `/books/OL${i + 1}M`);
  const fetcher = vi.fn().mockResolvedValueOnce(response(search(keys))).mockResolvedValue(response(null, 404));
  __setOpenLibraryFetcherForTests(fetcher);
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(6);
});
it('caps nested candidates and never follows work keys, arbitrary URLs or pagination', async () => {
  const docs = [{ editions: { docs: Array.from({ length: 20 }, (_, i) => ({ key: `/books/OL${i + 1}M` })) } }];
  const fetcher = vi.fn().mockResolvedValueOnce(response({ docs, next: 'https://untrusted.invalid' })).mockResolvedValue(response(null, 404));
  __setOpenLibraryFetcherForTests(fetcher);
  await settle(searchFrenchEditionsByTitle('Mirage'));
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(fetcher.mock.calls.slice(1).map(call => call[0])).toEqual(Array.from({ length: 5 }, (_, i) => `https://openlibrary.org/books/OL${i + 1}M.json`));
});
it('does not use work identifiers, ISBN aggregates or unsafe candidate paths', async () => {
  const raw = search(['/works/OL1W', 'https://evil.invalid/books/OL1M', '/books/../../OL1M']);
  raw.docs.push({ title: 'French work', language: ['fre'], isbn: [ean], editions: { docs: [] } });
  const fetcher = vi.fn().mockResolvedValue(response(raw));
  __setOpenLibraryFetcherForTests(fetcher);
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['search', 'edition'])('returns no results for a %s 404', async stage => {
  const fetcher = vi.fn();
  if (stage === 'edition') fetcher.mockResolvedValueOnce(response(search()));
  fetcher.mockResolvedValue(response(null, 404));
  __setOpenLibraryFetcherForTests(fetcher);
  expect(await settle(searchFrenchEditionsByTitle('Mirage'))).toEqual([]);
});
it.each(['http', 'json', 'network', 'shape'])('reports search %s failure', async failure => {
  const fetcher = vi.fn();
  if (failure === 'network') fetcher.mockRejectedValue(new Error('offline'));
  else fetcher.mockResolvedValue(failure === 'http' ? response(null, 503) : failure === 'json' ? { ok: true, status: 200, text: async () => '{' } : response({ docs: null }));
  __setOpenLibraryFetcherForTests(fetcher);
  await expect(settle(searchFrenchEditionsByTitle('Mirage'))).rejects.toThrow('French title edition lookup failed');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['http', 'json', 'network'])('does not present partial results as success after an edition %s failure', async failure => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(search(['/books/OL1M', '/books/OL2M']))).mockResolvedValueOnce(response(edition()));
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else fetcher.mockResolvedValueOnce(failure === 'http' ? response(null, 429) : { ok: true, status: 200, text: async () => '{' });
  __setOpenLibraryFetcherForTests(fetcher);
  await expect(settle(searchFrenchEditionsByTitle('Mirage'))).rejects.toThrow('French title edition lookup failed');
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each(['headers', 'body'])('enforces a five-second deadline during stalled %s even if the fetcher ignores abort', async stage => {
  let signal: AbortSignal | undefined;
  const never = new Promise<never>(() => {});
  __setOpenLibraryFetcherForTests(async (_url, options) => {
    signal = options?.signal;
    return stage === 'headers' ? never : { ok: true, status: 200, text: () => never };
  });
  const start = Date.now();
  await expect(settle(searchFrenchEditionsByTitle('Mirage'))).rejects.toThrow('French title edition lookup failed');
  expect(Date.now() - start).toBe(5_000);
  expect(signal?.aborted).toBe(true);
});
it('shares one fifteen-second budget across all requests and starts no more after timeout', async () => {
  let calls = 0;
  const signals: AbortSignal[] = [];
  __setOpenLibraryFetcherForTests(async (_url, options) => {
    signals.push(options!.signal!);
    const value = calls++ === 0 ? search(Array.from({ length: 5 }, (_, i) => `/books/OL${i + 1}M`)) : edition({ key: `/books/OL${calls - 1}M` });
    await new Promise(resolve => setTimeout(resolve, 3_500));
    return response(value);
  });
  const start = Date.now();
  const outcome = searchFrenchEditionsByTitle('Mirage').catch(error => error);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await outcome).toBeInstanceOf(Error);
  expect(Date.now() - start).toBe(15_000);
  expect(signals.at(-1)?.aborted).toBe(true);
  const atTimeout = calls;
  await vi.runAllTimersAsync();
  expect(calls).toBe(atTimeout);
  expect(calls).toBe(5);
});
it.each(['', 'a', 'a'.repeat(201)])('rejects invalid input before network access: %s', async value => {
  const fetcher = vi.fn(); __setOpenLibraryFetcherForTests(fetcher);
  await expect(searchFrenchEditionsByTitle(value)).rejects.toThrow('Invalid title');
  expect(fetcher).not.toHaveBeenCalled();
});
