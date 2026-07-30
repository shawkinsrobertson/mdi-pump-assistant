# mdi-pump-assistant

Native Expo (React Native + TypeScript) app that reads live CGM data from
xDrip+'s local Nightscout-compatible web server and/or a Bluetooth glucose
meter, logs treatments to a local SQLite database, suggests bolus doses
from user-entered settings, and runs a real, MDI-adapted port of the
oref0 (OpenAPS) prediction algorithm locally — no Nightscout, no cloud
roundtrip. See `lib/oref-vendor/MODIFICATIONS.md` for exactly what was
vendored and what was changed to support MDI (fixed long-acting basal
instead of a pump's temp basal).

## App shell / navigation

Four persistent tabs via React Navigation's bottom tab navigator
(`App.tsx`): Dashboard, Logbook, Trends, Settings — each a screen under
`screens/`, not a modal. `lib/GlucoseContext.tsx` owns the xDrip+ poll and
`useGlucoseSource()` state above the tab navigator (a `GlucoseProvider`
wrapping everything), so any tab — not just Dashboard — can read live
current BG/history via `useGlucose()` without starting its own poll.
Quick-entry flows that don't warrant their own tab (Quick Log, Connect
Meter, Log Basal Dose, Prediction) remain modals, launched from
Dashboard. `TrendsScreen` is currently a placeholder — Time in Range,
Ambulatory Glucose Profile, and a clinician export are designed (see the
mockups from that session) but not yet built; "Patterns and Insights"
within Trends is explicitly deferred as a future LLM-integration task.

Adding `@react-navigation/*`, `react-native-screens`, and
`react-native-safe-area-context` means any environment building this app
needs a dev-client rebuild after pulling this change, not just a JS
reload — see "Verification notes" below.

## CGM integration (xDrip+)

- Endpoint: `http://127.0.0.1:17580/sgv.json?count=144` (confirmed reachable
  from the phone's own browser before any app code was written; count=144
  pulls enough history for the trend graph, not just the latest point).
- Loopback is device-relative: the app must run on the same physical phone
  as xDrip+ (a dev client build), not an emulator.
- Android blocks cleartext HTTP by default. `expo-build-properties` sets
  `android.usesCleartextTraffic: true` in `app.json`. Requires
  `expo-dev-client` — not Expo Go.
- Poll interval: 30s.

## Bluetooth glucose meter integration

Generic support for any meter implementing the Bluetooth SIG Glucose
Service (0x1808) — not per-brand code. Tested against a Contour Next One,
which is a well-behaved reference implementation of the standard profile
(the same one xDrip+/AAPS/Tidepool use), but nothing in `lib/ble/` assumes
that specific meter.

- `lib/ble/gatt.ts` — service/characteristic UUID constants.
- `lib/ble/sfloat.ts` — IEEE 11073-20601 16-bit SFLOAT decoder (pure
  function, hand-verified against spec test vectors including the
  NaN/±Infinity/reserved sentinel values).
- `lib/ble/parseGlucoseMeasurement.ts` — parses the Glucose Measurement
  characteristic (0x2A18) into the same `GlucoseReading` shape xDrip+
  readings use, converting either mg/dL or mmol/L encodings to canonical
  mg/dL, and surfacing any sensor status fault bits.
- `lib/ble/racp.ts` + `fetchStoredRecords` in `lib/ble/bleGlucoseMeter.ts` —
  Record Access Control Point protocol to pull a meter's full stored
  history (not just live readings taken while connected).
- `lib/ble/permissions.ts` — Android runtime permission request, branching
  on API level (BLUETOOTH_SCAN/CONNECT on 31+, ACCESS_FINE_LOCATION below
  that). `app.json`'s `react-native-ble-plx` plugin config sets
  `neverForLocation: true` since this app never derives location from BLE
  scan results.
- `components/BleMeterModal.tsx` — scan/connect/sync UI, opened from a
  "Connect meter" button on the main screen (no navigation library yet).
