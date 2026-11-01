# Critic: CI green on main, lint running (G0), round 2 of 3

**Plan:** `.claude/plans/2026-11-ci-green.md`. **Reviewer:** plan-reviewer agent (Opus), not the author. **Read:** rubric v2, the plan, round 1, `.claude/DECISIONS.md`, `beta-resequence.md` (CI, OPS, PIPE), `glowing-dazzling-brooks.md` (C2, C7, M1a), `ci.yml`, `netlify.toml`, `audit-all.ts`, `audit-crosssource-lite.ts`, the baseline, TRACEABILITY Source 6, the three logs, and the probe. Reviewed 2026-11-01 at `4d55c58`. My scratch work is in `scratchpad/critic-r2/`.

## Applicability

**Project type:** dependency and CI maintenance on a deployed public civic site, plus a data-fidelity record that feeds a beta gate. **Tier:** Simple, per the program. The skip line and Review Focus are present.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | Yes | GATING | Always |
| X1 Physical safety | No | n/a | No hardware or hazardous output |
| X2 Privacy | No | n/a | No personal data is touched |
| X3 Evidence and source integrity | **Yes** | **GATING** | The baseline is a factual record REBUILD is judged against, and the plan's trade rests on a factual claim about CI's history |
| X4 Audience, brand, money | No | n/a | No public copy or figure changes |
| X5 Concurrency | Yes | ADVISORY | A shared worktree, `npm ci`, two P0b relays in flight, serialized releases |
| X6 Operability | Yes | ADVISORY | Changes an unattended job, adds a schedule, triggers a production deploy |
| X7 Self-modification | No | n/a | No MARVIN gate, hook or skill changes; `ci.yml` is the project's own |
| X8 Dependencies | Yes | ADVISORY | Adds three direct dev deps, bumps a major |

## Round 1 must-fixes: closed in substance?

| # | Must-fix | State | Evidence |
|---|---|---|---|
| 1 | Lint above Audit; response to the next high | **Part** | The order is right. The response covers dev highs only ("the next relay that touches the lock"). A runtime high has no response, and history says those are the common case |
| 2 | Correct "exist nowhere"; run on the checkpoint; mark measured or no input | **Closed** | Plan and baseline both changed; the logs show real measurement. Residuals under X3 |
| 3 | Write the baseline, the TRACEABILITY row, PIPE's spec | **Part** | Baseline and Source 6 are committed (`4d55c58`). PIPE's spec still has no hits for `tile-reader`, empty runs, or hardwired paths. The plan owes it in future tense, which is honest |
| 4 | Reader patch in the plan and committed; fixture test | **Closed** | `b45f191`, and the plan names it. I ran a fixture through the reader under vitest 4.1.12: passes patched, `TypeError: Pbf is not a constructor` unpatched. The test's location is unsaid; see #9 |
| 5 | Why bumps vs `--omit=dev`, and take a position | **Position closed; reason false** | See X3. This is the main finding of the round |
| 6 | PR, yes, push, `state:ready`, HTTP, no solo rollback | **Closed** | Change safety section |
| 7 | Normalise under npm 10; pin; warning; narrow the crash statement | **Open** | Pin and warning are done. The normalising step is not in the plan and the crash statement was not narrowed. See #8 |
| 8 | Who generates the lock; licences; `tsx` | **Closed** | `beta-resequence.md:88` and C7 (`glowing-dazzling-brooks.md:493`) still say Lee's terminal and are not in the strike list |
| 9 | Baseline before `npm ci` | **Closed** | Sequence stated. X5's other half, which dependency set the baseline ran on, is unrecorded |
| 10 | "Green at the label"; schedule or OPS route | **Part** | Both are in the text. The route does not exist; see X6 |
| 11 | By name, one mutation, lint control | **Closed** | But the audit control is declared impossible, and it is not; see #9 |
| 12 | Parking Lot, strikes, comments, CONTRIBUTING, owed | **Part** | Parking Lot is at `ROADMAP.md:144`. The reader's comments are absent from the plan. The strikes read "are struck" and are not: `handoff.md:43` and `glowing-dazzling-brooks.md:794` still carry them |

Round 1's #6 fix (Netlify in Review Focus 1) was also not folded. Review Focus 1 still names npm 10 only.

## The trade, on its merits

**Keep it. The stated reason is wrong, and the plan promises more than it delivers.**

