import { z } from 'zod';
import { searchFrenchComicSeries, getFrenchComicSeries, type BnfComicSeriesHit } from '../bnf';
import { bookEan, extractBookIdentifiers } from '../bnf/identifiers';
import { frenchCoverUrl, mergeFrenchSeries, normalized, volumeTitle, type FrenchSeries } from './model';

const ResponseSchema = z.object({ items: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), volumeInfo: z.object({
  title: z.string(), subtitle: z.string().optional(), language: z.string().optional(),
  publisher: z.string().optional(), publishedDate: z.string().optional(),
  description: z.string().optional(), authors: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  industryIdentifiers: z.array(z.object({ identifier: z.string() })).optional(),
}) })).optional() });

async function googleFrench(query: string, apiKey = ''): Promise<FrenchSeries[]> {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', query);
  url.searchParams.set('langRestrict', 'fr');
  url.searchParams.set('maxResults', '40');
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Google Books français HTTP ${response.status}`);
  const data = ResponseSchema.parse(await response.json());
  const out: FrenchSeries[] = [];
  for (const { id, volumeInfo: v } of data.items ?? []) {
    if (v.language !== 'fr') continue;
    // A French language code alone does not make a novel a comic.
    const categories = (v.categories ?? []).join(' ');
    if (!/comic|graphic novel|bande[s]? dessinee|manga/i.test(normalized(categories))) continue;
    const { isbn, ean } = extractBookIdentifiers((v.industryIdentifiers ?? []).map(i => i.identifier));
    if (!ean) continue;
    const fullTitle = v.subtitle ? `${v.title} - ${v.subtitle}` : v.title;
    const parsed = volumeTitle(fullTitle);
    const year = /^(\d{4})/.exec(v.publishedDate ?? '');
    const coverUrl = frenchCoverUrl(ean, null, id);
    out.push({ bnfArk: null, frenchIsbn: ean, name: parsed.name, publisher: v.publisher ?? null,
      startYear: year ? Number(year[1]) : null, volumeCount: 1, coverUrl, description: v.description ?? null,
      contentType: /manga/i.test(categories) ? 'manga' : 'comic',
      volumes: [{ ark: null, googleId: id, number: parsed.number, title: fullTitle, publisher: v.publisher ?? null,
        year: year ? Number(year[1]) : null, isbn, ean, coverUrl, description: v.description ?? null, creators: v.authors ?? [] }],
    });
  }
  return mergeFrenchSeries([], out);
}
function fromBnf(hit: BnfComicSeriesHit): FrenchSeries {
  const volumes = hit.volumes.map(v => ({ ...v, coverUrl: frenchCoverUrl(v.ean, v.ark) }));
  return { ...hit, volumes, contentType: hit.contentType ?? 'comic', frenchIsbn: volumes[0]?.ean ?? null, coverUrl: volumes[0]?.coverUrl ?? null };
}
export async function searchFrenchCatalog(query: string, apiKey = ''): Promise<FrenchSeries[]> {
  const [bnf, google] = await Promise.allSettled([searchFrenchComicSeries(query), googleFrench(bookEan(query) ? `isbn:${bookEan(query)}` : query, apiKey)]);
  if (bnf.status === 'rejected' && google.status === 'rejected') throw new Error(`Catalogue français indisponible (BnF: ${bnf.reason instanceof Error ? bnf.reason.message : 'échec'} ; Google Books: ${google.reason instanceof Error ? google.reason.message : 'échec'}). Réessayer plus tard.`);
  return mergeFrenchSeries(bnf.status === 'fulfilled' ? bnf.value.map(fromBnf) : [], google.status === 'fulfilled' ? google.value : []);
}
export async function getFrenchCatalogSeries(seed: { ark?: string | null; isbn?: string | null; title?: string | null }, apiKey = ''): Promise<FrenchSeries> {
  if (seed.ark) {
    const bnf = fromBnf(await getFrenchComicSeries(seed.ark, seed.title));
    const supplements = await googleFrench(bnf.name, apiKey).catch(() => []);
    return mergeFrenchSeries([bnf], supplements)[0]!;
  }
  const ean = bookEan(seed.isbn ?? '');
  if (!ean) throw new Error('ISBN français invalide');
  const candidates = await googleFrench(`isbn:${ean}`, apiKey);
  const exact = candidates.find(s => s.volumes.some(v => v.ean === ean));
  if (!exact) throw new Error('Édition française introuvable : aucune modification de la bibliothèque');
  const related = await searchFrenchCatalog(exact.name, apiKey).catch(() => []);
  const merged = mergeFrenchSeries(related, [exact]);
  return merged.find(s => normalized(s.name) === normalized(exact.name) && normalized(s.publisher) === normalized(exact.publisher)) ?? exact;
}
