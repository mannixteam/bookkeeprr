/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FrenchTitleLookup } from '@/app/(app)/discover/FrenchTitleLookup';

const result = (source = 'openlibrary') => ({ source, coverage: 'bounded', results: [{
  title: 'Mirage', ean: '9780306406157', language: 'fr', source,
  sourceId: source === 'bnf' ? 'ark:/12148/cb12345678x' : '/books/OL1M',
  sourceUrl: source === 'bnf' ? 'https://catalogue.bnf.fr/ark:/12148/cb12345678x' : 'https://openlibrary.org/books/OL1M',
  attribution: source === 'bnf' ? 'Bibliothèque nationale de France' : 'Open Library',
}] });
function open() { render(<FrenchTitleLookup />); fireEvent.click(screen.getByText('Éditions françaises par titre')); }
function search(value = 'Mirage') {
  fireEvent.change(screen.getByLabelText('Titre de l’édition'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher les éditions' }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('starts without network calls and explains limited edition-only coverage', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); open();
  expect(screen.getByText(/Recherche limitée, non exhaustive/).textContent).toContain('sans garantir une série complète');
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('status')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['bnf', 'openlibrary'])('displays %s edition identity and linked attribution using only the read endpoint', async source => {
  const data = result(source);
  const fetcher = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetcher); open();
  search('  Mirage & suite  ');
  const list = await screen.findByRole('list', { name: 'Éditions françaises trouvées' });
  expect(within(list).getByText('Mirage')).toBeTruthy();
  expect(within(list).getByText('Français · ISBN 9780306406157')).toBeTruthy();
  const link = within(list).getByRole('link', { name: data.results[0]!.attribution });
  expect(link.getAttribute('href')).toBe(data.results[0]!.sourceUrl);
  expect(link.getAttribute('rel')).toBe('noreferrer');
  expect(screen.getByRole('status').textContent).toContain('résultats non exhaustifs');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(new URL(fetcher.mock.calls[0]![0], 'http://localhost').searchParams.get('title')).toBe('Mirage & suite');
  expect(fetcher.mock.calls[0]![0]).toMatch(/^\/api\/discover\/french-title\?/);
  expect(fetcher.mock.calls[0]![1].method ?? 'GET').toBe('GET');
  expect(screen.queryByRole('button', { name: /Ajouter/ })).toBeNull();
});
it('retains separate same-title editions and their ISBNs', async () => {
  const data = result(); data.results.push({ ...data.results[0]!, sourceId: '/books/OL2M', ean: '9782723488525' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data))); open(); search();
  const list = await screen.findByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(within(list).getByText('Français · ISBN 9782723488525')).toBeTruthy();
});
it('reports an empty bounded search without claiming editions do not exist', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result(), results: [] }))); open(); search();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('D’autres éditions peuvent exister'));
  expect(screen.queryByRole('list')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
it.each(['HTTP', 'network', 'JSON', 'shape'])('shows a retryable error, not empty results, for %s failure', async failure => {
  const fetcher = vi.fn();
  if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'));
  else fetcher.mockResolvedValueOnce(failure === 'HTTP' ? Response.json({ error: 'failure' }, { status: 502 }) : failure === 'JSON' ? new Response('{') : Response.json({}));
  fetcher.mockResolvedValueOnce(Response.json(result()));
  vi.stubGlobal('fetch', fetcher); open(); search();
  expect((await screen.findByRole('alert')).textContent).toContain('Réessayez');
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('list')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('clears old results when the title changes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result()))); open(); search();
  await screen.findByRole('list');
  fireEvent.change(screen.getByLabelText('Titre de l’édition'), { target: { value: 'Autre titre' } });
  expect(screen.queryByRole('list')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
it('announces loading, blocks duplicate requests and clears old results before a new search', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result())).mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher); open(); search(); await screen.findByRole('list');
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('status').textContent).toContain('en cours');
  expect(screen.queryByRole('list')).toBeNull();
  const input = screen.getByLabelText('Titre de l’édition') as HTMLInputElement;
  expect(input.disabled).toBe(true);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(input.closest('form')!);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => resolve(Response.json(result())));
  expect(input.disabled).toBe(false);
  expect(screen.getByRole('list')).toBeTruthy();
});
it('aborts pending work on unmount and ignores a late response', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn().mockReturnValue(new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher); open(); search();
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  cleanup();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json(result())));
  expect(screen.queryByRole('list')).toBeNull();
});
it.each([' ', 'a', 'a'.repeat(201)])('rejects invalid titles even if native form checks are bypassed: %s', value => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); open();
  const input = screen.getByLabelText('Titre de l’édition');
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form')!);
  expect(screen.getByRole('alert').textContent).toContain('2 à 200');
  expect(fetcher).not.toHaveBeenCalled();
});
