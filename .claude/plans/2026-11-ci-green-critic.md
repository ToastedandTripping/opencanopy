# Critic: CI green on main, lint running (G0), round 3 of 3

**Plan:** `.claude/plans/2026-11-ci-green.md`. **Reviewer:** plan-reviewer agent (Opus), not the author. **Reviewed:** 2026-11-01 at `295254c`. **Read:** rubric v2, the plan, rounds 1 and 2, `.claude/DECISIONS.md`, the baseline and its JSONs, TRACEABILITY Summary and Source 6, `beta-resequence.md` (CI, OPS, PIPE, assumptions), `ci.yml`, `audit-all.ts`, `audit-tiles.ts`, `audit-crosssource-lite.ts`, `audit-geometry-precision.ts`, `gh run list`. **Scope, per the brief:** what is still open and what the folds broke; closed items are one table. Measurements are in `scratchpad/critic-r3/`, run under npm 10.9.4 on copies of the probe, against today's advisories.

**Result: PASS with concerns. No gating FAIL remains.** Round 2's three gating FAILs are closed. Thirteen small items remain, listed at the end; they fold without a fourth round, as DECISIONS' three-round cap requires.

## Applicability

**Project type:** dependency and CI maintenance on a deployed public civic site, plus a data-fidelity record feeding a beta gate. **Tier:** Simple, per the program; the skip line and Review Focus are present.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | Yes | GATING | Always |
| X1 Physical safety | No | n/a | No hardware or hazardous output |
| X2 Privacy | No | n/a | No personal data is touched |
| X3 Evidence and source integrity | **Yes** | **GATING** | The baseline is what REBUILD is judged against, and the trade rests on CI's history |
| X4 Audience, brand, money | No | n/a | No public copy or figure changes |
| X5 Concurrency | Yes | ADVISORY | Shared worktree, serialized releases |
| X6 Operability | Yes | ADVISORY | Unattended job, schedule, production deploy |
| X7 Self-modification | No | n/a | No MARVIN gate, hook or skill changes; `ci.yml` is the project's own |
| X8 Dependencies | Yes | ADVISORY | Three direct dev deps, one major bump |

## Round 2 must-fixes

| # | Must-fix | State | Evidence or what is open |
|---|---|---|---|
| 1 | Problem and trade rewritten from the replay; Lee told | **Closed, two residuals** | 7 of 16 and 1 of 10 match `gh run list` and r2's table. Residuals: line 13 still says "since at least 2026-10-07", when `gh run list` shows red since 09-11; and "Lee is told" has no order against the merge |
| 2 | Runtime negative control | **Closed** | Re-run on a probe copy: `lodash@4.17.20` makes the blocking step exit 1. It sits on the PR branch; see #7 |
| 3 | Lock account | **Closed; the fold broke one thing** | The crash sentence and copy route are right. "The probe" no longer has a referent; see #8 |
| 4 | Baseline corrections | **Mostly closed** | Closed: 35.3%, 4,366%, overall line, z7, Defects 3 and 4, input caveat, tracked JSONs, F4 and A7 rows. Open: the third input, the exclusion note, `tsx`, Tiles' evidence. See X3 |
| 5 | Reader and response for a red | **Closed in the plan, not durable** | See X6 and #3 |
| 6 | Replace `continue-on-error` | **Closed; new step unproven** | No `continue-on-error` remains in the design, so r2's objection to `ci.yml`'s comment is moot. The `::warning` has no form and no control; see #9 |
| 7 | PIPE's spec | **Closed for the suite, not for the findings** | Line 141 carries seven defects, the fail-open and green. It does not carry the diagnosis Source 6 assigns to PIPE; see X3 |
| 8 | Deploy preview in Review Focus 1 | **Closed** | r2's fallback for "no preview builds" was dropped; see #6 |
| 9 | Fixture location, Review Focus 3, `workflow_dispatch` | **Two of three** | `src/test/` and dispatch are in. Review Focus 3 still fails on `tailwindcss`; see #9 |
| 10 | Netlify; "non-dev in the lock" | **Closed** | Both in the trade. See #5 for what closes r2's open question |
| 11 | Close list | **Closed, with new omissions** | All r2's named items are there. See #10 |

