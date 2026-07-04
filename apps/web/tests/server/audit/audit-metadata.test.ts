import { describe, expect, it } from 'vitest';
import { buildAuditMetadata } from '@/app/(app)/settings/audit/metadata';
import type { AuditEventRow } from '@/server/db/audit';

function row(over: Partial<AuditEventRow>): AuditEventRow {
  return {
    id: 1,
    timestamp: new Date(0),
    actorKind: 'user',
    actorUserId: 1,
    actorUsername: 'paul',
    action: 'auth.login_success',
    targetKind: null,
    targetId: null,
    metadataJson: null,
    peerIp: null,
    clientIp: null,
    userAgent: null,
    ...over,
  };
}

describe('buildAuditMetadata', () => {
  it('surfaces clientIp as ip, first, merged with stored metadata', () => {
    const m = buildAuditMetadata(
      row({ clientIp: '203.0.113.7', metadataJson: JSON.stringify({ reason: 'bad_password' }) }),
    );
    expect(m).toEqual({ ip: '203.0.113.7', reason: 'bad_password' });
    // ip is first so it reads first in the viewer
    expect(Object.keys(m!)[0]).toBe('ip');
  });

  it('falls back to peerIp when clientIp is null', () => {
    const m = buildAuditMetadata(row({ clientIp: null, peerIp: '10.0.0.2' }));
    expect(m).toEqual({ ip: '10.0.0.2' });
  });

  it('prefers clientIp over peerIp', () => {
    const m = buildAuditMetadata(row({ clientIp: '1.1.1.1', peerIp: '10.0.0.2' }));
    expect(m).toEqual({ ip: '1.1.1.1' });
  });

  it('returns null when there is no ip and no metadata', () => {
    expect(buildAuditMetadata(row({}))).toBeNull();
  });

  it('shows ip even when there is no stored metadata', () => {
    expect(buildAuditMetadata(row({ clientIp: '8.8.8.8' }))).toEqual({ ip: '8.8.8.8' });
  });

  it('keeps stored metadata when there is no ip', () => {
    const m = buildAuditMetadata(row({ metadataJson: JSON.stringify({ forced: true }) }));
    expect(m).toEqual({ forced: true });
  });

  it('preserves non-object metadata under details', () => {
    const m = buildAuditMetadata(row({ clientIp: '1.2.3.4', metadataJson: JSON.stringify([1, 2]) }));
    expect(m).toEqual({ ip: '1.2.3.4', details: [1, 2] });
  });

  it('preserves malformed metadata json as raw details text', () => {
    const m = buildAuditMetadata(row({ clientIp: '1.2.3.4', metadataJson: 'not json' }));
    expect(m).toEqual({ ip: '1.2.3.4', details: 'not json' });
  });

  it('treats an empty-string ip as absent', () => {
    expect(buildAuditMetadata(row({ clientIp: '' }))).toBeNull();
  });
});
