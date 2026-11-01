## Critic Findings Folded

**Date:** 2026-09-21
**Critic model:** Fable
**Verdict:** FAIL
**Companion file:** opencanopy-relay-plan-critic.md

### Key fixes applied to this plan

1. Add ## Intent (grilled) or skip line (Problem-fit FAIL)
2. R5a.1: INVERT IT -- registry id is planned-cutblocks (the on-branch plan's revised choice), not proposed-cutblocks
3. R3: state what it actually is -- Batch 2 of 08-22 audit + zRank; Jen rules on fire colour conflict
4. D3/R4.2: replace (b) with (b') -- edge function to Telegram bot, not track.js (returns 403)
5. Decisions-check: LT item 1 adds git remote set-head origin -a; every relay Stage 0 uses --ref origin/main
6. R2.4: deletion already on branch; drop tenure-cutblocks from pinned set; scope grep correctly
7. R0.7: owed_remove patterns corrected; npm i -D item preserved
8. Per-relay plan files in .claude/plans/ each with own critic
9. R5c: frame policy via edge function; Stage 0.5 = deploy preview + curl, not toml parse

### NOT FOLDED -- requires Lee's decision

- D1: Phase B ship-as-is vs rebase
- D3: error reporter (Sentry vs same-origin)
- D4-D8: branch protection, CSP flip, share-card URL, embed timing, which layers first

---

# OpenCanopy — Relay Program Plan (charter gap closure)

Plan date: 2026-09-20. Derived from `opencanopy-audit-plan.md` (same directory), the project's `origin/main:.claude/DECISIONS.md` (11 entries, read 2026-09-20), and `~/marvin/.claude/skills/relay/SKILL.md`.

**Target repo:** `/home/leesalo/Projects/opencanopy` (GitHub `ToastedandTripping/opencanopy`). Live: opencanopy.ca, Netlify, git-triggered deploy from `main`.
**Canonical ref:** `origin/main` @ `3db5823` (fetched 2026-09-20). Local `main` is `c5234ab`, 29 behind; checkout is on `dolly/phase2-video` with two uncommitted files (`AGENTS.md`, `e2e/render/dolly.render.spec.ts`) that belong to the docked branch.
**Test baseline:** 866 passing / 58 files on an `origin/main` snapshot (vitest, 23 s, measured 2026-09-20).

## How to read this document

This is a **program plan**: six relays plus one Lee-terminal batch, sequenced by a dependency graph. Each relay is dispatched separately through `/relay` with **its own section of this file as the plan** and **its own critic file** (`opencanopy-relay-plan-{R0..R5}-critic.md` next to it, or the phase-section headings named in the pack's `plan_section`). The relay-load gate requires a companion critic per plan; a single critic pass over this whole document does not satisfy six relays, because R2 and R3 cannot be critiqued honestly until R1 has landed and the anchors are re-grepped.

Per-step headings are `### R{n}.{m} <title>` so `relay-brief.mjs` can carry one step's section into a worker's brief via `plan_section`.

Model policy (from `rules/integrations.md`): Ted implements at Opus low-effort; Razor, the cross-reviewer and the root-cause audit inherit the session model (omit `model`); Jen on Fable for visual spec and Stage-3 review; plan critic on the reviewer valve (astra first, Fable on refusal). The worker-tier valve is `off` by Lee's 2026-09-10 ruling; nothing here changes it.

---

## Standing rulings this plan is bound by (DECISIONS.md, origin/main, 11 entries)

Every relay's Stage 0 re-runs `scripts/decisions-check.sh --repo-root /home/leesalo/Projects/opencanopy` and reads the ref it names. The check must read `ref=origin/main@3db5823` or newer. **Until R0 lands, the local checkout reports `DECISIONS: absent` (the file is not in the dolly branch's tree) while naming 11 at the ref; that is the "every canonical ruling is gone from this tree" stop.** R0 exists to clear it. No relay other than R0 may be loaded while the check reads `absent`.

| # | Ruling (heading, verbatim) | Bucket | What it forbids or requires in this plan |
|---|---|---|---|
| 1 | The landing page ends on the province-wide red reveal; the zoom into the old-growth pocket is /map's job, via the CTA deep-link. | Product | Nothing here touches `/`'s ending. The dolly branch's two uncommitted files stay on the dolly branch. |
| 2 | A public number must be reproducible from the shipped data; when in doubt, understate. | Product | R2 leaderboard totals, R5a FOM hectares, any new copy figure: derived by script from a repo file, pinned by a file-reading test in the `hero-figure.test.ts` pattern, floored when rounded. |
| 3 | Logged hectares means dated 1950-2025 FTEN cutblocks under the 2,000 ha cap, in the story and on the map alike. | Product | R2's leaderboard applies exactly the render filter (cap + null-area arm + dated-only for "since 1950"); undated never in a headline. The entry itself says "Phase B's harvest leaderboard must use the same definition". |
| 4 | A stand we cannot age contributes to no value: not carbon, not timber, not ecosystem services. | Product | R0's PDF pointer fix must not touch calculator values. R5 report-card work (not this week) inherits it. |
| 5 | OpenCanopy may advocate: it tells the public when and how to act on what the data shows, not only what the data shows | Product | R5a's FOM layer copy: proponent named neutrally, never characterized; hectares from the portal API, never a post; no dramatizing sentence. |
| 6 | Do not merge the Phase 2 dolly-video branch until real video assets exist. (amended 08-21: docked) | Engineering | R0 step 1 checks out `main` and leaves `dolly/phase2-video` untouched. Nothing merges it. |
| 7 | The GFW decode-shader endgame stays behind the pre-committed scroll-story Phase-3 gate; do not pull it forward. | Engineering | R3's paint re-spine uses native MapLibre expressions only. No shader. |
| 8 | The agent sandbox cannot render the map; all visual and map QA happens on the live deploy, by Lee. | Operating | Every visual relay (R1, R2, R3, R5a-c) ships with a named live-QA list. Stage 2.8 behavioral eval is skipped with the reason "keyless sandbox; live-QA owed" recorded in the pack. No self-certified screenshots. |
| 9 | ffmpeg is not in the agent sandbox; the dolly-video render, encode and upload chain is a Lee-terminal job end to end. | Operating | Not touched. |
| 10 | Deploy is git-triggered: pushing to main auto-builds and deploys via Netlify's GitHub integration. | Operating | Relay branches are never pushed to `main` by an agent. Lee (or the coordinator on Lee's go) merges; `netlify api listSiteDeploys` confirms `state:ready`. |
| 11 | The analytics script is served from opencanopy.ca itself and its source lives in this repository. | Operating | R4's error reporter, if it adds any script or endpoint, changes `/privacy` copy and CSP `connect-src` in the same commit, with `privacy-claims.test.ts` extended. The recommended same-origin option (D3b) changes neither. |

**Conflicts found: none.** Every step below was checked against all 11. The two places a relay could drift into a conflict are flagged inline: R2.2 (ruling 3) and R4.2 (ruling 11).

**Environment constraints (not rulings, still binding):** the classifier blocks `npm install`, `npm audit fix` and `git push :main` from a session; the 34 GB `data/` tree exists only in the primary checkout, so `audit:all`, the leaderboard build and any tile rebuild run from `~/Projects/opencanopy` and never a worktree; worktrees for every relay are cut from `origin/main` (R0) or from the named predecessor branch (R2, R3).

---

## Dependency Graph

| Step | Relay | Depends on | Parallel group | Tier | Lee gate |
|---|---|---|---|---|---|
| R0 | Hygiene + routed small fixes | none (Lee-terminal step R0.1 first) | A | Standard (6 files + plan copies) | D9 slot for R0.1 |
| R1 | DataLayer public-path bugs | R0 merged | A (after R0) | Standard (5 files, UI) | none |
| R4 | Ops gate to grade B | R0 merged (R0.3 live-health fix) | A | Standard (5-6 files, Charity domain) | D3, D4, D5 |
| R2 | Land Phase B (accountability) | R1 merged | B | Complex (54-file branch, 10 conflict files, UI) | D1 |
| R3 | Paint re-spine (Phase C) | R1 + R2 merged | C | Complex (registry + ~8 style/test files, visual precision) | D2 |
| R5a | FOM proposed-logging layer | R3 merged | D | Standard-Complex (registry, proxy, WfsLayers, tests, UI) | none (probed GO) |
| R5b | Per-preset OG share cards | R2 merged | D | Standard (UI) | D6 |
| R5c | Embed mode | R2 merged | D | Standard (UI + netlify.toml) | D7 |
| R5d | Data vintage + copy-citation | R2 merged | D | Simple-Standard (UI) | none |
| R5e | Gated-layer re-verification | R3 merged | D | Standard (registry + audit) | D8 |
| LT | Lee-terminal batch | none | any time | n/a | D9 |

Groups A run concurrently (R0 first by an hour; R1 and R4 fork from post-R0 `main`). R2 forks from post-R1 `main` because R1 and Phase B both edit `DataLayer.tsx` and the effects R1 fixes are the ones the rebase touches. R3 forks from post-R2 `main` because Phase C's anchors were written against the Phase B registry. Group D items are independent of each other once their named predecessor is merged.

```
R0 ──► R1 ──► R2 ──► R3 ──► R5a, R5e
 │             └───► R5b, R5c, R5d
 └──► R4 (parallel, no code dependency on R1-R3)
LT (Lee-terminal, unblocks R0.1 and R4.5)
```

---

## R0 — Hygiene and the small routed fixes

**Relay id:** `opencanopy-r0-hygiene`. **Branch:** `relay/routed-small-2026-09`, forked from `origin/main`. **Tier: Standard** (6 code/test files + plan copies; no UI). **Probe: no.** **Domain match: no.** **Jen: skipped** (no `.tsx`).

**Goal.** Put the checkout on `origin/main` so no more worktrees fork from stale history; clear every small item the 09-01 refresh routed; get the program's plan files onto `main` so they survive the Phase B branch's fate.

### R0.1 Primary checkout onto main (Lee-terminal or coordinator, before any spawn)

In `/home/leesalo/Projects/opencanopy`:

```
git checkout main && git pull --ff-only
```

Expected: `main` moves `c5234ab -> 3db5823`. The two modified files (`AGENTS.md`, `e2e/render/dolly.render.spec.ts`) are on `dolly/phase2-video`; `git checkout main` will refuse if they conflict, in which case commit them to the dolly branch first (`git commit -am "dolly: wip"` on that branch) rather than stashing (shared stash stack). After this, `decisions-check.sh` reads 11 entries in the working tree and the `absent` stop clears.

This step is not agent work. The classifier may allow a `pull`; if it does not, it is the first line of the LT batch and R0.2 onward waits on it.

### R0.2 PDF methodology pointer

**File:** `src/lib/export/pdf-generator.ts:287`. Replace `(see methodology at opencanopy.ca)` with the GitHub `METHODOLOGY.md` URL the landing footer already uses (grep `METHODOLOGY.md` in `src/app/` for the exact string; do not invent one). **Test:** a string guard in an existing export test (or a new `src/test/lib/pdf-footer.test.ts`) asserting the footer contains `METHODOLOGY.md` and does not contain `methodology at opencanopy.ca`. Ruling 4 check: calculator values untouched.

### R0.3 Live-monitor tests that fail by construction (R4-02)

**File:** `e2e/monitoring/live-health.spec.ts`.
- `:187` — the `tenure-cutblocks` test asserts a layer that is not public. Switch to `cutblocks` and the selector `layer-cutblocks-tiles-fill`.
- `:243` — the `fish-streams` D3 test enables a non-public layer via `#layers=fish-streams`; `validateLayerIds` drops it on a public build. Rewrite to hit `${PRODUCTION_URL}/api/wfs?layer=fish-streams&…` directly (the proxy path is what D3 was verifying) and assert a feature count > 0.

**Cannot be verified from the sandbox** (production-only spec). The relay report names it as LT item "one real `npm run audit:live` from Lee's machine". R4.1's cron depends on this being green first.

### R0.4 wfs-client cleanup race (R2-02)

**File:** `src/lib/data/wfs-client.ts:34-49` (`rejectPendingForLayer`), `:96-100`, `:137-143`.
- Identity-check before deleting: `if (controllers.get(id) === controller) controllers.delete(id)`; same for `debounceTimers`.
- `rejectPendingForLayer` currently deletes and swallows; make it actually reject the pending promise (or document that the caller's abort is the rejection path — pick one and test it).
- **Tests:** `src/test/pipeline/wfs-client.test.ts` gains: (a) a second request for the same layer issued during the first's `finally` does not have its controller deleted; (b) `rejectPendingForLayer` rejects a still-pending promise. The 08-05 COV-1 gap.

Non-public path today; R5a's FOM layer is WFS-only and will hit it.

### R0.5 Back/forward navigation (P9)

**File:** `src/hooks/useMapState.ts` — `handlePopState` at `:237`, push effect at `:263-280`, `lastLayerHash` at `:139`. Add a `restoring` ref set in `handlePopState` and cleared after the state applies; the push effect updates `lastLayerHash.current` without calling `pushState` while it is set. **Test:** `src/test/lib/url-history.test.ts` — a popstate-driven layer change produces no new history entry.

### R0.6 Plans onto main; ROADMAP citations

- `git checkout relay/phase-b-harvest -- .claude/plans/phase-b-harvest-consolidation.md .claude/plans/phase-b-harvest-consolidation-critic.md .claude/plans/phase-c-color-respine.md .claude/plans/phase-c-color-respine-critic.md .claude/plans/phase-c-forest-class-shares.json .claude/plans/phase-d-fom-proposed-logging.md .claude/plans/phase-d-fom-proposed-logging-critic.md .claude/plans/phase-e-layer-architecture.md .claude/plans/phase-e-layer-architecture-critic.md .claude/plans/phase-b-jen-visual-spec.md .claude/plans/phase-b-jen-stage3-review.md .claude/plans/phase-b-razor-review.md .claude/plans/phase-b-tile-probe.md .claude/plans/design` onto this branch. These are documents, not code; no conflict with `main`.
- Copy `~/.claude/plans/temporal-scribbling-metcalfe.md`, `-critic.md`, `misty-waddling-hinton.md`, `-critic.md` into `.claude/plans/` (they are the plans the ROADMAP cites by name and exist only on this machine).
- ROADMAP: the three remaining cited names (`frolicking-imagining-puppy`, `jazzy-gathering-codd`, `sharded-finding-beacon`) exist nowhere; reword those citations to "(session-local plan, not retained)". Do not invent a file.

### R0.7 Handoff bookkeeping

`node ~/marvin/scripts/update-handoff.mjs --repo-root /home/leesalo/Projects/opencanopy` with `owed_remove` for: the stale-checkout item (after R0.1), R3-04, R4-02, R2-02. Add `log_entry` for the relay. Never hand-edit `handoff.md`.

**Files (R0):** `src/lib/export/pdf-generator.ts`, `e2e/monitoring/live-health.spec.ts`, `src/lib/data/wfs-client.ts`, `src/test/pipeline/wfs-client.test.ts`, `src/hooks/useMapState.ts`, `src/test/lib/url-history.test.ts`, `ROADMAP.md`, `.claude/handoff.md`, `.claude/plans/*` (copies). Batch rule: one batch of 8 code/test/doc files under `src/`, `e2e/`, root; the plan copies are a second batch (`.claude/plans/`, docs only, waiver: no code).

**Acceptance:** `npm test` >= 868 passing (866 + the new wfs-client and url-history tests, exact count recorded by Ted, never asserted from here); `npx tsc --noEmit`, `npm run lint`, `npm run build` green. Razor light pass. ROADMAP `shipped` entry. No live-QA item (no visual change), but the LT list gains "run `audit:live` once".

**Explicitly out:** anything in `DataLayer.tsx` (that is R1); `npm i -D @mapbox/vector-tile pbf @types/geojson` (LT, classifier-blocked).

---

## R1 — DataLayer public-path bugs + rendered PmtilesLayers tests

**Relay id:** `opencanopy-r1-datalayer-public-path`. **Branch:** `relay/datalayer-public-path`, forked from post-R0 `main`. **Tier: Standard** (5 files, UI `.tsx` present). **Probe: no** (all three bugs verified present on `origin/main` 2026-09-20 at the lines below). **Domain match: no.** **Jen: Stage 3 fires** (UI file) but the change is behavioral, not visual; expect PASS with no visual findings. **Stage 2.8 behavioral eval: skipped**, reason "keyless sandbox, ruling 8"; live-QA list is the substitute.

**Goal.** Fix the three bugs in the render path every public data layer takes, and give `PmtilesLayers` the rendered test harness it has never had, so each fix is revert-proven and R2/R3 can edit the same effects safely. One of the three (R1-02) breaks the honest-timeline promise in exactly the slow-load case it was built for.

### R1.1 Timeline ticks dropped behind `isStyleLoaded()` (R1-02)

**File:** `src/app/map/page.tsx:322-328`. Today:

```ts
useEffect(() => {
  const map = mapRef.current?.getMap();
  if (!map || timeline.yearFilter == null) return;
  if (!map.isStyleLoaded()) return;
  map.setGlobalStateProperty("currentYear", timeline.yearFilter);
}, [timeline.yearFilter]);
```

`isStyleLoaded()` is false whenever any tile is in flight in MapLibre 5.21, so a year tick issued during a load is silently dropped and the global-state year lags the timeline bar. Fix: a `styleReady` state flag set once on the map's `load` event (or `map.getStyle()` non-null), added to the effect's dependency array so a dropped tick is re-applied when the flag flips. Keep the `setGlobalStateProperty` call as the only write path (the 08-27 global-state uniform).

### R1.2 Stale-status clear sits below the tile-backed early return (R1-03, fold R1-16)

**File:** `src/components/map/DataLayer.tsx:1140-1152`. Today `loadData` returns at `:1144` (`if (!map || layer.source.type !== "wfs" || hasTileSource) return;`) before the `if (!visible) { clearLayerStatus(layer.id); return; }` branch at `:1149-1152`, so the clear never runs for any tile-backed public layer: a "data unavailable" toast stays up after the layer is toggled off. Fix: move the `!visible -> clearLayerStatus` branch above the early return, or into the visibility effect. While there, fold R1-16: `loadData` is invoked twice on a visibility change (find the two call sites in the visibility and viewport effects and dedupe).

### R1.3 PmtilesLayers adds layers from a stale closure (R1-05)

**File:** `src/components/map/DataLayer.tsx:237-245` (add-source effect, deps `[map, layer.id, layer.tileSource, layer.style]` at `:445`; the eslint-disable comment there says `visible` is intentionally excluded), `:447-475` (visibility effect). The add path reads `visible`/`classFilters` from the mount-time closure; toggling a layer on while the source is still loading leaves the legend lit and the map empty. Fix: mirror the `visibleRef` pattern `SatelliteLayers` already uses at `:118-122` (`const visibleRef = useRef(visible); visibleRef.current = visible;`) and read `visibleRef.current` (and a `classFiltersRef`) inside `addLayersToMap` at the time it runs. Do not add `visible` to the effect deps (that tears down and recreates sources, which the comment at `:444` correctly forbids).

### R1.4 Mock records global-state calls (R4-16)

**File:** `src/test/mocks/maplibre.ts`. Record `setGlobalStateProperty` calls as `calls.setGlobalState` alongside the existing recorded calls so R1.5(c) can assert on them.

### R1.5 Rendered PmtilesLayers tests (R1-13)

**New file:** `src/test/pipeline/pmtiles-layers-rendered.test.ts`. `src/test/pipeline/wfs-layers-d10.test.ts` already renders `DataLayer` via `@testing-library/react` with `useMap` mocked at module level (its header comment, lines 17-39, describes the harness); build on it, do not fork a second harness. Required tests:
- (a) status clears when a tile-backed layer is toggled off (`clearLayerStatus` called with the layer id);
- (b) toggle-on during source load produces visible layers once the `sourcedata` event fires (layout visibility `visible` on `layer-{id}-tiles-fill`);
- (c) page-level: a year tick issued while `styleReady` is false is applied via `calls.setGlobalState` when the flag flips.

**Mutation discipline:** each guard is proven through `~/marvin/scripts/mutation-battery.mjs` (spec in, journal out at `~/.local/state/marvin/mutation-battery/`), never a hand-rolled break-and-restore. The battery runs against a disposable worktree; the report cites the journal path, not a claim.

**Files (R1):** `src/app/map/page.tsx`, `src/components/map/DataLayer.tsx`, `src/test/mocks/maplibre.ts`, `src/test/pipeline/pmtiles-layers-rendered.test.ts` (new), `src/test/pipeline/wfs-layers-d10.test.ts` (only if the harness is extracted to a shared helper — prefer importing, not moving). One batch, one root (`src/`).

**Acceptance:** all 866+R0 tests still green plus the three new ones; three mutation-battery journal entries showing red-on-mutation; `tsc`, lint, build green; Razor PASS with the equivalence question "does any public layer's paint or filter expression change?" answered no (this relay changes timing and status, not paint). ROADMAP `shipped`; handoff `owed_remove` for "one relay: R1-02/03/05 + R1-13 + R4-16".

**Live-QA owed to Lee (named, per ruling 8):**
1. Cold-load `/map` on the phone, toggle Parks on while tiles are still arriving: map paints without a second toggle.
2. Play the timeline with three or more layers on a throttled connection: the bar reaches 2025 only after the last patch paints; no year is skipped.
3. Force a "data unavailable" toast (airplane mode mid-load), toggle that layer off: the toast clears.

**Explicitly out:** any split of `DataLayer.tsx` or `map/page.tsx` (09-01 refresh ruling: long, not costly); any paint change (R3).

---

## R2 — Land Phase B: harvest consolidation + accountability view

**Relay id:** `opencanopy-r2-phase-b-land`. **Branch:** `relay/phase-b-land`, created as `relay/phase-b-harvest` rebased (or merged forward) onto post-R1 `main`. **Tier: Complex** (54 files on the branch, 10 conflict files, UI, visual precision on the leaderboard and legend). **Probe: yes, narrow** — R2.2's cap-parity numbers are oracle values; Stage 0.5 measures the scrub table total and the leaderboard's regenerated total before the tolerance is written into a test. **Domain match: no.** **Jen: Stage 0.7 spec is already on the branch** (`phase-b-jen-visual-spec.md`); Stage 3 re-review fires on Fable. **Gate: D1** — Lee confirms option (a), rebase and ship. The audit's recommendation is (a); the B.1/B.2 rulings of 2026-08-26 match the branch.

**Goal.** Ship founding promise #2. The branch is 12 commits ahead and 39 behind `origin/main` (measured 2026-09-20); `git merge-tree --write-tree origin/main relay/phase-b-harvest` reports conflicts in exactly these 10 files: `README.md`, `ROADMAP.md`, `src/components/map/DataLayer.tsx`, `src/components/map/MapLegend.tsx`, `src/components/map/MapPopup.tsx`, `src/hooks/useMapState.ts`, `src/lib/layers/presets.ts`, `src/lib/layers/registry.ts`, `src/test/audit/contrast-audit.test.ts`, `src/test/audit/proxy-consistency-audit.test.ts`.

### R2.1 Rebase onto post-R1 main and resolve the ten conflicts

Three known conflict causes, each with a stated resolution rule:
- **Batch 1 renames** (main wins on names): preset `threats` is labelled "Logging", `protection` is "Old Growth + Parks"; layer ids `tap-deferrals` -> `old-growth-250`, `conservation-priority` -> `tap-priority`. Phase B code that references the old ids is updated to the new ones; `validateLayerIds` will fail loudly on any miss.
- **Global-state API** (main wins on API): `buildYearFilter(field)` / `buildAgeGradedOpacity(field)` dropped the year param; the DataLayer filter effect is keyed on `timelineActive`. Phase B's harvest recency choropleth (`phase-b-harvest-consolidation.md` §3.2) is re-expressed on the global-state `currentYear`, never a per-tick filter.
- **Test-file drift** (merge both): `contrast-audit`, `proxy-consistency-audit`, plus `schema-audit`, `satellite-zorder`, `data-layer-memo` — keep main's mutation-proven audit tests and add Phase B's cases.
- **09-01 refresh moves** (main wins on location): popup keys live in `src/lib/map/popup-keys.ts`; `CUTBLOCK_AREA_CAP_HA` is single-sourced and pinned to the proxy CQL; `validateLayerIds` exists. Phase B's `harvestAreaFilter()` (§3.3) must import the single-sourced cap, not carry its own 2000.
- **R1's effects** (R1 wins): the `styleReady` flag, the moved `clearLayerStatus` branch and the `visibleRef` add-path are kept verbatim; Phase B's DataLayer edits are re-applied around them.

Conflict resolution is Ted's Stage 1 batch 1 and is reviewed by Razor before batch 2 (the Complex-tier "Razor between batches" rule) with the explicit question: does the resolved tree preserve every R1 fix and every Batch 1 rename?

### R2.2 Cap-ruling parity (ruling 3 — the one place this relay can violate DECISIONS)

Phase B's `harvestAreaFilter()` keeps a null-area arm (tippecanoe drops null attributes, so null-area tile features legitimately pass the render filter). `scripts/build-harvest-leaderboard.ts` must apply **exactly** the render filter (cap + null-arm + dated-only for any "since 1950" figure) and the scrub table's definition. Add `src/test/lib/harvest-leaderboard.test.ts` in the `hero-figure.test.ts` pattern: reads `src/data/harvest-leaderboard.json` and `src/data/scrub/cutblocks-scrub.json`, asserts the dated totals agree within the tolerance Stage 0.5 measured (both derive from the same checkpoint under the same cap), asserts undated hectares sit in their own bucket and appear in no headline figure, and asserts the JSON declares `areaCap: 2000`. If Stage 0.5 finds the two totals disagree by more than rounding, that is a finding to surface, not a tolerance to widen.

### R2.3 Regenerate the leaderboard (primary checkout only)

`npx tsx scripts/build-harvest-leaderboard.ts` reads `data/checkpoint/preprocessed/tenure-cutblocks.ndjson` (1.8 GB, primary only). Runs from `/home/leesalo/Projects/opencanopy` on the relay branch checked out there, or the JSON is generated at the primary and committed onto the relay branch by path. Record `areaCap`, `generatedAt`, source file in the JSON. Never regenerate in a worktree (no data).

### R2.4 Share-link and registry hygiene

- Confirm the Razor F4 fix (write-only `#company=` share links) survived the rebase: `src/test/lib/url-history.test.ts` round-trip.
- Delete the `tenure-cutblocks` registry and proxy entries together (the Phase B critic verified safe); fix `src/test/lib/companies.test.ts:77-96` and `src/test/audit/schema-audit.test.ts:241-242`, which the branch's step list missed; re-check `SOURCE_TO_MAPLIBRE` in `e2e/screenshots/` for the removed id.
- R0.3 already moved the live-monitor test off `tenure-cutblocks`; verify no second reference remains (`git grep tenure-cutblocks`).

### R2.5 Re-gates

Razor: equivalence against the pre-rebase branch (`git diff relay/phase-b-harvest..relay/phase-b-land -- src/` should be explainable line-by-line as rename/API/R1 adaptations plus R2.2/R2.4) plus the new parity test. Jen Stage 3 on Fable against `phase-b-jen-visual-spec.md`; the prior CONCERNs were closed in `dfa71c5`, so she reviews the rebased legend/leaderboard, not the design.

### R2.6 Docs

ROADMAP `shipped` + `next`; ARCHITECTURE registry count (17 after `tenure-cutblocks` goes; the doc says ~18); handoff `owed_remove` for the Phase B item and `log_entry`; DECISIONS `decisions_add` only if something new is ruled (nothing expected; do not write one for the parity test, it is code-visible).

**Batches (Complex tier, cap 8 files / 1 root per batch, waivers stated):** B1 conflict resolution (10 files, roots `src/`, root docs — **waiver: a rebase's conflict set is not divisible; splitting it leaves the tree unbuildable between batches**); B2 cap parity + leaderboard (`scripts/build-harvest-leaderboard.ts`, `src/data/harvest-leaderboard.json`, `src/data/harvest-config.ts`, `src/test/lib/harvest-leaderboard.test.ts`, `src/lib/layers/registry.ts` cap import — 5 files, roots `scripts/` + `src/` — **waiver: writer and its pin belong in one batch**); B3 registry/proxy deletion + test fixes (`registry.ts`, `netlify/edge-functions/wfs-proxy.ts`, `companies.test.ts`, `schema-audit.test.ts`, e2e screenshot map — 5 files, 3 roots — **waiver: deleting an id is one change with N witnesses**); B4 docs.

**Acceptance:** tests green including parity; Razor PASS; Jen PASS or CONCERNs only; `#company=` round-trip green; ROADMAP updated. Report names the regenerated JSON's `generatedAt` and total.

**Live-QA owed to Lee:**
1. Logging preset shows harvest recency with forest-age's harvested class suppressed (no red-on-red).
2. Click a block: licensee in the popup, named as in the FTEN record.
3. Leaderboard totals are the same order of magnitude as the hero's 5.8M (shared definition now).
4. A `#company=<slug>` link opens filtered on a fresh load, and the slug is not written into the URL when you change layers afterwards.

**If D1 comes back (b) or (c):** this relay is withdrawn; R3 forks from post-R1 `main` instead and its registry anchors are re-grepped against that tree. R5b/c/d lose nothing (they depend on share-state machinery that is on `main` already).

---

## R3 — Paint re-spine (Phase C, vector-only): the three blockers and "layer audit finished"

**Relay id:** `opencanopy-r3-paint-respine`. **Branch:** `relay/paint-respine`, forked from post-R2 `main`. **Tier: Complex** (visual precision; registry + DataLayer + legend + ~4 audit tests + presets). **Probe: no** (paint values are design decisions, not external facts; the class-share numbers are already computed in `.claude/plans/phase-c-forest-class-shares.json`). **Domain match: no.** **Jen: Stage 0.7 spec on Fable is required** — the on-branch `phase-c-color-respine.md` has no Jen spec, and this is the phase where colour is the product. **Gate: D2** (z5 treatment).

**Scope reconciliation the relay's Stage 0 must do first.** The on-branch Phase C plan (`phase-c-color-respine.md`, critic PASS with 6 must-fixes folded, 2 gating) is split into **C1 — vector-only, autonomous, no raster, no palette change** (§3) and **C2 — atomic palette + proportion + rebuild + flip, HELD for Lee's deploy window** (§4, a tile rebuild on the primary). **R3 is C1 plus the visual-audit blockers below. C2 is Batch 4 territory** (Lee-terminal, days, primary only) and is out of this relay; do not pull it in. Every anchor in the on-branch plan predates Phase B's merge and the 09-01 refresh: **re-grep every file:line before Ted's brief is written**, and record the re-grep in the pack as a Stage 0 note.

Items (IDs from `research/map-visual-audit-2026-08-22.md`):

### R3.1 zRank — the structural piece (PR3)

Add `zRank` to `LayerDefinition` (`src/types/layers.ts`): rasters 0, fills 10, outlines 20, lines 30. `CanopyMap`/DataLayer sort layer insertion on it so fire never draws under forest-age and satellite never over a vector fill. Add an audit test (`src/test/audit/zorder-audit.test.ts`, alongside the existing `src/test/pipeline/satellite-zorder.test.ts` and `raster-overview-zorder.test.ts`, which stay) that asserts every registry entry declares a rank and that insertion order is monotone in it.

### R3.2 Old-growth outline (T1)

`old-growth-250`: width ramp `["interpolate",["linear"],["zoom"],8,0,10,0.6,13,1.2]` at opacity 0.5, so the gold scribble at z10+ becomes an edge. Swatch stays the green fill. Build-time dissolve is Batch 4, not here.

### R3.3 Cutblocks edge and recency (C1/C2 of the audit; PR1 follows by construction)

Edge to white `#ffffff` 1.2 px at 0.85; below z10 fill-only with opacity keyed to `DISTURBANCE_START_DATE` (the scrub path already computes the ramp; make it the static default); legend "Cutblock, 1950-2025 (brighter = more recent)". **R2 has already re-styled this layer for harvest recency — reconcile with what landed, do not double-apply.** PR1 (Logging preset pixel-identical to forest-age) is closed by this item plus R2's harvested-class suppression.

### R3.4 Fire (H1/H2)

Opacity by `FIRE_YEAR`; `#fbbf24` outline at 0.6; legend copy. With R3.1, fire draws above forest-age.

### R3.5 Priority hue (CP1)

`tap-priority`: violet `#a78bfa` fill 0.35 + `#c4b5fd` outline. Policy designation, not forest type; frees gold for old growth. This plus R3.3 is the protanopia fix the 07-15 backlog flagged.

### R3.6 Parks as an edge when stacked (K1)

White dashed outline via `style.outline` (PMTiles path honours it; parks is tile-backed), fill 0.08.

### R3.7 Satellite range and dim (S1/P5)

`satellite` `zoomRange [10,22]`; desaturate/dim under overlays; preset copy.

### R3.8 z5 honesty (P4) — Lee-gated D2

Option (a), recommended: `zoomRange [6,18]` on cutblocks, parks, fire, tap-priority plus a "zoom in to see" chip state in the layer panel. One line per layer, truthful. Option (b) — a real z5 treatment — is C2/Batch 4. If D2 is unanswered when R3 loads, ship (a); (b) is additive later.

### R3.9 Legend and audit tests

Legend swatch == paint per classSlug is a mutation-proven audit (09-01); it goes red on every colour change until `MapLegend` items are updated. That is the test doing its job; update the legend items, never the test. Gates that must be green: `color-audit`, `contrast-audit` (deuteranopia/protanopia), `opacity-audit` (>= 0.15 within zoomRange), `zorder-audit` (new), `npm run audit:rendering`.

**Files (R3):** `src/types/layers.ts`, `src/lib/layers/registry.ts`, `src/lib/layers/presets.ts`, `src/components/map/DataLayer.tsx` (insertion order only), `src/components/map/MapLegend.tsx`, `src/components/panels/LayerPanel.tsx` (chip state), `src/test/audit/{color,contrast,opacity,zorder}-audit.test.ts`, `research/map-visual-audit-2026-08-22.md` (status column). **Batches:** B1 zRank + zorder audit (4 files, `src/`); B2 paint items R3.2-R3.7 (registry, presets, legend, 3 audit tests — 6 files, `src/`); B3 P4 chip state + audit doc (3 files, `src/` + `research/` — waiver: doc update is the same change's record).

**Acceptance:** all audits green; Jen Stage 3 PASS on Fable against her Stage 0.7 spec; Razor PASS; Stage 2.8 skipped (ruling 8). After merge: ROADMAP `next` drops "Batch 2"; the audit checklist statuses updated; the charter's phase-4 gate reads "layer audit finished" for the public surface (Batches 3-5 remain improvements).

**Live-QA owed to Lee:** the 9-view grid the audit used, 7 public layers + 4 presets. Minimum: (1) old growth at z11 reads as edge not scribble; (2) Logging preset at z8 and z12 differs visibly from forest-age alone; (3) Fire+Logging at z9 shows fire above age with four distinguishable hues; (4) z5 shows the "zoom in" chip on the four affected layers and nothing claims to render; (5) priority is violet, not gold, and old growth is gold-edged green.

**Explicitly out:** C2 raster rebuild; per-layer PMTiles archives (P3); z10+ hole rebuild; the GFW shader (ruling 7).

---

## R4 — Ops gate to grade B (parallel track)

**Relay id:** `opencanopy-r4-ops-gate`. **Branch:** `relay/ops-gate`, forked from post-R0 `main` (needs R0.3 or the cron alarms on its first run by construction). **Tier: Standard** (5-6 files). **Probe: no.** **Domain match: yes — Charity** (deployment, monitoring, alerting); Stage 0.3 specialist pre-check fires. **Jen: skipped** unless D3 lands on Sentry (then `/privacy` copy changes and Jen reviews the copy block). **Gates: D3, D4, D5** — R4.2 and R4.4 cannot start without D3; R4.3 is Lee's account, not code.

**Goal.** Close the two production-audit FAILs (no error monitoring, no downtime alerting — `opencanopy-2026-08-27.md`, grade D 42/100, "entirely the monitoring/alerting gap") so the phase-4 gate's "prod audit B" half passes.

### R4.1 Scheduled `audit:live` with alerting

**New file:** `.github/workflows/live-monitor.yml`. Cron every 6 h; `npm ci`, `npx playwright install --with-deps chromium`, `npm run audit:live` (`playwright.live.config.ts`, already split from `test:e2e`); on failure, POST to a Telegram webhook (marvin `/notify` pattern; the webhook URL is a repo secret `LIVE_MONITOR_WEBHOOK` Lee adds — LT item). `workflow_dispatch` enabled so Lee can fire it once by hand as the first real run. Do not add it to `ci.yml`; it is production-facing and must never gate a PR.

### R4.2 Error reporting — shape decided by D3

**File:** `src/components/ui/MapErrorBoundary.tsx:25` (today `console.error("MapErrorBoundary caught:", …)` only).
- **D3(b), recommended:** new Netlify function `netlify/functions/report.ts` (or a second edge function beside `wfs-proxy.ts`) at `/api/report`, same-origin, rate-limited like the proxy, forwarding `{message, stack (trimmed), url, ua, ts}` to the existing ssc-ops track endpoint already named on `/privacy`. The boundary `fetch`es it with `keepalive: true`. **Ruling 11 check:** no new origin, no new script, no cookie; the privacy page's disclosed field list must still be true — extend `src/test/lib/privacy-claims.test.ts` to cover the report payload's fields. CSP `connect-src 'self'` already covers it.
- **D3(a), Sentry:** adds a third-party script and origin; `/privacy` copy, CSP `connect-src`/`script-src`, and `privacy-claims.test.ts` all change in the same commit, with Jen reviewing the copy. Not recommended.

### R4.3 Branch protection on `main` (D4, Lee's GitHub account)

Not code. Require the `ci` workflow's status check before merge; no force-push. Listed here so the production re-audit can tick it.

### R4.4 CSP report endpoint (D5)

Add `report-to`/`report-uri` to the existing `Content-Security-Policy-Report-Only` header in `netlify.toml:40`, pointing at the same `/api/report` function from R4.2 with a `type: "csp"` discriminator. Violations are then observed without Lee's phone. The enforce flip (`Content-Security-Policy-Report-Only` -> `Content-Security-Policy`) is a later one-line change on Lee's go after a week of clean reports; not in this relay.

### R4.5 Re-audit

After R4.1, R4.2 and (Lee) R4.3 land: `/production --quick` on `main`. Expected B (0 FAIL, <= 4 WARN). The R2 cache headers and tile manifest are LT items, not this relay.

**Files (R4):** `.github/workflows/live-monitor.yml` (new), `src/components/ui/MapErrorBoundary.tsx`, `netlify/functions/report.ts` (new) or `netlify/edge-functions/report.ts`, `netlify.toml`, `src/test/lib/privacy-claims.test.ts`, `src/test/lib/error-report.test.ts` (new: payload shape + rate limit). One batch (6 files, roots `.github/`, `src/`, `netlify/`, root — waiver: monitoring is one subsystem spread across config roots by Netlify's layout).

**Acceptance:** `npm test`, build green; the workflow file validates (`actionlint` if available, else a dry `workflow_dispatch` by Lee — LT); Charity's Stage 0.3 pre-check has no open item; Razor PASS with the rate-limit and payload-trim checked. No live-QA (no visual change) but two LT items: add the webhook secret; fire `workflow_dispatch` once.

---

## R5 — Growth: the first phase-5 work (opens once R2 and R3 are merged)

Each item is its own relay, parallel-eligible after its named predecessor. Only R5a and R5d need no scope call.

### R5a FOM proposed-logging layer (Phase D)

**Relay id:** `opencanopy-r5a-fom-layer`. **Branch:** `relay/fom-proposed-logging`, from post-R3 `main` (it takes the threat hue R3 frees, and it needs R3's `zRank`). **Tier: Complex** (registry, proxy, `DataLayer.tsx` WFS branch, LayerPanel, popup, presets, 4+ tests, UI). **Probe: already GO** (`phase-d-fom-proposed-logging.md` + probe); Stage 0.5 re-confirms the WFS endpoint answers and re-reads the schema field list live — feature counts moved 47,222 -> 48,279 in three weeks, so nothing numeric is hardcoded. **Jen: 0.7 spec + Stage 3 on Fable.** **Gate: none from Lee.** The plan is on `main` after R0.6.

**Critic findings that must be folded into the plan before Stage 1** (the critic's verdict was Approach soundness FAIL until they are):
1. **Unify the proxy key.** `netlify/edge-functions/wfs-proxy.ts:127` (`LAYER_CONFIG`) and `:377` (`PROPERTY_WHITELIST`) say `planned-cutblocks`; the plan's registry id is `proposed-cutblocks`. Rename the proxy keys to `proposed-cutblocks` and remove `planned-cutblocks` from `sanctionedOrphans` in `src/test/audit/proxy-consistency-audit.test.ts:339` in the same commit. The end state as written 400s every fetch and fails the orphan audit.
2. **Fix the whitelist** — `FSP_HOLDER_NAME, OPENING_ID, BLOCK_ID, CUTTING_PERMIT_ID` are FTEN names; the FOM schema (re-read live in Stage 0.5) has `FOM_ID, CUT_BLOCK_ID, NAME, PLANNED_DEVELOPMENT_DATE, PLANNED_AREA, FSP_HOLDER_NAME, …`.
3. **Re-add `WFS_ENDPOINTS.plannedCutblocks`** — deleted by the 08-05 dead-code sweep; restorable from `d5c1749:src/lib/layers/registry.ts:26`.
4. **Outlines on the WFS path.** `style.outline` is honoured only on the PMTiles branch (`DataLayer.tsx` `layer-{id}-tiles-outline`); the WFS/GeoJSON branch hardcodes `line-width 0.5`, `line-opacity 0.4`. **Choose (a): extend the WFS outline branch to honour `style.outline` (colour/width/opacity), with the caveat that `line-dasharray` is not data-driven in MapLibre, so a dashed "lapsed" state needs a second filtered line layer.** This is the better answer because R3.6's parks edge and any future WFS-only layer want it too. Add `DataLayer.tsx` to the file list with a rendered test in the `wfs-layers-d10` harness. Styling is fill-only for the three lifecycle states until that lands in the same relay.
5. **Copy:** no hardcoded counts; proponent named neutrally (ruling 5 — some proponents are First Nations forestry partnerships); popup deep-links `fom.nrs.gov.bc.ca` by `FOM_ID`; hectares from `PLANNED_AREA` on the portal's own record.
6. Add to the Logging preset (`presets.ts` `threats`): this is what makes "Logging" a threat map and completes the Batch 1 rename's promise.

**Live-QA owed to Lee:** a known open FOM (Wilson Lake, FOM 3406, Selkirk) renders in the Logging preset and its popup links the portal page; toggling the layer on at z8 shows proposed blocks distinct from cut blocks (hue, not just outline).

**Why it matters:** the only forward-looking layer any BC map shows, and the data substrate for the charter's phase 6 (FOM watch), which stays parked behind its grill.

### R5b Per-preset OG share cards — gated D6

**Relay id:** `opencanopy-r5b-share-cards`. From post-R2 `main`. **Tier: Standard** (UI). The static export cannot render a per-view OG image (bots do not run JS; the hash never reaches the server). Shape: four static route stubs `src/app/share/[preset]/page.tsx` with `generateStaticParams` over `PRESETS` (`overview`, `threats`, `protection`, `fire-logging`), each with its own `opengraph-image.png` **supplied by Lee from a real screenshot** (LT item; the sandbox cannot render, ruling 8) and a `<meta http-equiv="refresh">` + JS redirect to `/map#preset=…`. The share control gains "copy preset link" beside the exact-view link. **Blocked on the four PNGs; the relay can ship with the current site-wide card as a placeholder and swap when Lee supplies them, but the ROADMAP entry must say so.**

### R5c Embed mode — gated D7

**Relay id:** `opencanopy-r5c-embed`. From post-R2 `main`. **Tier: Standard** (UI + `netlify.toml`). `src/app/embed/page.tsx` renders `CanopyMap` chromeless with params locked (no panels; timeline only with `?timeline=1`; attribution and an "Open in OpenCanopy" link kept). `netlify.toml` gets a second `[[headers]]` block `for = "/embed/*"` that drops `X-Frame-Options` and sets `frame-ancestors *` (or an allowlist Lee names); `/*` keeps `DENY` and `frame-ancestors 'none'` (`netlify.toml:18`, `:40`). A "Copy embed code" action in the share control. **Razor question to answer explicitly:** the report-only CSP on `/*` carries `frame-ancestors 'none'`; the `/embed/*` block must override that directive too, or the enforce flip (R4.4's follow-on) will break embeds on the day it lands. Test: a header-parsing test over `netlify.toml` asserting the two blocks' `frame-ancestors` differ as intended.

### R5d Data vintage + copy-citation

**Relay id:** `opencanopy-r5d-vintage`. From post-R2 `main`. **Tier: Standard.** **Probe: yes** — no vintage field exists anywhere in `src/` today (grep `vintage|VRI_YEAR|PROJECTED_DATE` on `origin/main`: zero hits); Stage 0.5 must establish where the VRI vintage actually lives (PMTiles archive metadata via `pmtiles` `getMetadata()`, and the WFS `Last-Modified` header for live layers) before any string is written. Badge in the legend footer (`MapLegend.tsx`): "Data: VRI {vintage} · FTEN live · fire live · retrieved {date}". "Copy citation" produces URL + active layers + vintages + access date. **Ruling 2 applies:** a vintage is a public number; it is read from the archive, never typed, and pinned by a test that reads the same metadata.

### R5e Gated-layer re-verification — gated D8

**Relay id:** `opencanopy-r5e-gated-layers`. From post-R3 `main`. **Tier: Standard.** The 11 non-public registry entries (`logging-risk`, `tenure-cutblocks` — gone after R2 —, `conservancies`, `ogma`, `fish-streams`, `community-watersheds`, `species-at-risk`, `wildlife-habitat-areas`, `ungulate-winter-range`, `mining-claims`, `forestry-roads`) are checked one by one at the 9 audit views under the R3 palette and `zRank`; each that passes is added to `PUBLIC_LAYER_IDS` (`registry.ts:893`) with a legend entry and a LayerPanel category. Q1 (2026-08-26) "verify layer-by-layer before surfacing" is the rule. Cheaper than adding caribou / Forest Biodiversity Value / old-growth condition from the catalogue; those follow if D8 says so. Live-QA: per surfaced layer, one view.

**Not this week, named so it is not lost:** watershed report card (founding promise #1; one relay on the CO2 spine; 500 km² cap); FOM watch persona (charter phase 6; grill first, four open questions); Batch 4 tile rebuild (z10+ holes, per-layer archives, dissolve, C2 raster — days on the primary, Lee-terminal); Batches 3 and 5.

---

## LT — Lee-terminal batch (no decision, one sitting)

In order, in `/home/leesalo/Projects/opencanopy`:
1. `git checkout main && git pull --ff-only` (R0.1; unblocks everything).
2. `npm i -D @mapbox/vector-tile pbf @types/geojson` (R4-14; classifier-blocked from a session). Commit on `main` or on the R0 branch; the `package-safety.sh` hook runs `npm audit` after.
3. `rclone lsf` -> `scripts/generate-tile-manifest.py` -> deploy the `ocbin://` manifest (minutes; clears one 404 and ~70 console errors per landing load).
4. R2 `Cache-Control` metadata sweep on the versioned tile dirs (`rclone` metadata, hours, unattended).
5. After R0 merges: one real `npm run audit:live`; report the two rewritten tests' verdicts.
6. After R4 merges: add the `LIVE_MONITOR_WEBHOOK` repo secret; fire `live-monitor.yml` once via `workflow_dispatch`; enable branch protection (D4).
7. Live-QA lists: the six deployed relays plus the 09-02 deploy checks already in `handoff.md`, then R1, R2, R3, R5a as each merges. Each is a named list in the relay's report.
8. R5b: four preset screenshots at 1200x630 if D6 is yes.

---

## Decisions for Lee (batched; nine)

Each in the structured shape. Plumbing has already been decided by the plan; these are direction, scope, money and account calls.

**D1. Does the accountability view ship by rebasing the branch we already reviewed, or get rebuilt?**
*Today:* company-coloured harvest, a province-wide leaderboard and `#company=` links exist complete and reviewed (Razor 3 CRITICALs closed, Jen PASS) on a branch that is 39 commits behind and conflicts in 10 files. *Tension:* your rulings of 2026-08-26 (province-wide static leaderboard; harvest folded into the Logging preset, no separate chip) match what was built, but your 2026-09-02 ruling ("logged hectares means dated 1950-2025 FTEN cutblocks under the 2,000 ha cap … Phase B's harvest leaderboard must use the same definition") postdates it, and every week the rebase gets harder. *Options:* (a) rebase, apply the cap rule with a test that proves the leaderboard and the map agree, ship — R2 as written, about a day; (b) re-plan from scratch on today's main — throws away ~8k reviewed lines, ~3 days; (c) leave it — the branch dies by drift. *Recommendation:* (a). The substance is what you asked for; the only new constraint is mechanical and testable. Cost of being wrong: one more relay to adjust styling. *Reversible:* yes, it is a layer and a preset. *If nothing for a month:* the rebase cost roughly doubles.

**D2. At province zoom, should the map say "zoom in" honestly, or should we build a real province-scale picture for each layer?**
*Today:* the layer list claims cutblocks, parks, fire and priority render from zoom 5; nothing paints there. Fire is invisible at the one zoom where fire is the story. *Options:* (a) declare zoom 6 as the floor and show a "zoom in to see" chip — one line per layer, ships in R3; (b) a real province-scale treatment — a raster overview per layer, a tile build on your machine over several days (Batch 4). *Recommendation:* (a) now, (b) when Batch 4 runs; they are not exclusive. *Reversible:* yes.

**D3. When the live site crashes, who gets told, and through what?**
*Today:* a crash is caught, shown to the user as an error panel, and logged to their browser console. Nobody else knows. The production audit has failed on this since August. *Options:* (a) Sentry, free tier — richer stack traces and grouping, but a new third-party script on the page, so the privacy page and the security policy change with it (your 09-02 ruling: the tracker copy moves with the code); (b) a tiny same-origin function on our own Netlify site that forwards the error to the ssc-ops endpoint the privacy page already names — no new party, privacy page unchanged, less tooling. *Recommendation:* (b) first; upgrade if volume ever warrants. *Reversible:* fully. *If nothing:* the D grade stands and the phase-4 gate stays shut.

**D4. Should `main` refuse merges that have not passed CI?**
*Today:* anyone with push can merge without a green run; the audit flagged it. *Cost:* hotfix pushes from a session wait for the 3-4 minute CI run first. *Recommendation:* yes. *Reversible:* one setting.

**D5. Should the security policy start reporting violations to us now, and flip to enforcing later on your say?**
*Today:* report-only since July; the flip has waited two months on a phone/incognito sweep. *Recommendation:* ship the report endpoint (the same function as D3b), watch a week, flip on your go. *Reversible:* one header line.

**D6. Is a set of four preset share links with their own preview images worth adding?**
*Today:* every link to the site shows the same preview card. A per-view image is impossible on a static site. *Cost:* four screenshots from you, a second link type in the share menu. *Recommendation:* yes; it is the "every view is a link" promise made visible in a feed. *Reversible:* yes.

**D7. Build the embeddable map now, or after the first journalist asks?**
*Today:* no page on the internet can embed any OpenCanopy view; the site forbids framing everywhere. *Recommendation:* build now — a thin page over the existing share-state machinery, and the framing change is limited to `/embed`, so the rest of the site stays locked. *Reversible:* yes.

**D8. Which new layers first: re-verify and surface some of the eleven already built but hidden, or add caribou / biodiversity / old-growth condition from the catalogue?**
*Recommendation:* the hidden eleven first (they exist, are audited, cost nothing to surface once verified, and your 08-26 rule "verify layer-by-layer before surfacing" already governs them); the FOM layer (R5a) is the one genuinely new layer this month; caribou next if you want a wildlife story.

**D9. The terminal batch (no decision, a slot):** the eight LT items above in one sitting; items 1 and 2 first because R0 waits on them.

---

## Pre-mortem and inversions

**Assumption 1 (load-bearing): R0.1 happens before any spawn.** If it does not, the next worktree forks from the dolly branch again (third time) and `decisions-check.sh` reads `absent`. Mitigation: the ruling table above says no relay but R0 may load while the check reads `absent`; the relay-load Stage 2.5 is the enforcer.

**Assumption 2: R1 and Phase B's DataLayer edits compose.** They touch the same effects. Inversion: land Phase B first, then R1. Rejected because R1's fixes are small and well-understood while the rebase is the messy step; carrying three known fixes into a conflict resolution is easier than re-deriving them inside one. If R2.1 finds an R1 fix cannot survive the rebase, that is a Ted DONE_WITH_CONCERNS and a pause, not an improvisation.

**Assumption 3: the leaderboard and scrub totals agree under the same cap.** They derive from the same checkpoint, but through two scripts. If Stage 0.5 finds them apart by more than rounding, the finding goes to Lee (ruling 2: understate; ruling 3: same definition), and the leaderboard does not ship with a headline until it is explained.

**Assumption 4: the on-branch Phase C plan's C1 half is what "layer audit finished" needs.** The charter gate says "layer audit finished"; the audit's three blockers are all closable with paint and z-order. C2 (raster rebuild) is a fidelity improvement, not a correctness item. If Lee reads the gate as requiring C2, phase 5 waits on Batch 4 — say so rather than start R5.

**Assumption 5: R4's Charity pre-check does not turn up a fourth FAIL.** The 08-27 audit listed two FAILs and a WARN; nothing in the deploy has changed since except the CI fix. Low risk.

**Inversion: what if none of this ships this week?** R0 alone is worth doing: it stops the stale-fork trap and puts the program's plans on `main`. Everything else degrades gracefully to "still on a list" — except R2, which decays by drift and is the item to protect.

**Proportionality:** six relays for a project whose last production audit was D and whose founding promises are 0/3 shipped is not over-engineering; three of the six (R0, R1, R4) are half-day Standard relays.

---

## Sequencing (one week, two parallel lanes)

| Day | Lane 1 (map) | Lane 2 (ops) | Lee |
|---|---|---|---|
| Mon AM | R0 (after LT 1-2) | — | LT 1-2; answer D1-D5 |
| Mon PM | R1 | R4 (R4.1, R4.2 on D3) | — |
| Tue | R2 B1-B2 (rebase, parity) | R4 close; `/production --quick` | R2.3 leaderboard regen at the primary if Ted cannot; LT 5 |
| Wed | R2 B3-B4, gates, merge | — | Live-QA R1; LT 6; D4 |
| Thu | R3 (Jen spec first) | — | Live-QA R2; answer D6-D8 |
| Fri | R3 gates, merge; R5a Stage 0 | R5d probe | Live-QA R3 |
| Next week | R5a, R5b/c/d/e in parallel | CSP enforce flip on go | Live-QA R5a |

---

## What this plan deliberately does not do

- Does not split `DataLayer.tsx` or `map/page.tsx` (09-01 refresh ruling).
- Does not un-dock the dolly or touch the GFW shader (rulings 6, 7).
- Does not start the FOM watch persona (charter phase 6) — grill first; R5a builds its substrate.
- Does not pull C2 (the raster re-spine) into R3; it is Batch 4 on the primary.
- Does not bump MapLibre 6 / TypeScript 7 / ESLint 10; LT item 2 is the guard for when it happens.
- Does not build org accounts, offline PWA, or MLT migration.
- Does not touch `friends-of-eldred`; OpenCanopy carries the Eldred hot spot (`src/data/hotspots.ts:24`) and nothing else from it. If "absorbed" meant porting its scrollytelling, that is unrecorded and a question for Lee, not a step here.

---

## Sources

- Audit: `opencanopy-audit-plan.md` (this directory), 2026-09-20.
- Rulings: `git -C /home/leesalo/Projects/opencanopy show origin/main:.claude/DECISIONS.md` (11 entries), read 2026-09-20.
- Relay format: `/home/leesalo/marvin/.claude/skills/relay/SKILL.md`, `relay-load/SKILL.md` (tiers, batch cap, `plan_section`, decisions check).
- Branch facts (2026-09-20, after `git fetch`): `origin/main` = `3db5823`; local `main` = `c5234ab`, 29 behind; `relay/phase-b-harvest` = `642ef71`, 12 ahead / 39 behind; `git merge-tree --write-tree origin/main relay/phase-b-harvest` -> 10 `CONFLICT` files, listed under R2.
- Line anchors verified on `origin/main` 2026-09-20: `src/app/map/page.tsx:322-328`; `src/components/map/DataLayer.tsx:118-122, :237-245, :444-445, :447-475, :1140-1152`; `src/lib/export/pdf-generator.ts:287`; `e2e/monitoring/live-health.spec.ts:187, :243`; `src/lib/data/wfs-client.ts:34-49`; `src/hooks/useMapState.ts:139, :237, :263-280`; `src/components/ui/MapErrorBoundary.tsx:25` (the audit's path `components/map/` was wrong); `netlify/edge-functions/wfs-proxy.ts:127, :377` (`planned-cutblocks`; the Phase D critic's `:134/:384` anchors have moved); `src/test/audit/proxy-consistency-audit.test.ts:339`; `netlify.toml:18, :40`; `src/lib/layers/registry.ts:893`; `d5c1749:src/lib/layers/registry.ts:26` (`plannedCutblocks`).
- Phase B-E plans and critics: `relay/phase-b-harvest:.claude/plans/` (22 files; the C plan's C1/C2 split at §3/§4; the D critic's V4 and key-unification findings).
- Test files that exist on `origin/main` and are named above: `src/test/pipeline/{wfs-layers-d10,wfs-client,satellite-zorder,raster-overview-zorder}.test.ts`, `src/test/audit/{color,contrast,opacity}-audit.test.ts`, `src/test/mocks/maplibre.ts`, `src/test/lib/{url-history,companies,hero-figure,privacy-claims}.test.ts`, `src/test/audit/schema-audit.test.ts`.
- Session-local plans present on this machine: `~/.claude/plans/{temporal-scribbling-metcalfe,misty-waddling-hinton}{,-critic}.md`.
- Production audit: `/home/leesalo/marvin/state/production-audits/opencanopy-2026-08-27.md`.
- npm scripts: `origin/main:package.json` (`audit:live` = `playwright test --config=playwright.live.config.ts`).