**Re-verified today on the probe's lock:** `--omit=dev --audit-level=high` exit 0; full `--audit-level=critical` exit 0; full `--audit-level=high` exit 0; 17 moderates; non-dev diff against main is nanoid 3.3.18 to 3.3.20 alone; every version in the plan's table is right; `package.json` differs from HEAD only by the six listed lines.

## Verdicts

### Universal core

**1. Problem-fit: CONCERN [GATING].** Fits the bar and contradicts no DECISIONS entry. Two wording faults remain. "Red since at least 2026-10-07" sits one paragraph above a 44-day exposure that began before that date. And Lee's "push when green" and the correction have no stated order, so the yes may rest on the account round 2 refuted.
*Fix:* "red since 2026-09-11"; "Lee is told this before the merge".

**2. Approach soundness: PASS [GATING].** Reorder plus runtime block plus full-tree critical is sound, and it survived the replay.

**3. Completeness: CONCERN [GATING].** The response to a red runtime audit says "opens a bump pull request" with no way to make one, and the recipe is deferred with no owner. It can be closed now. Measured on the new lock with a runtime high present: `npm audit fix --package-lock-only` moves lodash to 4.18.1 and turns the blocking step green (the command itself exits 1 on the moderates, with no crash); `npm install lodash@4.17.21 --package-lock-only` exits 0.
*Fix:* name those two as the recipe; re-run them from scratch for CONTRIBUTING as the plan already requires, and put that in the Close.

**4. Right-sizing and reuse: PASS [GATING].** Scope and Parking Lot hold. `ROADMAP.md:144` still lacks "eslint core", and the Close covers it.

**5. Security: PASS [GATING].** r2's open question has an answer: `netlify env:list` from the primary checkout, names only, returns `NEXT_PUBLIC_MAPTILER_KEY` and `NODE_VERSION`. So dev-chain code in Netlify's build sees no private secret. Worth a clause in the trade, since it is the strongest support for giving up the dev-high block. Two wording limits, neither blocking: "the full-tree critical step bounds that" is unproven for a high in the packages that shape shipped output (`tailwindcss`, per r2), and r2's question of how npm rates a compromised package is still unanswered.

**6. Failure modes: CONCERN [GATING].** Two paths have no stated behaviour.
- A runtime high with no patched version. The step stays red, and under "green checks" every lane stops with no written way out. The tempting exit is a quiet ignore, which is the silent gate this plan removes.
- Review Focus 1 reads "the deploy preview on the PR builds green" and says nothing if no preview builds. r2's clause was dropped.

*Fix:* "No patched version: the session brings Lee the choice, and any exception is recorded with its advisory id"; restore "or the first production deploy's log is read before the HTTP checks".

**7. Change safety: CONCERN [GATING].** PR first, yes, recorded deploy id and no solo rollback all hold. But the controls are "throwaway commits" on the PR branch that will merge. Reverted, they still land in main's history; forgotten, a known-vulnerable runtime package ships. No step re-checks the non-dev diff at the merge.
*Fix:* run the controls on a separate branch and draft PR off the PR's head, closed unmerged. Read them from there.

**8. Data integrity and compatibility: CONCERN [GATING].** Round 2's FAIL is closed: the account is now true. **The fold broke one thing.** The previous text said "probed in a disposable copy"; the new text says "the probe's two files, copied", with no path anywhere in the plan. The files are at `scratchpad/ci-probe/` under `/tmp`, and they are the only copy of a lock that r2 showed the old route cannot regenerate. A reboot, a cleanup or a different session leaves the plan with no lock and no recipe.
*Fix:* name the path and pin the content: `package.json` sha256 `059c677477f4f6982678e01becd94648ac0d8085d00b018c06f63d41129d2d49`, `package-lock.json` sha256 `fda420850409788657252c6b722a4c3cd11dcec5556b5d0286c7e03d2c844c31`. Make the copy the relay's first act. If the files are gone, stop and tell Lee; do not reconstruct them.

