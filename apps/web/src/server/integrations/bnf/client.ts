import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { extractBookIdentifiers } from './identifiers';
import { frenchCoverUrl } from '../french-catalog/model';

const SRU_BASE = 'https://catalogue.bnf.fr/api/SRU';
const TIMEOUT_MS = 20_000;
const MAX_RECORDS = 100;

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
  contentType?: 'comic' | 'manga';
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
  language: string | null;
  comicLike: boolean;
  manga: boolean;
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
    /^(.*?)(?:\s*[.\-–—:]\s*)?\b(?:tomes?|t\.|volumes?|vol\.?|livres?)\s*0*(\d{1,3})\b/i,
  );
  if (suffix?.[1]) {
    baseTitle = suffix[1].trim();
    if (number == null && suffix[2]) number = Number(suffix[2]);
  } else {
    const dotted = title.match(/^(.*?)\s*\.\s*0*(\d{1,3})(?:\s*[,.:]\s*.*)?\s*$/);
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
  // Descriptions may mention other volumes; only titles/relations identify this item.
  const context = titles.join(' | ');
  const tv = titleAndVolume(title, context);
  const publisher = canonicalPublisher(publishers[0] ?? null);
  const id = extractBookIdentifiers(ids);
  const description = descriptions[0] ?? null;
  const language = langs[0] ?? null;
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
    language,
    comicLike,
    manga: /manga/.test(comicHaystack),
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
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const found = new Map<string, ParsedRecord>();
  let start = 1;
  for (let page = 0; page < 5; page++) {
    const url = new URL(SRU_BASE);
    url.search = new URLSearchParams({ version: '1.2', operation: 'searchRetrieve', query: cql,
      recordSchema: 'dublincore', maximumRecords: String(maximumRecords), startRecord: String(start) }).toString();
    try {
    const res = await fetch(url, { headers: { accept: 'application/xml,text/xml' }, signal });
    if (!res.ok) throw new BnfError(`BnF SRU HTTP ${res.status}`, res.status);
    const xml = await res.text();
    if (xml.length > 4_000_000 || XMLValidator.validate(xml) !== true) throw new BnfError('Invalid BnF XML response');
    const doc = parser.parse(xml) as { searchRetrieveResponse?: { diagnostics?: unknown; nextRecordPosition?: string; numberOfRecords?: string } };
    const root = doc.searchRetrieveResponse;
    if (!root || root.diagnostics) throw new BnfError('BnF SRU diagnostic or unexpected response');
    const rows = recordList(doc);
    for (const row of rows) { const record = parseRecord(row); if (record) found.set(record.ark, record); }
    const next = Number(root.nextRecordPosition ?? start + rows.length);
    const total = Number(root.numberOfRecords ?? 0);
    if (!rows.length || next <= start || next > total || maximumRecords < MAX_RECORDS) break;
    start = next;
    } catch (error) {
      // Later pages are best effort: a slow page must not discard verified notices.
      if (found.size) break;
      throw error;
    }
  }
  return [...found.values()];
}

function coverUrl(record: ParsedRecord): string {
  return frenchCoverUrl(record.ean, record.ark)!;
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
  if (record.rawNumber != null && norm(record.baseTitle) !== norm(record.title)) return record.baseTitle;
  return bestRelationForQuery(record, query) ?? record.baseTitle;
}

function groupKey(record: ParsedRecord, query: string): string {
  return `${norm(groupTitle(record, query))}|${norm(record.publisher)}`;
}

function recordQuality(record: ParsedRecord): number {
  return (record.ean ? 8 : 0) + (record.isbn ? 4 : 0) + (record.description ? 2 : 0) + (record.year ?? 0) / 10000;
}

function chooseRecords(records: ParsedRecord[]): Array<{ record: ParsedRecord; number: number | null }> {
  const hasNumbered = records.some((r) => r.rawNumber != null);
  if (hasNumbered) {
    const byNumber = new Map<number, ParsedRecord>();
    for (const record of records) {
      if (record.rawNumber == null) continue;
      const current = byNumber.get(record.rawNumber);
      if (!current || recordQuality(record) > recordQuality(current)) byNumber.set(record.rawNumber, record);
    }
    const numbered = [...byNumber.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, record]) => ({ record, number }));
    return [...numbered, ...records.filter(r => r.rawNumber == null).filter((r, i, all) => all.findIndex(other => norm(other.title) === norm(r.title)) === i).map(record => ({ record, number: null }))];
  }

  // Named albums (classic Franco-Belgian series) often have several reissues in
  // BnF. Keep one record per album title without inventing a volume number.
  const byTitle = new Map<string, ParsedRecord>();
  for (const record of records) {
    const key = norm(record.title);
    const current = byTitle.get(key);
    if (!current || recordQuality(record) > recordQuality(current)) byTitle.set(key, record);
  }
  return [...byTitle.values()]
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title))
    .map((record) => ({ record, number: null }));
}

function finalizeGroup(records: ParsedRecord[], query: string): BnfComicSeriesHit {
  const selected = chooseRecords(records);
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
  const volumeCount = volumes.length;
  const attribution = `Source des métadonnées : Bibliothèque nationale de France (consultée le ${new Date().toISOString().slice(0, 10)}).`;
  const description = canonical.description ? `${canonical.description}\n\n${attribution}` : attribution;
  return {
    bnfArk: canonical.ark,
    contentType: records.some(r => r.manga) ? 'manga' : 'comic',
    name,
    publisher: canonical.publisher,
    startYear: firstPublishedYear,
    volumeCount,
    coverUrl: coverUrl(canonical),
    description,
    volumes,
  };
}

function groupRecords(records: ParsedRecord[], query: string): BnfComicSeriesHit[] {
  const groups = new Map<string, ParsedRecord[]>();
  for (const record of records) {
    if (record.language && !/^(fre|fr|fra)\b|francais/i.test(norm(record.language))) continue;
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
      const hit = finalizeGroup(records, query);
      const title = norm(hit.name);
      const french = records.some((r) => /^(fre|fr|fra)\b|francais/i.test(norm(r.language)));
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
  const ean = extractBookIdentifiers([q]).ean;
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

  const query = preferredTitle?.trim() || seed.baseTitle;
  const related = await sru(`(bib.title all "${escapeCql(query)}") and (bib.recordtype any "mon")`);
  const all = [...new Map([seed, ...related].map((r) => [r.ark, r])).values()];
  const hits = groupRecords(all, query);
  // Reissues can replace the seed in chooseRecords. Match its group, never an unrelated first hit.
  return hits.find((hit) => norm(hit.name) === norm(groupTitle(seed, query)) && norm(hit.publisher) === norm(seed.publisher)) ?? finalizeGroup([seed], query);
}

