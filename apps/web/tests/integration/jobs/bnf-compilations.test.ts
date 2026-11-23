import { afterEach, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';
import { withBnfArk } from '@/lib/bnf-marker';
let db: SeedHandle | undefined;
afterEach(() => { vi.unstubAllGlobals(); db?.cleanup(); db = undefined; });
it('does not overwrite standard library volumes or totals with a selected integral', async () => {
  db = await seedDb({ skipDefaultSeries: true });
  const ark = 'ark:/12148/cb12345678x';
  const id = await insertSeries({ contentType: 'comic', status: 'releasing', titleEnglish: 'Mirage', rootPath: '/media/Test', qualityProfileId: db.qpId, totalVolumes: 8, extraSearchTermsJson: withBnfArk('[]', ark) });
  await insertVolume({ seriesId: id, number: 1, title: 'Tome local' });
  const beforeVolumes = await listVolumesBySeries(id);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(`<searchRetrieveResponse><records><record><recordData><dc><identifier>${ark}</identifier><title>Mirage. Intégrale. Tome 1</title><publisher>Delcourt</publisher><language>fre</language><relation>Titre d’ensemble : Mirage ; 1</relation></dc></recordData></record></records></searchRetrieveResponse>`)));
  await metadataHydrateDescriptor.handler({ seriesId: id }, 1);
  expect(await listVolumesBySeries(id)).toEqual(beforeVolumes);
  expect((await getSeries(id))?.totalVolumes).toBe(8);
});
