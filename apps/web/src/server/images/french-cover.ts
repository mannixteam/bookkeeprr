import sharp from 'sharp';
import { isFrenchCoverHost, upstreamImageHeaders } from './allowlist';

export const MAX_COVER_BYTES = 8 * 1024 * 1024;
export const COVER_TIMEOUT_MS = 8000;
const MAX_PIXELS = 20_000_000;

/** Decode all pixels, not just the header. Return safe, canonical JPEG bytes. */
export async function decodeFrenchCover(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw new Error('cover size');
  const input = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PIXELS });
  const meta = await input.metadata();
  if (
    (!['jpeg', 'png', 'webp', 'gif'].includes(meta.format ?? '') &&
      !(meta.format === 'heif' && meta.compression === 'av1')) ||
    !meta.width ||
    !meta.height ||
    meta.width < 80 ||
    meta.height < 100 ||
    meta.width * meta.height > MAX_PIXELS ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error('cover dimensions or format');
  const { data, info } = await input
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .timeout({ seconds: 3 })
    .toBuffer({ resolveWithObject: true });
  // Reject transparent and single-colour "no image" responses (including 1px
  // sentinels rejected above). Do not guess cover identity from aspect ratio.
  let visible = false;
  let varied = false;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3]! > 0) visible = true;
    if (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2]) varied = true;
  }
  if (!visible || !varied) throw new Error('blank cover');
  const result = await sharp(data, { raw: info })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .timeout({ seconds: 3 })
    .toBuffer();
  if (result.length > MAX_COVER_BYTES) throw new Error('cover output size');
  return result;
}

function checkedUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !isFrenchCoverHost(url.host)) {
    throw new Error('cover host');
  }
  // Explicit missing-image destinations must never become accepted covers.
  if (/(?:placeholder|no[-_]?cover|no[-_]?image|image[-_]?indisponible)/i.test(url.pathname)) {
    throw new Error('placeholder destination');
  }
  return url;
}

/** One deadline includes redirects, headers and streaming body; cap actual bytes. */
export async function fetchFrenchCover(target: string): Promise<Buffer> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      void reader?.cancel().catch(() => {});
      reject(new Error('cover timeout'));
    }, COVER_TIMEOUT_MS);
  });
  try {
    const bytes = await Promise.race([
      deadline,
      (async () => {
        let url = checkedUrl(target);
        let response: Response;
        for (let redirects = 0; ; redirects++) {
          response = await fetch(url, {
            signal: controller.signal,
            redirect: 'manual',
            headers: upstreamImageHeaders(url.host),
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          void response.body?.cancel().catch(() => {});
          const location = response.headers.get('location');
          if (redirects >= 3 || !location) throw new Error('cover redirect');
          url = checkedUrl(new URL(location, url).href);
        }
        if (
          response.status !== 200 ||
          !/^image\//i.test(response.headers.get('content-type') ?? '') ||
          !response.body
        ) {
          void response.body?.cancel().catch(() => {});
          throw new Error('cover response');
        }
        if (Number(response.headers.get('content-length')) > MAX_COVER_BYTES) {
          void response.body.cancel().catch(() => {});
          throw new Error('cover size');
        }
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_COVER_BYTES) throw new Error('cover size');
          chunks.push(value);
        }
        controller.signal.throwIfAborted();
        return Buffer.concat(chunks, size);
      })(),
    ]);
    return await decodeFrenchCover(bytes);
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}
