import { NextResponse } from 'next/server';
import { MeDeleteBody as DeleteBody } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import { getUser, deleteUser } from '@/server/db/users';
import { clearSessionCookie } from '@/server/auth/session-cookie';
import { verifyPassword } from '@/server/auth/password';
import type { UserRow } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Resolve the requesting user via any user credential — session cookie (web)
 * or bearer token (mobile). The X-Api-Key 'system' actor has no user, so it
 * resolves to null (the mobile 2FA screen loads its account via this route).
 */
async function resolveUser(req: Request): Promise<UserRow | null> {
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated' || result.actor === 'system') return null;
  return getUser(result.actor.userId);
}

export async function GET(req: Request): Promise<NextResponse> {
  const user = await resolveUser(req);
  if (user === null || user.disabled) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarPath != null ? `/api/auth/me/avatar/${user.id}` : null,
      authSource: user.authSource,
      totpEnabledAt: user.totpEnabledAt ? user.totpEnabledAt.getTime() : null,
    },
  });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const user = await resolveUser(req);
  if (user === null || user.disabled) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // OIDC / forward-auth accounts have no local password to confirm against.
  if (user.authSource !== 'local' || user.passwordHash === null) {
    return NextResponse.json(
      { message: 'Password confirmation not available for non-local accounts' },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = DeleteBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'currentPassword required' }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ message: 'Current password incorrect' }, { status: 401 });
  }

  // Delete user row — sessions + FK cascade data goes with it.
  await deleteUser(user.id);

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
