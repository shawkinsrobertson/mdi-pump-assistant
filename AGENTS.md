# mdi-pump-assistant

Native Expo (React Native + TypeScript) app that reads live CGM data from
xDrip+'s local Nightscout-compatible web server, on-device — no Nightscout,
no cloud roundtrip.

## CGM integration

- Endpoint: `http://127.0.0.1:17580/sgv.json?count=1` (confirmed reachable
  from the phone's own browser before any app code was written).
- Loopback is device-relative: the app must run on the same physical phone
  as xDrip+ (a dev client build), not an emulator.
- Android blocks cleartext HTTP by default. `expo-build-properties` sets
  `android.usesCleartextTraffic: true` in `app.json`. Requires
  `expo-dev-client` — not Expo Go.
- Poll interval: 30s.

## Status

Phase 0 only: live CGM ingestion (current SGV, polling, no-data/error
states). Bolus wizard math, settings, dashboard UI, treatment logging, and
any local DB are intentionally not wired in yet.

- The bolus wizard math and settings pattern to port in next live in
  `shawkinsrobertson/shelbyai-diabetes-assistant` (web dashboard).
- `shawkinsrobertson/mdi-logger` is a prior CGM-only spike this project
  supersedes; its polling client and cleartext-HTTP fix were the reference
  for this app's Phase 0.
