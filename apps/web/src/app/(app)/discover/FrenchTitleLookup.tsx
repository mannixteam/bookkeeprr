'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { lookupFrenchTitle } from '@/server/discover/french-title';

type SearchResult = Awaited<ReturnType<typeof lookupFrenchTitle>>;

export function FrenchTitleLookup() {
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function search() {
    if (pending.current) return;
    const query = title.trim();
    setResult(null);
    setError('');
    if (query.length < 2 || query.length > 200) {
      setError('Saisissez un titre de 2 à 200 caractères.');
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/discover/french-title?${new URLSearchParams({ title: query })}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Recherche indisponible. Réessayez dans un instant.');
      const data: SearchResult = await response.json();
      if (!Array.isArray(data.results) || data.coverage !== 'bounded') throw new Error('Invalid response');
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setError('Recherche indisponible. Réessayez dans un instant.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  }

  return <details className="mb-4 rounded border p-3">
    <summary>Éditions françaises par titre</summary>
    <p className="mt-2 text-sm text-muted-foreground">
      Recherche limitée, non exhaustive : BnF en priorité, puis Open Library si aucune édition éligible n’est trouvée.
      Les résultats présentent des éditions en français, sans garantir une série complète ni le genre BD/comic/manga.
    </p>
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="flex min-w-0 flex-1 flex-col gap-1">Titre de l’édition
        <input className="w-full rounded border bg-background p-2" value={title} minLength={2} maxLength={200}
          required disabled={busy} onChange={event => { setTitle(event.target.value); setResult(null); setError(''); }} />
      </label>
      <button className="rounded border px-3 py-2" type="submit" disabled={busy || title.trim().length < 2 || title.trim().length > 200}>
        Rechercher les éditions
      </button>
    </form>
    <div className="mt-3" aria-busy={busy}>
      {busy && <p role="status">Recherche des éditions françaises en cours…</p>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p role="status">{result.results.length
          ? `${result.results.length} édition(s) affichée(s) — résultats non exhaustifs.`
          : 'Aucune édition française vérifiée trouvée dans cette recherche limitée. D’autres éditions peuvent exister.'}</p>
        {result.results.length > 0 && <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto" tabIndex={0} aria-label="Éditions françaises trouvées">
          {result.results.map((edition, index) => <li className="rounded border p-3 break-words" key={`${edition.source}:${edition.sourceId}:${index}`}>
            <p><strong>{edition.title}</strong></p>
            <p>Français · ISBN {edition.ean}</p>
            <p>Source : <a className="underline" href={edition.sourceUrl} target="_blank" rel="noreferrer">{edition.attribution}</a></p>
          </li>)}
        </ul>}
      </>}
    </div>
  </details>;
}
