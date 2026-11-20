'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { lookupFrenchIsbn } from '@/server/discover/french-isbn';
type Edition = NonNullable<Awaited<ReturnType<typeof lookupFrenchIsbn>>>;
export type FrenchIsbnLookupHandle = { lookupIsbn: (isbn: string) => void };
export const FrenchIsbnLookup = forwardRef<FrenchIsbnLookupHandle, { onBusyChange?: (busy: boolean) => void }>(function FrenchIsbnLookup({ onBusyChange }, ref) {
  const details = useRef<HTMLDetailsElement>(null);
  const active = useRef(false);
  const lookupAbort = useRef<AbortController | null>(null);
  useEffect(() => () => lookupAbort.current?.abort(), []);
  const [isbn, setIsbn] = useState('');
  const [edition, setEdition] = useState<Edition | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string }>>([]);
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [addedId, setAddedId] = useState<number | null>(null);
  useImperativeHandle(ref, () => ({ lookupIsbn: value => { void search(value); } }));
  function markBusy(value: boolean) {
    active.current = value;
    setBusy(value);
    onBusyChange?.(value);
  }
  async function search(value = isbn) {
    if (active.current) return;
    const controller = new AbortController();
    lookupAbort.current = controller;
    setIsbn(value);
    if (details.current) {
      details.current.open = true;
      details.current.scrollIntoView?.({ block: 'nearest' });
    }
    markBusy(true); setEdition(null); setMessage(''); setAddedId(null);
    try {
      const response = await apiFetch(`/api/discover/french-isbn?isbn=${encodeURIComponent(value)}`, { signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error ?? 'Recherche indisponible');
      if (!data.result) { setMessage('Aucune édition française vérifiée trouvée.'); return; }
      const quality = await apiFetch('/api/quality-profiles', { signal: controller.signal });
      if (!quality.ok) throw new Error('Profils de qualité indisponibles');
      const choices = await quality.json();
      if (controller.signal.aborted) return;
      setProfiles(choices); setProfile(String(choices[0]?.id ?? '')); setEdition(data.result);
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Recherche indisponible'); }
    finally { if (!controller.signal.aborted) markBusy(false); }
  }
  async function add() {
    if (!edition || !profile || active.current) return;
    markBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/discover/french-isbn', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: edition.ean, source: edition.source, sourceId: edition.sourceId, qualityProfileId: Number(profile) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Ajout indisponible');
      setAddedId(data.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ajout indisponible'); }
    finally { markBusy(false); }
  }
  return <details ref={details} className="mb-4 rounded border p-3">
    <summary>Édition française par ISBN</summary>
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label>ISBN <input className="rounded border bg-background p-2" value={isbn} disabled={busy} onChange={event => { setIsbn(event.target.value); setEdition(null); setAddedId(null); setMessage(''); }} /></label>
      <button disabled={busy || !isbn.trim()} type="submit">Rechercher l’édition</button>
    </form>
    {busy && !edition && <p role="status">Vérification de l’édition par ISBN en cours…</p>}
    {edition && <div className="mt-3 space-y-2">
      <p><strong>{edition.title}</strong> — Français · ISBN {edition.ean}</p>
      <p>Source : <a href={edition.sourceUrl} target="_blank" rel="noreferrer">{edition.attribution}</a></p>
      <p>Ajout comme édition BD/comic/manga, sans série complète ni téléchargement automatique.</p>
      <label>Profil de qualité <select value={profile} disabled={busy} onChange={event => setProfile(event.target.value)}>
        {profiles.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
      </select></label>
      {addedId ? <a href={`/library/${addedId}`}>Voir dans la bibliothèque</a> : <button disabled={busy || !profile} onClick={() => void add()}>Ajouter cette édition</button>}
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
});