**9. Verifiability: CONCERN [GATING].** Three of the workflow's new behaviours have no red, by the plan's own standard (Lee, 2026-08-09).
- **The `::warning` step has no form and no control, and the obvious forms are traps.** Measured on the probe's lock, where 17 moderates make plain `npm audit` exit 1: `npm audit --json | jq` under `shell: bash` (pipefail) exits 1; `j=$(npm audit --json)` exits 1. Either turns every run red and main can never be green. The same form with `|| true` hides a registry failure as "no highs". A form that works, measured both ways:
  `npm audit --audit-level=high || echo "::warning title=Dev-chain high::..."`
  It stays quiet on the probe's lock under `-eo pipefail`, and fires with exit 0 under `bash -e` when a dev high is present. A registry failure also prints the warning, which errs loud. Since 0 highs exist today, the step will never fire on its own.
- **The full-tree critical step has no control.** Measured: `minimist@1.2.5 --save-dev` reads critical; the blocking step exits 0 and the critical step exits 1. And `lodash@4.17.20 --save-dev` is the dev-high control: both blocking steps exit 0, 1 high reported.
- **Review Focus 3 still fails on day one.** My scan of `src/` and `netlify/` imports against the new lock, tests excluded, has one hit outside the plan's exemptions: `tailwindcss` from `src/app/globals.css`.
- **"Three runs running" got cheap, and the cron is unproven.** With `workflow_dispatch`, three greens can be had in ten minutes, which is the moment-in-time weakness round 1 named. Nothing reads a scheduled run.

*Fix:* specify the one-liner; add both controls to the throwaway PR; exempt `tailwindcss` by name, as a build input that shapes shipped CSS; dispatches do not count toward the three, and at least one of the three is `event: schedule`, which proves the cron and spreads the runs across a week.

**10. Maintainability: CONCERN [GATING].** The Close omits things the plan itself promises or leaves wrong.
- "OPS's spec gains this route": not in the program (lines 91-99) and not in the Close.
- CONTRIBUTING's recipe: not in the Close.
- `beta-resequence.md:50-56` and `:324-326` ("Unverified; CI's baseline run resolves it", "All three high groups") go stale. The Close names only the CI paragraph.
- `scripts/mutation-battery.mjs` is not in this repo. It is `~/marvin/scripts/mutation-battery.mjs`.
- `npm update` still crashes on the **new** lock (measured, `edgesOut`). The plan says so only for main's, and it is the first command a future bumper will try.
- The reader's break is dated "main 120cc10"; the bump was `2ba3280`.

*Fix:* add these to the Close and correct the two sentences.

### Conditional

**X3. Evidence and source integrity: CONCERN [GATING].** The load-bearing false claim is gone, and the numbers I rechecked against the JSONs all match: Spatial, Adversarial, Property-Deep, Fidelity, CrossSource's 6, 11 and 35.3%, Precision's 15 pairs, and 4,366%. Tiles' 32, 4, 0 matches `scratchpad/audit-tiles-ndjson.log`. Open:

