# Critic: CI green on main, lint running (G0), round 1 of 3

**Plan:** `.claude/plans/2026-11-ci-green.md`. **Reviewer:** plan-reviewer agent (Opus, xhigh), not the author. **Read:** rubric v2, the plan, `.claude/DECISIONS.md`, `beta-resequence.md` (relay CI, PIPE, graph), `glowing-dazzling-brooks.md` (C7, M1a), `ci.yml`, `netlify.toml`, the probe's `package.json` and lock. Reviewed 2026-11-01, from 13:36 MST, while the author's `audit:ci` run was still live in the same worktree.

## Applicability

**Project type:** dependency and CI maintenance on a deployed public civic site, plus a data-fidelity baseline that feeds a beta gate.

**Tier:** Simple, per the program. The `## Intent (grilled)` skip line is present, and Review Focus is present though not required.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | Yes | GATING | Always |
| X1 Physical safety | No | n/a | No hardware or hazardous output |
| X2 Privacy | No | n/a | No personal data is touched; `nanoid` and the dev chain handle none |
| X3 Evidence and source integrity | **Yes** | **GATING** | The fidelity baseline is a factual record that decides what REBUILD treats as green or hides, under Lee's first anti-goal ("a wrong number spreads") |
| X4 Audience, brand, money | No | n/a | No public copy or figure changes |
| X5 Concurrency | Yes | ADVISORY | One worktree carries a live suite run, `npm ci`, and a serialized release |
| X6 Operability | Yes | ADVISORY | Changes an unattended CI job and triggers a production deploy |
| X7 Self-modification | No | n/a | Changes no MARVIN gate, hook or skill. `ci.yml` is the project's own and the plan leaves it alone |
| X8 Dependencies | Yes | ADVISORY | Adds three direct dev deps, bumps a major, generates the lock with another npm |

## What I reproduced

Run in scratch copies, with npm 10.9.4 on Node 22.22.1 unless stated. Installs used `--ignore-scripts`.

