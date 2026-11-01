# CI: green on main, lint running (G0)

**Tier:** Simple. **Lane:** project session. **Program:** `audit-remediation-2026-10/beta-resequence.md`, relay CI.

## Intent (grilled)

Skip line: no separate grill; the path-to-beta grill and DECISIONS 2026-10-23 cover it. The bar:
"CI green, with lint running again and the fidelity suite either in CI or run on each tile rebuild
with a recorded result." In the grill, green CI is a MARVIN call confirmed at the gate.

## Problem

Main has been red since 2026-09-11. `npm audit --audit-level=high` fails, and because
that step sits before Lint, lint never runs (`.github/workflows/ci.yml:37-41`). Today's four high
groups are all dev-chain: brace-expansion, js-yaml, vite (with launch-editor), happy-dom.
`npm audit --omit=dev` finds 0 today.

**What history says** (replaying each past red run's lock against advisory dates, critic r2,
inputs in `scratchpad/critic-r2/hist/`): 16 reds on main. Runtime-only blocking would have cleared
7 of them and only 1 of the last 10, so **most recent reds were real runtime findings, not dev
noise.** A critical MapLibre XSS (GHSA-jrc7-96c5-q579) sat on production for 44 days, 2026-09-08 to
10-22, and a Next critical for 29, because a step that was always red read as noise and nobody
responded. Lint stayed dark throughout.

## Change

**Workflow (`ci.yml`):**
- Lint moves above Audit, so a red audit can never hide it.
- Blocking: `npm audit --omit=dev --audit-level=high` (anything non-dev in the lock), plus
  `npm audit --audit-level=critical` across the whole tree.
- A dev-chain **high** warns without blocking: `npm audit --audit-level=high || echo "::warning title=Dev-chain high::run npm audit"`. Measured: quiet on the new lock, fires with exit 0 on a dev high, and a registry failure also warns (errs loud). `jq` and `$(...)` forms go permanently red on the 17 moderates.
- A weekly `schedule:` run and `workflow_dispatch`, so a new advisory turns CI red without waiting
  for a push. GitHub disables schedules after 60 days without repository activity; the wave-close
  read below would notice.
- **Response to a red runtime audit:** the session opens a bump pull request for Lee's yes, using `npm audit fix --package-lock-only` (it moves the package and exits 1 on the moderates, without crashing) or `npm install <pkg>@<fixed> --package-lock-only`, both measured on the new lock. With no patched version, the session brings Lee the choice, and any exception is recorded with its advisory id. Before
  OPS, the reader is the session's `gh run list` at each wave close, since GitHub's failure email
  has not been shown to reach Lee. OPS's spec gains this route. A red with no reader is the defect
  this ends.

*The trade, stated correctly:* this does not by itself keep main green; 9 of the last 10 reds would
still have been red. What it does is **separate signal:** a critical in the browser reads differently
from a denial-of-service in js-yaml on our own machines, and a red means someone acts. Given up: a
dev-chain high no longer blocks. Netlify installs the whole tree and runs our build on its machines,
so dev-chain code does run there, on our own source; the full-tree critical step bounds that. Netlify's build env holds only a public key (`NEXT_PUBLIC_MAPTILER_KEY`, `NODE_VERSION`), so dev-chain code there sees no private secret, the strongest support for this trade. Lee was told this corrected version in conversation on 2026-11-01, before the merge. The moderates (17 today, eslint core included) go to
the Parking Lot, held by the eslint-config-next pin.

