import { NextResponse } from 'next/server';
import { resolveCover, type CoverImage } from '@/server/integrations/french-catalog/covers';
import { bookEan } from '@/server/integrations/bnf/identifiers';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cache = new Map<string, { until: number; image: CoverImage | null }>();
const pending = new Map<string, Promise<CoverImage | null>>();
export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).searchParams;
  const ean = qs.get('ean'), ark = qs.get('ark'), googleId = qs.get('gb');
  if ((!ean && !ark && !googleId) || (ean && !bookEan(ean)) || (ark && !/^ark:\/12148\/cb[0-9a-z]{1,30}$/i.test(ark)) || (googleId && !/^[\w-]{1,100}$/.test(googleId))) return new NextResponse('invalid cover identifiers', { status: 400 });
  const key = JSON.stringify([ean ? bookEan(ean) : null, ark, googleId]);
  let image: CoverImage | null;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) image = cached.image;
  else {
    let task = pending.get(key);
    if (!task) {
      if (pending.size >= 6) return new NextResponse('cover service busy', { status: 503, headers: { 'retry-after': '2' } });
      task = resolveCover({ ean, ark, googleId }); pending.set(key, task);
    }
    try { image = await task; } finally { pending.delete(key); }
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { image, until: Date.now() + (image ? 3600_000 : 30_000) });
  }
  if (!image) return new NextResponse('no valid cover available', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new NextResponse(new Uint8Array(image.bytes), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=3600', 'x-cover-source': image.source, 'x-content-type-options': 'nosniff' } });
}