- Real on-device bug found and fixed: RACP sync (`fetchStoredRecords`)
  originally tore down the live measurement subscription and created a
  fresh one for the sync, then wrote the RACP command in the same tick.
  On the actual Contour Next One this produced Android error 129
  (`GATT_INTERNAL_ERROR`) — Android's BLE stack only tolerates one
  in-flight GATT operation per connection, and both the subscription
  teardown/recreation and the immediate write raced each other. Fixed by
  never tearing down the measurement subscription: `monitorLiveReadings`
  is established once per connection and lives for its whole lifetime;
  during a sync, `BleMeterModal` redirects its readings into a temporary
  buffer via a ref instead of removing/recreating the subscription.
  `fetchStoredRecords` itself only manages the RACP characteristic now
  (a monitor + a delay + the command write, still with a settle delay
  since RACP's own descriptor write and the command write are two
  separate operations on the same connection).
  A second, related bug this surfaced: removing a monitor subscription
  cancels its transaction, which delivers `BleErrorCode.OperationCancelled`
  ("Operation was cancelled") back to that same subscription's error
  callback — expected on intentional teardown (disconnect/cleanup), not a
  real failure. `lib/ble/errors.ts`'s `isOperationCancelledError` filters
  this out; without it, the old remove-then-recreate flow surfaced a
  confusing "Operation was cancelled" message on every sync attempt,
  which is what actually got reported and led to this fix.
  Still true: the Contour Next One needs a bonded (paired) connection for
  encrypted characteristics — `describeBleError` calls that out
  specifically when `attErrorCode` is `InsufficientAuthentication`/
  `InsufficientEncryption`, which is a different error than the one
  above.
  Follow-up: fixing the subscription churn removed the "operation
  cancelled" message but NOT the underlying GATT_INTERNAL_ERROR (129,
  `BleAndroidErrorCode.InternalError`) on the RACP write itself — it's
  reproducible on-device with no subscription race in the picture
  anymore. react-native-ble-plx exposes no bonding API at all (checked —
  nothing in its type defs mentions bonding), so there's no way to
  explicitly request it or reliably detect it beat us to the punch.
  `fetchStoredRecords`'s RACP write now retries once after a 2s delay on
  any failure, on the theory that Android's own auto-bond-and-retry
  completed just after our promise already rejected (a known
  react-native-ble-plx limitation/workaround pattern) — this is
  unverified, since it can't be tested off-device. `describeBleError`
  also now flags `BleAndroidErrorCode.InternalError` specifically with a
  hedged note (Android's own doc comment for this code is only "may
  happen due to implementation error in BLE stack" — genuinely
  ambiguous) suggesting manual pairing via Android Settings > Bluetooth
  as a fallback if the retry doesn't help. If this still fails, the next
  thing to check is whether the meter is actually showing as "paired" in
  Android's Bluetooth settings at all, independent of anything this app
  does.
  Second follow-up: researched xDrip+'s BLE handling for approach
  (GPL-3.0 — studied for architecture only, no code copied). Its core
  insight is strict single-GATT-operation-at-a-time sequencing: it never
  writes a characteristic until the *previous* operation's own completion
  callback has actually fired, and specifically waits for the RACP
  characteristic's CCCD (notification/indication-enable descriptor) write
  to succeed before ever writing the RACP command opcode. Our code was
  instead using `monitorCharacteristicForService` (which gives no
  completion signal for its internal descriptor write) followed by a
  blind fixed delay — a guess, not a confirmation.
  First attempt at fixing this tried calling `writeDescriptorForService`
  directly on RACP's CCCD — react-native-ble-plx unconditionally rejects
  this (error 506, `DescriptorWriteNotAllowed`: "not allowed by iOS and
  therefore forbidden on Android as well"; confirmed in the library's own
  Android source — it's a hard guard on the CCCD UUID specifically, not
  device/OS behavior). Enabling notifications/indications can *only* be
  triggered through `monitorCharacteristicForService`'s own internal
  mechanism; there is no way to directly await that internal write.
  Corrected fix: reading the CCCD (`readDescriptorForService`) is *not*
  similarly restricted, and Android only ever runs one GATT operation at
  a time per connection — so `fetchStoredRecords` now calls
  `monitorCharacteristicForService` (passed `'indication'` explicitly —
  RACP is indicate-only per spec, unlike Glucose Measurement's
  notify-only) and then immediately reads the same CCCD descriptor back
  and awaits it, purely as an ordering barrier: that read cannot complete
  before the monitor's own enable write (queued first on the same
  connection) has already finished. Only then is the RACP command
  written. The read-back value itself is just logged as a diagnostic
  (`CCCD_ENABLE_INDICATIONS` in `lib/ble/gatt.ts`), not enforced, in case
  this still isn't the whole story.
  Verified on-device: still reproduces the same GATT_INTERNAL_ERROR (129).
  The ordering-race theory (this fix, and the previous 2s bond-retry
  delay before it) has now been tried and hasn't resolved it — the root
  cause is still unknown. Deprioritized again per explicit direction to
  move on to the Trends screen; next time this is picked back up, the
  ordering theory should probably be considered ruled out rather than
  retried a third way, and something else investigated (e.g. whether the
  Contour Next One's RACP characteristic genuinely requires a bonded
  *and* explicitly re-encrypted link that Android's automatic bonding
  flow isn't actually establishing before our first touch of RACP, not
  just a timing/ordering issue).
  Needs a rebuilt dev client (not just a JS reload) any time a native
  module changes — see below.
