# Modifications to vendored oref0 code

This directory vendors source files from
[openaps/oref0](https://github.com/openaps/oref0) (MIT licensed — see
`LICENSE.txt`), at:

- Source repo: https://github.com/openaps/oref0
- Commit: `88cf032aa74ff25f69464a7d9cd601ee3940c0b3`
- Version: v0.7.1

Vendored files (copied unmodified, one commit, before any changes below):

- `lib/iob/` (full directory)
- `lib/determine-basal/determine-basal.js`
- `lib/determine-basal/cob.js`
- `lib/determine-basal/autosens.js`
- `lib/round-basal.js`, `lib/basal-set-temp.js`, `lib/percentile.js` (transitive dependencies of the above)
- `lib/profile/basal.js`, `lib/profile/isf.js`, `lib/meal/history.js` (transitive dependencies of the above)

## What changed

One fork was added to `lib/determine-basal/determine-basal.js`, marked
in-place with `// >>> MDI-FORK (not in upstream oref0): begin` /
`// <<< MDI-FORK: end` comments so the diff against upstream stays
auditable at a glance. No other vendored file was touched.

### Why

oref0 was written for insulin pumps, which can lower delivery below the
programmed basal rate via a temporary basal rate (a "temp basal"). This app
targets MDI (multiple daily injection) users, whose basal insulin is a
long-acting injection (glargine/detemir/degludec) already fully on board —
there is no way to "un-inject" it or otherwise reduce it once given.

`determine_basal()`'s logic reaches exactly one point where this
pump-specific assumption is load-bearing: the `if (rate <= 0)` branch inside
the "eventual BG below target" section. There, oref0 computes how long a
zero temp basal needs to run to let BG correct back up to target
(`durationReq`). For MDI, "run a zero temp" isn't an available action.

### What the fork does

When `profile.mdiMode` is truthy and this branch is reached:

1. Takes the already-computed `insulinReq` (negative here, meaning "less
   insulin than the current basal is delivering would be ideal").
2. Flips it to a positive "excess insulin" amount (`excessInsulin = -insulinReq`).
3. Converts that excess insulin to a carbohydrate suggestion via the
   user's own carb ratio: `carbsSuggested = excessInsulin * profile.carb_ratio`.
4. Sets `rT.carbsSuggested` and `rT.mdiExcessInsulin` on the result, appends
   a human-readable explanation to `rT.reason`, and returns immediately —
   skipping the pump-only `durationReq`/`setTempBasal` calculation entirely.

This mirrors the existing carbsReq feature already present elsewhere in
oref0 (suggesting carbs to prevent a low), applied to the case where excess
*basal* insulin (rather than excess *bolus* insulin) is the source of the
predicted low.

### How MDI mode is triggered

`profile.mdiMode` is an optional flag on the existing `profile` object that
was already threaded through every `determine_basal()` call — no function
signature changed. When unset (as in every ported oref0 test), execution is
identical to upstream. This is intentional: it's what let Step 7 confirm
all 37 originally-ported oref0 tests pass completely unchanged after this
edit, proving the fork adds a new code path without altering the existing
pump path. See `__tests__/mdi-fork.test.js` for tests that set
`profile.mdiMode = true` and exercise the new branch specifically.

### What still feeds this

`profile.current_basal` (used earlier in `determine_basal` to compute
`insulinReq`) is expected to be supplied by this app as the *virtual* basal
rate from the user's long-acting insulin dose, computed by
`lib/mdi/basalCurve.ts` (`currentBasalRate()`), not a pump's programmed
rate. That wiring — an orchestration layer that calls `determine_basal`
with real app data (glucose, IOB, COB, and this virtual basal) — has not
been built yet; it's a separate task from this vendoring/fork work.
