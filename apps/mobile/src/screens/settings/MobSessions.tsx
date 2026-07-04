// Settings → Active sessions screen.
//
// Lists sessions returned by GET /api/auth/sessions.
// The current session is marked with a "current" badge and cannot be revoked.
// Other sessions can be revoked via DELETE /api/auth/sessions/:id.

import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Monitor, Trash2 } from 'lucide-react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/auth/AuthContext';
import { createApiClient, ApiError } from '@/api/client';
import { useTokens } from '@/theme/ThemeProvider';
import { fonts, text } from '@/theme/typography';
import { withAlpha } from '@/theme/color';
import { useIsOnline, useOnlineGate } from '@/features/system/online';
import { SettingsOfflineState } from '@/features/settings/SettingsOfflineState';

interface SessionEntry {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ipAddress: string | null;
  current: boolean;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

export function MobSessions() {
  const t = useTokens();
  const navigation = useNavigation();
  const { state, signOut } = useAuth();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const online = useIsOnline();
  const { gate } = useOnlineGate();

  // Memoized so the screen's own state updates don't rebuild the client —
  // a fresh client identity re-arms the focus effect below and refires the
  // fetch mid-flight (the "two error alerts" bug).
  const client = useMemo(
    () =>
      state.status === 'authenticated'
        ? createApiClient(state.creds, { onAuthFail: () => signOut() })
        : null,
    [state, signOut],
  );

  const loadSessions = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const j = await client.get<{ sessions: SessionEntry[] }>('/api/auth/sessions');
      setSessions(j.sessions);
      setLoaded(true);
    } catch (err) {
      // A 401 already signed us out via onAuthFail — the reset to onboarding
      // IS the UX; an extra alert would float over the welcome screen.
      if (!(err instanceof ApiError && err.status === 401)) {
        Alert.alert('Error', 'Could not load sessions');
      }
    } finally {
      setLoading(false);
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void loadSessions();
    }, [loadSessions]),
  );

  const otherSessions = sessions.filter((s) => !s.current);
  const [revokingAll, setRevokingAll] = useState(false);

  async function revokeAllOthers(): Promise<void> {
    Alert.alert(
      'Sign out of all other sessions',
      `This signs out ${otherSessions.length} session${otherSessions.length === 1 ? '' : 's'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            if (!client) return;
            setRevokingAll(true);
            try {
              for (const s of otherSessions) {
                await client.delete(`/api/auth/sessions/${s.id}`);
              }
              await loadSessions();
            } catch (err) {
              // A 401 means THIS device's session died mid-flight — onAuthFail
              // has already signed out and reset to the login screen.
              if (!(err instanceof ApiError && err.status === 401)) {
                Alert.alert('Error', 'Could not sign out of all other sessions');
              }
            } finally {
              setRevokingAll(false);
            }
          },
        },
      ],
    );
  }

  async function revokeSession(id: string): Promise<void> {
    Alert.alert(
      'Revoke session',
      'Are you sure you want to revoke this session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            if (!client) return;
            setRevoking(id);
            try {
              await client.delete(`/api/auth/sessions/${id}`);
              setSessions((prev) => prev.filter((s) => s.id !== id));
            } catch (err) {
              if (!(err instanceof ApiError && err.status === 401)) {
                Alert.alert('Error', 'Could not revoke session');
              }
            } finally {
              setRevoking(null);
            }
          },
        },
      ],
    );
  }

  const card = {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 12,
    overflow: 'hidden' as const,
  };

  return (
    <ScreenContainer testID="screen-mob-sessions">
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Header */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}
        >
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} testID="btn-back-sessions">
            <ArrowLeft size={22} color={t.text} strokeWidth={1.75} />
          </Pressable>
          <Text style={[text.displayMd, { flex: 1, color: t.text }]}>Sessions</Text>
          {otherSessions.length > 0 ? (
            <Pressable
              testID="btn-signout-others"
              onPress={gate(() => {
                if (!revokingAll) void revokeAllOthers();
              })}
              disabled={revokingAll}
              hitSlop={8}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: withAlpha(t.err, 0.5),
                opacity: online ? 1 : 0.5,
              }}
            >
              {revokingAll ? (
                <ActivityIndicator size="small" color={t.err} />
              ) : (
                <Text style={{ fontFamily: fonts.sans.medium, fontSize: 12, color: t.err }}>
                  Sign out of all other sessions
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {!online && !loaded ? (
          <SettingsOfflineState />
        ) : loading ? (
          <View style={{ paddingTop: 32, alignItems: 'center' }}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : sessions.length === 0 ? (
          <Text style={[text.bodySm, { color: t.textMuted }]}>No active sessions found.</Text>
        ) : (
          <View style={card}>
            {sessions.map((s, idx) => (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: idx < sessions.length - 1 ? 1 : 0,
                  borderBottomColor: t.border,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: t.surfaceMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Monitor size={14} color={t.text} strokeWidth={1.75} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text
                      style={{ fontFamily: fonts.mono.regular, fontSize: 12, color: t.text }}
                    >
                      {s.id}
                    </Text>
                    {s.current ? (
                      <View
                        style={{
                          borderRadius: 99,
                          borderWidth: 1,
                          borderColor: withAlpha(t.primary, 0.4),
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: fonts.mono.regular,
                            fontSize: 9,
                            color: t.primary,
                          }}
                        >
                          current
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 10.5,
                      color: t.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {s.userAgent ?? 'Unknown device'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.mono.regular,
                      fontSize: 10,
                      color: t.textMuted,
                      marginTop: 1,
                    }}
                  >
                    {s.ipAddress ? `${s.ipAddress} · ` : ''}Last seen {fmtDate(s.lastSeenAt)}
                  </Text>
                </View>
                {!s.current ? (
                  <Pressable
                    testID={`btn-revoke-${s.id}`}
                    onPress={gate(() => void revokeSession(s.id))}
                    disabled={revoking === s.id}
                    hitSlop={8}
                    style={{ padding: 4, opacity: online ? 1 : 0.5 }}
                  >
                    {revoking === s.id ? (
                      <ActivityIndicator size="small" color={t.err} />
                    ) : (
                      <Trash2 size={15} color={t.err} strokeWidth={1.75} />
                    )}
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

export default MobSessions;
