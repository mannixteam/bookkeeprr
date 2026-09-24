import sharp from 'sharp';
import { bookEan } from '../bnf/identifiers';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const HOSTS = new Set(['bdi.dlpdomain.com', 'openapi.bnf.fr', 'covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com']);
export type CoverKey = { ean?: string | null; ark?: string | null; googleId?: string | null };
export type CoverImage = { bytes: Uint8Array; source: string };
export function candidates(key: CoverKey): string[] {
  const ean = key.ean ? bookEan(key.ean) : null;
  const urls: string[] = [];
  if (ean) urls.push(`https://bdi.dlpdomain.com/album/${ean}/couv/M385x862/cover.jpg`);
  if (key.ark && /^ark:\/12148\/cb[0-9a-z]+$/i.test(key.ark)) {
    const u = new URL('https://openapi.bnf.fr/couverture/image/image/recupererImage');
    u.search = new URLSearchParams({ idArk: key.ark, couverture: '1', taille: 'originale', largeur: '900', hauteur: '1400' }).toString();
    urls.push(String(u));
  }
  if (ean) urls.push(`https://covers.openlibrary.org/b/isbn/${ean}-L.jpg?default=false`);
  if (key.googleId && /^[\w-]{1,100}$/.test(key.googleId)) urls.push(`https://books.google.com/books/content?id=${key.googleId}&printsec=frontcover&img=1&zoom=1&source=gbs_api`);
  return urls;
}
export async function decodeCover(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length > MAX_BYTES) throw new Error('cover too large');
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
  const meta = await image.metadata();
  if (!['jpeg','png','webp','avif','gif'].includes(meta.format ?? '') || !meta.width || !meta.height || meta.width < 80 || meta.height < 100 || (meta.pages ?? 1) > 1) throw new Error('invalid cover');
  // Decode the entire image, not merely its header; truncated files must fail.
  return image.rotate().resize({ width: 900, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}
async function download(url: string, signal: AbortSignal): Promise<Uint8Array> {
  for (let redirects = 0; redirects <= 3; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !HOSTS.has(parsed.host)) throw new Error('forbidden image host');
    const res = await fetch(url, { redirect: 'manual', signal, headers: { accept: 'image/*' } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new Error('missing redirect location');
      url = new URL(location, url).toString();
      continue;
    }
    if (!res.ok || !res.headers.get('content-type')?.toLowerCase().startsWith('image/') || Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) {
      await res.body?.cancel(); throw new Error('upstream image error');
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('empty image');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_BYTES) throw new Error('cover too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
  throw new Error('too many redirects');
}
export async function resolveCover(key: CoverKey): Promise<CoverImage | null> {
  const deadline = AbortSignal.timeout(12_000);
  for (const url of candidates(key)) {
    try {
      const bytes = await download(url, AbortSignal.any([deadline, AbortSignal.timeout(3500)]));
      return { bytes: await decodeCover(bytes), source: new URL(url).host };
    } catch { if (deadline.aborted) break; }
  }
  return null;
}
