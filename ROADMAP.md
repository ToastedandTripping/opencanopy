---
status: in-progress
current: "Nov 11: MEASURE (plan .claude/plans/2026-11-measure-fix.md; critic r1 FAIL folded, r2 CONCERN; Razor PASS after one fix pass): logged hectares since 1950 is now the dissolved union of dated FTEN cutblocks under a cap on max(recorded, drawn), measured on the real checkpoint under heavy-run with two independent methods agreeing to under 0.001 ha: 5,731,775 ha (was 5,888,477 as an attribute sum); the hero and the logging chapter say 5.7 million (was 5.8 and nearly 6). Releasing; Lee's phone check owed after. Released Nov 10-11: releases 4-7 (DataLayer public path, react-map-gl 8.1.3, small routed fixes, HEAVY). Lee 2026-11-10: standing yes to release each item green through the gates."
next: "Brief 2026-11-10: the PMTiles header timeout on slow devices (owed, its own item); then G1 per beta-resequence.md: OPS monitoring, M1a map plumbing (charter gate: goal 1; includes the URL-hash subscription and the deep-link camera), S0a copy and privacy (incl. the hero subline), S0b dated-only overlays (regenerates the story frames with the drawn-area cap, one heavy build), then the film and the calculator redesign K (charter gate: goal 3). Goal 2 is built during the beta (charter gate, DECISIONS 2026-10-23)."
testing: null
pinned: false
shipped:
  - date: 2026-11-11
    item: "HEAVY, the heavy-build lock, RELEASED (release 7: sha=1dabd1eaff9129be274444619c87af30c5eec7d8 deploy=6af41ba4be5840b641e6bae3 data_version=none guards=green; plan .claude/plans/2026-11-heavy-run.md, critic r1+r2 FAIL folded, r3 CONCERN; Razor PASS after one fix pass). scripts/heavy-run.mjs: one launcher holds a kernel flock lock and passes it to the build, so no two heavy builds run at once and none starts under 16 GiB free; supersedes the P0b hand-built design (ARCHITECTURE.md, Heavy builds). Tooling only; first real use: MEASURE's union run, 1.59 GiB peak, 32 min."
  - date: 2026-11-11
    item: "Small routed fixes RELEASED (release 6: sha=b5c0753478bf9209676c9d4a591b57aaaf9f934c deploy=6af3ee1dd9c6f6a7b06403d2 data_version=none guards=green; plan .claude/plans/2026-11-small-routed-fixes.md, critic r1+r2 FAIL folded, r3 CONCERN; Razor PASS after one fix pass). The calculator PDF links the real methodology and states its band's own direction (the true figure may be up to 20% lower, computed from BAND_LOW_FACTOR); audit:live no longer fails by construction on non-public layers and every z11 test finds the map before moving the camera (7 passed / 2 failed, both M1a's, against 5 failed before); the WFS client stops dropping a newer request's bookkeeping and superseded requests settle as AbortError. Evidence ~/marvin/state/relay/small-routed-fixes-live/guard-evidence-token6.md."
  - date: 2026-11-11
    item: "react-map-gl 8.1.0 -> 8.1.3 RELEASED (release 5: sha=11b72335d802b7277141b98125b3dda7bdbb3335 deploy=6af3dd6f661a76641ef15441 data_version=none guards=green; plan .claude/plans/2026-11-react-map-gl-813.md, three critic rounds folded, released past the cap on Lee's 2026-11-11 answer). /map no longer throws 'reading center' on every scroll, drag, shared-link flyTo and window resize (MapLibre 6 removed map.transform, which 8.1.0 read): live 19-29 / 1 / 2 errors before, 0 / 0 / 0 after; a shared link now lands on its camera; audit:live old-growth-250 now passes. Evidence ~/marvin/state/relay/wheel-drag-live/guard-evidence-token5.md."
  - date: 2026-11-10
    item: "DataLayer public-path relay RELEASED (release 4: sha=4de59d712630cad7a1ebd0630d3c6516fd4b2a8a deploy=6af3b9d0647a97628cb3fffe data_version=none guards=green; plan .claude/plans/2026-11-datalayer-public-path.md, critic r1+r2 folded, Razor PASS 0/0/5 NOTE, 1,202 tests). The timeline year is no longer dropped while tiles load (R1-02); a hidden layer neither reports nor keeps an error (R1-03); a toggle during the tile-source wait is no longer lost (R1-05); and an untouched /map now attaches its vector layers, terrain and year within 5 s instead of waiting for the first touch (MapLibre 6 fires load only inside a render; readiness is style-parsed, src/lib/map/style-ready.ts). Live checks shown failing on the old deploy first (attach, year), green on the new. Evidence ~/marvin/state/relay/datalayer-public-path-live/guard-evidence-token4.md."
  - date: 2026-11-02
    item: "P0b release tooling RELEASED (post-release record, ledger summary: sha=9ad701babdb9bc97c71d28dfe65600607e7a60d6 deploy=6ae8b912eaff6cd3d1f02aab data_version=none guards=green). Deploy identity tag oc-build, the release ledger with lease, tokens and halts, check-push and the pre-push hook; installed at ~/marvin/state/opencanopy-release-tool/, core.hooksPath set; CI on main green. Every release goes through ARCHITECTURE.md, Releases; /save is not a release path."
  - date: 2026-09-02
    item: "Code refresh 2026-09-01 + three charter fixes — MERGED to main (fast-forward fce8c84) + LIVE 2026-09-02. Refresh (branch refresh/2026-09-01, report .refresh/2026-09-01.md): four Fable readers by subsystem, 74 findings; 42 safe cleanups applied across 10 commits — dead code (-424 lines: barrels, a drifted legend-label map, the never-wired scripts/lib dashboard, orphan asset, unreachable style= URL plumbing), dedups the 08-05 pass left half-done, six hollow audit tests replaced with mutation-proven guards (schema-audit Check 12 tested a hand-copy of PRIORITY_KEYS that had drifted from MapPopup while green -> shared src/lib/map/popup-keys.ts + WFS set parsed from the proxy whitelist; zoom-handoff could not fail by construction -> registry-value invariants incl. the crash gate; legend swatch == paint colour per classSlug [ARCHITECTURE invariant 3, previously unchecked]; CUTBLOCK_AREA_CAP_HA single-sourced + pinned to the proxy CQL; property-schema keys subset of extractor output; CSS text guard for the 2026-06-21 reduced-motion crash; visibility.ts idle-deferral actually asserted; keyless tests env-pinned), scripts/e2e fixes (SOURCE_TO_MAPLIBRE pointed the screenshot e2e at MapLibre layers that stopped existing at the 08-26 rename; prod monitor split into playwright.live.config.ts so test:e2e can never hit prod; last inline R2 URL removed), docs reconciled (README claimed 17 public layers against CHARTER non-goal 2; CONTRIBUTING recipe produced an invisible layer; METHODOLOGY Limitation 2 described the dead queryRenderedFeatures path; ARCHITECTURE setFilter->global-state + the status-clears-on-unmount sentence that misled the 08-05 fix; dolly restore recipe already conflicted). Razor equivalence review PASS-WITH-WARNINGS (0 CRITICAL; all ten mutation claims reproduced). CI on main red since 08-22 on npm audit alone -> lockfile patched (nanoid, browserslist), green. CHARTER FIXES (Lee's rulings 2026-09-02, rule: underestimate rather than state a number we cannot source): (1) hero 8M -> 5.8M ha — recomputed from the FTEN checkpoint: dated 1950-2025 under the 2,000 ha cap = 5.888M; the 230 polygons at 2,000-92,000 ha (2.45M ha, no client, repeated areas) are tenure boundaries the /map layer excludes and the story never did (scrub summed 7.06M; overlays painted them red/maroon); cap applied in build-scrub-tables.py + build-year-overlays.py, scrub JSON (declares areaCap) + 76 PNGs regenerated; 'larger than Nova Scotia' replaces Ireland; guard hero-figure.test.ts. (2) Unknown-age stands contribute to no value (were zero carbon + full stumpage + full services; panel/PDF label 'excluded from all values'; METHODOLOGY row). (3) public/tracker.js vendored, layout loads /tracker.js, CSP script-src drops ssc-ops, /privacy names the receiving host + screen size; guard privacy-claims.test.ts. 866 tests / tsc / build / lint 0 / npm audit 0 high. ROUTED (see report): one relay for three DataLayer public-path bugs (isStyleLoaded drops timeline ticks; stale-status clear below the tile-backed early return; PmtilesLayers stale-closure visibility) + rendered PmtilesLayers tests, before Batch 2; PDF methodology pointer; two hollow audit:live tests; wfs-client race; ten bucket-B refactors. Orchestrator Fable 5.1; readers + Razor on Fable."
  - date: 2026-08-27
    item: "Global-state year uniform — /map improvement small win (relay global-state-year, plan .claude/plans/temporal-scribbling-metcalfe.md; critic Opus PASS [5 must-fixes folded]; Razor PASS [0 CRITICAL, 1 WARNING: style-loaded coupling, not a ship-blocker]; 836 tests / tsc / build / lint green). Replaced the per-layer setFilter/setPaintProperty mechanism for timeline year changes with MapLibre 5.21's global-state: setGlobalStateProperty('currentYear', year) + ['global-state', 'currentYear'] in filter/paint expressions. 1 call per year tick instead of 2N. DataLayer filter effect dependency array uses timelineActive (boolean) not yearFilter (number) — fires on on/off, not every tick. filter-expressions API simplified: buildYearFilter(field) and buildAgeGradedOpacity(field) drop the year parameter. Phase A render-gate (map.once('idle')) preserved — verified that setGlobalStateProperty triggers _update(true) → triggerRepaint(). DEFAULT_RANGE exported from useTimeline. Year-sync effect in page.tsx with isStyleLoaded() guard. AWAITING merge+deploy+live QA: play 1917→2025 with 3+ layers, confirm bar-map lockstep."
  - date: 2026-08-26
    item: "Batch 1 COPY+CHROME — visual-audit remediation (relay batch1-copy-chrome, plan .claude/plans/temporal-scribbling-metcalfe.md; critic Opus PASS [Fable rate-limited, 2 must-fixes folded]; Razor PASS after 1 re-review [1 WARNING fixed: stale e2e layer name]; Jen Opus PASS [Fable rate-limited, 6 CONCERNs for live QA]; 836 tests / tsc / build / lint green). 13 items from the 2026-08-22 audit: (F2/T2) 'Old Growth' labels → 'Stands 250+ yr (VRI)' + reconciliation note linking VRI age class to the story's 0.3% Price/Holt/Daust figure; (CP2) tap-deferrals id → old-growth-250, conservation-priority → tap-priority, with URL/localStorage aliases for backward compatibility; (K2) parks swatch pre-multiplied #2f6b52; (S2) satellite → grey swatch + '(base map)' label; (P7) preset chip active state emerald-500/20 + 6px dot vs transparent inactive; (CH1) legend expanded by default (Set-based collapsedLayers), max-width 220/280px; (CH2) attribution/scale bar zinc-300 on bg-black/60; (CH3) badge title + aria-label; (PR2) Threats → Logging; (PR4) Protection → Old Growth + Parks; (PR5) Overview drops satellite. Lee's Q1-Q6 answers folded. Plus .claude/CHARTER.md adopted. AWAITING merge+deploy+live QA."
  - date: 2026-08-21
    item: "Ending dolly DOCKED — the landing page now ends on the province-wide '35,000 hectares' red reveal and proceeds straight to the CTA, whose 'Explore the Map' link already deep-links to the old-growth pocket (STORY_END_CAMERA) on /map. Removed: the `remains` chapter, the `cameraTo` intra-chapter camera scrub, `easeInOut`, the z6-z8 pocket tile prefetch on every landing load, `camera-dolly.test.ts`; `NarrativePanel.headingWeight` prop dropped. Both dolly versions preserved as annotated tags (dock/dolly-live-scrub = main before this change; dock/dolly-phase2-video = the pre-rendered video branch). Plan .claude/plans/misty-waddling-hinton.md; critic (Fable) CONCERN -> 5 must-fixes folded; prefetch guard revert-proven red-first; 816 tests / tsc / lint / build / reduced-motion e2e green. Live QA owed (Lee): reveal lands with its panel, no dead stretch before the CTA, CTA opens /map at the pocket, heading still semibold."
  - date: 2026-07-18
    item: "Phase A 'honest timeline' — render-gated playhead + comprehension layer (relay honest-timeline, plan .claude/plans/frolicking-imagining-puppy.md; plan-critic Fable CONDITIONAL CLEAR [4 must-fixes folded]; Razor Fable mutation-tested -> PASS after 1 re-review [3 WARNINGs fixed: every-resume ~1.8s watchdog stall via first-iteration gate skip, dead watchdog telemetry via a same-delay tied timeout -> +250ms margin, an unlocked pause-mid-dwell path -> a mutation-locking test]; Jen Fable PASS-WITH-CONCERNS [6 folded]; 803 tests / tsc / build / lint(0) / audit(0-high)). MERGED + DEPLOYED to opencanopy.ca. FIX: the /map timeline scrubber lied — on play the bar reached the end year while fire patches were still painting (measured 86–91% dropped frames on a sweep). Root cause: useTimeline.ts advanced currentYear on a fixed setInterval(400ms) on wall-clock with ZERO map awareness. NEW: replaced the setInterval with a self-rescheduling, idle-gated async loop — apply year (setFilter) -> await Promise.race([map.once('idle'), watchdog 1800ms]) -> advance via functional-updater + Math.min clamp; 'speed' becomes minimum dwell (cadence = max(dwell, render)). Load-bearing correction the plan-critic verified in code: the year filter is a GPU-side setFilter on already-loaded PMTiles (filter-expressions.ts), so the truthful paint-done signal is map.once('idle'), NOT sourcedata/tiles-loaded (the original research premise was wrong). Coupled to the map via an INJECTED waitForRender (hook stays maplibre-free + unit-testable); refs synced in useLayoutEffect (react-hooks/refs), read only after await boundaries; runIdRef + cancelledRef re-entrancy guards; the W1/W2 derived-range useMemo + clamp effect left untouched; DataLayer sourcedata path untouched. COMPREHENSION LAYER (research: animation alone misleads via change-blindness): per-year scented histogram in the scrubber track (bar height = that year's share of century-total burned area, from src/data/scrub/fire-scrub.json cumulativeNorm — build-scrub-tables.py extended to emit absolute total, diff-disciplined so ONLY the total key changed / cumulativeNorm byte-identical / /story pacing untouched), a 'X ha burned through {year}' cumulative-hectares readout (fire-history sole-active ONLY; the cutblocks >=2000ha filter-vs-table mismatch deferred to Phase B), reduced-motion jump-to-end, boundary-only SR announcements + enriched aria-valuetext, a debounced (>500ms) 'rendering…' chip. New src/lib/timeline/scented-track.ts (pure) + useTimeline.test.ts (15 tests) + scented-track.test.ts (14). The render-gate is the interface CONTRACT the deferred GFW year-raster decode-shader satisfies trivially later — don't build twice. Orchestrator Opus 4.8[1m]; Ted=Sonnet; plan-critic + Razor + Jen on Fable. Behavioral (2.8) SKIPPED — keyless sandbox can't render the map. AWAITING Lee live visual QA: play 1917->2025 -> the bar finishes in lockstep with the last fire patch; scrub gated; RM play jumps-to-end; histogram + readout legible on mobile."

