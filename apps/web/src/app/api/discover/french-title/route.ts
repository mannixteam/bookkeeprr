import { NextResponse } from 'next/server';
import { lookupFrenchTitle } from '@/server/discover/french-title';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const values = new URL(request.url).searchParams.getAll('title');
  const title = values[0]?.trim() ?? '';
  if (values.length !== 1 || title.length < 2 || title.length > 200) {
    return NextResponse.json({ error: 'Titre invalide (2 à 200 caractères)' }, { status: 400 });
  }
  try {
    return NextResponse.json(await lookupFrenchTitle(title));
  } catch {
    return NextResponse.json({ error: 'Recherche bibliographique indisponible' }, { status: 502 });
  }
}