I replayed CI's history: `npm audit --json` on each run's committed lock, with and without `--omit=dev`, keeping high and critical advisories whose GitHub `published_at` is on or before the run date. Statuses come from `gh run list`. `gh run view --log-failed` returned nothing for these old runs, so this is a reconstruction. It reproduces the two greens of 09-02 and 09-04 and every red since 08-22. It misses one: 7822cda (08-06) was green while nanoid's advisories already existed; their `updated_at` of 08-07 and 08-13 is the likely reason.

| Runs | Date | Live high or critical | Under `--omit=dev` |
|---|---|---|---|
| 6 reds, 2 replayed | 08-06 | brace-expansion, js-yaml (dev) | Green |
| 3 reds | 08-22 to 08-28 | **nanoid**, which the lock does not flag dev | **Red** |
| 2 reds | 09-11, 09-12 | **maplibre-gl critical, next critical, sharp high**; js-yaml (dev) | **Red** |
| 4 reds | 10-07 to 10-11 | **maplibre-gl critical, source-map-js**, and on the first of them next and sharp; brace-expansion, js-yaml, zod (dev) | **Red** |
| 1 red | 10-22 | brace-expansion, js-yaml, vite (dev) | Green |

**So 9 of the 16 reds, and 9 of the 10 since 08-22, stay red under this plan.** The plan's Problem section says the last two recurrences were "on new advisories in tools that never reach a visitor". The 09-11 one included GHSA-jrc7-96c5-q579, critical, an XSS sanitizer bypass in `DOM.sanitize()` in MapLibre, which ships in the browser. It sat on production from 09-08 to 10-22, 44 days, and Next's critical for 29. The 08-22 one was nanoid; it is probably build-only, but `--omit=dev` counts it, and the 09-02 commit's "dev-only" was a human label the lock does not share. "How CI stayed red for a month with lint dark" is also wrong on both counts: it was seven weeks (`gh run list`, red from 09-11), and only the last run of it was dev-chain.

**What the trade is really worth.**