1. **A fold deleted the third input instead of correcting it.** `295254c` removed "`data/geojson/reference`: not present, so anything needing it did not measure", which was false. Nothing replaced it. The baseline now never names `data/geojson/reference/fwa-lakes.ndjson` (475 MB), which `scripts/lib/audit-config.ts:43` reads and Spatial's two fails depend on.
2. **That makes one sentence wrong.** "Nothing here was re-measured against current government data." By its mtime, 2026-11-01 13:35, with no copy at the primary checkout, the lakes file was fetched today. So FB-4 compares May tiles with November lakes. Small effect, but this file exists to be exact about vintage.
3. **"Tiles writes elsewhere" is not so.** `audit-tiles.ts:1012-1024` writes only under `--output`, so it writes nothing during a suite run. FB-7, classed serious, and A3 and A7 rest on stdout. Defect 3 understates it the same way ("no report in `data/reports/`"). The evidence exists only in the scratchpad, along with the `SUITE FAILED` table the overall line relies on.
4. **The exclusion note is still unmentioned.** `audit-geometry-precision.ts:353` skips `conservation-priority` as "not present in current PMTiles build". Fidelity's JSON names the layer, and Tiles and Fidelity read it. It has no geometry check, and the baseline does not say so.
5. **Also unfolded:** `tsx` 4.23.15 from the `npx` cache. "Commit `4d55c58`" cannot be what ran, since it contains the results; the code is identical to `b45f191`, which is the honest name (`git diff --stat` shows docs only). All 11 CrossSource conflicts are R1, which the script itself calls an expected data limitation while still exiting 1 below 90%; "not diagnosed" passes over that. Forest-age's Hausdorff mean of 17,331 m at z10 is unrecorded, and it bears on whether FB-3 is a data fault or the audit's matching.
6. **TRACEABILITY's headline undercounts.** Summary still says "54 distinct SERIOUS defects", and its wave table names no FB row. Source 6 adds five SERIOUS-until-diagnosed rows after it, so the checkable form of the beta bar reads 59 in its tables and 54 at the top: G3 gains FB-7, and G5 gains FB-1, FB-2, FB-3 and FB-6 under the file's latest-wave counting rule. The label's condition is "TRACEABILITY serious set closed", and a reader stops at the Summary. FB-5 also still reads "summary and exit disagree", the understatement Defect 3 was corrected away from.
7. **PIPE both owns the findings and defines green.** Source 6 gives PIPE the diagnosis of FB-1, FB-2, FB-3 and FB-6. Line 141 gives PIPE the seven defects and the definition of green, and no FB id appears in any relay's spec (grep: none). So the spec's literal path lets a green definition make a 4,366% divergence stop counting without anyone diagnosing it.

*Fix:* one input line for the lakes with its fetch date; correct the sentence; copy both logs beside the JSONs; add the exclusion to Defect 2, which keeps PIPE's count of seven; add `tsx` and `b45f191`; one clause on R1 and one on the Hausdorff mean. Summary to 59 with its wave rows. Append to PIPE's line: "diagnoses TRACEABILITY's FB rows assigned to it; a finding leaves by diagnosis, never by a definition of green."

**X5. Concurrency: PASS [ADVISORY].** The baseline has finished and the JSONs are stored, so `npm ci` can no longer disturb it. Note that `data/geojson/` in this worktree is symlinks plus the lakes file, and the plan does not touch them.

**X6. Operability: CONCERN [ADVISORY].** A reader now exists, which is the real gain. Three things weaken it.
- **It lives only in this plan,** which closes. The program's wave-close text (lines 77, 316) names TRACEABILITY and the critical path, not CI, and OPS has not gained the route. It is the same decay as September.
- **`gh run list` cannot see a `::warning`.** It reports conclusion only. Annotations appear in `gh run view <id>` (read on run 39866175520), where they sit beside two Node and Ubuntu notices already there. So "read at each wave close" fails with the command the plan names.
- **"The wave-close read below would notice" a disabled schedule is an overclaim.** A disabled schedule leaves the last run green.

*Fix:* one sentence in `beta-resequence.md` at line 77, as a wave-close duty: "`gh run view` on main's latest CI run, read annotations, and confirm the latest scheduled run is under 8 days old."

**X8. Dependencies: PASS [ADVISORY].** Licences recorded, `tsx` parked for PIPE, versions verified. Nested `brace-expansion` moves to 5.0.12 too, unlisted and harmless.

## Stress tests

### Pre-mortem

1. **February: the label week finds a runtime red nobody read.** The advisory landed in week two. The reader was in a closed plan, and the program's wave-close text said nothing about CI. We should have seen it: X6's first point.
2. **Type-specific worst case, the gate certifies a wrong map.** PIPE writes "warnings do not fail" to end a permanently red `audit:ci`. FB-3 stops reading red, with nobody having asked why forest age diverges at 19 of 19. The rebuild goes live under a label claiming fidelity, and a wrong area spreads: Lee's first anti-goal. We should have seen it: X3's seventh point.
3. **The green that was never green.** The `::warning` step is written the obvious way, every run goes red on moderates, and the fix under pressure is `|| true`. Now a registry failure and a clean audit read alike. We should have seen it: #9's measurement.

### Load-bearing assumptions