---

# OpenCanopy — Roadmap

BC forest map: faithful government data rendered as PMTiles, served as a
public conservation reference. Architecture decision in March: base tileset
is government-truthful only; synthesis layers (fire-age reconciliation,
disturbance models) live as separate layers and are not part of the
open-source base.

## Known issues (deferred, prioritized)

- **/map visual audit (2026-08-22) — 35 findings, tracked by ID in `research/map-visual-audit-2026-08-22.md`.**
  Blockers: T1 (old-growth gold scribble at z10+), PR1 (Threats pixel-identical to forest-age
  alone — red on red), PR3 (Fire + Logging collapses four warm hues and draws age over fire).
  Majors that are one line: P1 (deep-link camera silently dropped after a 2 s poll —
  `useMapState.ts:172` — hits the landing CTA), P8 (`preset=` alone restores nothing). Structural:
  P3 (single PMTiles archive = 26 MB per z7 view for ANY layer), P2 (vector layers attach 14–40 s
  behind unconditional forest-age raster prefetch), P4 (no vector layer renders at z5). The
  remediation program is in `next:` above; batches ship as separate relays.
- **Ending dolly is not smooth — RESOLVED BY DOCKING 2026-08-21 (see Parking Lot); kept for archaeology.** Original note: The scroll-coupled
  zoom into the Vancouver Island pocket (z5→z8 on the binary raster tiles, in the
  `remains` chapter) **drops tiles and lags** on the live site — confirmed by Lee
  2026-06-28. The 2026-06-28 smoothing pass (800vh spread, cubic ease, DOLLY_END
  0.8, path-prefetch of `cameraTo` viewports, 100ms transition) **reduced but did
  not fix** it. Likely remaining causes to investigate: (a) per-frame `map.jumpTo`
  on a 3-zoom-level change still forces MapLibre to churn tile levels faster than
  the binary raster (R2) can serve; (b) prefetch may not cover every intermediate
  zoom/tile along the dolly path; (c) 256px binary tiles over-zoomed near z8 thrash.
  Fix ideas for next time: prefetch ALL z5–9 tiles in the pocket corridor before
  the dolly starts (not just endpoints); consider easing the zoom depth back
  (z8→~z7) to cut tile load; or reconsider the mechanism (e.g. a pre-rendered
  zoom or a coarser-but-complete tile set). Code: `useScrollytelling.updateCamera`
  (cameraTo scrub), `prefetch.ts` `prefetchBinaryTiles`, `chapters.ts` `remains`.
