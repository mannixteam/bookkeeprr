import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';
import * as bnf from '@/server/integrations/bnf';
import { withBnfArk } from '@/lib/bnf-marker';
let db: SeedHandle;
beforeEach(async () => { db = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { vi.restoreAllMocks(); db.cleanup(); });
const ark = 'ark:/12148/cb12345678x';
const album: bnf.BnfComicVolume = { ark, number: null, title: 'Album nommé', publisher: 'Delcourt', year: 2020, isbn: null, ean: null, coverUrl: null, description: null, creators: [] };
function detail(volumes: bnf.BnfComicVolume[]): bnf.BnfComicSeriesHit {
  return { bnfArk: ark, name: 'Série test', publisher: 'Delcourt', startYear: 2020, volumeCount: volumes.length, coverUrl: null, description: null, volumes };
}
async function series(totalVolumes: number | null = null) {
  return insertSeries({ contentType: 'comic', status: 'releasing', titleEnglish: 'Série test', rootPath: '/media/Test', qualityProfileId: db.qpId, totalVolumes, extraSearchTermsJson: withBnfArk('[]', ark) });
}
it('does not create numbered library volumes or totals from unnumbered albums', async () => {
  const id = await series();
  vi.spyOn(bnf, 'getFrenchComicSeries').mockResolvedValue(detail([album, { ...album, ark: 'ark:/12148/cb87654321z', title: 'Autre album' }]));
  expect(await metadataHydrateDescriptor.handler({ seriesId: id }, 1)).toEqual({ volumesAdded: 0 });
  expect(await listVolumesBySeries(id)).toEqual([]);
  expect((await getSeries(id))?.totalVolumes).toBeNull();
});
it('imports only explicit ordinals and remains idempotent for mixed results', async () => {
  const id = await series();
  vi.spyOn(bnf, 'getFrenchComicSeries').mockResolvedValue(detail([album, { ...album, number: 3, title: 'Tome 3' }]));
  expect(await metadataHydrateDescriptor.handler({ seriesId: id }, 1)).toEqual({ volumesAdded: 1 });
  expect(await metadataHydrateDescriptor.handler({ seriesId: id }, 2)).toEqual({ volumesAdded: 0 });
  expect((await listVolumesBySeries(id)).map(v => v.number)).toEqual([3]);
  expect((await getSeries(id))?.totalVolumes).toBe(3);
});
it('preserves existing numbered volumes and known totals when only unnumbered albums return', async () => {
  const id = await series(8);
  await insertVolume({ seriesId: id, number: 1, title: 'Titre local' });
  vi.spyOn(bnf, 'getFrenchComicSeries').mockResolvedValue(detail([album]));
  await metadataHydrateDescriptor.handler({ seriesId: id }, 1);
  expect(await listVolumesBySeries(id)).toMatchObject([{ number: 1, title: 'Titre local' }]);
  expect((await getSeries(id))?.totalVolumes).toBe(8);
});

it('preserves library rows and totals across repeated real-client hydration of a numbered publisher collection', async () => {
  const id = await series(8);
  // Include the collection number itself to catch accidental metadata overwrites.
  await insertVolume({ seriesId: id, number: 7, title: 'Titre local conservé' });
  const beforeVolumes = await listVolumesBySeries(id);
  const queries: string[] = [];
  const unexpected: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const query = url.searchParams.get('query') ?? '';
    queries.push(query);
    if (url.hostname !== 'catalogue.bnf.fr' || ![
      `bib.persistentid any "${ark}"`,
      '(bib.title all "Série test") and (bib.recordtype any "mon")',
      '(bib.title all "Album nommé") and (bib.recordtype any "mon")',
    ].includes(query)) {
      unexpected.push(url.toString());
      throw new Error('Unexpected provider request');
    }
    return new Response(`<searchRetrieveResponse><records><record><recordData><dc>
      <identifier>${ark}</identifier><title>Album nommé</title>
      <publisher>Delcourt</publisher><language>fre</language>
      <relation>Collection : Romans graphiques ; 7</relation>
      </dc></recordData></record></records></searchRetrieveResponse>`);
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    for (const jobId of [1, 2]) {
      expect(await metadataHydrateDescriptor.handler({ seriesId: id }, jobId)).toEqual({ volumesAdded: 0 });
      expect(await listVolumesBySeries(id)).toEqual(beforeVolumes);
      const hydrated = await getSeries(id);
      expect(hydrated?.totalVolumes).toBe(8);
      expect(hydrated?.titleEnglish).toBe('Album nommé');
      expect(hydrated?.extraSearchTermsJson).toBe(withBnfArk('[]', ark));
    }
    expect(unexpected).toEqual([]);
    expect(queries).toEqual([
      `bib.persistentid any "${ark}"`,
      '(bib.title all "Série test") and (bib.recordtype any "mon")',
      `bib.persistentid any "${ark}"`,
      '(bib.title all "Album nommé") and (bib.recordtype any "mon")',
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
