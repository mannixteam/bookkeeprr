import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { GET } from '@/app/api/img/route';
import { libraryCoverSrc, proxiedCoverUrl } from '@/server/images/allowlist';
import { purgeCachedImage } from '@/server/images/cache';

const settings = vi.hoisted(() => ({ enabled: false, dir: '' }));
vi.mock('@/server/db/settings/library', () => ({
  imageCacheSetting: { get: async () => ({ enabled: settings.enabled }) },
  getImageCacheDir: async () => settings.dir,
}));
vi.mock('@/server/images/cf-clearance', () => ({
  clearanceForHost: vi.fn(),
  invalidateClearance: vi.fn(),
}));
let png: Buffer;
const urls = [
  'https://bdi.dlpdomain.com/album/9782723488525/couv/M385x862/cover.jpg',
  'https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark:/12148/cb123',
];
const request = (url = urls[0]!) =>
  new Request(`http://localhost/api/img?u=${encodeURIComponent(url)}`);
beforeEach(async () => {
  settings.enabled = false;
  settings.dir = await mkdtemp(join(tmpdir(), 'bk-fr-cover-'));
  const pixels = Buffer.alloc(120 * 180 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 251;
  png = await sharp(pixels, { raw: { width: 120, height: 180, channels: 3 } })
    .png()
    .toBuffer();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await rm(settings.dir, { recursive: true, force: true });
});

it.each(urls)('requires proxy even without caching for %s', (url) => {
  expect(libraryCoverSrc(url, false)).toBe(`/api/img?u=${encodeURIComponent(url)}`);
  expect(proxiedCoverUrl(url)).toBe(libraryCoverSrc(url, false));
});
it.each(urls)('accepts decoded bytes for %s with caching off', async (url) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }),
      ),
  );
  const res = await GET(request(url));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(120);
  expect(await readdir(settings.dir)).toEqual([]);
});
it.each([false, true])('never serves or caches false image bytes (cache %s)', async (enabled) => {
  settings.enabled = enabled;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('<html>error</html>', { headers: { 'content-type': 'image/jpeg' } }),
      ),
  );
  const res = await GET(request());
  expect(res.status).toBe(502);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(await readdir(settings.dir)).toEqual([]);
});
it('ignores legacy cache, caches validated image, reuses it, and purges it', async () => {
  settings.enabled = true;
  const hash = createHash('sha256').update(urls[0]!).digest('hex');
  await writeFile(join(settings.dir, hash + '.jpg'), '<html>legacy</html>');
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(request())).status).toBe(200);
  expect(
    (await sharp(await readFile(join(settings.dir, `fr-v1-${hash}.jpg`))).metadata()).format,
  ).toBe('jpeg');
  expect((await GET(request())).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await purgeCachedImage(urls[0]);
  expect(await readdir(settings.dir)).toEqual([]);
});
it('rejects corrupted validated-cache bytes and retries upstream', async () => {
  settings.enabled = true;
  const hash = createHash('sha256').update(urls[0]!).digest('hex');
  await writeFile(join(settings.dir, `fr-v1-${hash}.jpg`), 'broken');
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(request())).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

const editionCover = '/api/img?bnfArk=ark%3A%2F12148%2Fcb12345678x&ean=9782723488525';
const editionRequest = (value = editionCover) => new Request(`http://localhost${value}`);
const validImage = () =>
  new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });

it('uses BnF first and never requests DLP after a validated BnF success', async () => {
  const fetcher = vi.fn().mockImplementation(async () => validImage());
  vi.stubGlobal('fetch', fetcher);
  const res = await GET(editionRequest());
  expect(res.status).toBe(200);
  expect(res.headers.get('x-cover-source')).toBe('bnf');
  const source = new URL(res.headers.get('x-cover-source-url')!);
  expect(source.host).toBe('openapi.bnf.fr');
  expect(source.searchParams.get('idArk')).toBe('ark:/12148/cb12345678x');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['404', 'html', 'corrupt', 'network', 'blank'])(
  'falls back to this edition EAN after BnF %s',
  async (kind) => {
    const blank = await sharp({
      create: { width: 120, height: 180, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async () => {
        if (kind === 'network') throw new Error('offline');
        if (kind === '404') return new Response(null, { status: 404 });
        const bytes =
          kind === 'blank'
            ? blank
            : Buffer.from(kind === 'html' ? '<html>missing</html>' : 'corrupt');
        return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg' } });
      })
      .mockImplementationOnce(async () => validImage());
    vi.stubGlobal('fetch', fetcher);
    const res = await GET(editionRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-cover-source')).toBe('dlp');
    expect(res.headers.get('x-cover-source-url')).toBe(urls[0]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toBe(urls[0]);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(120);
  },
);
it('falls back after a BnF deadline without starting DLP early', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockImplementationOnce(async () => validImage());
  vi.stubGlobal('fetch', fetcher);
  const result = GET(editionRequest());
  await vi.advanceTimersByTimeAsync(7999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  vi.useRealTimers();
  const res = await result;
  expect(res.headers.get('x-cover-source')).toBe('dlp');
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});
it('keeps failure uncacheable when both candidates fail', async () => {
  settings.enabled = true;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(null, { status: 404 })),
  );
  const res = await GET(editionRequest());
  expect(res.status).toBe(502);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('x-cover-source')).toBeNull();
  expect(await readdir(settings.dir)).toEqual([]);
});
it('does not invent an ISBN fallback when the notice has no EAN', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(editionRequest(editionCover.split('&')[0]))).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  'bnfArk=invalid',
  'bnfArk=ark:/12148/cb123&ean=9782723488524',
  'bnfArk=ark:/12148/cb123&ean=0306406152',
  'bnfArk=ark:/12148/cb123&u=https://example.org',
  'bnfArk=ark:/12148/cb123&ean=9782723488525&ean=9780306406157',
])('rejects invalid/ambiguous edition parameters: %s', async (query) => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(editionRequest('/api/img?' + query))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves attribution on a cached fallback and purges both edition candidates', async () => {
  settings.enabled = true;
  const fetcher = vi
    .fn()
    .mockImplementation(async (input) =>
      new URL(String(input)).host === 'openapi.bnf.fr'
        ? new Response(null, { status: 404 })
        : validImage(),
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await GET(editionRequest())).headers.get('x-cover-source')).toBe('dlp');
  const second = await GET(editionRequest());
  expect(second.headers.get('x-cover-source')).toBe('dlp');
  expect(second.headers.get('x-cover-source-url')).toBe(urls[0]);
  expect(fetcher).toHaveBeenCalledTimes(3); // BnF retried; DLP bytes served from cache.
  await purgeCachedImage(editionCover);
  expect(await readdir(settings.dir)).toEqual([]);
});
it('does not let a cross-source redirect falsify attribution', async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      async () => new Response(null, { status: 302, headers: { location: urls[0]! } }),
    )
    .mockImplementationOnce(async () => validImage());
  vi.stubGlobal('fetch', fetcher);
  const res = await GET(editionRequest());
  expect(res.headers.get('x-cover-source')).toBe('dlp');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