- *For:* signal separation, which is a better argument than the plan's. On 09-11 a critical browser XSS and a js-yaml DoS produced the same red. Under this plan they differ. Dev-only highs also arrive often: 09-08, 09-29, 10-01, 10-20. None of those is reachable from a visitor's input as far as their titles show, so not blocking on them loses little.
- *Against, and fixable:*
  1. **It does not keep main green.** Runtime advisories landed on five dates in 30 days (09-08, 09-18, 09-30, 10-06, 10-07). "Green at the label" depends on a bump route the plan does not name.
  2. **`--omit=dev` is not "shipped to visitors".** It errs both ways. nanoid and sharp count and probably do not ship in a static export. `tailwindcss` is dev and shapes the CSS every visitor downloads (`src/app/globals.css:1`). Say "non-dev in the lock", not "shipped".
  3. **"Run only on our machines and CI" omits Netlify**, which installs the dev tree and runs the build chain (`netlify.toml`, and the plan's own Review Focus 3). Round 1's Inversion named this. `.env.example` lists only a public MapTiler key, so the exposure is probably small, but state it after listing the Netlify env var names.
  4. **The report step is silent.** See below.

**A simpler second step, tested.** Replace the `continue-on-error` report with `npm audit --audit-level=critical`, with no `continue-on-error`. Measured: it prints the full list and exits 0 on both the probe's lock and main's, and in the replay every critical was already runtime, so it adds no red to that record. It keeps a block on a dev-chain critical, which shrinks what the plan gives up. I did not verify how npm rates a compromised-package advisory. It also avoids the problem below.

**The problem with `continue-on-error`.** `npm audit` with no level exits 1 today on the 17 moderates (measured), so the step fails on every run forever and a new high changes nothing visible. GitHub reports such a step's `conclusion` as `success` (contexts reference), so `gh run view` reads green. This repo has been here: `388f966` (2026-07-11) removed exactly this because "27 lint errors and 4 audit vulnerabilities were silently green in CI", and `ci.yml:33-36` says "No more silently-red gates". The plan reverses that without saying so. Dev highs still need a reader: emit a `::warning` when the count is above zero, and read it at each wave close, when TRACEABILITY is already re-classified.

## Baseline against the logs

| Baseline claim | Result |
|---|---|
| v10, 3,831,441,244 bytes, 2026-05-09 | **Confirmed.** R2 HEAD and `registry.ts:10` |
| Tiles 20/16/0, prints UNKNOWN | **Confirmed.** 12 of the 16 warnings are A2 "NDJSON file not found". The other four are unreported: A3 could not verify conservancies or mining-claims (no features in the z10 tile), and A7 finds null `DISTURBANCE_START_DATE` in 2 of 20 on cutblocks and tenure-cutblocks |
| Fidelity 599/600, F2, F4 warns | **Confirmed**, from the re-run. Unquantified: forest-age near seams is 15/20 against 98% interior, and it has no TRACEABILITY row |
| Spatial 205/202/2 with its two fails | **Confirmed** |
| Adversarial 32/0/0 | **Confirmed** |
| Property-Deep 17/2/1; 772 of 4,511 | **Confirmed** |
| Precision: 15 pairs, the z10 figures | **Confirmed for z10. Incomplete:** 8 of the 15 are z7, which the row omits, and they are the worst (forest-age 1,932.7%, mining claims 4,366.0%). **FB-3's "up to 4,333%" is therefore wrong.** Omitted: forest-age Hausdorff mean of 17,331 m at z10, which is either a real fault or wrong-feature matching. Only 8 of the 10 named layers measured anything. `conservation-priority` is excluded on a note, "not present in current PMTiles build", that Tiles (12 layers) and Fidelity (50/50) contradict |
| Temporal: nothing compared | **Confirmed** |
| CrossSource 17, 19, 6, 11 "(35.3%)" | **Counts confirmed; the percentage is misattached.** 35.3% is the consistency rate; conflicts are 64.7%. All 11 are R1, and the script itself calls R1 "informational (BC data limitation), not failures", hardcodes `failed: 0`, then exits 1 below 90%. "Not diagnosed" passes over that |
| Defect 3, summary disagrees with exit code | **Understated.** `audit-all.ts:178-197` sets `anyFail` only from the report file on disk and never reads the exit code. Tiles' `tile-check-results.json` is not in `data/reports/`, so a Tiles exit 1 reads UNKNOWN and cannot fail the suite. An audit that crashes with an older PASS report on disk reads PASS. That is the gate failing open |
| Defect 4, "outputs are under `data/checkpoint/preprocessed/`" | **Imprecise.** `rebuild.sh:42-46` writes `data/geojson/preprocessed/`, then a dated checkpoint. PIPE will inherit this sentence |
| "Build inputs", and the plan's "the inputs for v10" | **Unproven.** The manifest is dated 05-06 and the archive 05-09. 599/600 corroborates and does not prove. Round 1 asked for the vintage caveat |
| Overall result | **Missing.** The run printed `SUITE FAILED`, and that table shows Fidelity as FAIL from before the inputs were linked. The baseline never states an overall line |

Also unrecorded: the commit, the dependency set (main's tree with pbf 5.1.2, vector-tile 3.0.0, happy-dom 20.10.2) and `tsx` 4.23.15 from the `npx` cache, and a third input the two Spatial fails depend on, `data/geojson/reference/fwa-lakes.ndjson`. The evidence itself lives in a session scratchpad and in gitignored `data/reports/`, about 1.4 MB, so nobody can check this record next quarter.

**Unaddressed by anyone: what "green" means.** The program requires the "fidelity suite **green**" at REBUILD. With `--fail-on-warn`, 202 Spatial warnings at grid points that may be outside the data would keep `audit:ci` red for good, on any rebuild, whatever the data's quality. So would CrossSource's exit if the suite ever read exit codes. PIPE must define green per audit, or Review Focus 5 in the program has no testable meaning.

## Verdicts

### Universal core

**1. Problem-fit: CONCERN [GATING].** It clears the audit, runs lint, takes a position, and contradicts no DECISIONS entry. But Problem misstates the history (see X3), and "red since at least 2026-10-07" is 09-11 by `gh run list`, which round 1 had already given.
*Fix:* correct the dates and rewrite the paragraph from the replay table.

**2. Approach soundness: CONCERN [GATING].** The reorder is the real fix for lint and is correct. The trade is sound for a different reason than stated. `continue-on-error` is the weak part of the design.
*Fix:* adopt the critical-level second step and a `::warning`, or say why not. Replace "shipped to visitors" with what the flag does.

**3. Completeness: CONCERN [GATING].** No response for a runtime high: who bumps, how, and whether other releases wait. Under DECISIONS' "green checks", an unrelated advisory stops every lane until someone bumps. The natural tool, `npm update`, crashes on this lock (measured, both locks).
*Fix:* one line naming it: on a red runtime audit, the session opens a bump PR for Lee's yes, using the CONTRIBUTING recipe.

**4. Right-sizing and reuse: PASS [GATING].** Scope is right, and the Parking Lot is indexed. Small: `ROADMAP.md:144` says the moderates are "held by the eslint-config-next pin", which round 1 showed is only part of it. Add "and eslint core".

**5. Security: CONCERN [GATING].** The version pin is right. The Netlify omission is above. And the literal route needs a flag the plan does not mention (#8): if it was `--allow-remote`, that relaxes a default, so name its narrowest form or do not use it.
*Fix:* state Netlify's exposure; prefer copying the probe's lock.

**6. Failure modes: CONCERN [GATING].** Netlify's install is still unproven before production ships, though the plan's PR-first path could prove it cheaply: `deploys.json` shows 4 deploy-previews reached `ready`.
*Fix:* add to Review Focus 1, "the PR's deploy preview reaches `ready`, or if none builds, the first production deploy's log is read before the HTTP checks".

**7. Change safety: PASS [GATING].** PR first, green on the PR, Lee's yes, recorded deploy id, no solo rollback, `state:ready` and three routes. CI gates nothing mechanically (branch protection returns 404, and Netlify deploys on push), so "blocks" means "the session will not push"; say that once.

**8. Data integrity and compatibility: FAIL [GATING].** The lock is the source of truth, and the plan's account of how to make it is wrong in two ways, one of which goes into CONTRIBUTING as a standing instruction.

| Command under npm 10.9.4 | main's lock | Probe's lock |
|---|---|---|
| `npm install` | exit 0 | exit 0, zero diff |
| `npm update` | crash (`edgesOut`) | crash (`edgesOut`) |
| `npm audit fix` | crash (`edgesOut`) | no crash, exit 1 on the moderates |

Round 1 measured the same and asked for this to be narrowed. The plan still says all three crash.

The route as written does not produce the table. `npx npm@12.2.1 install --package-lock-only` from main's lock and the probe's `package.json` fails: `EALLOWREMOTE`, exit 1. With `--allow-remote=all` it exits 0 but leaves js-yaml 4.3.1, brace-expansion 1.1.18 and 5.0.9, and a full audit still exits 1, with 10 `libc` entries. The probe's lock got there by steps not recorded. **That lock is good:** a re-install under npm 10 gives zero diff, `--omit=dev` exits 0, full high exits 0, and the only non-dev move against main is nanoid. So it was normalised, the plan does not say so, and "plus optional fsevents" is stale.

*Fix:* "Copy the probe's `package.json` and lock; `npm ci` under 10.9.4." Put the bump recipe in CONTRIBUTING only after re-running it from scratch, with exact flags. Correct the crash sentence to the table above. A trigger of "the bump set crashes under npm 10" is what round 1 measured.

**9. Verifiability: FAIL [GATING].** "The blocking audit on main's lock with a runtime advisory is not constructible today (0 runtime findings), so the control is the step's flags, read from the run log." It is constructible, in two commands. On a copy of the probe, `npm install --save lodash@4.17.20 --package-lock-only` then `npm audit --omit=dev --audit-level=high` exits 1 with "1 high severity vulnerability". Reading a flag is not a control, and this is the one new gate the plan ships. Lee, 2026-08-09: a test isn't a guard until you've broken the thing and watched it go red.

*Fix:* add that throwaway commit to the lint control's PR and read red at the blocking step.

Three smaller items:
- **Review Focus 3's check fails on day one.** "Nothing under `src/` or `netlify/` imports a dev-only package" hits `geojson` (`src/lib/map/empty-fc.ts`) and `tailwindcss` (`src/app/globals.css:1`). Excluding test files, those are the only two, by my grep. State the two exemptions and why.
- **The fixture test's path matters.** `vitest.config.ts` includes `src/**` only. A test beside the reader in `scripts/lib/` silently never runs; I measured it being skipped. Name `src/test/...`.
- **No proof the schedule works.** Add `workflow_dispatch` so the first scheduled path can be exercised without waiting a week.

**10. Maintainability: CONCERN [GATING].** Stale text remains:
- `mvt-reader.ts:4-5` ("transitive dependencies") and `:19` ("use .default"), round 1's item, absent from this plan
- `ci.yml:33-36`, "No more silently-red gates", which a `continue-on-error` step contradicts
- `beta-resequence.md:88` and C7's line, not in the strike list
- `eslint.config.mjs` lacks `.netlify/**`. The P0b worktree's `npm run lint` (`scratchpad/lint.log`) reports 8,114 problems and 28 errors, all 28 under `.netlify/static`. CI has no such directory, but "lint is green" will not reproduce locally on any tree that has built with Netlify. One line, and this plan is about lint.

*Fix:* add them to the Close, and write "are struck" in the future tense until they are.

### Conditional

**X3. Evidence and source integrity: FAIL [GATING].**
1. **The load-bearing claim is false as written:** the last two recurrences were not in tools that never reach a visitor; see the replay. The brief says Lee was told and did not object. If what he was told matches this paragraph, he did not object to the facts. The decision may well stand, since my view is that it should, but he should hear the corrected version: this clears 7 of 16 past reds, and 1 of the last 10, and a critical browser XSS sat on production for 44 days under a red nobody acted on.
2. **Baseline errors:** "35.3%" attached to conflicts; FB-3's maximum; no overall result; "Build inputs" unproven; Precision's z7 half and its false exclusion note; Defect 3 understated; Defect 4 imprecise.
3. **The record cannot be rechecked:** no commit, no dependency set, no third input, and evidence on no durable path.

*Fix:* correct those lines; add a header line with commit, dependencies and all three inputs with their vintage caveat; copy `data/reports/*.json` to `research/beta-gate/fidelity-baseline-2026-11-01/`; state the overall result; re-run Tiles with inputs linked so A2 is measured, or keep its row as is and say A2 has no result. Add TRACEABILITY rows for F4 and A7, the latter because undated cutblocks are Ruling B's subject. Carry the suite's fail-open and "define green" into PIPE's spec.

**X5. Concurrency: PASS [ADVISORY].** Baseline finished; sequence stated. Both P0b branches carry the same one-line reader patch and touch neither `ci.yml` nor `package.json` (measured), and they have their own worktrees.

**X6. Operability: FAIL [ADVISORY].** A red has no reader. "GitHub's failure email reaches Lee until OPS exists" fails on three counts:
- It is the same channel that was available through seven weeks of red with criticals on production. Either the emails did not arrive or they did not cause action. Only Lee knows which; ask him.
- For a scheduled run, GitHub notifies "the user who last modified the cron syntax", so it depends on who commits the line.
- **OPS's spec (`beta-resequence.md:91-99`) has no CI route at all**: errors and uptime only. "Until OPS exists" hands over to nothing.

Also, a public repo's schedule is disabled after 60 days without activity, which is the kind of silence a quiet post-beta stretch produces.

*Fix:* add a CI-red check to OPS's spec, or to the wave-close routine, and say which. Name who reads a red.

**X8. Dependencies: PASS [ADVISORY].** Licences recorded, `tsx` parked, and carets guarded by the fixture test.

## Stress tests

### Pre-mortem

1. **February: the label week finds main red again, and it is not the dev chain.** A runtime advisory arrives, the weekly run goes red, an email goes wherever it goes. Nobody owns it, because the plan's response only covers dev highs. It is September again with lint running. We should have seen it: the replay above.
2. **Type-specific worst case, the gate fails open on a wrong map.** PIPE wraps `audit-all.ts`. On a partial rebuild Tiles exits 1 and reads UNKNOWN, or an audit crashes and a stale PASS report stands, and the suite passes. A layer with lost features goes live under a label claiming fidelity. That is Lee's first anti-goal. We should have seen it: `audit-all.ts:178-197` is short, and the baseline's Defect 3 names only the cosmetic half.
3. **The silent step.** A high lands in the build chain, in the packages that shape shipped output. The report step reads `success`. No relay touches the lock for months. P1c's finding from July, repeated.

### Load-bearing assumptions

| Assumption | Confidence | If wrong |
|---|---|---|
| Dev-chain advisories are why CI goes red | **False on the record:** 1 of the last 10 reds | Main goes red anyway with no response. Resolve before implementation |
| A red reaches Lee and causes action | **Low.** Seven weeks says otherwise; delivery not verified | The bar is met once and decays. Resolve by asking Lee and naming a reader |
| The lock that lands is the probe's | High if copied; **the plan's words do not produce it** | Full audit red, wrong versions. Resolve in the plan |
| The checkpoint NDJSON is v10's input | Medium-high. 599/600 is strong; the 3-day gap is unexplained | Fidelity's figures compare the wrong vintage. State the caveat |

### Inversion

**Keep the full audit blocking, with only the reorder.** It wins if a dev high and a runtime critical deserve the same red. They do not, as 09-11 shows. The trade holds, and the reorder alone would already have saved lint.

**`--omit=dev` plus a full-tree critical step, no `continue-on-error`.** It wins if it costs no extra reds and removes the silent step. Both conditions are already true by measurement. I would take it.

**Copy the probe's lock rather than regenerate.** It wins if the probe's lock is verified and the recipe is not. Already true.

**Fidelity suite in CI.** Still rejected; the inputs do not fit a runner. The fixture test is the cheap part that does, and it works.

## Overall verdict

**FAIL: three gating FAILs (Data integrity, Verifiability, Evidence), plus an advisory FAIL on Operability, and every one is fixable in a sentence or two.** The work itself is good. The baseline is a real measurement where round 1 had none, the lock passes everything I threw at it, the reorder is right, and the fixture test works and goes red when it should. The trade should stand, on the better argument that it separates a critical browser XSS from a js-yaml DoS, not on the claim that it keeps main green, which the replay refutes for 9 of the last 10 reds. What blocks is that the plan tells Lee something CI's history contradicts, tells the next session to run commands that do not work, and calls a two-command negative control impossible. Round 3 can be the last.

## Prioritized must-fix

1. **Rewrite Problem and "Why not only bump" from the replay, and tell Lee the corrected version in plain words.** 7 of 16 past reds clear, 1 of the last 10; runtime criticals sat on production for weeks; the reason to keep it is signal separation. (X3, blocks)
2. **Add the runtime negative control:** a throwaway commit with `lodash@4.17.20`, read red at the blocking step. (#9, blocks)
3. **Fix the lock account:** copy the probe's two files, correct the crash sentence to the measured table, drop "plus optional fsevents", and put a recipe in CONTRIBUTING only after re-running it. (#8, blocks)
4. **Correct the baseline:** 35.3%, FB-3's 4,366%, overall result, z7, the exclusion note, Defects 3 and 4, the input caveat; add commit, dependencies and all inputs; store the result JSONs on a tracked path; rows for F4 and A7. (X3, blocks)
5. **Name a reader and a response for a red:** runtime bump route, a CI check in OPS's spec or the wave close, and Lee's answer on whether the emails arrive. (X6, #3)
6. **Replace `continue-on-error`** with `npm audit --audit-level=critical` and a `::warning` on dev highs read at wave close, or say why not; update `ci.yml`'s comment. (#2)
7. **PIPE's spec:** the suite's defects, the fail-open in `audit-all.ts`, and a per-audit definition of "green". (X3, #3)
8. **Deploy preview in Review Focus 1.** (#6)
9. **Say where the fixture test lives (`src/`), fix Review Focus 3's two exemptions, add `workflow_dispatch`.** (#9)
10. **Say Netlify runs the build chain, and "non-dev in the lock" rather than "shipped".** (#5, trade)
11. **Close list:** reader comments, `beta-resequence.md:88`, C7's line, `.netlify/**` in the lint ignores, "eslint core" in the Parking Lot line, future tense on the strikes. (#10, #4)

## Sources

- CI history: `gh run list --workflow CI --branch main`; locks from `git show <sha>:package-lock.json`; advisory dates from `gh api /advisories/<GHSA>`, retrieved 2026-11-01. Replay inputs in `scratchpad/critic-r2/hist/`.
- MapLibre advisory: GHSA-jrc7-96c5-q579, critical, published 2026-09-08; fixed on main in `2ba3280`.
- GitHub docs, retrieved 2026-11-01: schedule notifications and the 60-day disable at https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows and https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows; `conclusion` versus `outcome` at https://docs.github.com/en/actions/reference/workflows-and-actions/contexts.
- Lee, 2026-08-09, on guards: auto-memory `feedback_guards_must_be_revert_proven.md`.
