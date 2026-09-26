import { bookEan, extractBookIdentifiers } from './identifiers';
import { XMLParser } from 'fast-xml-parser';

const SRU_BASE = 'https://catalogue.bnf.fr/api/SRU';
const COVER_BASE = 'https://openapi.bnf.fr/couverture/image/image/recupererImage';
const TIMEOUT_MS = 20_000;
const MAX_RECORDS = 100;
const MAX_PAGES = 5;

export class BnfError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'BnfError';
  }
}

export type BnfComicVolume = {
  ark: string;
  number: number | null;
  title: string;
  publisher: string | null;
  year: number | null;
  isbn: string | null;
  ean: string | null;
  coverUrl: string | null;
  description: string | null;
  creators: string[];
};

export type BnfComicSeriesHit = {
  bnfArk: string;
  name: string;
  publisher: string | null;
  startYear: number | null;
  volumeCount: number;
  coverUrl: string | null;
  description: string | null;
  volumes: BnfComicVolume[];
};

type ParsedRecord = {
  ark: string;
  title: string;
  baseTitle: string;
  rawNumber: number | null;
  publisher: string | null;
  year: number | null;
  isbn: string | null;
  ean: string | null;
  description: string | null;
  creators: string[];
  languages: string[];
  comicLike: boolean;
  relations: string[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function arr(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return scalar(obj['#text'] ?? obj.text);
  }
  return null;
}

function strings(value: unknown): string[] {
  return arr(value).map(scalar).filter((v): v is string => Boolean(v));
}

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\[(?:texte|image)[^\]]*\]/gi, ' ')
    .split(/\s+\/\s+/)[0]!
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:./-]+$/g, '')
    .trim();
}