| Assumption | Confidence | If wrong |
|---|---|---|
| The probe's files still exist when the relay runs | Medium: `/tmp`, session-scoped, unnamed in the plan | No lock and no recipe. Resolve in the plan (#8) |
| A session reads CI at each wave close | Low until written into the program | Back to seven weeks of unread red, with lint running. Resolve in the program (X6) |
| A patched version exists when a runtime high lands | Medium; true of the record's recent reds, which were bumped | Every lane stops, or someone ignores it quietly. State the route (#6) |
| The NDJSON is v10's input | Medium-high; 599/600, and the baseline states the caveat | Fidelity compares the wrong vintage. Stated honestly, so acceptable |

### Inversion

**Keep the full high audit blocking.** It wins if a dev high deserves the same red as a browser critical. It does not. And with only a public key in Netlify's build env (#5), the case for it is weaker than round 2 could show.

**Hold the plan for a fourth round.** It wins if a residual could produce a wrong result that the fold cannot catch. None does: each is a sentence or a named command, and the PR run proves the workflow itself. DECISIONS caps child plans at three rounds in any case.

**Commit the lock now rather than naming a path.** It wins if the relay might not run in this session. The lane says this session, so the path and hash suffice, but committing the two files to the PR branch immediately is the stronger form and costs nothing.

## Overall verdict

**PASS with concerns: no gating FAIL, and the plan may proceed once the items below are folded.** The trade is now told truthfully, the runtime control exists and works, the lock's account is correct, and PIPE carries the fail-open. What remains is a handful of folds that dropped a referent (the probe's path, the lakes input), one new step specified too loosely to survive contact with 17 moderates, a reader that dies with this plan, and a TRACEABILITY headline five short. None of it needs another review. For Lee, the two that matter are that the corrected history reaches him before the merge rather than after, and that PIPE cannot define its way past a 4,366% divergence without diagnosing it.

## Prioritized must-fix

Before the relay starts:
1. **Name the probe's path and hashes;** copy first; if gone, stop. (#8)
2. **Lee hears the corrected history before the merge;** "red since 2026-09-11". (#1)
3. **Specify the `::warning` one-liner.** (#9)
4. **Controls on a separate draft PR, never merged:** runtime high, lint error, dev high (warning fires, no red), dev critical (red at the critical step). (#7, #9)
5. **Baseline:** lakes input and date, the corrected sentence, Tiles and suite logs stored, conservation-priority in Defect 2, `tsx`, `b45f191`, R1, Hausdorff. (X3)
6. **TRACEABILITY Summary to 59,** wave rows updated, FB-5's wording. (X3)
7. **PIPE's line:** diagnoses its FB rows; a finding leaves by diagnosis, never by a definition of green. (X3)
8. **Wave-close duty in `beta-resequence.md`:** `gh run view`, annotations, scheduled run under 8 days old. (X6)

In the plan text, one line each:

9. **Bump recipe named;** no-patch route to Lee, any exception recorded. (#3, #6)
10. **Review Focus 1's no-preview path; Review Focus 3 exempts `tailwindcss`.** (#6, #9)
11. **Dispatches do not count toward the three;** at least one is `event: schedule`. (#9)
12. **Close adds:** OPS's route, CONTRIBUTING, `beta-resequence.md:50-56` and `:324-326`; corrects the battery's path, the `npm update` sentence and `2ba3280`. (#10)
13. **The trade gains a clause:** Netlify's build env holds only a public key. (#5)

## Sources

- CI history: `gh run list --workflow CI --branch main`, retrieved 2026-11-01. Annotations: `gh run view 39866175520`.
- Lock and audit measurements: `scratchpad/critic-r3/` (`run.sh`, copies `p`, `c1` to `c4`), npm 10.9.4, Node 22.22.1, registry advisories as of 2026-11-01. All installs there were `--package-lock-only --ignore-scripts`; the worktree's lock was not touched.
- Netlify variable names: `netlify env:list --json` from `~/Projects/opencanopy`, keys only; no values were read into this file.
- Round 2's replay and its method: `.claude/plans/2026-11-ci-green-critic-r2.md`.
- Lee, 2026-08-09, on guards: auto-memory `feedback_guards_must_be_revert_proven.md`. Lee, 2026-10-07, on the three-round cap: DECISIONS, "Each child plan of the 2026-10 remediation program gets at most three critic rounds".
