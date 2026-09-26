/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FrenchIsbnLookup } from '@/app/(app)/discover/FrenchIsbnLookup';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows the source and submits only the verified edition identity and chosen profile', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ result: { title: 'Mirage', source: 'openlibrary', sourceId: '/books/OL123M', sourceUrl: 'https://openlibrary.org/books/OL123M', attribution: 'Open Library', ean: '9780306406157' } }))
    .mockResolvedValueOnce(Response.json([{ id: 7, name: 'BD FR' }])).mockResolvedValueOnce(Response.json({ id: 42 }));
  vi.stubGlobal('fetch', fetcher); render(<FrenchIsbnLookup />);
  fireEvent.click(screen.getByText('Édition française par ISBN'));
  fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: '0306406152' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher l’édition' }));
  expect((await screen.findByRole('link', { name: 'Open Library' })).getAttribute('href')).toBe('https://openlibrary.org/books/OL123M');
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter cette édition' }));
  expect((await screen.findByRole('link', { name: 'Voir dans la bibliothèque' })).getAttribute('href')).toBe('/library/42');
  expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ isbn: '9780306406157', source: 'openlibrary', sourceId: '/books/OL123M', qualityProfileId: 7 });
});
it('shows lookup errors without offering an add', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'Indisponible' }, { status: 502 })));
  render(<FrenchIsbnLookup />); fireEvent.click(screen.getByText('Édition française par ISBN'));
  fireEvent.change(screen.getByLabelText('ISBN'), { target: { value: '0306406152' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher l’édition' }));
  expect((await screen.findByRole('status')).textContent).toContain('Indisponible');
  expect(screen.queryByRole('button', { name: 'Ajouter cette édition' })).toBeNull();
});
