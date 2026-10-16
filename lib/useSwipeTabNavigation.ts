import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { Gesture } from 'react-native-gesture-handler';

// Horizontal distance (px) OR velocity (px/s) a gesture needs before it
// counts as a deliberate swipe rather than an incidental drag/tap — either
// one alone is enough, so a short, fast flick still registers.
const SWIPE_DISTANCE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 400;

// Lets any of the 4 bottom-tab screens (Dashboard/Logbook/Trends/Settings)
// respond to a left/right swipe the same way tapping the tab bar does, per
// the "swipe in addition to the bottom nav bar" request.
//
// Rebuilt on react-native-gesture-handler's native Gesture.Pan() instead of
// core React Native's PanResponder — PanResponder runs its activation
// check in JS on every touch move, which on a screen with a vertically
// scrolling ScrollView/SectionList (Dashboard, Trends) raced against the
// scroll view's own native gesture recognizer and lost half the time,
// reported as "jerky and doesn't always work." `activeOffsetX`/
// `failOffsetY` below hand that negotiation to the native gesture
// recognizer instead: a clearly-horizontal drag claims the pan, a
// clearly-vertical one releases to the ScrollView immediately, decided
// natively before any JS runs.
//
// Reads the tab order from the navigator's own state at gesture-end time
// rather than a hardcoded name list, so it stays correct if App.tsx's
// <Tab.Screen> order ever changes. `tabNavigation` should be the *tab*
// navigator's NavigationProp — for a screen nested under a stack (e.g.
// SettingsHomeScreen), pass `navigation.getParent()`, not `navigation`
// itself, or this will read the wrong navigator's state.
export function useSwipeTabNavigation(tabNavigation: NavigationProp<ParamListBase> | undefined) {
  return Gesture.Pan()
    // Claim the gesture quickly once there's any clear horizontal intent —
    // +/-10px of sideways movement is enough to activate.
    .activeOffsetX([-10, 10])
    // Only give up to the ScrollView on a *clearly* vertical drag — +/-20px
    // of vertical movement before 10px of horizontal has happened.
    //
    // These two numbers need failOffsetY > activeOffsetX, not the other
    // way around: whichever threshold a real, slightly-diagonal swipe
    // crosses first wins the gesture. The first cut of this had
    // activeOffsetX at 20 and failOffsetY at 10 — twice as hard to
    // activate as to cancel — so almost any natural swipe (nobody's thumb
    // moves in a perfectly straight horizontal line) failed to the
    // ScrollView before ever reaching the horizontal activation distance,
    // which is exactly the "still difficult, doesn't always work" report
    // this was supposed to fix.
    .failOffsetY([-20, 20])
    // tabNavigation.navigate() is a plain JS closure over React Navigation
    // state, not a worklet — must run on the JS thread rather than the UI
    // thread the new Gesture API defaults to.
    .runOnJS(true)
    .onEnd((event) => {
      if (!tabNavigation) return;
      const passedDistance = Math.abs(event.translationX) > SWIPE_DISTANCE_THRESHOLD;
      const passedVelocity = Math.abs(event.velocityX) > SWIPE_VELOCITY_THRESHOLD;
      if (!passedDistance && !passedVelocity) return;
      const state = tabNavigation.getState();
      if (!state) return;
      const nextIndex = event.translationX < 0 ? state.index + 1 : state.index - 1;
      const nextRoute = state.routes[nextIndex];
      if (!nextRoute) return;
      tabNavigation.navigate(nextRoute.name);
    });
}
