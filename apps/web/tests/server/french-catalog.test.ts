import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchFrenchComicSeries, getFrenchComicSeries } from '@/server/integrations/bnf';
import { searchFrenchCatalog } from '@/server/integrations/french-catalog/client';
import { candidates, decodeCover, resolveCover } from '@/server/integrations/french-catalog/covers';
import { mergeFrenchSeries, volumeTitle, type FrenchSeries } from '@/server/integrations/french-catalog/model';
import { buildSeriesBody } from '@/components/add/quick-add';
import { toSheetHit } from '@/components/add/result-adapter';
import { extractFrenchIsbn, withFrenchIsbn, serializeVisibleTermsPreservingBnf } from '@/lib/bnf-marker';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next/package.json')] })) as (input: unknown) => { png(): { toBuffer(): Promise<Buffer> } };
const image = () => sharp({ create: { width: 120, height: 180, channels: 3, background: '#ac8040' } }).png().toBuffer();
const record = (title = 'Sacrifice. Tome 1', lang = 'fre', extra = '') => `<record><recordData><dc><identifier>https://catalogue.bnf.fr/ark:/12148/cb12345678x</identifier><identifier>ISBN 9782723488525</identifier><title>${title}</title><language>${lang}</language><publisher>Urban Comics</publisher><subject>Bandes dessinées</subject>${extra}</dc></recordData></record>`;
const xml = (records: string, next?: number) => new Response(`<searchRetrieveResponse><numberOfRecords>${next ? 2 : 1}</numberOfRecords>${next ? `<nextRecordPosition>${next}</nextRecordPosition>` : ''}<records>${records}</records></searchRetrieveResponse>`);
afterEach(() => vi.unstubAllGlobals());

