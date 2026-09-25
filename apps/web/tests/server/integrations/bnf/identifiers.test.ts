import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchFrenchComicSeries, getFrenchComicSeries } from '@/server/integrations/bnf';

const ark = 'ark:/12148/cb12345678x';
function record(ids: string[], options: { ark?: string; title?: string; year?: number } = {}) {
  return `<record><recordData><dc><identifier>${options.ark ?? ark}</identifier><title>${options.title ?? 'Sacrifice. Tome 1'}</title><publisher>Urban Comics</publisher><language>fre</language><subject>Bandes dessinées</subject><date>${options.year ?? 2020}</date>${ids.map(id => `<identifier>${id}</identifier>`).join('')}</dc></recordData></record>`;
}
const response = (records: string) => new Response(`<searchRetrieveResponse><records>${records}</records></searchRetrieveResponse>`);
async function volume(ids: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => response(record(ids))));
  return (await searchFrenchComicSeries('Sacrifice'))[0]!.volumes[0]!;
}
afterEach(() => vi.unstubAllGlobals());

describe('BnF ISBN/EAN edition identity', () => {
  it('normalizes a hyphenated ISBN-13 in catalog prose', async () => {
    expect(await volume(['ISBN 978-2-7234-8852-5 (br.) : 7,20 EUR'])).toMatchObject({ isbn: '9782723488525', ean: '9782723488525' });
  });
  it('converts ISBN-10 to its equivalent edition EAN and cover key', async () => {
    expect(await volume(['ISBN 0-306-40615-2'])).toMatchObject({ isbn: '0306406152', ean: '9780306406157', coverUrl: 'https://bdi.dlpdomain.com/album/9780306406157/couv/M385x862/cover.jpg' });
  });
  it('normalizes a lowercase ISBN-10 check digit X', async () => {
    expect(await volume(['ISBN 080442957x'])).toMatchObject({ isbn: '080442957X', ean: '9780804429573' });
  });
  it.each(['9782723488524', '0306406153', '4006381333931', '97827234885250', '978X723488525'])('rejects an invalid or non-book identifier: %s', async value => {
    const hit = await volume([value]);
    expect(hit).toMatchObject({ isbn: null, ean: null });
    expect(hit.coverUrl).toContain('openapi.bnf.fr');
  });
  it('skips a corrupt identifier before a valid one', async () => {
    expect(await volume(['9782723488524', '9782723488525'])).toMatchObject({ isbn: '9782723488525', ean: '9782723488525' });
  });
  it('keeps ISBN and EAN on the same edition when the notice lists different editions', async () => {
    expect(await volume(['0-306-40615-2', '9782723488525'])).toMatchObject({ isbn: '0306406152', ean: '9780306406157' });
  });
  it('does not concatenate adjacent identifiers', async () => {
    expect(await volume(['9782723488525 9780306406157'])).toMatchObject({ isbn: '9782723488525', ean: '9782723488525' });
  });
  it('uses the ISBN index for a normalized ISBN lookup', async () => {
    const fetcher = vi.fn(async (_url: string) => response(record(['0306406152'])));
    vi.stubGlobal('fetch', fetcher);
    await searchFrenchComicSeries('ISBN 0-306-40615-2');
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get('query')).toBe('bib.isbn any "9780306406157"');
  });
  it('never hydrates a different ARK when the requested notice is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(record(['9782723488525']))));
    await expect(getFrenchComicSeries('ark:/12148/cb87654321z')).rejects.toThrow('not found');
  });
  it.each(['Sacrifice. Tome 1', 'Sacrifice'])('preserves the explicitly selected edition among reissues: %s', async title => {
    const seed = record(['0306406152'], { title, year: 1990 });
    const newer = record(['9782723488525'], { title, year: 2026, ark: 'ark:/12148/cb87654321z' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(seed)).mockResolvedValueOnce(response(seed + newer)));
    const hit = await getFrenchComicSeries(ark, 'Sacrifice');
    expect(hit.volumes.find(v => v.ark === ark)).toMatchObject({ isbn: '0306406152', ean: '9780306406157' });
  });
});
