import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigationState } from '@react-navigation/native';
import { TabletSidebar, type SidebarKey } from '@/components/TabletSidebar';
import { useLayout } from '@/responsive/useLayout';
import { useTokens } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useUpdateAvailable } from '@/api/hooks';
import { AppConfig } from '@/lib/appConfig';
import { HomeStack } from '@/navigation/HomeStack';
import { LibraryStack } from '@/navigation/LibraryStack';
import { SettingsStack } from '@/navigation/SettingsStack';
import Activity from '@/screens/Activity';
import type { AppTabsParamList } from '@/navigation/types';

interface SidebarFooter {
  version: string;
  serverHost: string | undefined;
  updateAvailable: boolean;
}

const Tab = createBottomTabNavigator<AppTabsParamList>();

const ROUTE_TO_KEY: Record<string, SidebarKey> = {
  Home: 'home',
  Library: 'library',
  Activity: 'activity',
  Settings: 'settings',
};

export const KEY_TO_ROUTE: Record<SidebarKey, keyof AppTabsParamList> = {
  home: 'Home',
  library: 'Library',
  activity: 'Activity',
  settings: 'Settings',
};

// Pure helper that implements the sidebar navigate logic so it can be unit-
// tested without rendering the full TabletAppShell. Mirror of AppTabBar.go():
// emit tabPress (so the navigator's built-in stack-pop listener fires on re-tap),
// then navigate only when the tab is not already focused and default was not
// prevented.
export function makeSidebarNavigate(
  state: BottomTabBarProps['state'],
  navigation: BottomTabBarProps['navigation'],
) {
  return (key: SidebarKey) => {
    const targetName = KEY_TO_ROUTE[key];
    const route = state.routes.find((r) => r.name === targetName);
    if (!route) return;
    const isFocused = state.routes[state.index]?.key === route.key;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
  };
}

// Minimal shape of a React Navigation state for walking the focused path.
type FocusPathState =
  | { index?: number; routes: { name: string; state?: FocusPathState }[] }
  | undefined;

// Walks the focused-route path (each navigator's routes[index], descending into
// nested navigators) and reports whether the Reader screen is the currently
// focused screen. Used to collapse the tablet sidebar inset on Android: there
// the Reader's fullScreenModal is bounded to its navigator container and would
// otherwise leave the sidebar showing, whereas on iOS it covers the whole
// window. Only follows the focused index, so a Reader parked in a background tab
// does not count.
export function isReaderFocused(state: FocusPathState): boolean {
  let s = state;
  while (s && s.routes && s.routes.length) {
    const route = s.routes[s.index ?? s.routes.length - 1];
    if (!route) return false;
    if (route.name === 'Reader') return true;
    s = route.state;
  }
  return false;
}

// Renders the sidebar as the bottom-tab "tab bar" so it sits inside the
// navigator subtree (giving navigation hooks the context they need) while
// being absolutely positioned along the left edge. The Tab.Navigator screens
// reserve room for the sidebar via a left padding applied to the navigator's
// outer container.
function SidebarTabBar(
  props: BottomTabBarProps & { collapsed: boolean; sidebarWidth: number; footer: SidebarFooter },
) {
  const { state, navigation, collapsed, sidebarWidth, footer } = props;
  const current = state.routes[state.index];
  const active: SidebarKey = (current && ROUTE_TO_KEY[current.name]) || 'library';
  const onNavigate = makeSidebarNavigate(state, navigation);
  return (
    <View
      style={{
        position: 'absolute',
        // negative-marginLeft to undo the outer container's paddingLeft so the
        // sidebar visually attaches to the screen's left edge
        left: -sidebarWidth,
        top: 0,
        bottom: 0,
        width: sidebarWidth,
        zIndex: 10,
      }}
    >
      <TabletSidebar
        active={active}
        collapsed={collapsed}
        onNavigate={onNavigate}
        version={footer.version}
        serverHost={footer.serverHost}
        updateAvailable={footer.updateAvailable}
      />
    </View>
  );
}

export function TabletAppShell() {
  const layout = useLayout();
  const t = useTokens();
  const { state } = useAuth();
  const update = useUpdateAvailable();
  const collapsed = layout.class === 'tablet-portrait';
  const sidebarWidth = collapsed ? 64 : 232;

  // On Android the Reader's fullScreenModal is confined to its navigator
  // container (the sidebar-inset content pane), so the sidebar stays visible
  // beside it. Collapse the inset to 0 while the Reader is focused: the content
  // pane goes full-width (letting the modal cover everything) and the sidebar,
  // positioned at left:-sidebarWidth relative to that pane, slides off-screen.
  // iOS already covers the whole window from its window-level modal, so this is
  // Android-only and leaves the iOS layout untouched.
  const readerFocused = useNavigationState((s) => isReaderFocused(s as FocusPathState));
  const readerCovering = readerFocused && Platform.OS === 'android';

  const serverUrl = state.status === 'authenticated' ? state.creds.serverUrl : '';
  const footer: SidebarFooter = {
    version: AppConfig.versionLabel,
    serverHost: serverUrl ? serverUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : undefined,
    updateAvailable: update.available,
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingLeft: readerCovering ? 0 : sidebarWidth }}>
      <Tab.Navigator
        tabBar={(props) =>
          readerCovering ? null : (
            <SidebarTabBar
              {...props}
              collapsed={collapsed}
              sidebarWidth={sidebarWidth}
              footer={footer}
            />
          )
        }
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Library" component={LibraryStack} />
        <Tab.Screen name="Activity" component={Activity} />
        <Tab.Screen name="Settings" component={SettingsStack} />
      </Tab.Navigator>
    </View>
  );
}
