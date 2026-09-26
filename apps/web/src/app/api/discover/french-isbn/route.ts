import { NextResponse } from 'next/server';
import { bookEan } from '@/server/integrations/bnf/identifiers';
import { lookupFrenchIsbn } from '@/server/discover/french-isbn';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ean = bookEan(new URL(request.url).searchParams.get('isbn') ?? '');
  if (!ean) return NextResponse.json({ error: 'ISBN invalide' }, { status: 400 });
  try {
    return NextResponse.json({ result: await lookupFrenchIsbn(ean) });
  } catch {
    return NextResponse.json({ error: 'Recherche bibliographique indisponible' }, { status: 502 });
  }
}
