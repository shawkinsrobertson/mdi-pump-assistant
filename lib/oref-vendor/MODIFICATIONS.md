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
- `lib/meal/index.js`, `lib/meal/total.js` (the carb-absorption/COB orchestration built on cob.js — needed to produce real `meal_data`, added when the orchestration layer was wired up)
- `lib/glucose-get-last.js` (oref0's own utility for turning raw glucose history into the `glucose_status` shape `determine_basal` expects; added for the same reason)

## What changed

Three forks were added to `lib/determine-basal/determine-basal.js`, each
marked in-place with `// >>> MDI-FORK (not in upstream oref0): begin` /
`// <<< MDI-FORK: end` comments so the diff against upstream stays
auditable at a glance. No other vendored file was touched.

### Why

oref0 was written for insulin pumps, which can lower delivery below the
programmed basal rate via a temporary basal rate (a "temp basal"), including
setting it to zero to prevent or correct a low. This app targets MDI
(multiple daily injection) users, whose basal insulin is a long-acting
injection (glargine/detemir/degludec) already fully on board — there is no
way to "un-inject" it or otherwise reduce it once given.

`determine_basal()`'s control flow reaches **three** separate points where
this pump-specific assumption is load-bearing — all three try to zero a
pump's temp basal for hypo prevention/correction, just under different
trigger conditions:

1. **The `if (rate <= 0)` branch**, inside the "eventual BG below target"
   section. oref0 computes how long a zero temp basal needs to run to let
   BG correct back up to target (`durationReq`).
2. **The "predictive low glucose suspend" branch**, earlier in the
   function, whenever `bg` or a predicted-BG guard array (`minGuardBG`)
   drops below a hypo-safety `threshold`. Also computes a `durationReq` for
   a zero temp.
3. **The "severe predicted low" branch** (`naive_eventualBG < 40`), nested
   inside the same section as #1 but gated on a different, rarer condition
   (BG rising faster than expected, yet the crude no-averaging BG
   projection is still catastrophic). Sets a flat 30-minute zero temp
   without even computing a magnitude — oref0 treats this case as urgent
   enough not to bother.

Branches #2 and #3 were found by actually running the orchestration layer
(`lib/oref/predictionCore.ts`) end-to-end against a realistic falling-BG
scenario: the original fork (#1 above) never fired, because #2 caught the
scenario first. The initial Step 4 analysis had only identified #1 as the
"only place that needs new logic for MDI" — that assumption didn't hold up
under a real test, so forks #2 and #3 were added afterward as their own
reviewed change.

### What each fork does

When `profile.mdiMode` is truthy and one of these branches is reached, each
converts the pump's "how much to withhold" quantity into a carb suggestion
via the user's own carb ratio, sets `rT.carbsSuggested` / `rT.mdiExcessInsulin`,
appends a human-readable explanation to `rT.reason`, and returns
immediately — skipping the pump-only zero-temp calculation entirely:

1. `excessInsulin = -insulinReq` (insulinReq is oref0's own already-computed
   negative "less insulin than currently delivering would be ideal" value).
2. `excessInsulin = worstCaseInsulinReq` (oref0's own already-computed
   value — `(target_bg - minGuardBG) / sens` — no sign flip needed, it's
   already positive here).
3. `excessInsulin = (target_bg - naive_eventualBG) / sens` — this one isn't
   an existing oref0 variable (oref0 doesn't need a magnitude for this
   branch, just a flat 30m zero temp), so it's a new calculation, but it
   follows the exact same "(target − predicted) / sens" ISF-correction
   pattern used by oref0 itself throughout this file (see #2, and
   `insulinReq`'s own definition) rather than inventing a new formula.

All three then do `carbsSuggested = round(excessInsulin * profile.carb_ratio, 1)`.

This mirrors the existing carbsReq feature already present elsewhere in
oref0 (suggesting carbs to prevent a low), applied to the case where excess
*basal* insulin (rather than excess *bolus* insulin) is the source of the
predicted low.

### How MDI mode is triggered

`profile.mdiMode` is an optional flag on the existing `profile` object that
was already threaded through every `determine_basal()` call — no function
signature changed. When unset (as in every ported oref0 test), execution is
identical to upstream. This is intentional: it's what let Step 7 (and the
re-check after adding forks #2/#3) confirm all originally-ported oref0
tests pass completely unchanged after these edits, proving the forks add a
new code path without altering the existing pump path. See
`__tests__/mdi-fork.test.js` for tests that set `profile.mdiMode = true`
and exercise each branch specifically.

Branch #2's excess-insulin figure depends on `minGuardBG`, a real
per-5-minute predicted-BG guard array computed deep inside
`determine_basal` from `iob_data` — unlike branches #1 and #3, a flat
`iob_data` object (fine for testing those two) leaves `minGuardBG` at an
unpopulated sentinel default and produces a nonsense result. Its test uses
a minimal but realistic 48-entry iobArray instead (see the test file).

### What still feeds this

`profile.current_basal` (used earlier in `determine_basal` to compute
`insulinReq`) is supplied by the orchestration layer
(`lib/oref/predictionCore.ts`) as the *virtual* basal rate from the user's
long-acting insulin dose, computed by `lib/mdi/basalCurve.ts`
(`currentBasalRate()`), not a pump's programmed rate. `lib/oref/runPrediction.ts`
is the thin I/O shell that fetches real glucose/treatment/basal-dose history
and settings and calls into `predictionCore.ts`.

Carb-on-board (COB) is computed for real via the vendored `lib/meal/`
orchestration and `cob.js`'s deviation-based carb-absorption detection —
not stubbed out — fed by glucose history that's durably persisted to a
local `glucose_readings` table (`lib/db/glucoseReadings.ts`) rather than
kept in memory only, so COB detection survives an app restart. This mirrors
how AndroidAPS solves the same problem (persisting every received CGM
value locally). Autosens (`lib/oref-vendor/lib/determine-basal/autosens.js`)
is vendored but not yet wired in; a neutral `{ratio: 1}` is passed instead —
a deliberate, flagged simplification for this first pass, not a stand-in
for a decision that was made silently.
