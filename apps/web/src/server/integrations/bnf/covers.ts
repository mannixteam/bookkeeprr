import { bookEan } from './identifiers';

export type BnfCoverCandidate = { source: 'bnf' | 'dlp'; url: string };

/** Both identifiers must come from the same selected bibliographic notice. */
export function bnfCoverCandidates(ark: string, ean: string | null): BnfCoverCandidate[] {
  if (!/^ark:\/12148\/cb[0-9a-z]+$/i.test(ark)) throw new Error('invalid BnF ARK');
  if (ean !== null && (!/^97[89]\d{10}$/.test(ean) || bookEan(ean) !== ean)) {
    throw new Error('invalid canonical EAN');
  }
  const url = new URL('https://openapi.bnf.fr/couverture/image/image/recupererImage');
  url.searchParams.set('idArk', ark);
  url.searchParams.set('couverture', '1');
  url.searchParams.set('taille', 'originale');
  url.searchParams.set('largeur', '900');
  url.searchParams.set('hauteur', '1400');
  const candidates: BnfCoverCandidate[] = [{ source: 'bnf', url: url.href }];
  if (ean)
    candidates.push({
      source: 'dlp',
      url: `https://bdi.dlpdomain.com/album/${ean}/couv/M385x862/cover.jpg`,
    });
  return candidates;
}

/** Stable edition-specific URL; image selection/validation remains on demand. */
export function bnfEditionCoverUrl(ark: string, ean: string | null): string {
  bnfCoverCandidates(ark, ean);
  const params = new URLSearchParams({ bnfArk: ark });
  if (ean) params.set('ean', ean);
  return `/api/img?${params}`;
}

/** Parse only our local edition URL, never infer an ARK from a title or ISBN. */
export function candidatesForBnfCoverUrl(value: string): BnfCoverCandidate[] | null {
  if (!value.startsWith('/api/img?')) return null;
  const params = new URL(value, 'http://localhost').searchParams;
  if (!params.has('bnfArk')) return null;
  return bnfCoverCandidates(params.get('bnfArk')!, params.get('ean'));
}