- `BleManager` (from `react-native-ble-plx`) is created lazily on first
  use, not at module load — its native module doesn't exist outside a
  dev-client/production build, and eager construction at import time
  crashed the whole app in any environment without it (caught via web
  preview during development). Watch for this if refactoring
  `lib/ble/bleGlucoseMeter.ts` or `BleMeterModal.tsx`: any effect that
  unconditionally calls a BLE function on mount reintroduces the crash.

## Local treatment database

- `lib/db/treatments.ts` — expo-sqlite, one `treatments` table
  (event_type, insulin, carbs, created_at, and an unused `synced` column
  reserved for a future cloud-sync phase). `openDatabaseSync` is called
  lazily on first use, same reasoning as `BleManager` above.
- `insertTreatment`, `getRecentTreatments(count)`, and
  `getTreatmentsSince(timestamp)` — the last one exists specifically
  because IOB math needs "everything in the last DIA hours," not just
  "the most recent N rows."
- Dedup at write time: `insertTreatment` rejects (throws
  `DuplicateTreatmentError`) a treatment matching an existing row's
  event_type/insulin/carbs within the same whole second, so a double-tap
  or UI retry can't silently double-log a dose.
- Verified independently: the schema DDL and the dedup/time-window SQL
  were sanity-checked against Node's built-in `node:sqlite` module (same
  SQL, different JS wrapper) since expo-sqlite itself only runs natively.
  Actual on-device behavior via the real expo-sqlite binding is still
  unverified.

## Bolus wizard, IOB, and settings

- `lib/settings.ts` — AsyncStorage-backed settings (isf, carbRatio,
  targetBG, dia, penIncrement). The clinical values (isf/carbRatio/
  targetBG/dia) ship `null`, never a "typical" default — the wizard
  refuses to compute a suggestion until the user fills them in.
  penIncrement defaults to 1 (a rounding convenience, not a clinical
  value) and is user-editable in Settings.
  Multiple modals each hold their own `useSettings()` instance; there's
  no `window` to dispatch a change event from like the web app used, so
  `writeSettings` notifies a module-level listener set instead — don't
  remove that when touching this file, or Quick Log stops seeing
  Settings changes made while it's already mounted.
- `lib/bolus.ts` — `computeBolusWizard` (meal dose + correction − IOB,
  clamped to ≥0, rounded to the pen increment), ported from the web
  dashboard. Pure function, hand-verified with test vectors (mealDose,
  correction clamping when BG is below target, suggestion clamping when
  IOB exceeds meal+correction).
- `lib/iob.ts` — **placeholder linear-decay IOB model**, explicitly not
  the industry-standard exponential curve. mdi-logger's own brief flags
  "IOB model: exponential vs linear" as a decision to confirm with the
  human rather than silently pick — linear was chosen for now because
  it's the easiest to audit by hand. Revisit before relying on this for
  real dosing decisions.
