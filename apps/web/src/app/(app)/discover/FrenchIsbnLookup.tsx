'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import type { lookupFrenchIsbn } from '@/server/discover/french-isbn';
type Edition = NonNullable<Awaited<ReturnType<typeof lookupFrenchIsbn>>>;
export function FrenchIsbnLookup() {
  const [isbn, setIsbn] = useState('');
  const [edition, setEdition] = useState<Edition | null>(null);
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string }>>([]);
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [addedId, setAddedId] = useState<number | null>(null);
  async function search() {
    setBusy(true); setEdition(null); setMessage(''); setAddedId(null);
    try {
      const response = await apiFetch(`/api/discover/french-isbn?isbn=${encodeURIComponent(isbn)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Recherche indisponible');
      if (!data.result) { setMessage('Aucune édition française vérifiée trouvée.'); return; }
      const quality = await apiFetch('/api/quality-profiles');
      if (!quality.ok) throw new Error('Profils de qualité indisponibles');
      const choices = await quality.json();
      setProfiles(choices); setProfile(String(choices[0]?.id ?? '')); setEdition(data.result);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Recherche indisponible'); }
    finally { setBusy(false); }
  }
  async function add() {
    if (!edition) return;
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/discover/french-isbn', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: edition.ean, source: edition.source, sourceId: edition.sourceId, qualityProfileId: Number(profile) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Ajout indisponible');
      setAddedId(data.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ajout indisponible'); }
    finally { setBusy(false); }
  }
  return <details className="mb-4 rounded border p-3">
    <summary>Édition française par ISBN</summary>
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label>ISBN <input className="rounded border bg-background p-2" value={isbn} disabled={busy} onChange={event => { setIsbn(event.target.value); setEdition(null); setAddedId(null); }} /></label>
      <button disabled={busy || !isbn.trim()} type="submit">Rechercher l’édition</button>
    </form>
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
}
