import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getImageCacheDir, imageCacheSetting } from '@/server/db/settings/library';
import {
  isAllowlistedImageHost,
  isCfGatedImageHost,
  isFrenchCoverHost,
  upstreamImageHeaders,
} from '@/server/images/allowlist';
import { clearanceForHost, invalidateClearance } from '@/server/images/cf-clearance';

import { decodeFrenchCover, fetchFrenchCover, MAX_COVER_BYTES } from '@/server/images/french-cover';

import { bnfCoverCandidates } from '@/server/integrations/bnf/covers';

export const dynamic = 'force-dynamic';

/** Map an upstream content-type (or fall back to the URL) to a file extension. */
function extFor(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/jpeg') || ct.startsWith('image/jpg')) return '.jpg';
  if (ct.startsWith('image/png')) return '.png';
  if (ct.startsWith('image/webp')) return '.webp';
  if (ct.startsWith('image/avif')) return '.avif';
  if (ct.startsWith('image/gif')) return '.gif';
  const m = /\.(jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.exec(url);
  if (m) return `.${m[1]!.toLowerCase().replace('jpeg', 'jpg')}`;
  return '.img';
}

const CACHE_CONTROL = 'public, max-age=604800, immutable';

/**
 * Fetch a Cloudflare-gated image directly using the clearance (cf_clearance
 * cookie + matching User-Agent) obtained for its host via FlareSolverr. The
 * clearance is UA- and IP-bound, so we send the solved UA verbatim instead of
 * the default bookkeeprr UA. On a 403 the clearance has gone stale: drop it and
 * re-solve once. Returns null when no clearance is available (FlareSolverr off
 * or solve failed) — the caller responds 502 and the cover falls back to a tint.
 */
async function fetchCfGated(url: string, host: string): Promise<Response | null> {
  const clearance = await clearanceForHost(host);
  if (!clearance) return null;

  const headers = {
    ...upstreamImageHeaders(host),
    'user-agent': clearance.userAgent,
    cookie: clearance.cookie,
  };
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (res.status !== 403) return res;

  // Stale clearance — invalidate, re-solve, retry once.
  invalidateClearance(host);
  const fresh = await clearanceForHost(host);
  if (!fresh) return res;
  return fetch(url, {
    headers: { ...upstreamImageHeaders(host), 'user-agent': fresh.userAgent, cookie: fresh.cookie },
    redirect: 'follow',
  });
}

function contentTypeForExt(ext: string): string {
  switch (ext) {
    case '.jpg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Image proxy for external cover art. Browsers load `/api/img?u=<url>`; the
 * server fetches the allowlisted upstream and streams it back. Used to dodge
 * MangaDex's hotlink placeholder (see {@link upstreamImageHeaders}) and to give
 * us a single point to control caching + headers for cover images.
 *
 * When the image cache setting is enabled, fetched bytes are persisted to disk
 * (content-addressed by sha256 of the URL) and served from disk on subsequent
 * requests without hitting the upstream.
 */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has('bnfArk')) {
    let candidates;
    try {
      if (
        params.has('u') ||
        params.getAll('bnfArk').length !== 1 ||
        params.getAll('ean').length > 1
      )
        throw new Error('ambiguous cover');
      candidates = bnfCoverCandidates(params.get('bnfArk')!, params.get('ean'));
    } catch {
      return new NextResponse('invalid edition cover', { status: 400 });
    }
    for (const candidate of candidates) {
      // Reuse the same decoder/cache acceptance path. A local function call,
      // not a loopback HTTP request. Only validated 200 responses can win.
      const response = await GET(
        new Request(`http://localhost/api/img?u=${encodeURIComponent(candidate.url)}`),
      );
      if (response.ok) {
        response.headers.set('x-cover-source', candidate.source);
        response.headers.set('x-cover-source-url', candidate.url);
        return response;
      }
      await response.body?.cancel();
    }
    return new NextResponse('no valid edition cover', {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  }
  const target = params.get('u');
  if (!target) return new NextResponse('missing u', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse('bad url', { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !isAllowlistedImageHost(parsed.host)) {
    return new NextResponse('forbidden host', { status: 403 });
  }

  const { enabled } = await imageCacheSetting.get();
  const hash = createHash('sha256').update(target).digest('hex');

  if (isFrenchCoverHost(parsed.host)) {
    // A separate namespace prevents pre-validation cache entries being served.
    const fileName = `fr-v1-${hash}.jpg`;
    let bytes: Buffer | undefined;
    if (enabled) {
      try {
        const file = join(await getImageCacheDir(), fileName);
        if ((await stat(file)).size <= MAX_COVER_BYTES) {
          bytes = await decodeFrenchCover(await readFile(file));
        }
      } catch {
        /* Missing or invalid cache: try the upstream. */
      }
    }
    if (!bytes) {
      try {
        bytes = await fetchFrenchCover(target, parsed.host);
      } catch {
        return new NextResponse('invalid cover', {
          status: 502,
          headers: { 'cache-control': 'no-store' },
        });
      }
      if (enabled) {
        try {
          const dir = await getImageCacheDir();
          await mkdir(dir, { recursive: true });
          const file = join(dir, fileName);
          const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
          await writeFile(tmp, bytes);
          await rename(tmp, file);
        } catch {
          /* A cache failure must not hide a validated cover. */
        }
      }
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // Cache HIT: serve from disk without touching the upstream. The extension is
  // unknown without the upstream content-type, so probe the candidate exts.
  if (enabled) {
    const dir = await getImageCacheDir();
    for (const ext of ['.jpg', '.png', '.webp', '.avif', '.gif', '.img']) {
      const file = join(dir, hash + ext);
      try {
        const bytes = await readFile(file);
        return new NextResponse(new Uint8Array(bytes), {
          status: 200,
          headers: { 'content-type': contentTypeForExt(ext), 'cache-control': CACHE_CONTROL },
        });
      } catch {
        // not this ext — keep probing
      }
    }
  }

  let upstream: Response;
  try {
    if (isCfGatedImageHost(parsed.host)) {
      const res = await fetchCfGated(parsed.toString(), parsed.host);
      if (!res) return new NextResponse('no cloudflare clearance', { status: 502 });
      upstream = res;
    } else {
      upstream = await fetch(parsed.toString(), {
        headers: upstreamImageHeaders(parsed.host),
        redirect: 'follow',
      });
    }
  } catch {
    return new NextResponse('upstream fetch failed', { status: 502 });
  }
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !contentType.startsWith('image/')) {
    return new NextResponse('upstream error', { status: 502 });
  }

  // Cover URLs are content-addressed (the filename embeds a hash), so the bytes
  // never change for a given URL — cache hard at the browser + any CDN.
  if (!enabled) {
    return new NextResponse(upstream.body, {
      status: 200,
      headers: { 'content-type': contentType, 'cache-control': CACHE_CONTROL },
    });
  }

  // Cache MISS with caching on: buffer the bytes so we can persist + serve them.
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  try {
    const dir = await getImageCacheDir();
    await mkdir(dir, { recursive: true });
    const file = join(dir, hash + extFor(contentType, target));
    // Atomic write: temp file + rename so a partial write is never observable.
    const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
  } catch (err) {
    // Degrade to pass-through: a cache-write failure must never drop the cover.
    console.warn('[api/img] failed to write cache file, serving pass-through', err);
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: { 'content-type': contentType, 'cache-control': CACHE_CONTROL },
  });
}
