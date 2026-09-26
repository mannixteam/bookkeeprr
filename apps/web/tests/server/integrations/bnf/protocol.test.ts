import { afterEach, expect, it, vi } from 'vitest';
import { getFrenchComicSeries, searchFrenchComicSeries } from '@/server/integrations/bnf';

const record = (id: number) => `<record><recordData><dc><identifier>ark:/12148/cb1234567${id}x</identifier><title>Série test. Tome ${id}</title><publisher>Delcourt</publisher><language>fre</language></dc></recordData></record>`;
const envelope = (content: string) => `<searchRetrieveResponse>${content}</searchRetrieveResponse>`;
const records = (id: number) => `<records>${record(id)}</records>`;
const diagnostic = '<diagnostics><diag:diagnostic xmlns:diag="http://www.loc.gov/zing/srw/diagnostic/"><diag:uri>info:srw/diagnostic/1/10</diag:uri><diag:message>Query syntax error</diag:message></diag:diagnostic></diagnostics>';
const invalidPages = [
  ['truncated XML', `<searchRetrieveResponse>${records(2)}`],
  ['mismatched XML', `<searchRetrieveResponse>${records(2)}</wrong>`],
  ['empty body', ''],
  ['plain text', 'Service unavailable'],
  ['HTML', '<html><body>Maintenance</body></html>'],
  ['wrong envelope containing records', `<other>${records(2)}</other>`],
  ['bare records', records(2)],
  ['multiple response roots', envelope(records(2)) + envelope(records(3))],
  ['diagnostics only', envelope(diagnostic)],
  ['diagnostics alongside records', envelope(records(2) + diagnostic + '<nextRecordPosition>201</nextRecordPosition>')],
] as const;

afterEach(() => vi.unstubAllGlobals());
it.each(invalidPages)('rejects first-page %s with an explicit protocol error', async (_name, xml) => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(xml));
  vi.stubGlobal('fetch', fetcher);
  await expect(searchFrenchComicSeries('Série test')).rejects.toMatchObject({ name: 'BnfError', status: 502 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(invalidPages)('retains only verified earlier notices after later-page %s', async (_name, xml) => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response(envelope(records(1) + '<nextRecordPosition>101</nextRecordPosition>')))
    .mockResolvedValueOnce(new Response(xml));
  vi.stubGlobal('fetch', fetcher);
  const [hit] = await searchFrenchComicSeries('Série test');
  expect(hit?.volumes.map(v => v.number)).toEqual([1]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('accepts a legitimate empty result', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(envelope('<numberOfRecords>0</numberOfRecords>'))));
  await expect(searchFrenchComicSeries('Série test')).resolves.toEqual([]);
});
it('accepts a namespace-prefixed SRU response with an XML declaration', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>1</srw:numberOfRecords>${records(1)}</srw:searchRetrieveResponse>`;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(xml)));
  expect((await searchFrenchComicSeries('Série test'))[0]?.volumes.map(v => v.number)).toEqual([1]);
});
it('does not misreport a seed protocol failure as a missing ARK', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(envelope(diagnostic))));
  await expect(getFrenchComicSeries('ark:/12148/cb12345671x')).rejects.toMatchObject({ name: 'BnfError', status: 502 });
});