- `components/QuickLogModal.tsx` — the bolus wizard UI. Meal/Correction
  toggle (not auto-inferred from carbs/insulin presence — matches the
  same UX decision made for the web app's dashboard panel). Refuses to
  show a computed suggestion (shows a manual-entry-only state instead) if
  IOB couldn't be loaded, rather than silently treating a failed query as
  "no insulin on board" — a real gap that was caught and fixed during
  development, not a hypothetical.
- `components/LogbookModal.tsx` — read-only, `getRecentTreatments`. No
  edit/delete yet (matches scope as asked; mdi-logger's product overview
  eventually wants editable/deletable entries, not built here).

## Shared glucose state

`lib/useGlucoseSource.ts` is the single "current BG" + history state, fed
by both xDrip+ polling and the Bluetooth meter via namespaced source keys
(`replaceSource('xdrip', …)`, `reportReading('ble', …)`,
`replaceSource('ble', …)` for a history sync) — deliberately not two
parallel BG states that the UI has to reconcile. "Current" is always
whichever known reading is newest by its own timestamp, regardless of
which source last reported. `QuickLogModal` reads `currentBG` from this
same shared state rather than fetching its own snapshot.

## Verification notes for future sessions

This environment has no physical device or emulator, so:
- BLE and SQLite behavior can only be verified indirectly: pure logic
  (SFLOAT decode, bolus math, IOB decay) via a throwaway `tsx` script
  against hand-computed test vectors; SQL correctness via Node's built-in
  `node:sqlite`; UI rendering and error-state handling via
  `expo start --web` + Playwright with mocked data (this reliably catches
  import-time crashes and unhandled-rejection bugs — it caught three real
  ones: eager `BleManager` construction, an effect that touched BLE
  unconditionally on mount, and two missing `.catch()` handlers on DB
  reads that would otherwise hang the UI or silently zero out IOB).
- expo-sqlite does not work in that web preview (no SharedArrayBuffer /
  cross-origin isolation in this setup) — DB insert/read correctness on
  the actual native binding is unverified and needs on-device testing.
- Any new native dependency requires a full dev-client rebuild
  (`npx expo prebuild --clean` then `expo run:android` or an EAS dev
  build) — a `git pull` + JS reload is not enough, and produces a
  "Cannot read properties of null (reading '<method>')" style error at
  the point the missing native module is first used.

## Status

Live CGM + Bluetooth meter ingestion, the trend graph, local treatment
storage, the bolus wizard, and a real local oref0-based prediction engine
(IOB/COB/autosens/carb-suggestion, adapted for a fixed MDI basal instead
of a pump's temp basal — see `lib/oref-vendor/`) are all implemented and
running on-device. The 4-tab navigation shell (Dashboard/Logbook/Trends/
Settings) is in place. Trends has working Time in Range and Ambulatory
Glucose Profile cards (`lib/trends/`, `components/AgpChart.tsx`) fed by
glucose_readings' 90-day retention; Patterns/Insights and the clinician
export remain "coming soon".

`lib/importers/nightscout.ts` parses real Nightscout-format entries/
treatments exports (the same shape AAPS/xDrip+/Nightscout all produce).
`scripts/seed-data/` bundles a small real export for testing, loaded via
a "Seed test data" button under Settings > Data and Sharing. This is
explicitly **not** the v1 import feature — the user wants a real "Import
from Nightscout backup" feature eventually (also Settings > Data and
Sharing), but v1 targets MDI users without that kind of migration
tooling. The seed button/bundled data should be removed before any real
release build.

A Figma design system (`Primitives`/`Color`/`Spacing`/`Radius` variable
collections + a 12-component library) was built to prototype the new
look before porting it to code — see the file linked in chat history.
The Figma MCP server is on a Starter-plan quota (6 read-tool-calls/
month, now exhausted for this billing period); further Figma work needs
either a plan upgrade or to wait for the reset.

The app-side restyle (ported by hand from the Figma work, not via Code
Connect — that needs an Org/Enterprise plan) landed in `lib/theme.ts`
(colors incl. brand blue `#054AE1`, spacing/radius/icon-size scales,
card shadow) and `components/ui/Card.tsx` (white + drop-shadow card,
replacing the old flat gray-fill style) and `components/AppTabBar.tsx`
(floating pill tab bar with brand-blue-active / gray-inactive icons,
replacing the edge-to-edge underlined bar). Dashboard's reading+chart
section, all of Trends' cards, and Settings (now grouped into Dosing /
Time in Range / Developer cards) all use the new Card. Logbook now
groups entries under Today/Yesterday/date section headers.

**On-device UI issues flagged from the first restyle pass (screenshots
of Dashboard + Trends):**
- Dashboard: content (reading card + action buttons) no longer
  vertically centers on short screens now that it's a `ScrollView`
  instead of a centered `View` — leaves a large empty gap above the tab
  bar. Fix likely `flexGrow: 1` + `justifyContent: 'center'` on
  `contentContainerStyle`, or accept top-alignment and tighten spacing
  instead. **Still open.**
- ~~Trends: the AGP chart renders as a thin squiggle...~~ **Fixed** —
  `components/AgpChart.tsx` now uses a data-adaptive y-domain (was a
  fixed 40-260 range) and a taller aspect ratio; Trends labels bumped to
  >=14pt. See the "user flow diagrams" work below.
- Bottom tab bar: user reports icons read as "very tiny" — current
  `iconSize.base` (26px) may need to move up a step (`lg`/32px), and/or
  the pill needs more padding. (The dark strip visible below the pill in
  the screenshots is the user's own Android system nav bar, confirmed
  not an app issue — no `AppTabBar`/`app.json` change needed there.)
