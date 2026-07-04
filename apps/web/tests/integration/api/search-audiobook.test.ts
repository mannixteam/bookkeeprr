import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/series/search/route';
import {
  __setITunesFetcherForTests,
  __resetITunesForTests,
} from '@/server/integrations/itunes';
import { expectShape } from '../../helpers/assert-spec';
import { SeriesSearchResponse } from '@/server/openapi/schemas/series';
import { ErrorResponse } from '@/server/openapi/schemas/common';

// Audnex has no title-search endpoint (/books?title= 404s) — the audiobook
// search branch now uses iTunes. iTunes hits carry no ASIN/narrator/runtime.
const ITUNES_OK = JSON.stringify({
  resultCount: 1,
  results: [
    {
      collectionId: 1234567,
      collectionName: 'Project Hail Mary (Unabridged)',
      trackName: 'Project Hail Mary',
      artistName: 'Andy Weir',
      releaseDate: '2021-05-04T07:00:00Z',
      artworkUrl100: 'https://is1-ssl.example/100x100bb.jpg',
    },
  ],
});

beforeEach(() => {
  __resetITunesForTests();
});
afterEach(() => {
  __resetITunesForTests();
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/series/search?${qs}`);
}

describe('GET /api/series/search?contentType=audiobook (iTunes)', () => {
  it('maps iTunes hits to the audiobook search shape (asin null)', async () => {
    __setITunesFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => ITUNES_OK,
    }));
    const res = await GET(req('contentType=audiobook&q=project+hail+mary'));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=audiobook');
    const json = (await res.json()) as {
      contentType: string;
      results: Array<{
        asin: string | null;
        title: string;
        author: string | null;
        narrator: string | null;
        releaseYear: number | null;
        runtimeMinutes: number | null;
      }>;
    };
    expect(json.contentType).toBe('audiobook');
    expect(json.results).toHaveLength(1);
    const r = json.results[0]!;
    expect(r.asin).toBeNull(); // iTunes carries no Amazon ASIN
    expect(r.title).toBe('Project Hail Mary'); // prefers the cleaner trackName
    expect(r.author).toBe('Andy Weir');
    expect(r.releaseYear).toBe(2021);
    expect(r.narrator).toBeNull();
    expect(r.runtimeMinutes).toBeNull();
  });

  it('returns empty results when iTunes finds nothing', async () => {
    __setITunesFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ resultCount: 0, results: [] }),
    }));
    const res = await GET(req('contentType=audiobook&q=zzzznope'));
    expect(res.status).toBe(200);
    await expectShape(SeriesSearchResponse, res, 'GET /api/series/search?contentType=audiobook');
    const json = (await res.json()) as { results: unknown[] };
    expect(json.results).toEqual([]);
  });

  it('returns 502 on an iTunes upstream error', async () => {
    __setITunesFetcherForTests(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }));
    const res = await GET(req('contentType=audiobook&q=x'));
    expect(res.status).toBe(502);
    await expectShape(ErrorResponse, res, 'GET /api/series/search?contentType=audiobook');
  });
});
