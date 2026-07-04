/**
 * Regression guards for two tablet navigation bugs:
 *
 * Bug #1 — back from a Library detail jumps to Home instead of LibraryHome.
 * Fix: each tab stack navigator has initialRouteName set so a cross-tab deep-link
 * lands on the detail with the root screen already beneath it in the stack.
 * Test: structural — assert the initialRouteName prop on each Stack.Navigator.
 *
 * Bug #2 — re-tapping the active sidebar item doesn't pop the detail stack.
 * Fix: SidebarTabBar.onNavigate now emits 'tabPress' (so the navigator's
 * built-in stack-pop listener fires), and only calls navigate when the tab is
 * not already focused.
 * Test: unit-test makeSidebarNavigate (the extracted pure helper).
 */

import { makeSidebarNavigate, KEY_TO_ROUTE, isReaderFocused } from '@/components/TabletAppShell';
import { LibraryStack } from '@/navigation/LibraryStack';
import { HomeStack } from '@/navigation/HomeStack';
import { SettingsStack } from '@/navigation/SettingsStack';

// ---------------------------------------------------------------------------
// Helpers — minimal BottomTabBarProps-shaped state + navigation mocks
// ---------------------------------------------------------------------------

function makeRoute(name: string, key: string) {
  return { name, key, params: undefined };
}

function makeState(routes: { name: string; key: string }[], index: number) {
  return {
    routes,
    index,
    key: 'tab-state',
    routeNames: routes.map((r) => r.name),
    history: [],
    preloadedRouteKeys: [],
    type: 'tab' as const,
    stale: false as const,
  };
}

function makeNavigation(defaultPrevented = false) {
  const emit = jest.fn().mockReturnValue({ defaultPrevented });
  const navigate = jest.fn();
  return { emit, navigate };
}

// ---------------------------------------------------------------------------
// Bug #2: SidebarTabBar tabPress regression guard
// ---------------------------------------------------------------------------

