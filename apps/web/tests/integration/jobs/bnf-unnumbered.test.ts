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
