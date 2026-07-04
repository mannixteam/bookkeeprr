import type { ContentType } from '@/server/content-type';

// Every media extension the library scanner recognizes. Mirrors the importer's
// routing table so a scan sees the same files the auto-grab importer would.
export const MEDIA_EXT_RE = /\.(cbz|cbr|zip|rar|7z|epub|mobi|pdf|azw3?|m4b|m4a|mp3|aac|flac|ogg)$/i;

const ARCHIVE_RE = /\.(cbz|cbr|zip|rar|7z)$/i;
const DOCUMENT_RE = /\.(epub|mobi|pdf|azw3?)$/i;
const AUDIO_RE = /\.(m4b|m4a|mp3|aac|flac|ogg)$/i;

/**
 * Default content type for a media file, by extension. Archives default to
 * `manga` (comics share the same extensions — the user can re-tag), documents
 * to `ebook` (light novels share theirs), audio to `audiobook`. Returns null
 * for non-media files.
 */
export function contentTypeForFile(name: string): ContentType | null {
  if (ARCHIVE_RE.test(name)) return 'manga';
  if (DOCUMENT_RE.test(name)) return 'ebook';
  if (AUDIO_RE.test(name)) return 'audiobook';
  return null;
}

/** The dominant content type across a directory's files (most common wins). */
export function contentTypeForFiles(names: readonly string[]): ContentType | null {
  const counts = new Map<ContentType, number>();
  for (const n of names) {
    const t = contentTypeForFile(n);
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: ContentType | null = null;
  let bestCount = 0;
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}
