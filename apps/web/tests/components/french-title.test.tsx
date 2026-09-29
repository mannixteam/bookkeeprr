/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FrenchTitleLookup } from '@/app/(app)/discover/FrenchTitleLookup';
import { FrenchEditionDiscovery } from '@/app/(app)/discover/FrenchEditionDiscovery';

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

// Exercise the actual composition used by Discover, not a mocked handoff.
const profiles = [{ id: 7, name: 'BD FR' }, { id: 8, name: 'Archives FR' }];
function verified(source = 'bnf') {
  return { ...result(source).results[0]!, title: 'Titre fraîchement vérifié', sourceId: source === 'bnf' ? 'ark:/12148/cb99999999x' : '/books/OL99M', sourceUrl: source === 'bnf' ? 'https://catalogue.bnf.fr/ark:/12148/cb99999999x' : 'https://openlibrary.org/books/OL99M' };
}
async function titleChoice() {
  render(<FrenchEditionDiscovery />);
  fireEvent.click(screen.getByText('Éditions françaises par titre'));
  search();
  return screen.findByRole('button', { name: 'Vérifier cet ISBN avant ajout' });
}
function isbnPanel() { return within(screen.getByText('Édition française par ISBN').closest('details')!); }

it.each(['bnf', 'openlibrary'])('rechecks only the ISBN and submits the freshly displayed %s identity after explicit add', async source => {
  const edition = verified(source);
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockResolvedValueOnce(Response.json({ result: edition }))
    .mockResolvedValueOnce(Response.json(profiles))
    .mockResolvedValueOnce(Response.json({ id: 42, created: false }));
  vi.stubGlobal('fetch', fetcher);
  fireEvent.click(await titleChoice());
  const panel = isbnPanel();
  expect(await panel.findByText('Titre fraîchement vérifié')).toBeTruthy();
  expect(panel.getByRole('link', { name: edition.attribution }).getAttribute('href')).toBe(edition.sourceUrl);
  expect((panel.getByLabelText('ISBN') as HTMLInputElement).value).toBe('9780306406157');
  expect(screen.getByText('Édition française par ISBN').closest('details')!.open).toBe(true);
  expect(panel.getByText(/sans série complète ni téléchargement automatique/)).toBeTruthy();
  const url = new URL(fetcher.mock.calls[1]![0], 'http://localhost');
  expect([...url.searchParams]).toEqual([['isbn', '9780306406157']]);
  expect(fetcher.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
  fireEvent.change(panel.getByLabelText('Profil de qualité'), { target: { value: '8' } });
  fireEvent.click(panel.getByRole('button', { name: 'Ajouter cette édition' }));
  expect((await panel.findByRole('link', { name: 'Voir dans la bibliothèque' })).getAttribute('href')).toBe('/library/42');
  expect(JSON.parse(fetcher.mock.calls[3]![1].body)).toEqual({ isbn: edition.ean, source, sourceId: edition.sourceId, qualityProfileId: 8 });
});
it.each(['absent', 'provider error', 'profile error'])('never offers stale title metadata for add after %s', async failure => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()));
  if (failure === 'absent') fetcher.mockResolvedValueOnce(Response.json({ result: null }));
  else if (failure === 'provider error') fetcher.mockResolvedValueOnce(Response.json({ error: 'Indisponible' }, { status: 502 }));
  else fetcher.mockResolvedValueOnce(Response.json({ result: verified() })).mockResolvedValueOnce(new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetcher); fireEvent.click(await titleChoice());
  const panel = isbnPanel();
  const expected = failure === 'absent' ? 'Aucune édition française vérifiée trouvée.' : failure === 'provider error' ? 'Indisponible' : 'Profils de qualité indisponibles';
  await panel.findByText(expected);
  expect(panel.queryByRole('button', { name: 'Ajouter cette édition' })).toBeNull();
  expect(fetcher.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
});
it('refreshes the same selection again and removes the previous verified result during lookup', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockResolvedValueOnce(Response.json({ result: verified() })).mockResolvedValueOnce(Response.json(profiles))
    .mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher); const select = await titleChoice(); fireEvent.click(select);
  await isbnPanel().findByText('Titre fraîchement vérifié');
  fireEvent.click(select);
  expect(isbnPanel().queryByText('Titre fraîchement vérifié')).toBeNull();
  expect(isbnPanel().queryByRole('button', { name: 'Ajouter cette édition' })).toBeNull();
  expect((select as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(select);
  expect(fetcher).toHaveBeenCalledTimes(4);
  await act(async () => resolve(Response.json({ result: null })));
  expect(isbnPanel().getByText('Aucune édition française vérifiée trouvée.')).toBeTruthy();
  expect((select as HTMLButtonElement).disabled).toBe(false);
});
it.each([409, 502])('shows server revalidation failure %s without claiming an import succeeded', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockResolvedValueOnce(Response.json({ result: verified() })).mockResolvedValueOnce(Response.json(profiles))
    .mockResolvedValueOnce(Response.json({ error: 'Édition modifiée ou indisponible' }, { status }));
  vi.stubGlobal('fetch', fetcher); fireEvent.click(await titleChoice());
  fireEvent.click(await isbnPanel().findByRole('button', { name: 'Ajouter cette édition' }));
  await isbnPanel().findByText('Édition modifiée ou indisponible');
  expect(isbnPanel().queryByRole('link', { name: 'Voir dans la bibliothèque' })).toBeNull();
});
it('blocks another title selection and duplicate add while the explicit POST is pending', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockResolvedValueOnce(Response.json({ result: verified() })).mockResolvedValueOnce(Response.json(profiles))
    .mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher); const select = await titleChoice(); fireEvent.click(select);
  const add = await isbnPanel().findByRole('button', { name: 'Ajouter cette édition' });
  fireEvent.click(add); fireEvent.click(add); fireEvent.click(select);
  expect((select as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(4);
  await act(async () => resolve(Response.json({ id: 42, created: true })));
  expect((select as HTMLButtonElement).disabled).toBe(false);
  expect(isbnPanel().getByRole('link', { name: 'Voir dans la bibliothèque' })).toBeTruthy();
});
it('does not enable add when no quality profile is available', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockResolvedValueOnce(Response.json({ result: verified() })).mockResolvedValueOnce(Response.json([])));
  fireEvent.click(await titleChoice());
  expect((await isbnPanel().findByRole('button', { name: 'Ajouter cette édition' }) as HTMLButtonElement).disabled).toBe(true);
});
it('aborts an ISBN handoff on unmount without starting the profile lookup after a late response', async () => {
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(result()))
    .mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
  vi.stubGlobal('fetch', fetcher); fireEvent.click(await titleChoice());
  const signal = fetcher.mock.calls[1]![1].signal as AbortSignal;
  cleanup(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(Response.json({ result: verified() })));
  expect(fetcher).toHaveBeenCalledTimes(2);
});