describe('French catalogue', () => {
  it('keeps French records and rejects explicit foreign language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xml(record('Sacrifice. Tome 1', 'eng'))));
    expect(await searchFrenchComicSeries('Sacrifice')).toEqual([]);
  });
  it('does not infer ordinal from dates or descriptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xml(record('Album nommé', 'fre', '<description>Suite du tome 9</description>'))));
    const hits = await searchFrenchComicSeries('Album nommé');
    expect(hits[0]?.volumes[0]?.number).toBeNull();
  });
  it('follows SRU pagination and deduplicates repeated ARKs', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(xml(record(), 2)).mockResolvedValueOnce(xml(record()));
    vi.stubGlobal('fetch', fetcher);
    const hits = await searchFrenchComicSeries('Sacrifice');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(fetcher.mock.calls[1]![0] as string).searchParams.get('startRecord')).toBe('2');
    expect(hits[0]?.volumes).toHaveLength(1);
  });
  it('retains verified notices when a later SRU page fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(xml(record(), 2)).mockRejectedValueOnce(new Error('timeout')));
    const hits = await searchFrenchComicSeries('Sacrifice');
    expect(hits[0]?.volumes).toHaveLength(1);
  });
  it('surfaces SRU diagnostics instead of pretending the search was empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<searchRetrieveResponse><diagnostics><diagnostic>bad CQL</diagnostic></diagnostics></searchRetrieveResponse>')));
    await expect(searchFrenchComicSeries('Sacrifice')).rejects.toThrow('diagnostic');
  });
  it('never hydrates an unrelated ARK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(xml(record())));
    await expect(getFrenchComicSeries('ark:/12148/cb87654321z')).rejects.toThrow('not found');
  });
  it('searches ISBN using the ISBN index', async () => {
    const fetcher = vi.fn().mockResolvedValue(xml(record())); vi.stubGlobal('fetch', fetcher);
    await searchFrenchComicSeries('9782723488525');
    expect(new URL(fetcher.mock.calls[0]![0] as string).searchParams.get('query')).toBe('bib.isbn any "9782723488525"');
  });
  it('preserves spin-offs and edition qualifiers', () => {
    expect(volumeTitle('Les Légendaires Origines - Tome 02')).toEqual({ name: 'Les Légendaires Origines', number: 2 });
    expect(volumeTitle('Batman Intégrale')).toEqual({ name: 'Batman Intégrale', number: null });
  });
  it('uses French Google Books when BnF is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('bnf.fr')) throw new Error('offline');
      return Response.json({ items: [{ id: 'abc', volumeInfo: { title: 'Nouvelle BD - Tome 1', language: 'fr', publisher: 'Delcourt', categories: ['Comics & Graphic Novels'], industryIdentifiers: [{ identifier: '9782723488525' }] } }] });
    }));
    const hits = await searchFrenchCatalog('Nouvelle BD');
    expect(hits[0]?.frenchIsbn).toBe('9782723488525');
    expect(hits[0]?.volumes[0]?.number).toBe(1);
  });
  it('rejects foreign Google editions and French novels', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('bnf.fr') ? xml('') : Response.json({ items: [
      { id: 'a', volumeInfo: { title: 'Comic', language: 'en', categories: ['Comics'], industryIdentifiers: [{ identifier: '9782723488525' }] } },
      { id: 'b', volumeInfo: { title: 'Roman', language: 'fr', categories: ['Fiction'], industryIdentifiers: [{ identifier: '9782723488525' }] } },
    ] })));
    expect(await searchFrenchCatalog('Roman')).toEqual([]);
  });
  it('preserves ISBN marker across visible term edits', () => {
    expect(extractFrenchIsbn(serializeVisibleTermsPreservingBnf(withFrenchIsbn('[]', '9782723488525'), ['alias']))).toBe('9782723488525');
  });
  it('carries French manga identities through both add flows', () => {
    const r = { contentType: 'manga' as const, title: 'Manga FR', source: 'frenchbooks', sourceId: 'fr-isbn:9782723488525', sources: { frenchIsbn: '9782723488525' }, inLib: false, detail: null };
    expect(buildSeriesBody(r, { rootPath: '/media/comics/Manga FR', qualityProfileId: 1 })).toMatchObject({ contentType: 'manga', frenchIsbn: '9782723488525' });
    expect(toSheetHit(r)).toMatchObject({ hit: { contentType: 'manga', frenchIsbn: '9782723488525' } });
  });
  it('keeps BnF primary when an identical edition is supplemented', () => {
    const base: FrenchSeries = { bnfArk: 'ark:/12148/cb123x', frenchIsbn: '9782723488525', name: 'Sacrifice', publisher: 'Urban Comics', startYear: 2024, volumeCount: 1, coverUrl: null, description: 'BnF', contentType: 'comic', volumes: [{ ark: 'ark:/12148/cb123x', number: 1, title: 'Sacrifice 1', isbn: '9782723488525', ean: '9782723488525', publisher: 'Urban Comics', year: 2024, coverUrl: null, description: null, creators: [] }] };
    const merged = mergeFrenchSeries([base], [{ ...base, bnfArk: null, description: 'Google', volumes: [{ ...base.volumes[0]!, ark: null, googleId: 'abc' }] }]);
    expect(merged).toHaveLength(1); expect(merged[0]?.description).toBe('BnF'); expect(merged[0]?.volumes[0]?.googleId).toBe('abc');
    expect(base.volumes[0]?.googleId).toBeUndefined();
  });
});
describe('real cover validation', () => {
  it('rejects HTML masquerading as an image', async () => { await expect(decodeCover(Buffer.from('<html>error</html>'))).rejects.toThrow(); });
  it('decodes a real PNG and returns WebP', async () => { const bytes = await decodeCover(await image()); expect(Buffer.from(bytes).toString('ascii', 8, 12)).toBe('WEBP'); });
  it('rejects truncated images', async () => { const bytes = await image(); await expect(decodeCover(bytes.subarray(0, 35))).rejects.toThrow(); });
  it('uses only validated book identifiers in candidate URLs', () => { expect(candidates({ ean: '9782723488524', ark: 'http://127.0.0.1', googleId: '../x' })).toEqual([]); });
  it('falls back after a broken image and validates the next one', async () => {
    const bytes = await image(); const fetcher = vi.fn().mockResolvedValueOnce(new Response('<html>404</html>', { headers: { 'content-type': 'image/jpeg' } })).mockResolvedValueOnce(new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetcher); const cover = await resolveCover({ ean: '9782723488525' });
    expect(cover?.source).toBe('covers.openlibrary.org'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not follow redirects to local or arbitrary hosts', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    vi.stubGlobal('fetch', fetcher); expect(await resolveCover({ ean: '9782723488525' })).toBeNull();
    expect(fetcher.mock.calls.every(call => !String(call[0]).includes('127.0.0.1'))).toBe(true);
  });
});
