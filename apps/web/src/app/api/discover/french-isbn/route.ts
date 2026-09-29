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

export async function POST(request: Request) {
  const { z } = await import('zod');
  const parsed = z.object({
    isbn: z.string().refine(value => bookEan(value) !== null),
    source: z.enum(['bnf', 'openlibrary']), sourceId: z.string().min(1),
    qualityProfileId: z.number().int().positive(),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Demande invalide' }, { status: 400 });
  const { addFrenchEdition, EditionAddError } = await import('@/server/discover/add-french-edition');
  try {
    const result = await addFrenchEdition(parsed.data);
    const { revalidatePath } = await import('next/cache');
    try { revalidatePath('/library'); } catch { /* No Next request scope in tests. */ }
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof EditionAddError ? error.message : 'Ajout indisponible' },
      { status: error instanceof EditionAddError ? error.status : 502 });
  }
}