**Dependencies (package.json + lock):** the relay's first act copies `scratchpad/ci-probe/package.json` (sha256 `059c677477f4f6982678e01becd94648ac0d8085d00b018c06f63d41129d2d49`) and `package-lock.json` (sha256 `fda420850409788657252c6b722a4c3cd11dcec5556b5d0286c7e03d2c844c31`), full path under this session's scratchpad, then `npm ci` under npm 10.9.4 (CI's npm). If the files are gone, stop and tell Lee; do not reconstruct them, since the old route cannot regenerate this lock.

| Package | From | To | Why |
|---|---|---|---|
| happy-dom | ^20.8.7 | ^21.0.4 | high, direct |
| vitest, @vitest/coverage-v8 | ^4.1.1 | ^4.1.12 | moderate; carries vite |
| vite (lock) | 8.0.16 | 8.3.5 | high |
| brace-expansion, js-yaml (lock) | 1.1.18, 4.3.1 | 1.1.21, 4.3.2 | high |
| @mapbox/vector-tile, pbf, @types/geojson | transitive | direct dev | the tile audits import them. M1a's item moves here. Licences and registry entries checked (BSD-3-Clause, BSD-3-Clause, MIT); all three are already in the tree as maplibre-gl's own dependencies, so no new code enters |

Bumped as well as gating, because the bumps cost nothing and lint and the test runner are better
current.

Verified on the probe's lock: a re-install under npm 10 gives zero diff, `--omit=dev` exits 0, full
high exits 0. On main's lock under npm 10.9.4, `npm update` and `npm audit fix` crash on `edgesOut`,
as does this bump set under `npm install`. On the new lock `npm audit fix` runs, and `npm update` still crashes. A bump recipe goes in
CONTRIBUTING only after being re-run from scratch with exact flags. The session does the copy; C7's
"Lee runs the installs" exists because the classifier blocked them, and its line is updated at close.

**Non-dev diff of the lock against main:** nanoid 3.3.18 to 3.3.20. Nothing else moves; next 16.4.2
and maplibre-gl 6.15.0 are unchanged.

**`scripts/lib/mvt-reader.ts`:** MapLibre 6 brought pbf 5, which exports only `PbfReader`; the reader's
`new Pbf(...)` has thrown ever since (`2ba3280`), and `tile-reader.ts` swallows it as "tile doesn't
exist". One-line fix: `PbfLib.PbfReader ?? default ?? PbfLib`, already committed on this branch
(b45f191). It ships here because this relay pins pbf 5. A fixture test under `src/test/` parses one
real MVT tile through the reader and asserts a layer and a feature count, mutation-proven through
`~/marvin/scripts/mutation-battery.mjs`.

## The fidelity suite stays out of CI

It reads a 3.8 GB archive and the NDJSON build inputs, so a CI run is impractical; it runs per rebuild,
inside PIPE, with a recorded result. The baseline is written:
`research/beta-gate/fidelity-baseline-2026-11-01.md`, per audit, measured or no input, with result JSONs
and TRACEABILITY rows. PIPE's spec (`beta-resequence.md`) gains its seven suite defects, including the
fail-open in `audit-all.ts`, and the per-audit definition of green.

## Verification

- On the PR branch: `npm ci` (npm 10), lint, `npm test`, build, the audit steps.
- **Negative controls,** on a separate branch and draft PR off the PR's head, closed unmerged, read from its run:
  - runtime high (`lodash@4.17.20`): the blocking step goes red, exit 1;
  - lint error: red with Audit not reached;
  - dev high (`lodash@4.17.20 --save-dev`): both blocking steps exit 0, the warning fires;
  - dev critical (`minimist@1.2.5 --save-dev`): red at the critical step.
  - Reader: the fixture test fails on the unpatched line.
- 59 files and 867 tests pass on happy-dom 21, plus the fixture test, with the same test names as main
  (compared by name, not count) and no new skips; one DOM test mutated to confirm it can still fail.
- **Done when** main is green **three runs running** with Lint executed, read from `gh run view`. Dispatches do not count, and at least one of the three is `event: schedule`, which proves the cron. An owed
  item stays open until the third. At the gate the bar reads "green at the label", not "was green once".

## Change safety and release

PR first; CI green on the PR; then the push, under Lee's yes of 2026-11-01 ("push when green"): the session
merges and pushes, with Phase 0's records landing first or together. Then `state:ready` on the deploy and
HTTP 200 on `/`, `/map`, `/privacy`. Rollback: republish the previous deploy id, recorded before the push;
a session does not roll back production alone, it brings Lee the choice (C2).

## Review Focus

1. A lock Netlify's build rejects though CI accepts it. Owner: this relay (the deploy preview on the PR
   builds green, or the first production deploy's log is read before the HTTP checks).
2. happy-dom 21 making a test vacuous. Owner: this relay (by-name comparison, one mutation).
3. `--omit=dev` hiding a dependency wrongly marked dev. Owner: this relay (nothing under `src/` or
   `netlify/` imports a dev-only package, except `@types/*`, the test tree, and `tailwindcss`, a build input that shapes shipped CSS).
4. The reader fix proving the wrong layer shape. Owner: this relay's fixture test.

## Close

Hand-off and ROADMAP through the writers: the "still red" note goes after the third green, and an owed
item stays until then. Parking Lot: the moderates, eslint core included; `tsx` (the audit scripts use
`npx tsx` unpinned; pin in PIPE). Strike the hand-off's terminal-install clause, M1a's dev-dep line and
C7's line; refresh the reader's comments; update `beta-resequence.md`'s CI paragraph; add `.netlify/**`
to the lint ignores; add the red-CI route to OPS's spec and the recipe to CONTRIBUTING (re-run from scratch first); correct `beta-resequence.md`'s two stale lines on CI and the suite.
