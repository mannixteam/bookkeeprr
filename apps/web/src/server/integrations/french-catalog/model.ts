export type FrenchVolume = {
  ark: string | null;
  googleId?: string;
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
export type FrenchSeries = {
  bnfArk: string | null;
  frenchIsbn: string | null;
  name: string;
  publisher: string | null;
  startYear: number | null;
  volumeCount: number;
  coverUrl: string | null;
  description: string | null;
  volumes: FrenchVolume[];
  contentType: 'comic' | 'manga';
};
export function normalized(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** Keep integral/deluxe/spin-off qualifiers; only strip an explicit volume suffix. */
export function volumeTitle(title: string): { name: string; number: number | null } {
  const match = /^(.*?)\s*(?:[-–—:.]\s*)?\b(?:tome|t\.?|volume|vol\.?)\s*0*(\d{1,3})(?!\d)(?:\s*[-–—:.].*)?$/i.exec(title);
  if (!match?.[1]?.trim() || !match[2]) return { name: title.trim(), number: null };
  const n = Number(match[2]);
  return { name: match[1].trim(), number: n > 0 ? n : null };
}
export function frenchCoverUrl(ean: string | null, ark?: string | null, googleId?: string): string | null {
  const qs = new URLSearchParams();
  if (ean) qs.set('ean', ean);
  if (ark) qs.set('ark', ark);
  if (googleId) qs.set('gb', googleId);
  return qs.size ? `/api/french-cover?${qs}` : null;
}
/** Merge only exact series + publisher matches; BnF keeps editorial precedence. */
export function mergeFrenchSeries(primary: FrenchSeries[], supplements: FrenchSeries[]): FrenchSeries[] {
  const out = primary.map(s => ({ ...s, volumes: s.volumes.map(v => ({ ...v })) }));
  for (const other of supplements) {
    const match = out.find(s => s.publisher && other.publisher && normalized(s.name) === normalized(other.name) && normalized(s.publisher) === normalized(other.publisher));
    if (!match) { out.push({ ...other, volumes: other.volumes.map(v => ({ ...v })) }); continue; }
    for (const volume of other.volumes) {
      const same = match.volumes.find(v => (v.ean && v.ean === volume.ean) || (v.number != null && v.number === volume.number));
      if (same) {
        if (same.ean === volume.ean && volume.googleId) {
          same.googleId = volume.googleId;
          same.coverUrl = frenchCoverUrl(same.ean, same.ark, same.googleId);
        }
      } else match.volumes.push({ ...volume });
    }
    match.volumes.sort((a,b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.title.localeCompare(b.title, 'fr'));
    match.volumeCount = Math.max(match.volumeCount, other.volumeCount, match.volumes.length);
    const years = [match.startYear, other.startYear].filter((y): y is number => y != null);
    match.startYear = years.length ? Math.min(...years) : null;
    match.coverUrl = match.volumes[0]?.coverUrl ?? match.coverUrl;
  }
  return out;
}
