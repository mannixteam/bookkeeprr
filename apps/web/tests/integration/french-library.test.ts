import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from './helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';
import { insertVolume, listVolumesBySeries } from '@/server/db/volumes';
import { withFrenchIsbn } from '@/lib/bnf-marker';
import * as catalog from '@/server/integrations/french-catalog/client';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';

let db: SeedHandle;
beforeEach(async () => { db = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { vi.restoreAllMocks(); db.cleanup(); });
const marker = withFrenchIsbn('[]', '9782723488525');
function input() {
  return { contentType: 'comic' as const, status: 'releasing' as const, titleEnglish: 'Série française', publisher: 'Delcourt', qualityProfileId: db.qpId, rootPath: '/media/Test', extraSearchTermsJson: marker };
}
it('serializes simultaneous adds of the same French edition', async () => {
  const ids = await Promise.all([insertSeries(input()), insertSeries(input())]);
  expect(ids[0]).toBe(ids[1]);
  const different = await insertSeries({ ...input(), publisher: 'Autre éditeur', extraSearchTermsJson: withFrenchIsbn('[]', '9782205084338') });
  expect(different).not.toBe(ids[0]);
});
it('hydrates recent ISBN editions idempotently without shrinking or deleting local metadata', async () => {
  const id = await insertSeries({ ...input(), totalVolumes: 8 });
  await insertVolume({ seriesId: id, number: 1, title: 'Local', metadataJson: JSON.stringify({ custom: 'keep' }) });
  const volume = { ark: null, number: 1, title: 'Série française - Tome 1', publisher: 'Delcourt', year: 2026, isbn: '9782723488525', ean: '9782723488525', coverUrl: null, description: null, creators: [] };
  vi.spyOn(catalog, 'getFrenchCatalogSeries').mockResolvedValue({ bnfArk: null, frenchIsbn: '9782723488525', name: 'Série française', publisher: 'Delcourt', startYear: 2026, volumeCount: 3, coverUrl: null, description: null, contentType: 'comic', volumes: [volume, { ...volume, number: 2 }, { ...volume, number: null, title: 'Album non numéroté' }] });
  await metadataHydrateDescriptor.handler({ seriesId: id }, 1);
  await metadataHydrateDescriptor.handler({ seriesId: id }, 2);
  const volumes = await listVolumesBySeries(id);
  expect(volumes.map(v => v.number).sort()).toEqual([1, 2]);
  expect(JSON.parse(volumes.find(v => v.number === 1)!.metadataJson!)).toMatchObject({ custom: 'keep', source: 'googlebooks', ean: '9782723488525' });
  expect((await getSeries(id))?.totalVolumes).toBe(8);
});
