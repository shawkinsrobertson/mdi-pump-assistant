# mdi-pump-assistant

Native Expo (React Native + TypeScript) app that reads live CGM data from
xDrip+'s local Nightscout-compatible web server, on-device, and (optionally)
readings from a standard Bluetooth glucose meter — no Nightscout, no cloud
roundtrip.

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
- Known device quirk: the Contour Next One requires a bonded (paired)
  connection to read the Glucose Measurement/RACP characteristics.
  Android's own pairing dialog should trigger automatically on first
  access; if it doesn't, that shows up as a connection/read error in the
  modal rather than failing silently.
- `BleManager` (from `react-native-ble-plx`) is created lazily on first
  use, not at module load — its native module doesn't exist outside a
  dev-client/production build, and eager construction at import time
  crashed the whole app in any environment without it (caught via web
  preview during development). Watch for this if refactoring
  `lib/ble/bleGlucoseMeter.ts` or `BleMeterModal.tsx`: any effect that
  unconditionally calls a BLE function on mount reintroduces the crash.

## Shared glucose state

`lib/useGlucoseSource.ts` is the single "current BG" + history state, fed
by both xDrip+ polling and the Bluetooth meter via namespaced source keys
(`replaceSource('xdrip', …)`, `reportReading('ble', …)`,
`replaceSource('ble', …)` for a history sync) — deliberately not two
parallel BG states that the UI has to reconcile. "Current" is always
whichever known reading is newest by its own timestamp, regardless of
which source last reported.

## Status

Live CGM + Bluetooth meter ingestion and the trend graph are working.
Bolus wizard math, settings, treatment logging, and any local DB are
intentionally not wired in yet.

- The bolus wizard math and settings pattern to port in next live in
  `shawkinsrobertson/shelbyai-diabetes-assistant` (web dashboard).
- `shawkinsrobertson/mdi-logger` is a prior CGM-only spike this project
  supersedes; its polling client and cleartext-HTTP fix were the reference
  for this app's first CGM screen.
