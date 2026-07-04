/**
 * Single display version for the marketing site. The topbar pill, the footer,
 * the live-demo chrome, and the Docker compose example all show this version.
 *
 * It is resolved server-side from the latest GitHub release and cached in
 * Next's data cache for an hour (`revalidate`), so the deployed site tracks
 * releases automatically with no rebuild, the upstream API is hit at most once
 * per hour (shared across all visitors), and the visitor's browser never calls
 * GitHub - keeping the privacy guarantee on the static-feeling, server-rendered
 * pages.
 *
 * Server components await getAppVersion() directly (Next dedupes the fetch);
 * client components read the value from <VersionProvider> via useAppVersion().
 */
const REPO = 'paulcsiki/bookkeeprr';
const REVALIDATE_SECONDS = 3600;

/** Last-resort version if the GitHub API is unreachable at build and runtime. */
export const FALLBACK_VERSION = '1.0.3';

export async function getAppVersion(): Promise<string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bookkeeprr-website',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers,
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = (await res.json()) as { tag_name?: string };
    const tag = (data.tag_name ?? '').trim();
    return tag ? tag.replace(/^v/, '') : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
