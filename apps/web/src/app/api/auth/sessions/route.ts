import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { listSessionsForUser } from '@/server/db/sessions';
import { readSessionCookie } from '@/server/auth/session-cookie';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  // Any user credential works — session cookie (web) or bearer token (mobile).
  // The 'system' X-Api-Key actor has no user, so it cannot list sessions.
  const auth = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (auth.kind !== 'authenticated' || auth.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // `current` is only meaningful for cookie callers — a mobile bearer caller
  // has no current WEB session, so nothing is marked current.
  const cookieToken = readSessionCookie(req);

  const rows = await listSessionsForUser(auth.actor.userId);
  const result = rows.map((s) => ({
    id: s.token.slice(0, 12),
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    userAgent: s.userAgent ?? null,
    ipAddress: s.ipAddress ?? null,
    current: cookieToken !== null && s.token === cookieToken,
  }));

  return NextResponse.json({ sessions: result });
}