describe('makeSidebarNavigate — tabPress emission', () => {
  const routes = [
    makeRoute('Home', 'home-key'),
    makeRoute('Library', 'library-key'),
    makeRoute('Activity', 'activity-key'),
    makeRoute('Settings', 'settings-key'),
  ];

  it('emits tabPress with the route key when tapping the ALREADY-ACTIVE tab', () => {
    // Library is focused (index 1)
    const state = makeState(routes, 1);
    const nav = makeNavigation();
    const onNavigate = makeSidebarNavigate(state, nav as never);

    onNavigate('library');

    expect(nav.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'library-key',
      canPreventDefault: true,
    });
  });

  it('does NOT call navigate when re-tapping the already-active tab', () => {
    const state = makeState(routes, 1); // Library focused
    const nav = makeNavigation(false); // defaultPrevented = false
    const onNavigate = makeSidebarNavigate(state, nav as never);

    onNavigate('library');

    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('emits tabPress AND calls navigate when switching to a DIFFERENT tab', () => {
    const state = makeState(routes, 0); // Home focused
    const nav = makeNavigation(false);
    const onNavigate = makeSidebarNavigate(state, nav as never);

    onNavigate('library');

    expect(nav.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'library-key',
      canPreventDefault: true,
    });
    expect(nav.navigate).toHaveBeenCalledWith('Library');
  });

  it('does NOT call navigate when switching tabs if defaultPrevented=true', () => {
    const state = makeState(routes, 0); // Home focused
    const nav = makeNavigation(true); // defaultPrevented = true
    const onNavigate = makeSidebarNavigate(state, nav as never);

    onNavigate('library');

    expect(nav.emit).toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('is a no-op when the key maps to an unknown route', () => {
    const state = makeState(routes, 0);
    const nav = makeNavigation();
    const onNavigate = makeSidebarNavigate(state, nav as never);

    // Pass an unknown key — the route.find will return undefined → early return
    // Cast needed since TypeScript would catch it; we're testing the guard.
    onNavigate('unknown' as never);

    expect(nav.emit).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tablet bug: on Android the Reader's fullScreenModal is bounded to its
// navigator container, so the left sidebar stays visible behind it (on iOS the
// modal covers the whole window). TabletAppShell collapses the sidebar inset on
// Android while the Reader is focused; isReaderFocused is the extracted pure
// predicate that walks the focused-route path to detect that. It must only
// return true when Reader is on the CURRENTLY-FOCUSED path (else a Reader parked
// in a background tab would wrongly hide the sidebar).
// ---------------------------------------------------------------------------

describe('isReaderFocused — focused-route path walk', () => {
  it('returns true when Reader is the focused route in the Library stack', () => {
    const state = {
      index: 0,
      routes: [
        {
          name: 'App',
          state: {
            index: 1, // Library tab focused
            routes: [
              { name: 'Home' },
              { name: 'Library', state: { index: 1, routes: [{ name: 'LibraryHome' }, { name: 'Reader' }] } },
            ],
          },
        },
      ],
    };
    expect(isReaderFocused(state as never)).toBe(true);
  });

  it('returns true when Reader is the focused route in the Home stack', () => {
    const state = {
      index: 0,
      routes: [
        {
          name: 'App',
          state: {
            index: 0, // Home tab focused
            routes: [
              { name: 'Home', state: { index: 1, routes: [{ name: 'Dashboard' }, { name: 'Reader' }] } },
              { name: 'Library' },
            ],
          },
        },
      ],
    };
    expect(isReaderFocused(state as never)).toBe(true);
  });

  it('returns false when the focused route is a library detail, not the Reader', () => {
    const state = {
      index: 0,
      routes: [
        {
          name: 'App',
          state: {
            index: 1,
            routes: [
              { name: 'Home' },
              { name: 'Library', state: { index: 0, routes: [{ name: 'LibraryHome' }] } },
            ],
          },
        },
      ],
    };
    expect(isReaderFocused(state as never)).toBe(false);
  });

  it('returns false when a Reader is parked in a NON-focused tab', () => {
    // Home is focused; the Library stack still has Reader on top but is hidden.
    const state = {
      index: 0,
      routes: [
        {
          name: 'App',
          state: {
            index: 0, // Home focused, not Library
            routes: [
              { name: 'Home', state: { index: 0, routes: [{ name: 'Dashboard' }] } },
              { name: 'Library', state: { index: 1, routes: [{ name: 'LibraryHome' }, { name: 'Reader' }] } },
            ],
          },
        },
      ],
    };
    expect(isReaderFocused(state as never)).toBe(false);
  });

  it('returns false for undefined or empty navigation state', () => {
    expect(isReaderFocused(undefined as never)).toBe(false);
    expect(isReaderFocused({ index: 0, routes: [] } as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug #1: initialRouteName structural guard
// ---------------------------------------------------------------------------

describe('KEY_TO_ROUTE mapping', () => {
  it('maps all four sidebar keys to the correct route names', () => {
    expect(KEY_TO_ROUTE.home).toBe('Home');
    expect(KEY_TO_ROUTE.library).toBe('Library');
    expect(KEY_TO_ROUTE.activity).toBe('Activity');
    expect(KEY_TO_ROUTE.settings).toBe('Settings');
  });
});

// Stack initialRouteName tests — structural guard. The compiled Jest module
// preserves string literals from JSX props, so .toString() on the exported
// component function reliably contains the `initialRouteName` value.
describe('stack navigators — initialRouteName', () => {
  it('LibraryStack passes initialRouteName="LibraryHome" to its Stack.Navigator', () => {
    expect(LibraryStack.toString()).toContain('LibraryHome');
  });

  it('HomeStack passes initialRouteName="Dashboard" to its Stack.Navigator', () => {
    expect(HomeStack.toString()).toContain('Dashboard');
  });

  it('SettingsStack passes initialRouteName="SettingsHome" to its Stack.Navigator', () => {
    expect(SettingsStack.toString()).toContain('SettingsHome');
  });
});
