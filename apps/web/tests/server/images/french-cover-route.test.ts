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
