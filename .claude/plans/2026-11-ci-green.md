# CI: green on main, lint running (G0)

**Tier:** Simple. **Lane:** project session. **Program:** `audit-remediation-2026-10/beta-resequence.md`, relay CI.

## Intent (grilled)

Skip line: no separate grill; the path-to-beta grill and DECISIONS 2026-10-23 cover it. The bar:
"CI green, with lint running again and the fidelity suite either in CI or run on each tile rebuild
with a recorded result." In the grill, green CI is a MARVIN call confirmed at the gate.

## Problem

Main has been red since at least 2026-10-07. `npm audit --audit-level=high` fails, and because
that step sits before Lint, lint never runs (`.github/workflows/ci.yml:37-41`). Four high groups,
all dev-chain: brace-expansion, js-yaml, vite (with launch-editor), happy-dom. `npm audit
--omit=dev` finds 0. **The pattern is the defect:** the same step went red again 16 and 9 days after
each of the last two fixes, on new advisories in tools that never reach a visitor, and each time
it hid lint.

## Change

**Workflow (`ci.yml`):**
- Lint moves above Audit, so a red audit can never hide it.
- The blocking audit becomes `npm audit --omit=dev --audit-level=high`: a high advisory in anything
  shipped to visitors blocks.
- A second step reports the full audit without blocking (`continue-on-error`), so dev-chain
  findings stay visible in the run.
- A weekly `schedule:` run, because a new runtime advisory should turn CI red without waiting for
  a push; GitHub's failure email reaches Lee until OPS exists.

*Why not only bump:* bumps alone clear today's list and go red at the next dev advisory, which is
how CI stayed red for a month with lint dark. *What this gives up:* a high in a dev tool no longer
blocks. Those tools run only on our machines and CI, on our own code, so a block protects nothing
a visitor touches; the report step keeps them seen, and they are bumped on the next relay that
touches the lock. The dev chain's remaining moderates (17 today, eslint core included) go to the
Parking Lot, held by the eslint-config-next pin.

**Dependencies (package.json + lock), probed in a disposable copy on 2026-11-01:**

| Package | From | To | Why |
|---|---|---|---|
| happy-dom | ^20.8.7 | ^21.0.4 | high, direct |
| vitest, @vitest/coverage-v8 | ^4.1.1 | ^4.1.12 | moderate; carries vite |
| vite (lock) | 8.0.16 | 8.3.5 | high |
| brace-expansion, js-yaml (lock) | 1.1.18, 4.3.1 | 1.1.21, 4.3.2 | high |
| @mapbox/vector-tile, pbf, @types/geojson | transitive | direct dev | the tile audits import them. M1a's item moved here; the hand-off's terminal-install clause and M1a's line are struck. Licences and registry entries checked (BSD-3-Clause, BSD-3-Clause, MIT); all three are already in the tree as maplibre-gl's own dependencies, so no new code enters |

Bumped as well as gating on runtime, because the bumps cost nothing and lint and the test runner
are better current.

`npm install`, `npm update` and `npm audit fix` under npm 10.9.4 crash on this lockfile with
`Cannot read properties of null (reading 'edgesOut')`. The lock is generated with
`npx npm@12.2.1` (it warns about Node 22.22.1, and works; lockfileVersion stays 3), then checked
with `npm ci` under 10.9.4, which CI uses. CONTRIBUTING gets one line on this. The session runs
the install: C7's "Lee runs the installs" exists because the classifier blocked them, which it no
longer does for this.

**Runtime diff of the lock:** nanoid 3.3.18 to 3.3.20, plus optional fsevents. Nothing else
non-dev moves; next 16.4.2 and maplibre-gl 6.15.0 are unchanged.

**`scripts/lib/mvt-reader.ts`:** MapLibre 6 brought pbf 5, which exports only `PbfReader`; the
reader's `new Pbf(...)` has thrown ever since (main 120cc10), and `tile-reader.ts` swallows it as
"tile doesn't exist". One-line fix: `PbfLib.PbfReader ?? default ?? PbfLib`. It stops the suite
being silently wrong; it ships here because this relay pins pbf 5. A fixture test parses one real
MVT tile through the reader and asserts a layer and a feature count, mutation-proven through
`scripts/mutation-battery.mjs`. The swallowing `catch` is PIPE's, recorded below.

## The fidelity suite stays out of CI

It reads `data/tiles/opencanopy.pmtiles` (3.8 GB) and the NDJSON build inputs, so a CI run is
impractical; it runs per rebuild, inside PIPE, with a recorded result. The inputs for v10 exist at
`~/Projects/opencanopy/data/checkpoint/preprocessed/` (May 2026), and the archive can be fetched
from R2.

This relay writes the baseline: `research/beta-gate/fidelity-baseline-2026-11-01.md`, with one row
per audit, each marked **measured** or **no input**, from a run with the archive and the
checkpoint NDJSON in place on the fixed reader. A TRACEABILITY row per failing audit. PIPE's spec
gains the defects the baseline finds, including at least: audits that report PASS having checked
nothing, the `catch` in `tile-reader.ts` hiding parse errors as missing tiles, and input paths that
do not match where the pipeline writes.

## Verification

- On the PR branch: `npm ci` (npm 10), lint, `npm test`, build, both audit steps.
- **Negative controls:** the blocking audit on main's lock with a runtime advisory is not
  constructible today (0 runtime findings), so the control is the step's flags, read from the run
  log. Lint: a deliberate lint error on a throwaway commit turns the PR red with Audit not reached.
  Reader: the fixture test fails on the unpatched line.
- 59 files and 867 tests pass on happy-dom 21, with the same test names as main (compared by name,
  not count) and no new skips; one DOM test mutated to confirm it can still fail.
- **Done when** main is green **three runs running** with Lint executed, read from `gh run view`.
  An owed item stays open until the third. At the gate the bar reads "green at the label", not
  "was green once".

## Change safety and release

PR first; CI green on the PR; Lee's yes in conversation; the session merges and pushes
(`bdf0d2b` and Phase 0's docs land first or together). Then `state:ready` on the deploy and HTTP
200 on `/`, `/map`, `/privacy`. Rollback: republish the previous deploy id, recorded before the
push; a session does not roll back production alone, it brings Lee the choice (C2).

Sequence: the baseline run finishes before `npm ci` replaces this worktree's node_modules.

## Review Focus

1. A lock generated by npm 12 that npm 10 rejects. Owner: this relay.
2. happy-dom 21 making a test vacuous. Owner: this relay (by-name comparison, one mutation).
3. `--omit=dev` hiding a dependency wrongly marked dev. Owner: this relay (the lock's runtime diff; `next build` under `npm ci --omit=dev` is out of scope, since the static build needs dev tools; the check is that nothing under `src/` or `netlify/` imports a dev-only package).
4. The reader fix proving the wrong layer shape. Owner: this relay's fixture test.

## Close

Hand-off and ROADMAP through the writers: the "still red" note goes after the third green. Parking
Lot: the moderates; `tsx` (the audit scripts use `npx tsx` with no pinned version; pin in PIPE).
