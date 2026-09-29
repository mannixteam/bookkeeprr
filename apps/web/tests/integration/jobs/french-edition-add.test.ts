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
  const { publishDate: _publishDate, ...bnfEdition } = edition;
  vi.mocked(lookup.lookupFrenchIsbn).mockResolvedValue({ ...bnfEdition, source: 'bnf', sourceId: ark, ark, sourceUrl: `https://catalogue.bnf.fr/${ark}`, attribution: 'Bibliothèque nationale de France', year: 2026, description: null, creators: [], number: 3 });
  expect((await add({ source: 'bnf', sourceId: ark })).status).toBe(201);
  const [row] = await getDb().select().from(series);
  expect(row).toMatchObject({ isbn: edition.ean, totalVolumes: null, extraSearchTermsJson: '[]', monitoring: 'none' });
  expect(row!.description).toContain(ark);
  expect(await getDb().select().from(volumes)).toEqual([]);
  expect(await getDb().select().from(jobs)).toEqual([]);
});

async function seedExistingVolume(metadata: string, contentType: 'comic' | 'ebook' = 'comic') {
  const [parent] = await getDb().insert(series).values({
    contentType, titleEnglish: edition.title, status: 'releasing', monitoring: 'all',
    rootPath: '/media/existing', qualityProfileId: db.qpId, description: 'Keep this description',
  }).returning();
  await getDb().insert(volumes).values({ seriesId: parent!.id, number: 7, title: 'My selected edition', metadataJson: metadata });
  return parent!;
}
const snapshot = async () => ({ series: await getDb().select().from(series), volumes: await getDb().select().from(volumes), jobs: await getDb().select().from(jobs) });
const bnfEdition = () => ({ ...edition, publishDate: undefined, source: 'bnf' as const, sourceId: 'ark:/12148/cb12345678x', ark: 'ark:/12148/cb12345678x', sourceUrl: 'https://catalogue.bnf.fr/ark:/12148/cb12345678x', attribution: 'Bibliothèque nationale de France', year: 2026, description: null, creators: [], number: 7 });

it.each(['bnf', 'openlibrary'] as const)('recognizes existing volume identifiers for %s without changing library records', async source => {
  const verified = source === 'bnf' ? bnfEdition() : edition;
  vi.mocked(lookup.lookupFrenchIsbn).mockResolvedValue(verified);
  const parent = await seedExistingVolume(JSON.stringify({ isbn: '0-306-40615-2', ean: edition.ean, source: 'legacy', coverUrl: '/keep.jpg' }));
  const before = await snapshot();
  const responses = await Promise.all([add({ source, sourceId: verified.sourceId }), add({ source, sourceId: verified.sourceId })]);
  for (const response of responses) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: parent.id, created: false });
  }
  expect(lookup.lookupFrenchIsbn).toHaveBeenCalledTimes(2);
  expect(await snapshot()).toEqual(before);
});
it.each([
  { isbn: '0-306-40615-2' }, { ean: edition.ean }, { isbn: '978-0-306-40615-7' },
  { ean: 'broken', isbn: '0306406152' }, { isbn: 123, ean: edition.ean },
])('recognizes a valid standalone or equivalent legacy identifier: %j', async meta => {
  const parent = await seedExistingVolume(JSON.stringify(meta));
  const response = await add();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: parent.id, created: false });
  expect(await getDb().select().from(series)).toHaveLength(1);
});
it.each([
  '{}', '{broken', 'null', '[]', '"0306406152"',
  JSON.stringify({ isbn: ['0306406152'] }), JSON.stringify({ ean: 9780306406157 }),
  JSON.stringify({ isbn: '0306406153' }),
  JSON.stringify({ isbn: '9782723488525' }),
  JSON.stringify({ isbn: '9782723488525', ean: edition.ean }),
  JSON.stringify({ isbn: '0306406152', ean: '9782723488525' }),
])('does not equate malformed, different or contradictory identifiers: %s', async metadata => {
  const parent = await seedExistingVolume(metadata);
  const before = await snapshot();
  const response = await add();
  expect(response.status).toBe(201);
  expect((await response.json()).id).not.toBe(parent.id);
  const after = await snapshot();
  expect(after.series).toHaveLength(2);
  expect(after.series.find(row => row.id === parent.id)).toEqual(parent);
  expect(after.volumes).toEqual(before.volumes);
  expect(after.jobs).toEqual(before.jobs);
});
it('does not use a matching ebook volume to suppress a comic edition', async () => {
  const parent = await seedExistingVolume(JSON.stringify({ isbn: '0306406152' }), 'ebook');
  const response = await add();
  expect(response.status).toBe(201);
  expect((await response.json()).id).not.toBe(parent.id);
});
it.each(['missing', 'changed', 'failure'])('still revalidates the provider despite an existing volume: %s', async mode => {
  await seedExistingVolume(JSON.stringify({ isbn: '0306406152' }));
  const before = await snapshot();
  const spy = vi.mocked(lookup.lookupFrenchIsbn);
  if (mode === 'missing') spy.mockResolvedValue(null);
  else if (mode === 'changed') spy.mockResolvedValue({ ...edition, sourceId: '/books/OL999M' });
  else spy.mockRejectedValue(new Error('offline'));
  expect((await add()).status).toBe(mode === 'failure' ? 502 : 409);
  expect(await snapshot()).toEqual(before);
});
