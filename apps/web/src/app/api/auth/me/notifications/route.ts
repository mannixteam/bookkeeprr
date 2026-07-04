import { NextResponse } from 'next/server';
import { MeNotificationsPatchBody as PatchBody } from '@/server/openapi/schemas/auth';
import { authenticateRequest } from '@/server/auth/session-middleware';
import {
  getOrCreateNotificationPrefs,
  updateNotificationPrefs,
} from '@/server/db/notification-prefs';
import { recordAuditEvent } from '@/server/audit/record';
import { auditActor, auditContext } from '@/server/audit/request';

export const dynamic = 'force-dynamic';

async function authenticate(
  req: Request,
): Promise<{ userId: number } | NextResponse> {
  // Any user credential works — session cookie (web) or bearer token (mobile).
  // The X-Api-Key 'system' actor has no user, so it cannot read/patch prefs.
  const result = await authenticateRequest(req as Parameters<typeof authenticateRequest>[0]);
  if (result.kind !== 'authenticated' || result.actor === 'system') {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return { userId: result.actor.userId };
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  const prefs = await getOrCreateNotificationPrefs(auth.userId);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid request body', issues: parsed.error.issues }, { status: 400 });
  }

  const prefs = await updateNotificationPrefs(auth.userId, parsed.data);

  await recordAuditEvent({
    actor: await auditActor(req),
    action: 'notifications.update',
    target: { kind: 'user', id: String(auth.userId) },
    metadata: { fields: Object.keys(parsed.data) },
    context: auditContext(req),
  });

  return NextResponse.json({ prefs });
}
