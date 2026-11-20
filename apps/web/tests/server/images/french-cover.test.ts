import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  decodeFrenchCover,
  fetchFrenchCover,
  MAX_COVER_BYTES,
  COVER_TIMEOUT_MS,
} from '@/server/images/french-cover';

const url = 'https://bdi.dlpdomain.com/album/9782723488525/couv/M385x862/cover.jpg';
let png: Buffer;
let jpg: Buffer;
// Deterministic, varied pixels: real decodable fixtures, no network dependency.
beforeAll(async () => {
  const data = Buffer.alloc(120 * 180 * 3);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37) % 251;
  png = await sharp(data, { raw: { width: 120, height: 180, channels: 3 } })
    .png()
    .toBuffer();
  jpg = await sharp(png).jpeg().toBuffer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const response = (bytes: Uint8Array, headers = {}) =>
  new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg', ...headers } });

describe('real French cover decoding', () => {
  it.each(['png', 'jpeg', 'webp', 'gif', 'avif'] as const)(
    'decodes %s and derives output MIME from pixels',
    async (format) => {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const result = await decodeFrenchCover(bytes);
      expect(await sharp(result).metadata()).toMatchObject({
        format: 'jpeg',
        width: 120,
        height: 180,
      });
    },
  );
  it.each(['html', 'empty', 'fake signature', 'truncated jpeg', 'truncated png'])(
    'rejects %s',
    async (kind) => {
      const bytes =
        kind === 'html'
          ? Buffer.from('<html>not an image</html>')
          : kind === 'empty'
            ? Buffer.alloc(0)
            : kind === 'fake signature'
              ? Buffer.from([255, 216, 255, 0, 0])
              : kind === 'truncated jpeg'
                ? jpg.subarray(0, jpg.length - 100)
                : png.subarray(0, png.length - 60);
      await expect(decodeFrenchCover(bytes)).rejects.toThrow();
    },
  );
  it.each([
    [1, 1],
    [79, 180],
    [120, 99],
    [5000, 5000],
  ])('rejects unusable dimensions %ix%i', async (width, height) => {
    const bytes = await sharp({ create: { width, height, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await expect(decodeFrenchCover(bytes)).rejects.toThrow();
  });
  it.each([0, 1])('rejects blank/transparent placeholders (alpha %s)', async (alpha) => {
    const bytes = await sharp({
      create: {
        width: 120,
        height: 180,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha },
      },
    })
      .png()
      .toBuffer();
    await expect(decodeFrenchCover(bytes)).rejects.toThrow('blank');
  });
});

describe('bounded cover requests', () => {
  it('validates bytes even when MIME lies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(Buffer.from('<html>error</html>'))));
    await expect(fetchFrenchCover(url)).rejects.toThrow();
  });
  it('accepts a genuine image with inaccurate image MIME', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(png)));
    expect((await sharp(await fetchFrenchCover(url)).metadata()).format).toBe('jpeg');
  });
  it.each([404, 500, 204, 206])('rejects HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(fetchFrenchCover(url)).rejects.toThrow('response');
  });
  it('rejects HTML content-type even with valid image bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(png, { 'content-type': 'text/html' })),
    );
    await expect(fetchFrenchCover(url)).rejects.toThrow('response');
  });
  it('rejects advertised oversized bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(png, { 'content-length': String(MAX_COVER_BYTES + 1) })),
    );
    await expect(fetchFrenchCover(url)).rejects.toThrow('size');
  });
  it('bounds streamed bytes despite a false length and cancels the stream', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'image/jpeg', 'content-length': '1' } }),
        ),
    );
    await expect(fetchFrenchCover(url)).rejects.toThrow('size');
    expect(cancel).toHaveBeenCalled();
  });
  it.each(['headers', 'body'])('times out stalled %s', async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        phase === 'headers'
          ? new Promise(() => {})
          : Promise.resolve(
              new Response(new ReadableStream({ cancel }), {
                headers: { 'content-type': 'image/jpeg' },
              }),
            ),
      );
    vi.stubGlobal('fetch', fetcher);
    const assertion = expect(fetchFrenchCover(url)).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(COVER_TIMEOUT_MS);
    await assertion;
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    if (phase === 'body') expect(cancel).toHaveBeenCalled();
  });
  it.each([
    'http://openapi.bnf.fr/image',
    'https://evil.example/image',
    'https://openapi.bnf.fr/no-cover.jpg',
  ])('rejects redirect to %s before fetching it', async (location) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchFrenchCover(url)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('follows an allowed redirect with the same deadline signal', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/real.jpg' } }),
      )
      .mockResolvedValueOnce(response(png));
    vi.stubGlobal('fetch', fetcher);
    await fetchFrenchCover(url);
    expect(fetcher.mock.calls[0]![1].signal).toBe(fetcher.mock.calls[1]![1].signal);
  });
  it('caps redirect loops', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: url } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchFrenchCover(url)).rejects.toThrow('redirect');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