function cleanRelation(raw: string): string {
  return cleanTitle(
    raw
      .replace(/^\s*(?:appartient\s+[àa]\s*:|collection\s*:|titre\s+d['’]ensemble\s*:?)\s*/i, '')
      .replace(/\s+(?:voir|notice|lien)\b.*$/i, '')
      .replace(/\s*[.;]\s*\d{1,3}\s*$/g, ''),
  );
}

function relationNumber(relations: string[]): number | null {
  for (const relation of relations) {
    const explicit = relation.match(/\b(?:tomes?|t\.|volumes?|vol\.?)\s*0*(\d{1,3})\b/i);
    if (explicit?.[1]) return Number(explicit[1]);
    const trailing = relation.match(/[.;]\s*0*(\d{1,3})\s*$/);
    if (trailing?.[1]) {
      const n = Number(trailing[1]);
      if (n >= 1 && n <= 300) return n;
    }
  }
  return null;
}

function titleAndVolume(raw: string, context: string): { baseTitle: string; number: number | null } {
  const title = cleanTitle(raw);
  const haystack = `${title} ${context}`;
  const explicit = haystack.match(/\b(?:tomes?|t\.|volumes?|vol\.?|livres?)\s*0*(\d{1,3})\b/i);
  let number = explicit?.[1] ? Number(explicit[1]) : null;
  if (number != null && (number < 1 || number > 300)) number = null;

  let baseTitle = title;
  const suffix = title.match(
    /^(.*?)(?:\s*[.\-–—:]\s*)?(?:tomes?|t\.|volumes?|vol\.?|livres?)\s*0*(\d{1,3})\b/i,
  );
  if (suffix?.[1]) {
    baseTitle = suffix[1].trim();
    if (number == null && suffix[2]) number = Number(suffix[2]);
  } else {
    const dotted = title.match(/^(.*?)\s*\.\s*0*(\d{1,3})\s*$/);
    if (dotted?.[1] && dotted[2]) {
      const n = Number(dotted[2]);
      if (n >= 1 && n <= 300) {
        baseTitle = dotted[1].trim();
        number ??= n;
      }
    }
  }
  return { baseTitle: baseTitle || title, number };
}

function extractArk(blob: string): string | null {
  return blob.match(/ark:\/12148\/cb[0-9a-z]+/i)?.[0] ?? null;
}

function firstYear(values: string[]): number | null {
  for (const value of values) {
    const match = value.match(/\b(19\d{2}|20\d{2})\b/);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

const KNOWN_PUBLISHERS: Array<[RegExp, string]> = [
  [/\burban(?:\s+comics)?\b/i, 'Urban Comics'],
  [/\bpanini(?:\s+comics)?\b/i, 'Panini Comics'],
  [/\bdelcourt\b/i, 'Delcourt'],
  [/\bsoleil\b/i, 'Soleil'],
  [/\bgl[eé]nat\b/i, 'Glénat'],
  [/\bdargaud\b/i, 'Dargaud'],
  [/\bdupuis\b/i, 'Dupuis'],
  [/\bcasterman\b/i, 'Casterman'],
  [/\bkana\b/i, 'Kana'],
  [/\bki-?oon\b/i, 'Ki-oon'],
  [/\bpika\b/i, 'Pika'],
  [/\bkurokawa\b/i, 'Kurokawa'],
  [/\bakata\b/i, 'Akata'],
  [/\bvega\b/i, 'Vega'],
  [/\bkomikku\b/i, 'Komikku'],
  [/\bbamboo\b/i, 'Bamboo'],
  [/\bankama\b/i, 'Ankama'],
  [/\ble\s+lombard\b/i, 'Le Lombard'],
  [/\bhumano[iï]des\b/i, 'Les Humanoïdes Associés'],
  [/\bdrakoo\b/i, 'Drakoo'],
  [/\bmana\s+books\b/i, 'Mana Books'],
  [/\bhachette\b/i, 'Hachette'],
  [/\balbert\s+ren[eé]\b/i, 'Éditions Albert René'],
];

function canonicalPublisher(raw: string | null): string | null {
  if (!raw) return null;
  for (const [pattern, name] of KNOWN_PUBLISHERS) {
    if (pattern.test(raw)) return name;
  }
  return raw
    .replace(/\b(?:DL|cop\.|copyright|impr\.)\s*(?:19|20)\d{2}\b/gi, '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/^\s*[^:]{1,35}:\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.-]+$/g, '')
    .trim() || raw;
}

function publisherLooksComic(publisher: string | null): boolean {
  return KNOWN_PUBLISHERS.some(([pattern]) => pattern.test(publisher ?? ''));
}

function parseRecord(record: unknown): ParsedRecord | null {
  if (!record || typeof record !== 'object') return null;
  const rec = record as Record<string, unknown>;
  const recordData = (rec.recordData ?? rec) as Record<string, unknown>;
  const dc = (recordData.dc ?? recordData) as Record<string, unknown>;
  const titles = strings(dc.title);
  if (titles.length === 0) return null;

  const blob = JSON.stringify(record);
  const ark = extractArk(blob);
  if (!ark) return null;

  const descriptions = strings(dc.description);
  const relations = strings(dc.relation);
  const subjects = strings(dc.subject);
  const publishers = strings(dc.publisher);
  const creators = [...strings(dc.creator), ...strings(dc.contributor)];
  const langs = strings(dc.language);
  const types = strings(dc.type);
  const ids = strings(dc.identifier);

  const title = [...titles].map(cleanTitle).filter(Boolean).sort((a, b) => a.length - b.length)[0]!;
  if (!title) return null;
  // A description may mention another album; it cannot identify this ordinal.
  const context = titles.join(' | ');
  const tv = titleAndVolume(title, context);
  const publisher = canonicalPublisher(publishers[0] ?? null);
  const id = extractBookIdentifiers(ids);
  const description = descriptions[0] ?? null;
  const comicHaystack = norm([...subjects, ...descriptions, ...types, publisher ?? ''].join(' '));
  const comicLike =
    /bande dessinee|comic|roman graphique|graphic novel|manga/.test(comicHaystack) ||
    publisherLooksComic(publisher);

  return {
    ark,
    title,
    baseTitle: tv.baseTitle,
    rawNumber: tv.number ?? relationNumber(relations),
    publisher,
    year: firstYear(strings(dc.date)),
    isbn: id.isbn,
    ean: id.ean,
    description,
    creators: [...new Set(creators)],
    languages: langs,
    comicLike,
    relations,
  };
}

function recordList(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const root = parsed as Record<string, unknown>;
  const response = (root.searchRetrieveResponse ?? root) as Record<string, unknown>;
  const records = response.records as Record<string, unknown> | undefined;
  return arr(records?.record);
}

function escapeCql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim();
}

async function sru(cql: string, maximumRecords = MAX_RECORDS): Promise<ParsedRecord[]> {
  const url = new URL(SRU_BASE);
  url.searchParams.set('version', '1.2');
  url.searchParams.set('operation', 'searchRetrieve');
  url.searchParams.set('query', cql);
  url.searchParams.set('recordSchema', 'dublincore');
  url.searchParams.set('maximumRecords', String(maximumRecords));

  // One budget covers every request and response body in this SRU lookup.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const records = new Map<string, ParsedRecord>();
  let startRecord = 1;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0 && signal.aborted) break;
    url.searchParams.set('startRecord', String(startRecord));
    try {
      const res = await fetch(new URL(url), {
        headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
        signal,
      });
      if (!res.ok) throw new BnfError(`BnF SRU HTTP ${res.status}`, res.status);
      const xml = await res.text();
      let doc: unknown;
      try {
        doc = parser.parse(xml);
      } catch (err) {
        throw new BnfError(`BnF SRU XML parse failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const rawRecords = recordList(doc);
      for (const raw of rawRecords) {
        const record = parseRecord(raw);
        if (record && !records.has(record.ark)) records.set(record.ark, record);
      }
      if (rawRecords.length === 0) break;
      const root = doc as Record<string, unknown>;
      const response = (root.searchRetrieveResponse ?? root) as Record<string, unknown>;
      const next = Number(scalar(response.nextRecordPosition));
      const totalText = scalar(response.numberOfRecords);
      const total = totalText === null ? null : Number(totalText);
      // Never invent a cursor when the service has not supplied a valid one.
      if (!Number.isSafeInteger(next) || next <= startRecord ||
          (total !== null && Number.isSafeInteger(total) && next > total)) break;
      startRecord = next;
    } catch (err) {
      // A later page must not discard notices already received successfully.
      if (page > 0) break;
      if (err instanceof BnfError) throw err;
      throw new BnfError(`BnF SRU request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return [...records.values()];
}

function coverUrl(record: ParsedRecord): string {
  const isbn = record.ean;
  if (isbn) {
    return `https://bdi.dlpdomain.com/album/${isbn}/couv/M385x862/cover.jpg`;
  }

  const url = new URL(COVER_BASE);
  url.searchParams.set('idArk', record.ark);
  url.searchParams.set('couverture', '1');
  url.searchParams.set('taille', 'originale');
  url.searchParams.set('largeur', '900');
  url.searchParams.set('hauteur', '1400');
  return url.toString();
}

function bestRelationForQuery(record: ParsedRecord, query: string): string | null {
  const q = norm(query);
  if (!q) return null;
  const qTokens = q.split(' ').filter((t) => t.length >= 3);
  const candidates = record.relations
    .map(cleanRelation)
    .filter((r) => r.length >= 3 && r.length <= 140)
    .map((r) => ({ raw: r, normalized: norm(r) }))
    .filter(({ normalized }) => normalized && qTokens.some((token) => normalized.includes(token)));
  candidates.sort((a, b) => {
    const aq = a.normalized.includes(q) ? 1 : 0;
    const bq = b.normalized.includes(q) ? 1 : 0;
    return bq - aq || a.raw.length - b.raw.length;
  });
  return candidates[0]?.raw ?? null;
}

function groupTitle(record: ParsedRecord, query: string): string {
  if (record.rawNumber != null) return record.baseTitle;
  return bestRelationForQuery(record, query) ?? record.baseTitle;
}

function groupKey(record: ParsedRecord, query: string): string {
  return `${norm(groupTitle(record, query))}|${norm(record.publisher)}`;
}

function recordQuality(record: ParsedRecord): number {
  return (record.ean ? 8 : 0) + (record.isbn ? 4 : 0) + (record.description ? 2 : 0) + (record.year ?? 0) / 10000;
}

function chooseRecords(records: ParsedRecord[], preferredArk?: string): Array<{ record: ParsedRecord; number: number | null }> {
  const byNumber = new Map<number, ParsedRecord>();
  const byTitle = new Map<string, ParsedRecord>();
  for (const record of records) {
    if (record.rawNumber != null) {
      const current = byNumber.get(record.rawNumber);
      if (!current || record.ark === preferredArk || (current.ark !== preferredArk && recordQuality(record) > recordQuality(current))) byNumber.set(record.rawNumber, record);
    } else {
      // Keep named albums visible, including in groups with numbered volumes.
      const key = norm(record.title);
      const current = byTitle.get(key);
      if (!current || record.ark === preferredArk || (current.ark !== preferredArk && recordQuality(record) > recordQuality(current))) byTitle.set(key, record);
    }
  }
  return [
    ...[...byNumber.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, record]) => ({ record, number })),
    ...[...byTitle.values()]
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title))
      .map(record => ({ record, number: null })),
  ];
}

function finalizeGroup(records: ParsedRecord[], query: string, preferredArk?: string): BnfComicSeriesHit {
  const selected = chooseRecords(records, preferredArk);
  if (selected.length === 0) throw new BnfError('BnF series group is empty');
  const first = selected[0]!.record;
  const canonical = selected.find(({ number }) => number === 1)?.record ?? first;
  const name = groupTitle(canonical, query);
  const volumes: BnfComicVolume[] = selected.map(({ record, number }) => ({
    ark: record.ark,
    number,
    title: record.title,
    publisher: record.publisher,
    year: record.year,
    isbn: record.isbn,
    ean: record.ean,
    coverUrl: coverUrl(record),
    description: record.description,
    creators: record.creators,
  }));
  const firstPublishedYear = selected
    .map(({ record }) => record.year)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)[0] ?? null;
  // Observed album count is distinct from the highest known ordinal.
  const volumeCount = volumes.length;
  const attribution = `Source des métadonnées et de la couverture : Bibliothèque nationale de France (consultée le ${new Date().toISOString().slice(0, 10)}).`;
  const description = canonical.description ? `${canonical.description}\n\n${attribution}` : attribution;
  return {
    bnfArk: canonical.ark,
    name,
    publisher: canonical.publisher,
    startYear: firstPublishedYear,
    volumeCount,
    coverUrl: coverUrl(canonical),
    description,
    volumes,
  };
}

/** French-only catalog policy: every declared content language must be French.
 * Missing, indeterminate, unsupported and bilingual declarations are not proof
 * of a French-only edition. Never infer language from the publisher or title.
 */
function isConfirmedFrench(record: ParsedRecord): boolean {
  return record.languages.length > 0 && record.languages.every(raw => {
    const value = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return ['fr', 'fre', 'fra', 'francais', 'french'].includes(value) || /^fr[-_][a-z]{2}$/.test(value);
  });
}

function groupRecords(records: ParsedRecord[], query: string, preferredArk?: string): BnfComicSeriesHit[] {
  const groups = new Map<string, ParsedRecord[]>();
  for (const record of records) {
    if (!isConfirmedFrench(record)) continue;
    if (!record.comicLike && !publisherLooksComic(record.publisher)) continue;
    const title = groupTitle(record, query);
    if (!norm(title)) continue;
    const key = groupKey(record, query);
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }

  const q = norm(query);
  return [...groups.values()]
    .map((records) => {
      const hit = finalizeGroup(records, query, preferredArk);
      const title = norm(hit.name);
      const french = records.some(isConfirmedFrench);
      let score = 0;
      if (title === q) score += 100;
      else if (title.startsWith(q) || q.startsWith(title)) score += 60;
      else if (title.includes(q) || q.includes(title)) score += 30;
      if (records.some((r) => r.comicLike)) score += 35;
      if (publisherLooksComic(hit.publisher)) score += 25;
      if (french) score += 10;
      score += Math.min(hit.volumeCount, 20) * 4;
      return { hit, score };
    })
    .filter(({ score }) => score >= 45)
    .sort((a, b) => b.score - a.score || b.hit.volumeCount - a.hit.volumeCount)
    .map(({ hit }) => hit)
    .slice(0, 20);
}

export async function searchFrenchComicSeries(query: string): Promise<BnfComicSeriesHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ean = bookEan(q);
  const cql = ean ? `bib.isbn any "${ean}"` : `(bib.title all "${escapeCql(q)}") and (bib.recordtype any "mon")`;
  const records = await sru(cql);
  return groupRecords(records, q);
}

export async function getFrenchComicSeries(
  seedArk: string,
  preferredTitle?: string | null,
): Promise<BnfComicSeriesHit> {
  if (!/^ark:\/12148\/cb[0-9a-z]+$/i.test(seedArk)) throw new BnfError('invalid BnF ARK');
  const seedRecords = await sru(`bib.persistentid any "${escapeCql(seedArk)}"`, 5);
  const seed = seedRecords.find((r) => r.ark.toLowerCase() === seedArk.toLowerCase());
  if (!seed) throw new BnfError(`BnF record not found: ${seedArk}`, 404);
  if (!isConfirmedFrench(seed)) throw new BnfError('BnF notice excluded: French-only language not confirmed', 422);

  const query = preferredTitle?.trim() || seed.baseTitle;
  const related = await sru(`(bib.title all "${escapeCql(query)}") and (bib.recordtype any "mon")`);
  const all = [...new Map([...related, seed].map((r) => [r.ark, r])).values()];
  const hits = groupRecords(all, query, seed.ark);
  return hits.find((hit) => hit.volumes.some((v) => v.ark.toLowerCase() === seedArk.toLowerCase())) ?? finalizeGroup([seed], query, seed.ark);
}
