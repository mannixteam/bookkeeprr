import type { AuditEventRow } from '@/server/db/audit';

/**
 * Builds the metadata object shown for an audit row. Folds the request IP
 * (clientIp, falling back to the immediate peerIp) in as an `ip` entry so it
 * surfaces alongside the event's stored metadata in the viewer. Non-object
 * stored metadata (a scalar or array) is preserved under a `details` key.
 * Returns null when there is nothing to show.
 */
export function buildAuditMetadata(row: AuditEventRow): Record<string, unknown> | null {
  let stored: Record<string, unknown> = {};
  if (row.metadataJson !== null && row.metadataJson.length > 0) {
    try {
      const parsed = JSON.parse(row.metadataJson) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        stored = parsed as Record<string, unknown>;
      } else {
        stored = { details: parsed };
      }
    } catch {
      stored = { details: row.metadataJson };
    }
  }

  // clientIp is the real client (via X-Forwarded-For); peerIp is the immediate
  // peer (the reverse proxy). Show the most meaningful one as "ip".
  const ip = row.clientIp ?? row.peerIp;

  // `ip` first, then the stored metadata keys.
  const merged: Record<string, unknown> = {};
  if (ip !== null && ip !== '') merged.ip = ip;
  for (const [k, v] of Object.entries(stored)) merged[k] = v;

  const hasValue = Object.entries(merged).some(([, v]) => v != null);
  return hasValue ? merged : null;
}
