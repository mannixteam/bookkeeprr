import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { POST } from '@/app/api/discover/french-isbn/route';
import { getDb } from '@/server/db/client';
import { series, volumes, jobs } from '@/server/db/schema';
import * as lookup from '@/server/discover/french-isbn';
let db: SeedHandle;
const edition = { source: 'openlibrary' as const, sourceId: '/books/OL123M', sourceUrl: 'https://openlibrary.org/books/OL123M', attribution: 'Open Library', language: 'fr' as const, ean: '9780306406157', isbn: '9780306406157', title: 'Mirage', publisher: 'Delcourt', publishDate: '2026', number: null, coverUrl: null };
beforeEach(async () => { db = await seedDb({ skipDefaultSeries: true }); vi.spyOn(lookup, 'lookupFrenchIsbn').mockResolvedValue(edition); });
afterEach(() => { vi.restoreAllMocks(); db.cleanup(); });
const add = (extra = {}) => POST(new Request('http://localhost/api/discover/french-isbn', { method: 'POST', body: JSON.stringify({ isbn: edition.ean, source: edition.source, sourceId: edition.sourceId, qualityProfileId: db.qpId, ...extra }) }));
it('imports verified provenance without invented ARK, tomes or jobs', async () => {
  const response = await add({ title: 'Forged title', language: 'eng', bnfArk: 'fake' });
  expect(response.status).toBe(201);
  const [row] = await getDb().select().from(series);
  expect(row).toMatchObject({ titleEnglish: 'Mirage', isbn: edition.ean, totalVolumes: null, totalChapters: null, monitoring: 'none', openlibraryId: null, extraSearchTermsJson: '[]' });
  expect(row!.description).toContain('fr'); expect(row!.description).toContain(edition.sourceId); expect(row!.description).toContain(edition.sourceUrl);
  expect(await getDb().select().from(volumes)).toEqual([]);
  expect(await getDb().select().from(jobs)).toEqual([]);
});
it('repeated concurrent adds return the same edition without duplicate rows', async () => {
  const responses = await Promise.all([add(), add()]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
  const bodies = await Promise.all(responses.map(r => r.json()));
  expect(bodies[0].id).toBe(bodies[1].id);
  expect(await getDb().select().from(series)).toHaveLength(1);
});
it.each(['missing', 'changed', 'failure'])('does not import after revalidation is %s', async mode => {
  const spy = vi.mocked(lookup.lookupFrenchIsbn);
  if (mode === 'missing') spy.mockResolvedValue(null);
  else if (mode === 'changed') spy.mockResolvedValue({ ...edition, sourceId: '/books/OL999M' });
  else spy.mockRejectedValue(new Error('offline'));
  expect((await add()).status).toBe(mode === 'failure' ? 502 : 409);
  expect(await getDb().select().from(series)).toEqual([]);
});
it('rejects invalid quality profile without creating a row', async () => {
  expect((await add({ qualityProfileId: 99999 })).status).toBe(400);
  expect(await getDb().select().from(series)).toEqual([]);
});
it('rejects invalid ISBN before lookup', async () => {
  expect((await add({ isbn: 'bad' })).status).toBe(400);
  expect(lookup.lookupFrenchIsbn).not.toHaveBeenCalled();
});
it('adds a BnF ISBN as an edition without launching complete-series hydration', async () => {
  const ark = 'ark:/12148/cb12345678x';
  vi.mocked(lookup.lookupFrenchIsbn).mockResolvedValue({ ...edition, publishDate: undefined, source: 'bnf', sourceId: ark, ark, sourceUrl: `https://catalogue.bnf.fr/${ark}`, attribution: 'Bibliothèque nationale de France', year: 2026, description: null, creators: [], number: 3 });
  expect((await add({ source: 'bnf', sourceId: ark })).status).toBe(201);
  const [row] = await getDb().select().from(series);
  expect(row).toMatchObject({ isbn: edition.ean, totalVolumes: null, extraSearchTermsJson: '[]', monitoring: 'none' });
  expect(row!.description).toContain(ark);
  expect(await getDb().select().from(volumes)).toEqual([]);
  expect(await getDb().select().from(jobs)).toEqual([]);
});
