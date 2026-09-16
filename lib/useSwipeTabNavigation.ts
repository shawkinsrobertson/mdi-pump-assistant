import { useRef } from 'react';
import { PanResponder, type PanResponderInstance } from 'react-native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

// Horizontal distance (px) a gesture must travel before it's treated as a
// deliberate swipe rather than an incidental drag/tap.
const SWIPE_THRESHOLD = 60;
// How much more horizontal than vertical movement a gesture needs before
// this claims it — keeps vertical ScrollView/SectionList scrolling from
// ever being misread as a tab swipe.
const DIRECTION_RATIO = 1.5;

// Lets any of the 4 bottom-tab screens (Dashboard/Logbook/Trends/Settings)
// respond to a left/right swipe the same way tapping the tab bar does, per
// the "swipe in addition to the bottom nav bar" request. Reads the tab
// order from the navigator's own state at release time rather than a
// hardcoded name list, so it stays correct if App.tsx's <Tab.Screen> order
// ever changes. `tabNavigation` should be the *tab* navigator's
// NavigationProp — for a screen nested under a stack (e.g.
// SettingsHomeScreen), pass `navigation.getParent()`, not `navigation`
// itself, or this will read the wrong navigator's state.
export function useSwipeTabNavigation(tabNavigation: NavigationProp<ParamListBase> | undefined): PanResponderInstance {
  return useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > SWIPE_THRESHOLD / 2 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * DIRECTION_RATIO,
      onPanResponderRelease: (_evt, gesture) => {
        if (!tabNavigation || Math.abs(gesture.dx) < SWIPE_THRESHOLD) return;
        const state = tabNavigation.getState();
        if (!state) return;
        const nextIndex = gesture.dx < 0 ? state.index + 1 : state.index - 1;
        const nextRoute = state.routes[nextIndex];
        if (!nextRoute) return;
        tabNavigation.navigate(nextRoute.name);
      },
    }),
  ).current;
}