- **Empty-tile 404 console noise.** Both `raster/v3/forest-age` (pre-existing) and
  the new `raster/v3/binary` raster sources request empty/ocean tiles the build
  skips → 404s (MapLibre renders nothing = correct, but it's console noise). A
  tile bounds/manifest so MapLibre never requests skipped tiles would clean it.

## Shipped Archive

Older `shipped` entries, moved out of the frontmatter at ten (relay-design rule): each keeps its date and its first sentence verbatim. Full text is in git history (`git log -p ROADMAP.md`).

- **2026-07-17**: P2 accessibility cluster — 8 WCAG findings (relay a11y-p2-cluster, plan .claude/plans/frolicking-imagining-puppy.md; critic CONDITIONAL CLEAR [4 must-fixes folded: getClientRects-not-offsetParent visibility for fixed panels, per-key Escape guard so B1 doesn't disable panel dismissal, a real 2.1.4 shortcut mechanism, empirical viewport build-check over a tautological one]; Razor 4 WARN → fixed → PASS-flagged after 1 re-review [re-review self-caught +1 new WARN: seq-guard left the search spinner stuck — fixed w/ mutation-proven test]; Jen PASS-WITH-CONCERNS, all rulings folded; 773 tests / tsc / build / lint(0) / audit(0-high) green).
- **2026-07-16**: CO₂ calculator redesign — render-independent WFS + turf-clip data path (relay co2-calculator-redesign, plan .claude/plans/jazzy-gathering-codd.md; critic-gated: original review BLOCKED [Completeness FAIL + X3/X4], all 8 must-fixes folded, delta re-review CLEAR; Razor PASS after 1 re-review [2 WARNINGs fixed: unbounded body-read timeout + missing race/guard tests], Jen CONCERNS [10, ALL folded]; 690 tests / tsc / build / lint(0) green).
- **2026-07-11**: Audit P0+P1 remediation (relay audit-p0-p1-remediation, plan .claude/plans/jazzy-gathering-codd.md — critic gate CLEAR + 5 must-fixes folded; Razor PASS 16/16 coverage, 0 CRITICAL/0 WARNING/4 NOTE; Jen PASS a11y).
- **2026-07-09**: /map polish — 4 verified audit fixes (relay map-polish-fixes, Razor PASS 4/4, 0 CRITICAL/0 WARNING/3 NOTE; 614 tests/tsc/build/lint green).
- **2026-07-05**: Scroll-story Phase 1 — dead-machinery removal + perf floor + 404-quieting (relay story-phase1-cleanup, Razor PASS 12/12 coverage, 0 CRITICAL; plan .claude/plans/sharded-finding-beacon.md Phase 1, critic-gated).
- **2026-06-30**: Hero Beat-2 copy rewrite (Jen 'Reckoning' direction) + type-system swap to Literata (display) + Public Sans (body/UI), retiring Fraunces + Inter (Fraunces was only shipped 06-27).
- **2026-06-28**: Phase 1b + Exploration Bridge DEPLOYED to opencanopy.ca (relay phase1b-exploration-bridge, plan .claude/plans/curried-frolicking-reddy.md, critic-gated, Razor PASS).
- **2026-06-27**: Public readiness pass: narrowed public surface (18→7 layers + satellite, presets 11→4), React error boundary for WebGL crashes, bug report button (mailto with map state), production audit #2 (63/100, up from 52, 2 a11y FAILs fixed via relay — error boundary role=alert + SearchBar ARIA combobox + stale focusedIndex fix).
- **2026-06-22**: Hero texture: dimmed fog backdrop on Beat 2 ('8 million hectares') — the only flat, texture-less panel between two full-bleed photo beats.
- **2026-06-21**: Reduced-motion scrollama crash FIXED + DEPLOYED to opencanopy.ca (origin/main, merges cd942bf + veil; live-verified).
- **2026-06-21**: Story-render Phase 1 'client wins' (Batch A) — relay story-render-batch-a, branch relay/story-render-batch-a (forked off session branch 3419f6a; NOT yet merged to main).
- **2026-06-20**: Deep research sweep + consolidated story-render plan (critic-gated; ~/marvin/research/scroll-driven-temporal-map-animation-20260620/).
- **2026-06-20**: Story base fix DEPLOYED: scrollytelling no longer uses the forest-age overview raster as its base.
- **2026-06-20**: v3 raster paint-order fix DEPLOYED: province-scale forest-age now reads RED.
- **2026-06-19**: a11y grade-C FAILs closed + Wave 3 styling pass (branch marvin/session-529466, DEPLOYED 06-20).
- **2026-06-18**: Low-zoom legibility + old-growth swatch + LayerPanel a11y DEPLOYED & live-verified on opencanopy.ca (plan .claude/plans/misty-cuddling-yeti.md, critic-gated; main 8366792).
- **2026-06-18**: Ko-fi support link added to the landing footer (ko-fi.com/toasted40013) as an emerald give-back CTA; external link + rel=noopener, AA contrast on the dark footer, aria-label.
- **2026-06-18**: Landing-story refinement DEPLOYED (plan .claude/plans/swirling-chasing-goose.md, critic-gated; main 1b61b01).
- **2026-06-18**: /production audit = grade C (52/100, report at marvin state/production-audits/opencanopy-2026-06-16.md).
- **2026-06-12**: Layer-fidelity Wave 2 DEPLOYED: per-class isolation rasters regenerated for all 5 themes z4-z10 in registry palette, uploaded to R2 raster/v2/ (12,798 tiles, local↔R2 parity verified), client flipped.
- **2026-06-12**: Layer-fidelity Wave 2 code (branch relay/layer-fidelity-w2, 6 commits, 511 tests): per-class isolation raster themes in registry palette (old-growth #0d5c2a dark green — gold theme deleted), forest-age-palette.json as single color authority for python script + TS registry (+ CalculatorPanel/pdf-generator stragglers), client flipped to raster/v2/ R2 dirs (old dirs kept one release), RASTER_THEME_COLORS override removed, color-audit rewritten with cross-language --dump-themes guard (Razor: PASS-WITH-WARNINGS → all closed → PASS).
- **2026-06-12**: Layer-fidelity Wave 1 DEPLOYED + live-verified: proxy bbox-in-CQL fix (fish-streams/tap-deferrals/cutblocks all return features live; D3 e2e gates green), satellite z-order verified on production (index 26, all 38 overlays above, labels on top), MapTiler backdrop-dark confirmed zero layer-* collisions.
- **2026-06-11**: Layer-fidelity Wave 1 (branch relay/layer-fidelity-w1, 7 commits, 487 tests): proxy bbox-in-CQL fix (restores fish-streams, tap-deferrals + cutblocks supplemental — GeoServer rejects bbox+cql_filter together), imperative satellite z-order (anchor below first overlay/symbol, toggle-order independent), WfsLayers hooks-order fix + tile-backed fetch skip (StrictMode dev crash gone).
- **2026-06-09**: Production-readiness & shareability push (branch relay/production-readiness, 5 commits, +~1.5k LOC, 462 tests): per-layer error/empty/zoom status states (the centerpiece — replaces silent blank failures), OG/Twitter share card + metadataBase (blank previews fixed), privacy page + footer, WFS-proxy per-IP rate limiting, GitHub Actions CI, next 16.2.7.
- **2026-04-13**: v9 PMTiles deployed (refactored bulk-FGDB pipeline, single-pass tippecanoe, Razor C1+W1-W4+N1 fixes)
- **2026-04-10**: Pipeline refactor — bulk download + single-pass tippecanoe, replacing legacy monolith
- **2026-04-08**: Forest-age vector tiles at z10, MapLibre v5 compatibility fix
- **2026-04-01**: Tier 1 overview + z12 PMTiles rebuild (v8)
- **2026-03-31**: Full data fidelity pipeline — 7-audit suite, water subtraction via GDAL/GEOS (63 min vs 72h projected)

## Parking Lot — every deferral, one index

**This is the single entry point for named-but-unscheduled work.** Added 2026-08-21, when the
held/deferred list was moved out of `.claude/handoff.md` (it was living under "Standing Gates",
where a routine hand-off rewrite could have dropped it). Rulings and constraints went to
`.claude/DECISIONS.md`; this is the work. A deferral is recorded here or it does not exist.

### Held — decided, not scheduled

- **Docked: the ending dolly (2026-08-21).** Two versions exist, neither on the page, both one command from back:
  - `dock/dolly-live-scrub` — annotated tag on main as it was before the cut: the `remains` chapter + `cameraTo` scroll-scrub zoom (lags / drops tiles on live, confirmed 2026-06-28). Restore: `git revert 72cbddb` no longer applies cleanly (c67dd99 reformatted the same NarrativePanel.tsx lines six days later; found by `git merge-tree` on 2026-09-01). Restore from the tag instead: `git checkout dock/dolly-live-scrub -- src/data/chapters.ts src/hooks/useScrollytelling.ts src/lib/story/prefetch.ts src/lib/math/interpolation.ts src/components/story/NarrativePanel.tsx`, then remove the post-dock guards that would go red (`prefetch-binary.test.ts` "EXACTLY {z5,z6}", `scrollytelling-raf.test.ts` "last chapter holds flat") and re-add the `remains` chapter's tests from the tag.
  - `dock/dolly-phase2-video` — annotated tag on the pre-rendered play-on-scroll video branch (`dolly/phase2-video`, merge of `relay/story-phase2-dolly-video`): code-complete, Razor-passed, never merged. Needs the ffmpeg render -> `scripts/encode-dolly.sh` -> R2 upload chain from Lee's terminal before it can go live. Restore: `git merge dock/dolly-phase2-video`, then render.
  - Why docked: three relays, never shipped smooth; the landing page was absorbing effort that belongs to /map. Ruling in `.claude/DECISIONS.md`.
- **CSP is report-only, not enforcing.** The enforce-flip is gated behind a cold-cache/incognito/mobile console watch that hasn't happened yet.
- **GFW decode-shader endgame** (year-encoded raster + custom WebGL shader for the scroll-story) -- feasibility study done, encoding spec frozen, held behind the pre-committed scroll-story Phase-3 gate (ruling in `.claude/DECISIONS.md`).
- **The /map improvement program** is fully designed but not started: a small-win MapLibre `global-state` batch, then Phases B (harvest consolidation + accountability), C (color/threat re-spine), D (proposed-logging FOM layer, probed and GO), E (layer architecture). Research lives at `~/marvin/research/opencanopy-map-layering-comms-20260717/` (PLAN.md + 4 lens files + probe outputs). Each phase needs its own plan-mode + Fable critic + relay, on Lee's go. Sequencing is an open question in `.claude/handoff.md`.
- **FOM watch: the comment-period alert persona (2026-09-11).** Lee, 2026-09-11: OpenCanopy is allowed to advocate ("I don't mind that it becomes a tool of change"). Watch every open Forest Operations Map comment period in the province through the FOM public API (no scraping needed), publish plain-language alerts with the deadline, the hectares and a comment scaffold, and hand Lee a reviewed post for Facebook groups and Reddit, semi-automated with one review step. Phase D of the /map program (the proposed-logging layer, probed GO) grows a time axis here. Detail: `### Deferred from 2026-10 — path to beta (Lee, 2026-10-23; `.claude/plans/audit-remediation-2026-10/beta-resequence.md`)

Built during the beta, in the order the plan gives:
- **B′** the accountability view (Phase B rebase plus tenure attribution, ruling H).
- **W** the watershed report card and **P** the conservation priority analysis: charter goal (2), no plan yet, each needs a grill. The beta cannot exit until these and B′ ship.
- **C′** the rest of the Phase C re-spine, less whatever the small colour relay takes. Replaces August's 500 ha cap with the rectangle check (Lee, 2026-11-01: check first).
- **D′** FOM layer; **E′** E2-E5; the rest of **T** (E&N mask, big-tree subset, empty-tile manifest).
- **M3b** less the coordinate rounding and the view-state parser.

Held or awaiting a check:
- **G** tile domain: stays on r2.dev (held 2026-10-02).
- Undated blocks option 2: revisit after the status-code check.
- iOS Safari bottom-bar check (no owner for a fix if it reproduces).
- The eslint dev chain's moderates, held by the eslint-config-next pin; `tsx` pinned in PIPE.
- Heavy-build lock: split from P0b as its own small relay, **HEAVY**, in G2 before S0b (Lee, 2026-11-01). Binding rules: `.claude/plans/2026-10-p0b-release-tooling.md`, "Relay HEAVY". Owed in `.claude/handoff.md`. **Built 2026-11-11 (relay heavy-run, releasing):** `scripts/heavy-run.mjs`, a kernel `flock` lock that supersedes the P0b mechanism (critic rounds measured the hand-built lock failing); ARCHITECTURE.md, Heavy builds.

Deferred from P0b release tooling (2026-11-01; plan `.claude/plans/2026-10-p0b-release-tooling.md`, "Out of scope"):
- Recording build peak memory (C7): belongs to the build relays that run heavy jobs, not to the release tool.
- The live guards themselves: M1a builds them; P0b only records their verdicts.
- C1 asset versioning: S2-pages and the data relays own it.
- Retargeting the two `audit:live` tests at `live-health.spec.ts:187` and `:243`: M1a batch 0 owns it; until then `audit:live` cannot read green. **Done 2026-11-11 by brief item 4 (relay small-routed-fixes):** `:187` retargeted to public cutblocks, `:243` replaced by a direct fish-streams proxy request, and the forest-age and old-growth-250 z11 tests made to find the map before moving the camera; M1a keeps `:118` (stale URL parser) and `:130` (raster z5).
- A server-side gate by locking Netlify auto-publish: needs Lee to amend "Deploy is git-triggered"; the escalation if the cooperative hook proves insufficient.
- A `netlify.toml` `ignore` for docs-only commits: only if the docs route (a docs commit is a release) proves too heavy; 8 of the last 19 production deploys were docs.
- Teaching `/save` the OpenCanopy release path: a marvin change; until then `/save` stops at the pre-push hook.
- Five leftover decisions from the 2026-09-20 plan (D4-D8, including branch protection): batched for Lee, see TRACEABILITY.

Deferred from the DataLayer public-path relay (2026-11-10): seven items, detail in `### Deferred from datalayer-public-path (2026-11-10)` below.
Deferred from the react-map-gl 8.1.3 relay (2026-11-10): five items, detail in `### Deferred from react-map-gl-813 (2026-11-10)` below.
Deferred from the small routed fixes relay (2026-11-11): six items, detail in `### Deferred from small-routed-fixes (2026-11-11)` below.
Deferred from MEASURE (2026-11-11): five items, detail in `### Deferred from measure-fix (2026-11-11)` below.

### Deferred from 2026-09-11 — FOM watch` below. Grill before planning; the charter needs Lee's amendment first (advocacy is not in it).

### Deferred — known, unscheduled

- **z10+ rectangle tile artifact** (Phase 5 of the original scroll-story plan) -- confirmed live and worse than "contained." Still unaddressed. Root cause: tippecanoe `--drop-densest` + 5MB cap; fix is a tile rebuild with tuned flags.
- **P3 ops backlog:** cache headers for `/raster` and `/images`, hero `srcset` (584KB LCP), prefetch gating (~8MB), `DEPLOY.md` + rollback runbook, scheduled `audit:live`, re-gating the `__opencanopy_map` debug handle on `OC_DEBUG`, minor dependency bumps, a shared-store WFS rate limiter.
- **a11y deferred notes** (non-blocking): Dvorak physical-key shortcut nuance, Escape-should-own-the-modal-first ordering, an ellipsis (U+2026 vs `...`) sweep.
- **CO2 calculator follow-ups:** k/C_max yield-curve data sourcing, an Option C watershed fast-path, a Web Worker for the turf-clip wait if live QA finds it slow, the PDF financial-compliance/voluntary caveat (currently panel-only).
- **Preset opacity overrides** (Wave 3 item 3.8, `styleOverrides`/`opacityScale`) -- deferred 2026-06-19; its own relay batch after the styling pass, touches `DataLayer.tsx` at 4 wiring points.

### Deferred from 2026-09-11 — FOM watch (the comment-period alert persona)

**Origin.** Lee found Interfor's Wilson Lake map (FOM 3406, Selkirk district, 142.7 ha in 12
cutblocks plus 7.3 km of road) through a Facebook post a fortnight into a 30-day comment window,
and asked whether OpenCanopy could watch the portal and tell people. His words: "a lot of times
people don't realize these things are happening or that they have a period they can make comments."
Ruling the same day: **OpenCanopy is allowed to advocate.** The charter says "conservation
reference"; this is the first thing the project would do that speaks rather than shows, so the
charter needs his amendment before code (proposed, not yet written).

**Probe (2026-09-11, live, from a marvin session).** The portal at `fom.nrs.gov.bc.ca/public` is an
Angular app over a public JSON API; the whole system is open source, Apache 2.0, at
`github.com/bcgov/nr-fom`. No scraping and no key:

- `GET /api/project/publicSummary?includeCommentOpen=true&includePostCommentOpen=false` — every
  open comment period in the province: 55 records, 14 KB, each with id, name, a point, FSP id,
  licensee and state.
- `GET /api/project/{id}` — `commentingOpenDate`, `commentingClosedDate`, `validityEndDate` (the
  three-year permit reliance), district, licensee, operation years, `publicNoticeId`.
- `GET /api/spatial-feature?projectId={id}` — the polygons: `cut_block` features with
  `plannedAreaHa`, `road_section` with `plannedLengthKm`, `plannedDevelopmentDate`.
- Locked (403): `/api/public-notice/*` (the notice text) and `/api/project/metrics/{id}` (comment
  counts). The persona cannot say "only four people have commented", which is the most motivating
  line there is; the newspaper legal notice remains the only source of the licensee's contact.
- Caught in passing: the newspaper notice said comments close Sep 25, the API says Sep 26. A
  watcher sees that; a person does not.

**Shape (the 110% version; scope down from here).**
1. *Watcher.* Poll the summary daily, diff against the last snapshot, emit events: newly opened,
   closing in 7 days, closing in 48 hours, moved to finalized. Enrich with detail, polygons,
   hectares, road km, district and nearest named place. Cost is negligible.
2. *A feed people can subscribe to.* A page on opencanopy.ca per district and province-wide, RSS,
   an email digest. The reliable channel; nobody can ban it.
3. *The persona.* An OpenCanopy-owned Facebook page posts through the Pages API. Groups and Reddit
   are the real audience and both treat automation as spam (Reddit allows flagged bots only where a
   subreddit permits). So: the persona drafts, a human (Lee) reviews and crossposts, one tap a day.
   Lee, 2026-09-11: human in the loop "for sure", but "something that I don't have to overly
   manipulate ... semi-automated with just a review would be ideal."
4. *The how-to-comment kit.* Every alert links the portal record and carries a short guide plus a
   comment scaffold adapted to the block (the Wilson Lake one exists in the 2026-09-11 marvin
   session log). The scaffold is what turns a reader into a commenter.
5. *The map.* Phase D's FOM polygons coloured by days remaining, so /map itself becomes the alert.

**Constraints already ruled that bind here.** Neutral proponent language (Phase D honest-framing
spec: some proponents are First Nations forestry partnerships); a public number must be
reproducible from the shipped data (DECISIONS, 2026-09-02) — hectares come from the API's own
`plannedAreaHa`, never from a post.

**Open before planning.** (a) The charter amendment wording. (b) Whether the feed lives in this
repo (Next.js on Netlify, scheduled function) or beside it. (c) Which groups and subreddits, and
under whose account. (d) Whether the weak version — a bot that spams groups and is banned in a week
— is fenced by design, not by hoping.

### Deferred from datalayer-public-path (2026-11-10)

Plan `.claude/plans/2026-11-datalayer-public-path.md` (Out of scope, Amendment A); Razor review `~/marvin/state/relay/datalayer-public-path-razor-review-b1.md` (NOTEs, parked under the fix-loop rule, none reaches a public path today).
- **The landing story has the same readiness defect** (lane S): `StoryMap.tsx:72` (camera) and `:152` (binary reveal) drop writes while tiles load (`isStyleLoaded()`), its `onLoad` (`:219`) waits on MapLibre `load`, and `lib/story/visibility.ts:48` guards the same way. On /map, `load` was measured not to fire for 70 s on an untouched page; the story is scroll-driven, so it renders more often, but the rule is the same: readiness is style-parsed (`src/lib/map/style-ready.ts`).
- **A failed PMTiles header is never retried**: the layer reports error while visible and the source stays dead until reload.
- **WfsLayers' stale closure** (the R1-05 race on the WFS path; reads `visible` from its add effect's closure). No WFS-only layer is mounted on /map.
- **A WFS-only layer's in-flight fetch writes its status after the layer is hidden** (Razor N2). Not public.
- **No red test for WfsLayers' readiness, the terrain block, or the five cleanup cancels** (Razor N1). Terrain is the one production-visible behaviour here without a test.
- **The year is written twice at mount when the style is already parsed** (Razor N3). MapLibre ignores the repeat; one extra log line.
- **`updateRasterBeforeId` serializes the whole style on every `styledata`** in each DataLayer (Razor N5; unmeasured). The old code did the same once the map was loaded; it now also does it while tiles load.

### Deferred from react-map-gl-813 (2026-11-10)

Plan `.claude/plans/2026-11-react-map-gl-813.md`; Razor review `~/marvin/state/relay/react-map-gl-813-razor-review-b1.md` (NOTEs, parked under the fix-loop rule).
- **The URL hash does not follow the camera on a fresh /map visit** (M1a, "subscribe the URL sync once the map exists"): `useMapState` reads the map handle once, before the async map exists, and never subscribes to `moveend`. Not fixed by 8.1.3; measured empty before and after.
- **A shared deep link can snap the camera late** (M1a): the deep-link `flyTo` runs only once /map re-renders after the map exists (CanopyMap's dep-less `useImperativeHandle`); on 8.1.3 it completes, so a visitor who pans first and then opens a panel is moved to the link's camera.
- **The guard test sees only `.transform` property reads in one dist file** (Razor N1): a destructured or bracket read would pass it.
- **Console errors from the now-live `moveend` WFS reload are not counted by the live checks** (Razor N3; WFS-only layers, none public).
- **CI's guard reports after deploy and cannot block one** (Razor N4; pre-existing: Netlify deploys on push).

### Deferred from small-routed-fixes (2026-11-11)

Plan `.claude/plans/2026-11-small-routed-fixes.md`; Razor review `~/marvin/state/relay/small-routed-fixes-razor-review-b1.md`.
- **The calculator panel contradicts its own band** (to K, the calculator redesign, under "CO2 calculator follow-ups"): `CalculatorPanel.tsx:609` says "Approximate — may overestimate by up to ~20%." under its own "may be as low as" floor of 0.8 x, which makes the headline up to 25% high, not 20%; the PDF footer was corrected to the band's own direction on 2026-11-11. `:632` says the estimates "may overestimate by 10–20% compared to more conservative figures", a comparison against lower published carbon pools that needs a source. The panel also carries six em dashes.
- **The 20% band itself has no cited source** (to K): `BAND_LOW_FACTOR = 0.8` (`src/lib/carbon/calculator.ts`) rests on a code comment. K sources it or replaces it; the footer and the band move together because the footer computes its percentage from the factor.
- **A WFS-only layer superseded during its debounce shows `ok` early** (accepted, plan item 3): the old caller now settles at once instead of hanging. No public layer uses WFS.
- **Cache-hit lead** (critic r1): a cached response can be returned while a fresher request for the same layer is debounced. Not reproduced; WFS-only.
- **The screenshot spec still skips when the map is not found** (`e2e/screenshots/screenshot-regression.spec.ts`, "layer isolation", around `:200`): same class as the audit:live skips removed here.
- **Razor notes** N2 (two equivalent over-guard mutants survive), N3 (the DataLayer AbortError test pins "not error", not the resulting status), N4 (the fish-streams check hard-codes the production origin).

### Deferred from measure-fix (2026-11-11)

Plan `.claude/plans/2026-11-measure-fix.md`; Razor review `~/marvin/state/relay/measure-fix-razor-review-b1.md`; evidence `research/measure-2026-11/`.
- **Story frames still paint the nine drawn-only boundaries** (and overstate generally, mostly from painting every touched cell): S0b regenerates them dated-only with the shared cap rule in one heavy build.
- **/map and the WFS proxy still use the recorded-area cap**: T-pre owns the drawn-area cap for tiles and the proxy (beta-resequence.md, T-pre, amended 2026-11-11).
- **The chapter's "each red mark is a cutblock" and "every tree was removed"** are unsupported by the shipped picture and data: S0b/S1-prime copy. **The hero subline** ("Logged since 1950. An area larger than Nova Scotia.", two fragments) is S0a's; **the Nova Scotia comparison's source** is NUM's.
- **Razor notes**: fixture rows already in rank order (N1; check 1 covers it on real data); NaN-permissive comparisons (unreachable); the acceptance profile keys on timestamp and size but not the sha it computes; the output fence covers two named files; the tile method is about 6x the rank method; the fire scrub path keeps a silent catch-all; the post-projection re-repair has no mutant.
- **The scrub union measured 1.59 GiB peak**: under 8 GB, so this job need not take the heavy lock (ARCHITECTURE, Heavy builds, "unmeasured is heavy").

## Reference

- Architecture: `ARCHITECTURE.md` (in-repo, authored 2026-06-10)
- Audit pipeline: `scripts/audit-*.ts` (7-audit suite — source-to-tile tracing,
  geometry precision, spatial validation, adversarial testing, cross-source
  consistency, deep property validation, unified runner)
- Repo: github.com/ToastedandTripping/opencanopy
- Outstanding audit items (non-blocking):
  - Okanagan Lake V3 test point needs adjustment
  - tenure-cutblocks DISTURBANCE_START_DATE property issue
  - Cross-source R1 reclassify as informational (BC VRI data limitation)
- From the 2026-06-09 production push (for the follow-up /code-refresh):
  - **WfsLayers** has `if (layer.tileSource) return null` BEFORE its hooks (rules-of-hooks
    smell). Causes a dev-only StrictMode cleanup crash (`map.getMap()` undefined in the
    teardown). Pre-existing on main; production unaffected (effects run once). Fix the
    hooks order + guard the cleanup.
  - `conservation-priority` (258K fill from z0) left ungated — no degradation measured at
    z5; revisit with a real perf trace before gating `tileSource.minZoom`.
  - Empty/zoom/WFS-only-layer rendering verified by unit tests + wiring, NOT live (the
    `/api/wfs` edge fn doesn't run under `next dev`). Smoke-check on the live deploy.
  - Vestigial WFS fetch for tile-backed layers (data isn't rendered, fetch still fires) —
    candidate to skip entirely as an optimization.