| Plan's claim | Result |
|---|---|
| Main's lock fails `--audit-level=high`; four high groups | **Confirmed.** Exit 1; 4 high, 20 moderate: brace-expansion, happy-dom, js-yaml, vite |
| Proposed lock passes audit; `--omit=dev` finds 0 | **Confirmed.** Exit 0; 0 high, **17** moderate (the plan says ~20; 20 is main's number) |
| `npm ci` under 10.9.4 accepts the new lock | **Confirmed**, exit 0 |
| Runtime diff is nanoid plus optional fsevents | **Confirmed.** The fsevents change is a `dev` flag flip with no version move. Full diff: 14 added, 2 removed, 42 version moves, every one dev except nanoid. tailwindcss, @tailwindcss/postcss, top-level lightningcss and postcss, and typescript are unchanged, so the "same app" claim holds for shipped CSS and types too |
| 59 files, 867 tests, none skipped | **Confirmed and strengthened.** Per-test comparison of main's deps against the probe: 867 passed on each, identical names, no status change |
| `npm run lint` exit 0 | **Confirmed.** 193 files linted, 139 in `src`, 0 errors, 0 warnings. A violating file on stdin exits 1, so the step can fail |
| `happy-dom` must be major | **Confirmed.** The code-execution advisory covers `>=17.0.0 <=21.0.3`, so no 20.x clears it |
| npm 10 crashes (`edgesOut`) on `npm install` and `audit fix` | **Half right; see #2.** It crashes on this bump set and on `audit fix`. It does **not** crash on a plain `npm install` or on adding an unrelated package |
| `@mapbox/vector-tile`, `pbf`, `@types/geojson` already in the tree | **Confirmed.** Same versions move to direct. Licences BSD-3, BSD-3, MIT; all resolved URLs are the npm registry; no new install scripts |
| CI's npm is 10.9.4 | **Not confirmed.** `gh run view --log` returned nothing for run 39866175520; 10.9.4 is this machine's npm, and `node-version: 22` floats |
| `npm run build` ok | Not re-run by me |

## Verdicts

### Universal core

**1. Problem-fit: CONCERN [GATING].** It clears the audit and lint runs, and contradicts no DECISIONS entry. But the program told this plan to choose between bumps and `--omit=dev`: "the child plan picks and says why". It picks bumps and never says why.
*Fix:* add one paragraph with the reason. Note that happy-dom's code-execution advisory and the build-env exposure are the honest arguments; see Inversion.

**2. Approach soundness: FAIL [GATING].** The Problem section names two causes, a red audit and "because that step sits before Lint, lint never runs". The plan fixes the first and rules out touching the second ("No change to `ci.yml`: once audit passes, Lint runs"). The audit step is the one that has repeatedly gone red with no code at fault:

- Blocking since 2026-07-16 (`continue-on-error` removed).
- Red 08-06; fixed 08-06; **red again 08-22, 16 days later.**
- Fixed 09-02; three greens 09-02 to 09-04; **red again 09-11, 9 days after the fix**, and red for all seven runs since.

The failing step is the audit step in all six red runs sampled across those episodes (31128855607, 32549982078, 33034689162, 33221729619, 34645788302, 39866175520); on the latest, Lint reads `skipped`. So the next high advisory in the dev chain, expected inside weeks on this record, restores the exact state this plan exists to end: red main and no lint, with no code change. The fix is displaced, not closed.

*Fix, two lines:* move Lint above Audit in `ci.yml`, or give Lint `if: always()`. Then state the standing response to the next high advisory: who bumps, and whether it blocks. Whether dev-chain findings stay blocking is the separate policy call the program already asked for (#1).

**A second defect in the same section.** "npm 10's `npm install` and `audit fix` crash on this lockfile" is too broad. Measured on main's lock under npm 10.9.4:

| Command | Result |
|---|---|
| `npm install` (fresh) | exit 0 |
| `npm install -D is-odd` | exit 0 |
| `npm install -D` the plan's bump set | crash |
| `npm audit fix` | crash (also on 10.9.9) |

On the **proposed** lock, plain `npm install` (fresh, and with main's modules cached) and adding a package (with and without modules) all exit 0. So Review Focus 3's feared crash does not reproduce after this change.

*Fix:* state the trigger as measured, and reduce Review Focus 3 to "if npm 10 reports `edgesOut`", not a standing rule to use another npm.

**3. Completeness: FAIL [GATING].** The program's relay requires three things of the baseline: run `audit:ci` once on v10, record the result, and classify any failures into TRACEABILITY, "owned before REBUILD". None is complete, and the plan states them as done:

- `research/beta-gate/fidelity-baseline-2026-11-01.md` **does not exist** as of 13:55, and `research/beta-gate/` is absent. `audit:ci` was still running.
- `research/ui-perf-audit-2026-10-02/TRACEABILITY.md` (39 KB, "being written") contains **zero** occurrences of "fidelity".
- PIPE's spec in the program says nothing about the suite's defects, so "they are PIPE's to fix" lands on an owner whose text does not carry the work.
- **An out-of-plan change is already in the tree.** `git status` shows ` M scripts/lib/mvt-reader.ts`, a one-line patch adding `PbfLib.PbfReader`. The plan says "Dev dependencies only (package.json + lock)" and never mentions it. See below for why it matters.

The committed reader cannot work on the version this plan pins. `pbf` 5.1.2 exports only `PbfReader` and `PbfWriter`, with no default, so main's `(PbfLib as any).default ?? PbfLib` yields a plain object, not a constructor, and `new Pbf(buf)` should throw on every tile (read from the exports under Node; I did not run it under `tsx`). It moved from pbf 4.0.1 and vector-tile 2.0.4 to 5.1.2 and 3.0.0 in `2ba3280` (2026-10-22). The hand-off warned that a MapLibre 6 bump would break the tile audits, for a different reason, and it broke them anyway. No test imports `mvt-reader`, so nothing went red. The plan pins this pair as "the tile audits import them" without saying the audits' reader is broken on it.

*Fix:* write the record before this plan claims it; add a TRACEABILITY row with an owner; add the item to PIPE's spec; and put the reader patch in the Change table, committed with this relay. A baseline measured on an uncommitted reader cannot be rerun by anyone, which is the thing the 2026-09-02 ruling forbids in spirit.

Also missing: C7 says "Lee runs the installs", M1a says "the classifier blocks installs from a session", and the program says "the install needs Lee's terminal". The plan moves M1a's item here and never says who generates the lock or how it reaches the real branch. *Fix:* name the step (copy the probe's two files, then `npm ci`), and say whether that satisfies C7 or asks Lee to amend it.

**4. Right-sizing and reuse: CONCERN [GATING].** The scope is right; three bumps and a pin is not gold-plated. But the out-of-scope items are not in the ROADMAP Parking Lot: the eslint-chain moderates and the held `eslint-config-next`. The rubric requires the index.

The stated reason is also overclaimed: "clearing them needs eslint-config-next". `npm audit` lists `eslint` itself in the chain through `@eslint/config-array` and `@eslint/eslintrc`, and minimatch `<11.0.1` underneath, with fix offers that are nonsense downgrades (eslint 4.0.0, eslint-config-next 0.2.4). A config-next bump alone may not clear them.

*Fix:* add a Parking Lot line with the true count (17) and "eslint core and config-next", not config-next alone.

**5. Security: CONCERN [GATING].** Attack surface barely moves: dev-only, registry-resolved, no new install scripts. The defect is `npx npm@latest`, a floating executable fetched at generation time and proposed as a standing instruction in Review Focus 3. On this machine it is also out of range: npm 12.2.1 requires `^22.22.2`, Node here is 22.22.1, and it prints `npm v12.2.1 does not support Node.js v22.22.1` and carries on. The plan reports 12.2.1 as if clean.

*Fix:* name `npx npm@12.2.1` and record the engine warning, or avoid standing use of npm 12 at all (#8).

**6. Failure modes: CONCERN [GATING].** Two paths have no stated behaviour.

- A new high advisory appears between the probe and the push, or between green runs. `audit` depends on the date as well as the lock, so the probe's exit 0 can expire. See #2.
- `npm ci` or Netlify's install fails on the first real push. Review Focus 1 names CI only, and Netlify is the second consumer of this lock. I simulated `npm install` under 10.9.4 with no modules and with main's modules cached: both exit 0 ("added 3, changed 30"). But Netlify's actual installer and npm version were not read, since the deploy API returned no log URL.

*Fix:* add Netlify to Review Focus 1, proven by a PR deploy preview if previews are on, otherwise by the first deploy's log.

**7. Change safety: CONCERN [GATING].** The rollback is named and the change is reversible, but three things are missing.

- The DECISIONS deploy entry says the session pushes "after Lee's yes in conversation, with green checks and a named rollback". The plan does not mention Lee's yes, and does not define "green checks" while main is red by premise.
- Netlify deploys on push whatever CI says, so the first proof on the real runner arrives as production ships. `ci.yml` already has `pull_request`. *Fix:* open a PR first, read a green run with Lint executed, then ask for the yes.
- "Republish the previous Netlify deploy" omits who. P0b quotes the program: "a session never rolls back production on its own". The same DECISIONS entry also names the standard check, `listSiteDeploys` to `state:ready` and an HTTP verify, which the plan omits. *Fix:* state both.

**8. Data integrity and compatibility: CONCERN [GATING].** The lock is the source of truth, and an npm 12 lock is not stable under the npm that everyone runs. A plain `npm install` under 10.9.4 rewrites it: 42 diff lines, stripping `libc` fields and flipping the fsevents flag, so the next session gets a dirty lockfile and a meaningless diff.

*Fix, cheap and tested:* after generating with npm 12, run stock `npm install` once and commit that output. I did this. Same 590 packages, same versions, `npm ci` exit 0, audit exit 0, and the runtime diff becomes nanoid alone. It also dissolves Review Focus 1's npm-mismatch risk for the lockfile format.

**9. Verifiability: CONCERN [GATING].**

- "Green three runs running" is the program's bar, but it **would have passed in September**: three greens 09-02 to 09-04, then red within a week for seven runs. It proves a moment. The bar needs "and still green at the label", which the program's label row implies. *Fix:* say so here, with a re-check at the gate.
- Review Focus 2 proposes comparing counts, and counts cannot detect the failure it names: a vacuous test still counts as a pass. *Fix:* compare by test name (done above: identical), cite the actual breaking change, and mutate one DOM-heavy test under happy-dom 21. v21.0.0's stated break is CSS and iframe loading off by default; `src` has no `<iframe>`, iframe or link creation, or `rel=stylesheet` by grep, so the exposure looks nil. The plan should say that rather than "867 passing is the check".
- Lint has not executed on main since 09-04 and the plan offers no negative control for it. Mine is above; record one.
- "No new test is written" leaves the pin itself unguarded, which is how the 10-22 break went unseen. *Fix:* one small test in `npm test` parsing a fixture MVT through `mvt-reader`, mutation-verified. It is the only part of this relay that would catch the next MapLibre bump.

**10. Maintainability: CONCERN [GATING].** The Close misses stale text that will misdirect a later session.

- The hand-off's "Path to beta" paragraph still lists "a terminal install of @mapbox/vector-tile and pbf" as waiting on Lee.
- `glowing-dazzling-brooks.md:794` still gives M1a the dev-deps item.
- `mvt-reader.ts`'s header still says "transitive dependencies of maplibre-gl" and its comment says "use .default".
- "A line in CONTRIBUTING or the hand-off" is undecided. This lasts as long as the lock, so it belongs in CONTRIBUTING, not the volatile file.
- The Close removes the "still red" note, but the owed third green run needs a hand-off item until it lands. As of 10-22 main sees about one run a week.

### Conditional

**X3. Evidence and source integrity: FAIL [GATING].** Two load-bearing statements do not survive a look.

1. "Recorded in `research/beta-gate/fidelity-baseline-2026-11-01.md`": no such file (#3).
2. "`data/geojson/*.ndjson`, gitignored build outputs that exist nowhere on this machine". Twelve files with the audit's exact layer names are at `~/Projects/opencanopy/data/checkpoint/preprocessed/` (about 14 GB), with a `_manifest.json` listing the same 12 layers and dated 2026-05-06, three days before v10 of 05-09. `rebuild.sh` writes such checkpoints from `data/geojson/preprocessed/`. **I have not proven they are v10's exact inputs**, or that the flat path matches. But the claim as written is false, and the audit's `NDJSON_DIR` is one path away.

This matters because of what the current run measures. The reports written so far say F1 "0/0 features found across 12 layers" while F2, F3 and F4 **PASS** on nothing ("No found features to compare"); crosssource-lite reports 0 tiles checked, 36 missing, `failed: 0, warned: 0`; and `property-deep` is 19 WARN on "no features found", and `adversarial` 8 FAIL "tile missing". That run predates or straddles the reader patch, so these numbers may change. Recording a no-input run as "the v10 baseline" launders the absence of a measurement into a measurement, and pushes a classifiable defect into "the suite's own defects".

Keeping the suite out of CI is still the right call, and the bar allows it, but for the honest reason: about 18 GB of archive and inputs on a hosted runner, not absence.

*Fix:* correct the sentence; try the suite with `data/geojson` pointed at the checkpoint, on the committed reader; record per audit which result is a real measurement and which ran on no input; state the vintage caveat; and name crosssource-lite's silent 0/36 and F2/F4's pass-on-empty as owned defects (the program's Review Focus 5 is exactly this).

**X5. Concurrency: CONCERN [ADVISORY].** "Repeated on the real branch: `npm ci`" deletes `node_modules` in the worktree where `audit:ci` is running right now (PIDs live at 13:50). That either crashes the suite or leaves a result from mixed dependencies.
*Fix:* order them explicitly: baseline finishes, then `npm ci`. State which dependency set the baseline ran on, since the reader's behaviour depends on it.

**X6. Operability: CONCERN [ADVISORY].** Main was red for seven weeks across seven pushes while production deploys went out, because CI gates nothing and no step makes a red anyone's job. The plan turns it green and leaves that as it was. It also runs only on push, so an advisory surfaces at a random later release.
*Fix:* add a weekly `schedule:` trigger for early warning, plus a named way a red reaches Lee, or route this to OPS explicitly.

**X8. Dependencies: CONCERN [ADVISORY].** C7 requires typosquat and licence checks "by the plan that introduces them", and the plan offers "long-established" instead. The facts pass: BSD-3, BSD-3 and MIT, all compatible with this repo's AGPL-3, and all three were already in the tree at the same versions. Record them. The same hygiene argument the plan makes for `pbf` applies to **`tsx`**, which is in neither `package.json` nor the lock and is fetched by `npx` for every audit script (the running suite is using an `_npx` cache copy). The suite's result depends on an unpinned tool. `@types/geojson`'s "the tile audits import them" also undersells it: `src/lib/map/empty-fc.ts` imports it too.
*Fix:* record the C7 checks; add `tsx` to the pin row or park it with a reason.

## Stress tests

### Pre-mortem

1. **February: the gate is reached and CI is red.** A dev-chain high advisory landed around week two. Lint had been skipped for weeks again, because the plan left the order alone, and a lint-class error sits in a map relay. Someone spends the label week clearing it. We should have seen it: the 08-22 and 09-11 recurrences are in `gh run list`.
2. **Type-specific worst case, the gate certifies what it never measured.** The fidelity record says v10 was baselined and REBUILD is compared to it. In truth the suite ran on no NDJSON and a reader that had been broken since 10-22 until an uncommitted patch. A later partial rebuild passes the checks that pass on empty, crosssource-lite reports no failures on 0 tiles, and a layer with lost features goes live under a label claiming fidelity. That is Lee's first anti-goal, a wrong picture that spreads. We should have seen it: "0/0 features" and "tilesChecked: 0" are in `data/reports/` today.
3. **Lock churn.** A later `npx npm@latest`, now npm 13 with a new lockfile format, generates a lock CI's npm refuses. Install fails, so nothing downstream runs. A floating tag in a standing instruction is what did it.

### Load-bearing assumptions

| Assumption | Confidence | If wrong |
|---|---|---|
| No new high dev-chain advisory arrives before three greens and before the label | **Low.** Recurrence was 16 and 9 days | Red main, lint hidden again. Resolve before implementation: #2's reorder |
| CI's and Netlify's npm accept the new lock | Medium. Local 10.9.4 shapes pass; neither real environment was read | Failed install, or a failed production build on push. Resolve with a PR run first |
| The v10 inputs are unavailable, so the baseline is what it is | **False as written** | A hollow baseline is recorded as real. Resolve before implementation |
| happy-dom 21 changes nothing the tests rely on | High. Identical per-test results; the stated break is CSS and iframe loading, and `src` uses neither | A vacuous DOM test. One mutation closes it |

### Inversion

**`--omit=dev` on the audit step.** It wins if the recurring reds are dev-chain and the dev chain cannot reach users. The first holds for what is red today: `--omit=dev` finds 0 on both locks, and the 09-02 fix was also dev-only by its commit message. I did not classify every earlier episode. The second is mostly true: vitest, vite and happy-dom touch no shipped code, though the Netlify build does execute the dev chain with the build env's keys present. It would probably have kept main green for much of the time since September, while still catching runtime advisories like October's Next critical. The bumps are still worth doing, since they clear real findings, so this is not either/or: bumps now, reorder regardless, and decide whether dev-chain findings block or report. The plan needs to take a position; the program demanded one.

**Fidelity suite in CI.** It wins only if the suite's inputs fit a runner. They do not, so the rejection stands. But a **one-fixture reader test** in `npm test` wins cheaply, and it would have caught the 10-22 break the day it happened.

**Stock npm 10 for the lock.** It wins if `edgesOut` were avoidable. It is not for this bump set, so npm 12 is justified once, as generator, followed by normalising under npm 10 (#8).

## Overall verdict

**FAIL: three gating FAILs (Approach, Completeness, X3), the rest CONCERN, no PASS among the active dimensions, though the dependency work itself is sound.** The lock does what the plan says: I reproduced audit, install, tests and lint, and the runtime diff is as small as claimed. The bump can proceed once folded. The failures are around it. The plan leaves the mechanism that hid lint for seven weeks in place, on a record of re-reddening in 9 to 16 days. It states as recorded a fidelity baseline that does not exist yet, on a premise (inputs "nowhere on this machine") that the disk contradicts, against a reader broken on the pinned version and patched outside the plan. All of it fits in a short revision, and round 2 should be quick.

## Prioritized must-fix

1. **Move Lint above Audit, or `if: always()`,** and state the response to the next high advisory. (#2, blocks)
2. **Correct "exist nowhere on this machine"; attempt the suite against the checkpoint NDJSON on the committed reader; mark each audit as measured or no-input.** (X3, blocks)
3. **Write the baseline record and the TRACEABILITY row, and add the suite's defects to PIPE's spec,** before claiming them. (#3, X3, blocks)
4. **Put the `mvt-reader.ts` patch in the Change table and commit it;** add one fixture test through the reader. (#3, #9, blocks)
5. Say why bumps over `--omit=dev`, and take a position on whether dev-chain findings block. (#1)
6. PR first, then Lee's yes, then the push; define green checks; add `state:ready` plus HTTP verify; say a session does not roll back alone. (#7)
7. Normalise the lock under npm 10 before committing; pin `npm@12.2.1`; note the engine warning; narrow the crash statement. (#2, #5, #8)
8. Say who generates the lock under C7; record the licence and typosquat checks; pin or park `tsx`. (#3, X8)
9. Sequence the baseline before `npm ci` in this worktree. (X5)
10. "Still green at the label" and a weekly `schedule:` or OPS route for a red. (#9, X6)
11. Review Focus 2 by test name, with one mutation; a lint negative control. (#9)
12. Parking Lot line (17 moderates, eslint core too); strike the hand-off's terminal-install clause and M1a's item; refresh the reader's comments; CONTRIBUTING, not "or"; keep an owed item until the third green. (#4, #10)