- The floating gray gear-icon bubble seen top-right in both screenshots
  is confirmed to be Expo Dev Client's own floating dev-menu bubble, not
  app UI — no action needed.
- Dashboard IOB/COB header stat, Quick Actions icon row, and the
  collapsible Bolus Wizard card are still intentionally unbuilt (see
  below) — the "missing elements" feedback likely includes these; not a
  new regression.

## User flow diagrams (2nd design pass)

The user provided flowchart diagrams + notes covering: Quick Actions/
Bolus Wizard flow, a Connect Meter flow (entry point on Logbook), a
Logbook entry edit/delete flow, global rules (back nav everywhere,
confirm-before-submit on every log/edit/delete, voice entry on
treatment/notes fields), a Dashboard prediction callout, a 6-card
Settings restructure, Trends/Logbook screen specifics, and full Quick
Actions detail (Carbs/Insulin/Activity/Notes + chart markers). Broken
into lettered phases, tracked as tasks:

- **Phase A (done):** Trends visual scaling + export icon — see above.
- **Phase B (done):** Logbook edit/delete CRUD, a `notes` column on
  both `treatments` and `basal_doses` (migrated in), a search bar
  (`lib/logbookEntry.ts`, `components/LogbookEntryModal.tsx`), and a
  "Connect meter" link added to Logbook (Dashboard's own entry point
  was left in place, not removed — the flow diagram didn't say to
  remove it). Search is text-only (matches type/date-string/notes) —
  no true date-range picker yet, since no calendar library is in the
  project.
- **Phase C (done):** New `activities` and `note_entries` tables (see
  `lib/db/activities.ts`, `lib/db/noteEntries.ts`). Four Quick Action
  modals — Carbs, Insulin (both simple, no bolus calculation — reuse
  `treatments` with the unused field left null), Activity
  (intensity+duration), Notes (freeform text) — each a bottom sheet with
  Save/Clear and a confirm-before-save `Alert`. The same confirm step
  was added to the existing `QuickLogModal` (relabeled "Bolus Wizard" on
  Dashboard, since it computes a suggested dose unlike the new simple
  Carbs/Insulin actions) and `BasalDoseModal`. `GlucoseChart` now takes
  a `markers` prop and plots a small shape per logged action at a fixed
  baseline (not at its BG value, to stay legible); each action's
  color/shape is defined once in `lib/theme.ts`'s `quickActionStyles`
  and shared between its Quick Action button icon and its chart marker.
  A treatment with both carbs and insulin set (e.g. from the Bolus
  Wizard) shows as a carbs-colored marker — one marker per treatment
  row, not one per field, to keep the chart legible.
- **Phase D (done):** `components/PredictionCallout.tsx` — a
  simplified, always-on summary under the Dashboard glucose graph
  (suggested carbs / "no action, eventual BG X" / a Settings nudge),
  tapping it opens the existing `PredictionModal` for the full
  derivation rather than duplicating it. Refreshes on tab focus and
  after any log action. The Bolus Wizard's own accept/modify suggestion
  step was found already implemented in the existing `QuickLogModal`
  (pre-filled suggested insulin, editable, with a "reset to suggested"
  undo) — no changes needed there beyond Phase C's rename/confirm step.

  **Bug found via the new callout, now fixed:** `computeAutosens` in
  `lib/oref/predictionCore.ts` used `currentBasal` as
  `profile.max_daily_basal`, autosens.js's normalizing denominator (see
  the comment above that function for why). With no basal dose logged —
  a completely normal state, not an error — `currentBasal` is 0, so
  autosens divided by zero, producing a NaN ratio that poisoned ISF/
  deviation/eventualBG all the way through `determine_basal`, surfacing
  only as an opaque "could not calculate eventualBG" error with zero
  indication of the real cause. Fixed by bailing out to the same safe
  `{ratio: 1, insufficientData: true}` default already used for
  insufficient glucose history, whenever there's no current basal to
  normalize against. `lib/oref/predictionCore.ts` had solid existing
  test coverage (`__tests__/predictionCore.test.js`) but every autosens
  fixture happened to include a logged basal dose except the one under
  the glucose-count threshold — this exact combination (>=72 points,
  zero basal) was untested; a regression test for it is now in place.
