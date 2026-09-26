import { afterEach, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';
import { withBnfArk } from '@/lib/bnf-marker';
let db: SeedHandle | undefined;
const ark = (n: number) => `ark:/12148/cb1234567${n}x`;
const record = (n: number, isbn: string, number = 1) => `<record><recordData><dc><identifier>${ark(n)}</identifier><identifier>${isbn}</identifier><title>Mirage. Tome ${number}</title><publisher>Delcourt</publisher><language>fre</language></dc></recordData></record>`;
const response = (xml: string) => new Response(`<searchRetrieveResponse><records>${xml}</records></searchRetrieveResponse>`);
afterEach(() => { vi.unstubAllGlobals(); db?.cleanup(); db = undefined; });
async function setup() {
  db = await seedDb({ skipDefaultSeries: true });
  return insertSeries({ contentType: 'comic', status: 'releasing', titleEnglish: 'Mirage', rootPath: '/media/Test', qualityProfileId: db.qpId, extraSearchTermsJson: withBnfArk('[]', ark(2)) });
}
it('writes one row per ordinal and preserves the selected edition across repeated hydration', async () => {
  const id = await setup(); const seed = record(2, '0306406152');
  vi.stubGlobal('fetch', vi.fn(async (url) => response(new URL(String(url)).searchParams.get('query')!.includes('persistentid') ? seed : seed + record(1, '9782723488525'))));
  expect(await metadataHydrateDescriptor.handler({ seriesId: id }, 1)).toEqual({ volumesAdded: 1 });
  expect(await metadataHydrateDescriptor.handler({ seriesId: id }, 2)).toEqual({ volumesAdded: 0 });
  const rows = await listVolumesBySeries(id);
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]!.metadataJson)).toMatchObject({ bnfArk: ark(2), ean: '9780306406157' });
});
it('does not overwrite an existing other tome with a different edition when its notice is absent', async () => {
  const id = await setup(); const seed = record(2, '0306406152');
  await insertVolume({ seriesId: id, number: 2, title: 'Mon édition', metadataJson: JSON.stringify({ source: 'bnf', bnfArk: ark(4), ean: '9780804429573' }) });
  const before = (await listVolumesBySeries(id))[0];
  vi.stubGlobal('fetch', vi.fn(async (url) => response(new URL(String(url)).searchParams.get('query')!.includes('persistentid') ? seed : seed + record(3, '9782723488525', 2))));
  await metadataHydrateDescriptor.handler({ seriesId: id }, 1);
  expect((await listVolumesBySeries(id)).find(v => v.number === 2)).toEqual(before);
});
it('matches an existing ISBN-10 to its EAN instead of switching to another available edition', async () => {
  const id = await setup(); const seed = record(2, '9780804429573');
  await insertVolume({ seriesId: id, number: 2, metadataJson: JSON.stringify({ isbn: '0306406152' }) });
  const related = seed + record(1, '9782723488525', 2) + record(3, '9780306406157', 2);
  vi.stubGlobal('fetch', vi.fn(async (url) => response(new URL(String(url)).searchParams.get('query')!.includes('persistentid') ? seed : related)));
  await metadataHydrateDescriptor.handler({ seriesId: id }, 1);
  const rows = await listVolumesBySeries(id);
  expect(rows).toHaveLength(2);
  expect(JSON.parse(rows.find(v => v.number === 2)!.metadataJson)).toMatchObject({ bnfArk: ark(3), ean: '9780306406157' });
});