- **Phase E (done):** Settings is now a nested stack
  (`screens/settings/SettingsNavigator.tsx`) — a home screen listing 6
  category cards, each its own screen with a real back button (also
  covers part of Phase F's back-nav requirement). Integrations,
  Tutorials and Help, and Data and Sharing (besides the moved dev seed
  tool) are placeholder "coming soon" screens. Account and Profile is
  real — absorbs the old Dosing + Time in Range cards, merged with
  Treatment Configurations per the spec (no account system exists yet).
  Display and Theme and Notifications and Reminders are both real,
  working features, not placeholders:
  - **Theming** (`lib/ThemeContext.tsx`, `lib/theme.ts`'s
    `lightColors`/`darkColors`): persisted mode (light/dark/system,
    resolved against `useColorScheme()`), font size, and 12h/24h time
    format (`lib/time.ts`'s `formatTime`, not yet wired into any
    screen's actual clock display). **Scope note:** only Settings
    itself consumes `useTheme()` and re-renders on theme/font changes
    today. Dashboard/Logbook/Trends still import `lib/theme.ts`'s
    static `colors` (== `lightColors`) and won't visually respond to
    dark mode yet — deliberately deferred so the mechanical "migrate
    every screen's styles to useTheme()" pass happens alongside the
    Dashboard UI work the user wants to do next, rather than rushed
    through blind here. `app.json`'s `userInterfaceStyle` was changed
    from `"light"` (hard-locked) to `"automatic"` so the OS-level
    setting no longer fights the in-app one.
  - **Notifications** (`lib/notifications.ts`): persisted high/low
    glucose thresholds + DND window, real permission request flow, and
    actually wired into `GlucoseContext`'s live reading flow — a new
    reading crossing a threshold fires a real local notification
    (with a 20-minute re-notify cooldown per zone, and a DND check).
    New native module (`expo-notifications`) — **needs a dev-client
    rebuild** (`npx expo run:android`) before any of this can be
    tested on-device, same category as the BLE/react-native-screens
    additions. Also added `@react-navigation/native-stack` for the
    Settings navigator itself — same rebuild requirement.
- **Phase F (partly done via Phase E):** `LogbookEntryModal` and all 6
  Settings sub-screens now have real back navigation (the stack's own
  header, or a chevron). Dashboard's "Welcome, User" header is done (see
  below). Still open: voice entry (mic icon) on treatment/notes inputs —
  flagged as its own native-dependency risk (needs a library like
  `@react-native-voice/voice`, same rebuild category as the above).

**Dashboard UI finishing pass** (after Phase E, same session):
`DashboardScreen.tsx` is now fully migrated to `useTheme()` (the first
screen besides Settings to consume it — colors, spacing, radius,
iconSize, and font scale all dynamic; every remaining hardcoded hex was
replaced with a theme token). Added: a "Welcome, User" header above the
reading card; an IOB/COB stat in the reading card's top-right corner
(the mockup element that was still missing), fed by a new
`lib/oref/usePrediction.ts` hook shared between this stat and
`PredictionCallout` (which was refactored to a pure presentational
component taking `result`/`error`/`checked` as props, so the same
`runPrediction()` call isn't made twice). Fixed the vertical-centering
regression (`flexGrow: 1` + `justifyContent: 'center'` on the
ScrollView's `contentContainerStyle`) and bumped the floating tab bar's
icon size (`iconSize.base` 26px → `iconSize.lg` 32px, plus more pill
padding) per the "icons read as tiny" feedback.

The Bolus Wizard is now also a collapsible inline card
(`components/BolusWizardCard.tsx`, title + chevron, collapsed by
default) matching the reference mockup, replacing the old
`QuickLogModal` (deleted — same IOB-aware suggestion logic, just
re-hosted inline and made theme-aware instead of a separate modal).
`AppTabBar` and the rest of Dashboard's *sibling* screens (Logbook,
Trends) still use the static `colors` export, not `useTheme()` — same
deferred-migration note as Phase E.

Not done yet: the exponential IOB model (current model is an explicitly-
flagged linear placeholder — separate from the vendored oref0 IOB calc,
which is used only for the prediction engine), Trends' Patterns/
Insights (an LLM feature) and clinician export, the real (v1+)
Nightscout import feature, and
a live-timer notification for Activity logging (a simpler start/
duration-only version is what's built now). The BLE meter's RACP "Sync History" still
hits a `GATT_INTERNAL_ERROR` that hasn't been resolved. Migrating
Dashboard/Logbook/Trends onto the new theme system (dark mode, font
scale, time format) is also still open — see Phase E's scope note.

- `shawkinsrobertson/shelbyai-diabetes-assistant` is the web dashboard
  this app's bolus wizard and Quick Log UX were ported from.
- `shawkinsrobertson/mdi-logger` is a prior CGM-only spike this project
  supersedes; its polling client and cleartext-HTTP fix were the
  reference for this app's first CGM screen.

**Follow-up correction pass on the glucose card** (immediately after the
above, same session): user feedback on the first pass flagged 3 real
issues, verified visually via a static HTML/CSS repro of the exact style
values rendered through headless Chromium (no device/emulator available
in this environment) before committing —
  - "mg/dL" pixel-aligned at the same x as the 96pt glucose number still
    looked offset further left, because the numeral glyph (particularly
    "1") has much more built-in left bearing than "mg/dL"'s "m". Added a
    small `marginLeft` nudge to the unit text to match the number's
    visual ink edge rather than its box edge. Same issue mirrored on the
    right: "min ago" flush against the card's true right edge looked
    like it overshot the chart, since the chart's own SVG right padding
    (`PADDING.right`) means the plotted line/bands stop short of that
    edge. `GlucoseChart.tsx` now exports `CHART_RIGHT_PADDING_RATIO` so
    Dashboard's overlay row can match it exactly instead of guessing.
  - The dashed prediction line wasn't rendering. Root cause:
    determine-basal.js has its own early "CGM data is unchanged, doing
    nothing" shortcut (real, common — many CGM sources report a genuine
    0 delta between consecutive readings) that returns before ever
    computing `predBGs` — that's a pump temp-basal decision, not a
    reason to predict nothing. `predictionCore.ts` now replicates that
    same flat-detection condition and, when it fires, fills `predBGs`
    with a flat line at the current glucose instead of `null` — a
    faithful visualization of oref0's own conclusion, not a fabrication.
  - The chart read as too small to be legible. Bumped `GlucoseChart.tsx`'s
    `HEIGHT` constant from 280 to 364 (+30%, width already fills the
    card so height was the only lever).

**Second follow-up: shrink the reading, enlarge the chart further.**
User feedback: the "mg/dL" gap was still too big, and the chart should be
this card's focal point rather than the number. Reduced `glucose` from
96pt to 60pt (and `arrow`/`delta` proportionally, 40→26 / 16→13), which
freed up room to grow `GlucoseChart.tsx`'s `HEIGHT` again, 364→500.
Re-derived `unit`'s `marginTop` (now -12, down from the implicit 0) by
measuring actual rendered pixel rows in the headless-Chromium repro
rather than eyeballing it — the glucose number's line box leaves empty
space below the digits beyond their visible ink (ordinary font metrics),
so closing that gap to the requested ~4px needed a negative offset, not
just a smaller positive one. `marginLeft` also scaled down (8→5) to
match the smaller font's proportionally smaller optical inset.

**Dashboard glucose card follow-up pass** (mockup-driven, same session
as the finishing pass above): reworked the reading card per 5 specific
requests —
  - Glucose reading, trend arrow, unit, and the new reading-to-reading
    **delta** (`formatDelta()` in `lib/glucose.ts`, formatting the
    `delta` field xDrip+'s `sgv.json` already provides) are now one
    left-aligned block (`readingCard` switched from `alignItems:
    'center'` to `'stretch'`, with a new `readingBlock` wrapper).
  - The old under-the-number clock-time status line is gone. In its
    place: a right-aligned **"Nmin ago"** line (`formatMinutesAgo()`)
    sitting just above the chart, with the STALE badge alongside it.
  - The chart's data source changed from `GlucoseContext`'s in-memory
    `history` (poll-bounded to xDrip+'s own `count=144` fetch) to a
    direct `getReadingsSince()` DB query, re-run whenever the window
    changes or a new reading lands. **Tapping the chart cycles the
    window 3h → 6h → 12h → 24h** (`GlucoseChart`'s new `onPress` prop);
    no schema change was needed since `glucose_readings` already
    persists 90 days regardless of what's polled.
  - `predictionCore.ts`'s `PredictionResult` now exposes `predBGs`
    (`rT.predBGs.COB` preferred, else `.IOB`) — determine-basal.js's
    own internal predicted-BG curve, not a separate calculation. Note:
    for a perfectly flat/unchanging CGM feed, determine-basal.js takes
    its own early "CGM data is unchanged, doing nothing" shortcut and
    never computes `predBGs` at all (covered by a test in
    `predictionCore.test.js` using the same declining-BG fixture as the
    MDI fork test, since a flat fixture doesn't reach that code path).
    Dashboard turns the first 12 points (~60min) into a dashed leading
    line on the chart, prefixed with the last real reading for visual
    continuity.
  - `GlucoseChart.tsx` gained vertical dashed gridlines at an interval
    keyed off the selected window (30/60/120/240min for 3/6/12/24h)
    with time labels via `lib/time.ts`'s `formatTime()` — the first
    real use of the Display setting's 12h/24h time-format preference,
    previously built but unwired. The x-axis domain is now fixed to
    `[now - windowHours, now]` (extended to cover the prediction line)
    rather than derived from the data's own extent, so gridlines stay
    on stable clock marks. The Y-axis 70/180 in-range labels went from
    10pt to 14pt/semibold.
  - `formatClockTime()` (superseded by `formatMinutesAgo()`) was
    removed from `lib/glucose.ts` as dead code.

**Chart gridline follow-up**: reduced the 3h window's vertical gridlines
from 30min to 60min intervals (`GRID_INTERVAL_MIN` in `GlucoseChart.tsx`)
specifically to free up horizontal room for larger time-axis labels —
bumped 10pt → 14pt to match the Y-axis range labels, per feedback that
the smaller font was hard to read.

**Background AI insight generation** (new feature, not a follow-up):
weekly (best-effort) background task that summarizes the last 7 days of
local data (Time in Range, AGP stats, severe low/high counts, overnight
low %, carb/insulin/activity/note counts — all real computed values, no
pattern-detection ML/heuristics invented here) and POSTs it to a
user-configured webhook (Settings > Integrations > AI Insights) for
external LLM-generated insight text, storing whatever comes back for the
Trends screen's "Patterns and Insights" card (previously a hardcoded
"coming soon" placeholder) to display.
  - `lib/insights/insightPayload.ts` (pure, tested) / `buildInsightPayload.ts`
    (I/O shell) — same split as `predictionCore.ts`/`runPrediction.ts`.
  - `lib/tasks/insightTask.ts` exports `runInsightGeneration(source)`,
    shared verbatim by the `expo-task-manager` background task and the
    Trends screen's "Generate Insights Now" button — no separate payload
    path was built for scheduled vs. manual, and that same button is also
    the dev-testing hook (no extra debug-only button needed).
    `TaskManager.defineTask()` is called at module load via a side-effect
    import in `index.ts` (not just `App.tsx`), since a headless JS
    context can invoke the task without the component tree ever mounting.
  - `lib/db/insights.ts` stores every run (`insertInsight`/
    `getLatestInsight`) so Trends always has something to show even if
    the background task last fired hours ago and the person hasn't
    reopened the app since.
  - New native modules (`expo-task-manager`, `expo-background-fetch`) —
    **needs a dev-client rebuild** before this can run on-device, same
    category as the BLE/notifications/navigator additions earlier in this
    doc. Added `ios.infoPlist.UIBackgroundModes: ["fetch"]` and
    `android.permission.RECEIVE_BOOT_COMPLETED` (for `startOnBoot`) to
    `app.json`.
  - Per Expo's own docs, `minimumInterval` is a floor the OS is free to
    miss — iOS especially adapts real firing to the person's own usage
    patterns over time, so irregular timing in testing is expected, not
    a bug.
  - The insight response shape is whatever the configured webhook
    returns, not something this app defines — see the follow-up below for
    how that's actually parsed.

**Insight parsing follow-up** (same session, once the real webhook was
live): the n8n workflow's own "parse model output" step was itself
failing whenever the model wrapped its JSON reply in a fenced markdown
code block (a common LLM habit), falling back to an error-wrapper shape
— `{error: "Failed to parse model output", raw: "<fenced JSON text>"}` —
and the Trends card was rendering that literal wrapper as a JSON blob
instead of the actual insight sitting inside `raw`. Replaced the old
field-name-only `extractInsightText()` with
`lib/insights/parseInsightContent.ts` (unit tested against the real
observed payload shape), which: strips a fenced code block and re-parses
the JSON inside it when present; specifically unwraps that `{error, raw}`
shape by re-parsing `raw` the same way; and renders the resulting
`summary`/`patterns`/`considerations`/`doctor_discussion_topics` fields
as real sections on the Trends card (bulleted, with per-pattern
confidence folded in) instead of one text blob — while still falling
back gracefully to plain text for any other/unrecognized webhook
response shape, since the workflow behind the webhook isn't something
this app controls or can assume a fixed contract with.
