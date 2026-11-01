# OpenCanopy UI, visual and performance audit: synthesis

*2026-10-02. Production opencanopy.ca at origin/main 3db5823. Four audit lanes (map visuals, landing and pages, performance, usability and refactor), each re-checked by an independent skeptic who re-ran the claims with their own scripts. Read against `.claude/CHARTER.md`, `.claude/DECISIONS.md` and `ROADMAP.md` in the repo.*

**How to read this.** Severities are the skeptic's corrected ones. Where two lanes found the same thing it appears once, with both lenses. Anything a skeptic refuted or could not reproduce is in Appendix A, not in the body. Items no skeptic re-checked keep the auditor's severity and are listed in Appendix B; sources are in Appendix C. Evidence paths are relative to `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/` (lane folders `map-visual/`, `pages-visual/`, `performance/`, `usability-refactor/`, skeptic folders `verify/*-evidence/`). Code paths (`src/`, `scripts/`) are repo-relative; where a bare file name appears, `CanopyMap.tsx`, `DataLayer.tsx`, `MapLegend.tsx`, `MapPopup.tsx` live in `src/components/map/`, the story components in `src/components/story/`, and story logic in `src/lib/story/`. Finding ids (F-, SPD-, U-) point into the lane reports; section 5 uses none.

## 1. Verdict

1. The landing story opens well, then paints more than its data can prove: its red covers about five times the logged hectares it captions, and four of its sentences say things the government's own record contradicts.
2. On /map the paint is unchanged since August; what broke is the plumbing under it: on a fresh visit search does nothing, shared links and the story's own "Explore the Map" button miss their view in half to nearly all fresh loads, and on desktop the opening view shows no data at all until the reader drags the map.
3. On a throttled phone (Slow 4G) the first data tile arrives at 37-42 s and the landing pulls about 17 MB before the reader scrolls; the time goes to tiles for layers that are switched off, 3D terrain on a flat map and an eager prefetch, not to React.
4. No public layer ever says "loading", "nothing here" or "failed", so a slow link, an early tap that left a layer blank, and a genuinely empty area all look identical, which is the opposite of charter done item 1.
5. The fixes are cheap: six of the top ten are small code or copy changes, none of the ten needs new data, and the expensive work (tile delivery, per-layer archives, palette) is already on the ROADMAP or waits on a decision from you.

## 2. Top 10

Ranked by user impact per unit of effort, for a phone reader first. Effort: S = hours to a day, M = a few days, L = a week or more.

### 1. Search, shared links and the story's map button do nothing on a fresh visit

- **Severity / effort:** P0 / S. (The skeptics split: map-visual and usability held P0; performance rated its slice P1 because the right layers still show, and pages rated the CTA slice P1. P0 kept because the merged defect is wider than any one slice: search, sharing, deep links and the landing hand-off, which is a standing ruling, all fail together on every cold visit.)
- **Charter:** done (1), the core map works; the 2026-08-21 ruling that "Explore the Map" carries readers to the old-growth pocket.
- **What's wrong:** /map reads the map through a handle that stays empty until some unrelated part of the page re-renders. Until then a town search lists results but selecting one does nothing, Copy link shares bare `/map`, deep links and the landing's "Explore the Map" open on the province, and panning never updates the address bar. Any preset tap fills the handle, which is why casual testing misses it. The August fix (08-22 P1, "shipped" in Batch 0) polls that same empty handle, and its test fills the handle by hand, so it cannot fail.
- **Evidence:** first search a no-op 4/4 cold loads (`verify/usability-refactor-evidence/data/camprobe.jsonl`); deep links stuck at z5 in 6/12 (`verify/map-visual-evidence/data/f17.jsonl`); the CTA link never landed without input in 15/16 runs (`verify/performance-evidence/cam/*.json`); a real CTA click missed 4/5 (`verify/pages-visual-evidence/data/f19.out`). Cause `src/components/map/CanopyMap.tsx:68`; hollow test `src/test/lib/deeplink-hydration.test.ts:29-47`.
- **Fix:** forward the ref with the existing `src/lib/react/merge-refs.ts`; seed `initialViewState` from the URL hash when the map is constructed (no fly, no race); delete the poll-and-fly in `useMapState`; subscribe the URL sync once the map exists. Guards: a CanopyMap test with a deferred mock map that does not hand-attach the ref, and a live check that a fresh-context search moves the hash. Side benefit: the CTA stops downloading the province view first (237 raster requests and 2.25 MB of terrain, performance lane).
- **Lenses:** map-visual F-17 + F-13, usability U-05 + P1-0822, performance SPD-01, pages F-19.

### 2. The data layers wait for a signal that, on desktop, never comes; an early tap stays blank

- **Severity / effort:** P0 / S.
- **Charter:** done (1), every public layer reading correctly. A lit legend over an empty map states something false.
- **What's wrong:** the vector data source is registered only on MapLibre's `load` event. On desktop `load` never fires by itself: the last tile to settle is one of 130-160 R2 404s, and MapLibre does not repaint after a 404, so nothing loads until the reader drags the map (hovering is not enough). Separately, a preset tapped before `load` reads a stale copy of its visibility and stays blank until toggled off and on, while chip and legend say it is on. Phones fire `load` at 2-6 s, so there the failure is the early tap; on desktop it is every visit that sits at the opening view, including every deep link whose camera missed.
- **Evidence:** desktop, 8 configurations, no `load` and no `.pmtiles` request in 30-45 s; a 5 px drag fires it at once (`verify/map-visual-evidence/data/f16.jsonl`, `f16b.jsonl`, `shots/f16_desktop_z5_hover20.png` vs `f16_desktop_z5_drag20.png`). 9/9 cold desktop loads, and one `triggerRepaint()` fires `load` within 40 ms (`verify/usability-refactor-evidence/data/diag-repaint.jsonl`). Early Logging tap: coloured fraction 0.000 for 75 s, 0.676 after a re-toggle (`data/layerprobe.jsonl`). Code: `DataLayer.tsx:420-427` (registers on `load`), `:290/311/357` with deps at `:445` (stale `visible`).
- **Fix:** register the PMTiles and satellite sources on `style.load` (or as soon as `getStyle()` is non-null) and `triggerRepaint()`; give PmtilesLayers the `visibleRef` pattern SatelliteLayers already uses, for `visible` and `classFilters` (refresh R1-05, already owed). Do **not** ship the 08-22 fix for "nothing at z5" (zoomRange [6,18] plus a "zoom in" chip): the data renders fine once `load` fires, so that fix would hide it. Guards: a desktop province link must request `.pmtiles` within 20 s with no input; a rendered PmtilesLayers test that flips `visible` while the source is unloaded.
- **Lenses:** map-visual F-16, usability U-11 (= refresh R1-05) plus its skeptic's 404 diagnosis, performance skeptic's `load`-gate mechanism (SPD-03).

### 3. Four sentences on the landing page that the record contradicts

- **Severity / effort:** two P0, one P1, one P2 / S (copy).
- **Charter:** done (3), non-goal (3) ("the story base must not imply pre-1950 logging").
- **What's wrong:**
  - "Much of what you see in red was already gone by 1950." The red it points at is undated blocks parked at a proxy year of 1949. The record does date most of them, recently: of 36,730 undated blocks under the 2,000 ha cap, 2 carry a planned harvest date before 1950 and 89% are dated 1990 or later. (P0)
  - "The full picture is worse." sits over an end reveal that paints mature and young forest in the loss red. A point sample of the live reveal tiles found about 92% of the red is not recorded harvest: 61% mature forest, 16% non-forest, 7.5% stands of 250+ years. (P0; the picture half is a decision, section 5)
  - "0.3% of the province's forest." Price, Holt & Daust put the 35,000 ha at 0.07% of BC's forest and 0.27% of its old forest, and call the class "very large trees". The 35,000 ha headline is right. The same misquote is in the /map legend note (`src/lib/layers/registry.ts:119`). (P1)
  - "Nothing is modelled, estimated, or editorially filtered." The site drops the 230 tenure polygons over 2,000 ha (a filter, by your own 2026-09-02 ruling) and parks undated blocks at a proxy year. (P2)
- **Evidence:** BC WFS hit counts by planned harvest date (`verify/pages-visual-evidence/scripts/undated_hits.py`, `verify/pages-visual.md` F-03); reveal point sample (`scripts/binsample2.py`); source PDF text (`verify/pages-visual.md` F-01, Price, Holt & Daust 2020); `scripts/build-year-overlays.py` (proxy year 1949), `scripts/build-raster-tiles.py:135-143` (mature and young mapped to `#ef4444`). The sentences: `src/data/chapters.ts:131`, `:189`, `:190`; `src/components/story/CtaSection.tsx:78-80`.
- **Fix:** today, delete the "by 1950" sentence and "The full picture is worse."; replace the 0.3% line with "That's the old forest left on BC's most productive sites, where the very biggest trees grow. Less than 0.1% of the province's forest." and fix the legend note to match; rewrite the provenance line to name the 2,000 ha filter. Add a copy guard that bans "by 1950". The auditor's replacement for the 1950 line ("logged too, but the record does not say when") is withdrawn: the record's planned dates point the other way. The pictures behind the first two sentences wait on two decisions in section 5.
- **Lenses:** pages F-03, F-02 (copy half), F-01, F-13; map-visual cross-reference for the legend note.

### 4. /map downloads tiles for layers that are off, and runs 3D terrain on a flat map

- **Severity / effort:** P1 / S. (Usability skeptic rated the prefetch half P2 as "already tracked"; P1 kept on the performance skeptic's phone counterfactual.)
- **Charter:** audience tripwire (a member of the public on a phone); feeds done (1), because these requests are the 404s that stall item 2.
- **What's wrong:** five forest-age raster sets, a second copy of the old-growth source and satellite are hidden with opacity 0, which MapLibre still fetches. An empty /map pulls 2.3 MB on a phone and 6.3 MB on desktop, where 160 of the requests are 404s (90 of them outside the archive's bounds), and the layer the reader asked for queues behind them. Terrain is switched on at load for a map that opens flat.
- **Evidence:** `verify/performance-evidence/mapreq/plain-desktop.json`, `plain-phone.json`. Blocking only the hidden sets on a phone profile (Slow 4G, 4x CPU, Logging z7, 2 runs per arm) moved the PMTiles header from 30 s to 19.5 s and the first z7 tile from 36.5 s to 24.5 s (`mapreq/logz7-base-*.json` vs `logz7-nohidden-*.json`). Terrain off: main-thread script -31%, a scripted pan from 8-14 fps to 37-39 fps (`terrain/ab.log`). The auditor's combined A/B: first vector tile 41.5/39.1 s to 22.6/20.5 s, 404s 31 to 2 (`performance/data/mapab/`).
- **Fix:** `layout.visibility: 'none'` for inactive raster sets and for satellite, keeping the fade only for the active set; let old-growth-250 reuse the forest-age old-growth source; add the archive `bounds` to every raster source; add terrain only when pitch passes 5 degrees and remove it at 0. Cost: the first use of a class filter fetches on demand instead of fading in pre-warmed tiles.
- **Lenses:** performance SPD-03 + SPD-04, usability P2-0822 + U-19 (raster requests with no layer on), map-visual F-22 (hidden satellite tiles), 08-22 P2.

### 5. The timeline opens at "1917 · 0 ha burned" over every fire up to 1950

- **Severity / effort:** P0 / S.
- **Charter:** non-goal (3), the render-gated playhead; done (1).
- **What's wrong:** the map's year is seeded at 1950 on load. When the timeline opens, the year sync is skipped because MapLibre reports the style "not loaded" while any tile is pending, and nothing retries, so the readout says 1917 over 1950's fires.
- **Evidence:** readout 1917, map global state 1950, 200 rendered fires with a maximum year of 1950, no year call made (`verify/map-visual-evidence/data/f18.jsonl`, `map-visual/data/yeartrace.jsonl`). Code `src/app/map/page.tsx:322-327`, `CanopyMap.tsx:84`. Already owed as refresh R1-02 in `.claude/handoff.md`.
- **Fix:** set the year whenever `getStyle()` is non-null and on timeline enable; stop seeding 1950; record `setGlobalStateProperty` in the MapLibre mock and test the `isStyleLoaded() === false` case.
- **Lenses:** map-visual F-18, usability R1-02-0901 (its live probe of a different window did not hit it; the opening frame is confirmed).

### 6. At the zooms readers arrive at, the forest rasters sit on top of place names and data

- **Severity / effort:** P1 (auditor P0) / S.
- **Charter:** done (1).
- **What's wrong:** at z4-9 the six raster overviews draw above every label and every data layer. Data is dimmed rather than erased, but place names go grey-green and Logging at those zooms reads mostly as forest age. The July fix never took effect: it positions the rasters only when `isStyleLoaded()` is true, which it rarely is.
- **Evidence:** live layer order in 3/3 loads: first label at index 39, data 27-38, rasters 50-55 (`verify/map-visual-evidence/data/f02.jsonl`). Valid A/B with a terrain reset: mean difference from data-alone at cutblock outlines 36.3 live vs 6.6 with rasters underneath (`data/f02b.jsonl`, `shots/f02_desktop_logging_z8_interior__AB.png`). Code `DataLayer.tsx:1086-1101`.
- **Fix:** compute `beforeId` from `getStyle().layers` without the `isStyleLoaded()` guard, at mount, on `load` and on `styledata`; a render test with `isStyleLoaded()` mocked false. Then re-measure before any paint work: several August colour findings (Logging looking like forest age, parks vanishing at arrival zooms) share this cause.
- **Lenses:** map-visual F-02; the 07-09 audit's raster-above-labels finding (regressed).

### 7. The story's red covers about five times the logged area its captions state

- **Severity / effort:** P0 / M (code change S; the overlay build runs about 35 minutes and needs 12 GB, detached).
- **Charter:** done (3), non-goal (3).
- **What's wrong:** the year overlays are rasterized at about 2.7 km per pixel with `all_touched`, so any pixel a block touches is painted solid. The 2025 frame paints 32.75M ha, 40% of the forest base, against a data footprint of 6.52M ha (about 10%). The 1950 frame paints 14.2M ha for under 1M ha of undated blocks. Fire's last frame paints 41M ha against 22.1M ha of summed perimeters.
- **Evidence:** the skeptic's exact-area read of the live PNGs and its own fine re-rasterization of the source data (`verify/pages-visual-evidence/scripts/truearea.py`, `verify/pages-visual.md` F-05); `pages-visual/data/overlay_area.txt`; `scripts/build-year-overlays.py:483-495`.
- **Fix:** rasterize finely without `all_touched`, block-average to the display grid, alpha proportional to covered fraction; same for fire and the binary theme. Guard: the 2025 frame's area-weighted total within ±15% of the dated plus undated totals. In the same pass write palette PNGs, which are lossless here and cut the 185 overlays from 10 MB to 3.4 MB (performance SPD-09, unverified). Take the undated-blocks and palette decisions first so the build runs once. The honest story will be visibly less red.
- **Lenses:** pages F-05, performance SPD-09.

### 8. The landing pulls about 17 MB before the reader scrolls; on a slow phone the story map is blank for its first chapters

- **Severity / effort:** P1 / S for the first two steps, M in full.
- **Charter:** audience tripwire; non-goal (3) as well, because "See what's left." over a blank map reads as "nothing is left".
- **What's wrong:** the hero queues all 185 story overlays, the fire overlays and the binary tiles at hydration, and the story adds a second hillshade on the same terrain tiles the basemap already draws. MapLibre (259 KB compressed) rides into the landing bundle through a prefetch import. The second hero beat, "5.8 million hectares", is hidden by CSS until JavaScript hydrates. Throttled, the first chapter showed no forest from 47 s to 88 s although its image had arrived at 43.9 s, and the year counter ran 1983 to 1999 over an empty map.
- **Evidence:** 17.61 and 17.68 MB with no scroll (`verify/performance-evidence/landing/bytes-1/result.json`, `bytes-2`); reading-pace strip (`landing/read-1/strip.png`); green fraction 0% to 88 s (`verify/pages-visual-evidence/scripts/slow.mjs`, `shots/slow_88s.png`); beat 2 at opacity 0 until 6.4 s on Slow 4G (`landing/hydr-*`). Blocked-URL counterfactual: 16.3 MB to 1.3 MB, time to interactive 83 s to 11 s (`performance/data/lh/`). Code `src/components/story/HeroSection.tsx:43-45`, `src/lib/story/prefetch.ts`, `src/app/globals.css:243-248`. A probable second cause, not instrumented: `src/lib/story/visibility.ts:48-51` gates on the same `isStyleLoaded()` trap as items 5 and 6.
- **Fix:** remove the hero's overlay prefetch; mount the story when a sentinel one screen above it comes into view; replace the all-185 queue with a window (current chapter plus about ten frames ahead); drop the duplicate hillshade and restyle the basemap's own; render-gate the year counter on its overlay; move the overlay URL constants into a dependency-free module so MapLibre leaves the hero bundle; make beat 2 visible by default. The claimed "hero photo 38 s to 8 s" gain did not reproduce and is dropped.
- **Lenses:** performance SPD-02 + SPD-07, pages F-24 + F-15.

### 9. Popups contradict the legend on the same screen

- **Severity / effort:** P1 / S for the labels, M with the phone layout.
- **Charter:** non-goal (3); undoes the Batch 1 honesty relabel at the point of inspection.
- **What's wrong:** tapping a stand says "Old Growth" while the legend beside it says "Stands 250+ yr (VRI)", or "Mature Second Growth", which asserts a past harvest that stand age cannot show. Species come out as codes (YC, SX). Cutblock popups print "Other", the literal word "null" and a four-decimal area, and taps near the screen edge clip off a phone.
- **Evidence:** `verify/map-visual-evidence/data/f20.jsonl`, `shots/f20_phone_forestage_vi_z11__popup.png`; `verify/usability-refactor-evidence/data/popupprobe.jsonl` (15 of 32 features carry the string "null", 31 of 32 company "other"). Code `src/lib/taxonomy/forest-age.ts:57-62`, `MapPopup.tsx:97,105-110,169`; the string "null" comes from `scripts/pipeline/build-tiles.ts:187`.
- **Fix:** one label table shared by legend and popup, with an equality check in the colour audit; species code to common name; treat "null" and "" as missing; area to one decimal; a header naming the layer and source; MapLibre's automatic anchor, and a bottom sheet below 768 px.
- **Lenses:** map-visual F-20, usability U-07 + U-08.

### 10. Nothing on the public map says loading, empty or failed

- **Severity / effort:** P1 (the session-killing timeout inside it is P2) / M.
- **Charter:** done (1), word for word: "honest status states instead of silent blanks".
- **What's wrong:** for the six tile-backed public layers the only status ever written is "error". The loading bar never appears, and the legend's status badge renders only on collapsed rows while rows start expanded. On throttled links the map sat blank for 15-90 s with chip pressed, legend lit and no message. If the tile index takes more than 15 s, all six layers are abandoned for the session; the toast blames "BC data", lists layers that are off, and vanishes. That last case is rare: the index naturally arrived in 0.8-4 s on slow profiles.
- **Evidence:** `verify/usability-refactor-evidence/data/stall-slow4g.log`, `stall-slow3g.log`, `stallprobe.jsonl`; outage legend identical to the working one from 3 s to 49 s (`verify/map-visual-evidence/data/f08.jsonl`, `shots/f08_phone_outage.png`). Code `DataLayer.tsx:408-418`, `:1144`, `:1216`; `MapLegend.tsx:232-236`.
- **Fix:** a status lifecycle in PmtilesLayers (loading while visible and undrawn; ok or empty from `queryRenderedFeatures` on idle; zoom-in); keep the source listener alive and let the timer mark "slow" rather than abandon; clear status on toggle-off (refresh R1-03); show the badge in expanded rows; error copy that names only visible layers and never blames BC. First, make the MapLibre test mock's `isSourceLoaded` controllable: today it returns true the instant a source is added, which is why these bugs ship green.
- **Lenses:** map-visual F-14 + F-08, usability U-09 + U-10, refresh R1-03 and R1-13, 08-22 T3.

**Just outside the ten:** the desktop share button clipped out of sight and the phone action row (Relay 4), invented-looking numbers in the Discover panel and a share card advertising layers that are not public (Relay 3), the calculator's unreachable "unknown age" row (Relay 3), and story captions that arrive after their animation (Relay 5).

## 3. Proposed relay batches

**What exists today.** Your confirmed order is global-state (done), then Phase B, C, D, E (2026-08-26). Phase B already exists as the complete, unmerged `relay/phase-b-harvest` and needs a 2-3 hour rebase. One relay is owed "before Batch 2": the three DataLayer public-path bugs from the 09-01 refresh, with the rendered PmtilesLayers tests that do not exist yet (`.claude/handoff.md`). The 08-22 program's remaining batches are 2 (paint), 3 (load and empty states), 4 (tile build) and 5 (mobile and interaction).

**Proposed order:**

1. Today, outside any relay: the landing-copy deletions in top-10 item 3. Minutes of work; the sentences are false now.
2. **Relay 1, map plumbing**, before the Phase B rebase. It is the owed relay, widened.
3. **Relay 2, story honesty**, in parallel with Relay 1 (no shared files), once three decisions are in.
4. **Relay 3, trust and provenance**, small; after Relay 1, before Phase B goes live.
5. **Relay 4, phone chrome and status states**, as the first step of the Phase B rebase or just before it.
6. Phase B as ruled. Then **Relay 5, landing speed**, any time after Relay 2.
7. Phase C paint, after Relay 1's re-measure. **Relay 6, delivery and tiles**, folds into Batch 4 and Phase E. D and E unchanged.

Severity and effort follow each item; "unverified" means no skeptic re-checked it (Appendix B).

### Relay 1. Map plumbing (jumps ahead of Phase B)

- **Why jump:** four of the P0s live here and break search, sharing and the story's hand-off. Phase B's rebase edits the same DataLayer filter code (handoff 2026-08-27), so it should rebase once onto fixed plumbing. And B's leaderboard will be shared through links that currently do not land.
- **Contents:**
  - Test harness first: a controllable `isSourceLoaded` and a recorded `setGlobalStateProperty` in `src/test/mocks/maplibre.ts`, plus rendered PmtilesLayers tests that fail today (P2, M). Usability R1-13; refresh R4-16.
  - Map handle and camera, top-10 item 1 (P0, S).
  - `style.load` registration and `visibleRef`, item 2 (P0, S).
  - Timeline year, item 5 (P0, S).
  - Raster order, item 6 (P1, S).
  - Hidden-layer downloads and terrain, item 4 (P1, S).
  - Slow sources marked "slow" instead of being abandoned, and status cleared on toggle-off. This is the plumbing half of item 10 (P2 and P2, S). Map-visual F-08, usability U-10, refresh R1-03.
  - Back and Forward: popstate restores without pushing a new entry (P2, S). Measured independently by two lanes but unverified. Map-visual F-21 (`map-visual/data/deeplinks.jsonl`), usability P9-0822 (`usability-refactor/data/probe-prior-checks.jsonl`).
  - Deep-link latitude range check (P3, S, unverified). July scan F6, `src/hooks/useMapState.ts:68`.
- **Guards:** add live Playwright guards to `playwright.live.config.ts` that run against production after deploy. These bugs only appear on real loads, and the audit lanes showed headless Chromium on the host GPU can render production; the map-visual lane's read-only React hook replaces the dev-only map handle.
- **After it ships:** re-run the like-for-like grid (`map-visual/scripts/grid.mjs`, `post.py`) before Phase C. Several August colour findings share item 6's cause and should shrink.
- **Size:** about nine S items. If the plan critic wants two relays, cut after the terrain change.

### Relay 2. Story honesty (charter done 3)

- **Where it goes:** ahead of Phase B, alongside Relay 1. It touches only story files and the overlay build.
- **The 2026-08-21 ruling:** you docked the dolly because "the landing page was trying too hard". This relay keeps the dolly docked. It is not ornament: it removes pictures and sentences the data does not support, which done (3) requires.
- **Contents:**
  - The copy fixes in item 3 (P0/P1/P2, S). Pages F-03, F-02, F-01, F-13.
  - Area-true overlays and palette PNGs, item 7 (P0, M). Pages F-05, performance SPD-09.
  - Undated blocks, per your decision (pages F-03).
  - The closing reveal, per your decision. Whatever you choose, stop painting stands of 250+ years and non-forest in red (pages F-02; skeptic sample `verify/pages-visual-evidence/scripts/binsample2.py`).
  - Crossfade the forest base into the reveal instead of cutting it to zero, which leaves 120vh of a forest-less province (P1, S). Pages F-12; `verify/pages-visual-evidence/shots/sheet_p390.png`; `src/lib/story/visibility.ts`.
  - The "75 years of logging" scrub draws record-keeping, not logging: 11 dated blocks in 1950-69 against about 70,000 per decade in the 2000s, while BC's harvest peaked in 1987. Relabel it as what the record dates and start the motion where the record does (P1, S). Pages F-04; `src/data/scrub/cutblocks-scrub.json`.
  - Render-gate the year counter on its overlay (P1, S). Performance SPD-02(e); non-goal (3).
  - Guard the hero comparison: floor greater than Nova Scotia's 5,528,400 ha (P3, S, unverified). Pages F-18.
  - "Some of these trees are older than the Roman Empire": Canada's oldest documented tree postdates the Empire's start (P2, S, unverified, medium confidence). Pages F-14.
  - If the palette decision says so, separate logged from forest by lightness, not hue alone (P2, S, unverified). Pages F-17.
- **Decisions needed first:** undated blocks, the closing reveal, and the palette, so the overlay build runs once.

### Relay 3. Trust and provenance on /map, the calculator and the PDF

- **Where it goes:** after Relay 1, before Phase B goes live. Mostly copy and metadata, so it rarely conflicts with anything.
- **Why before B:** B adds public numbers and a reason to share links. Your 2026-09-02 ruling already binds: "A figure that cannot be derived is not shown."
- **Contents:**
  - Share card and meta (P1, S). They advertise "17 data layers", "species at risk", "Fish streams" and "real-time" data; the public map has 6 data layers plus satellite and a 2024 build. Add a test pinning their nouns to the public layer list. Map-visual F-09, pages F-07, usability U-18; `verify/map-visual.md` F-09; `src/app/layout.tsx`, `src/app/map/layout.tsx`. (Severity: the map-visual skeptic held P1 and the pages skeptic said P2. P1 kept, because the /map preview's "real-time" is a claim about the data, not just a feature.)
  - Discover panel: "1,131 hectares of old growth" has no derivation anywhere. Derive it with a pinned, floored script or remove it; cite the 96 m tree and the 2.6M ha figure as external facts (P1, S). Map-visual F-10, usability U-14; `src/data/hotspots.ts:27,32,66`, `registry.ts:546`.
  - Popups, item 9 (P1, S-M).
  - The calculator's dollar comparison, per your decision (P1, S). Pages F-20; `src/lib/carbon/calculator.ts:232-242`.
  - The "unknown age" row is unreachable live because the edge proxy drops every unaged stand: 314 treed unaged stands (7,025 ha) in one Sooke box, 0 returned. That makes your 2026-09-02 "the area stays visible in the breakdown" untrue. Keep treed unaged stands as class "unknown" in the proxy (P1, M; edge function, so Razor). Pages F-06; `verify/pages-visual-evidence/scripts/f06c.py`; `netlify/edge-functions/wfs-proxy.ts`.
  - Old-growth caveat on the "Old Growth + Parks" legend item, and layer descriptions as a visible line instead of a hover tooltip a phone cannot show (P2, S, unverified). Map-visual F-11, usability U-13.
  - Provenance (P2, S, unverified). Map-visual F-23, usability U-19.
    - An OpenCanopy wordmark linking home.
    - A data-vintage line ("VRI 2024") from a tested constant.
    - Attribution on the PMTiles source.
    - A "Sources & method" link.
  - PDF (P2, S, unverified). Usability U-17, refresh R3-04, pages F-21; `src/lib/export/pdf-generator.ts:287`.
    - A link to the exact view, a data date and the real methodology URL.
    - Page breaks, so a phone export is not four pages with the map sliced.
    - Caveat text at readable contrast.
    - A visible message when pop-ups are blocked.
  - Small pages (P2-P3, S, unverified):
    - Remove "Sponsor on GitHub", which lands on a profile with no sponsor option.
    - Fix the /privacy "Last updated" date and add the footer.
    - Replace Next's default white 404 with a branded one.
    - Give the five "Explore" buttons distinct accessible names.
    - Pages F-09, F-10, F-08, usability U-22.

### Relay 4. Phone chrome and status states

- **Where it goes:** it folds ROADMAP Batch 3 (load and empty states) and Batch 5 (mobile and interaction). Run it as the first step of the Phase B rebase or just before it, because B.1's leaderboard needs a panel slot and a share button people can find.
- **Contents:**
  - Visible Share and a fixed action row (P1, S-M). On desktop, Copy link is clipped out of the preset bar and hit-tests to the map in 3/3 layouts. On a phone, the active preset and 5-6 of the bar's controls start off-screen with no cue, and the bug-report flag covers a chip (at 360 px, tapping "Old Growth + Parks" opens the mail app). Fix: a non-scrolling action cluster with Share, a preset row with an edge fade that scrolls the active chip into view, and the bug report moved into the layer sheet. Map-visual F-03 and F-04 (confirmed P1); usability U-03 and U-04 (confirmed P2 for the phone parts); `map-visual/data/layout.jsonl`, `verify/usability-refactor-evidence/data/hitprobe.jsonl`.
  - The status lifecycle in item 10: loading, empty and zoom-in (P1, M). 08-22 T3.
  - Phone legend (P2, S-M). It is capped at 25vh with a hidden scrollbar, covers about a quarter of the map, and its 13 px class-filter rows sit 3 px apart, so a mis-tap silently hides a class. Fix: collapse below 768 px, show a scroll cue, and put class filtering behind an explicit control with 44 px rows. Map-visual F-05 and F-24, usability U-06.
  - Search bar covering the zoom buttons; zoom readout hidden under the navigation control (P2, S, unverified, found by two lanes). Map-visual F-06, usability U-02.
  - Inactive preset chips and the legend note below AA contrast (P2, S, unverified). Map-visual F-07.
  - Timeline chrome (P2, M, unverified). Map-visual F-19.
    - 23 px speed and step buttons become 44 px.
    - The readout says it is province-wide.
    - On a phone, the legend docks above the panel.
  - Shared links carry the timeline year and class filters, through one view-state parser (P2, M). Usability U-21 and R1-08, plus its "URL as view state" refactor.
  - Draw-to-select on touch (P2, S, unverified). Usability U-16, U-20.
    - An instruction chip.
    - A result sheet that leaves the selection visible.
    - Equivalences to two significant figures.
    - "Tap", not "Click".
  - Geolocate capped at z12 (P3, S, unverified). Usability U-12.
  - Phone polish (P3, S, unverified). Map-visual F-22.
    - Attribution sprawling over the scale bar.
    - A one-colour swatch for a four-colour layer.
    - 5 px of horizontal overflow.
  - What a first-time visitor sees, per your decision. Map-visual F-01, usability U-01.
  - One panel slot for all panels, which the leaderboard needs. Usability refactor R4.

### Phase B, as ruled, plus one prerequisite

- Fix who-logged-what attribution before the leaderboard publishes, per your decision. Usability U-15; `verify/usability-refactor-evidence/scripts/company-share.mjs`, `data/company-share.json`.
- Class filters become attribute filters with a filter or dim mode (usability refactor R6).

### Phase C paint re-spine, as planned

- Start it after Relay 1 and its re-measure.
- It takes the palette decision (map-visual F-15, pages F-17).
- It still carries the August items: the gold old-growth lattice at z10+ (T1, P2, reproduced), cutblock and fire time ramps (C1, H1), red on red (C2), gold meaning three things (H2, CP1), parks vanishing (K1) and the satellite jump (S1).
- One correction to the August plan: its proposed 500 ha cutblock cap (C3) would contradict your 2026-09-02 ruling that logged hectares use the 2,000 ha cap "in the story and on the map alike", so it needs an amendment or a different fix.

### Relay 5. Landing speed and phone reading

- **Where it goes:** after Relay 2, because it touches the same story files. It can run alongside Phase B.
- **Contents:**
  - Item 8 in full (P1, S-M). Performance SPD-02 and SPD-07, pages F-24 and F-15.
  - Sticky story cards (P1, M). On a phone, a caption is on screen at only 7 of 30 scroll stops, and every one arrives after its animation. Pages F-11; `verify/pages-visual-evidence/shots/sheet_p390.png`; `src/components/story/NarrativePanel.tsx`.
  - Fit BC to each screen (P2, S). The fixed z5 camera shows a 390 px phone 58% of the province's forest; the Okanagan, Kootenays and Haida Gwaii never appear. Pages F-16.
  - Reduced motion (P2, S, unverified). It keeps the full 1,878vh of scroll for five pictures. Pages F-22.
  - Chrome over the red reveal below AA: counter label 3.7:1, nav 3.0:1 (P2, S, unverified). Pages F-23.
  - The closing number set as a headline, after the 0.3% fix (P2, S, unverified). Pages F-25.
  - Hero image `srcset`, cache headers for `/raster` and `/images` (now `max-age=0`), and Literata without its optical-size axis, which doubles the font from 52 KB to 110 KB and is preloaded on /map where only the calculator uses it (P3, S, unverified). Performance SPD-10, SPD-12, SPD-11; ROADMAP P3 ops backlog.
  - The P3 copy and hygiene batch (P3, S, unverified). Pages F-18.
    - Fire wording.
    - The 2023 fire figure to reconcile before it is ever printed.
    - Nav overlap.
    - Live-region text.
    - One grey family.
    - Duplicate Ko-fi and disclaimer.
    - An unused 600 KB image.
    - The Tab jump.

### Relay 6. Delivery and tiles (folds into Batch 4 and Phase E)

- Tile delivery off r2.dev, per your decision (P1, M). Performance SPD-05; `verify/performance-evidence/r2/`, `warm/logging-z7-phone.json`.
- Per-layer archives (P1, L). Performance SPD-06; `verify/performance-evidence/pmtiles/check.json`.
  - Today a z7 Logging tile is 12.5% cutblocks: forest-age vectors drawn only from z10 still ride in every tile, as do the non-public layers.
  - Rebuild forest-age from z10, keep non-public layers out, and key the renderer by each layer's tile URL instead of the shared `opencanopy` source (usability P3-0822).
  - This is the same rebuild as the parked z10+ holes.
- Stop writing the string "null" for missing dates at tile build (usability U-15; `scripts/pipeline/build-tiles.ts:187`).
- Empty-tile 404s: deploy the binary-tile manifest, or answer 204 from the Worker (P3, S). Performance SPD-14, refresh R3-13.
- Calculator data path (P2, M, unverified). Performance SPD-08, usability U-20.
  - A size guard by feature count, not km²: coastal selections of about 200 km² time out at the edge at 35 s, against a 20 s client budget and a 500 km² promise.
  - No caching of 5xx responses.
  - Watershed groups as a static layer.
- Load `@turf/intersect` only for the calculator (P3, S, unverified). Performance SPD-13.
- Already in Batch 4: the E&N private-land mask (08-22 F3) and the big-tree subset (T2).
- **Before Phase D:** fix the WFS client race and the GeoJSON path the FOM layer will ride on (usability refactor R7; refresh R2-02, already routed).

## 4. Prior-audit scoreboard

Sources:
- the 08-22 tracking checklist (`research/map-visual-audit-2026-08-22.md` in the repo);
- the 07-09 /map re-audit and the 07-15 audit;
- the 07-18 improvement scan (`research/improvement-scan-2026-07.md`);
- the 09-01 refresh routing in `.claude/handoff.md`.

Status comes from fresh measurement in this audit. The lane tables are `map-visual/REPORT.md` "Prior findings: status", `pages-visual/REPORT.md` and the performance summary. The 08-22 checklist's own status column is stale: Batch 1 items still read "open".

**Score: 21 fixed and holding, 4 regressed or never effective, 4 partly fixed, 7 open with the diagnosis corrected, the rest open and unchanged.**

### Fixed and holding

- **08-22 P7 preset active state:** fixed (emerald border plus dot). Side effect: inactive chips fell below AA contrast (Relay 4).
- **08-22 P8:** a link carrying only `preset=` restores the view. Confirmed by two lanes.
- **08-22 CP2 layer id renames:** fixed. Old links still resolve and the hash is rewritten.
- **08-22 K2 parks swatch:** fixed.
- **08-22 PR5 Overview:** fixed; it is now forest age plus parks.
- **08-22 CH1 legend truncation:** fixed. Side effects: the phone legend height and the hidden status badge (items 10 and Relay 4).
- **08-22 CH2 attribution contrast:** fixed, now 13.1:1.
- **08-22 CH3 layer-count badge label:** fixed.
- **08-22 PR2 and PR4:** renamed per your 2026-08-26 answers. Copy only: the Old Growth + Parks view is still gold-dominant.
- **08-22 P6 hidden layers:** closed by your ruling ("Keep hidden").
- **08-22 X4 light colour scheme:** passes; the site stays dark and intact.
- **09-01/09-02 hero "5.8 million hectares":** a true floor. It beats Nova Scotia (55,284 km², StatCan) by 4.9%.
- **09-02 tenure blocks:** gone from the story overlays live (PNG checksums match the fix).
- **09-02 same-origin tracker:** fixed; the privacy page's claim is true.
- **06-21 reduced-motion crash fix:** holds.
- **07-17 pinch-zoom on text pages:** holds.
- **07-05 scroll performance floor:** holds, 55-58 fps at 4x CPU.
- **08-27 global-state timeline:** shipped. Playback is limited by the map engine, not React.
- **ROADMAP vestigial WFS fetch:** gone. No `/api/wfs` request in 30+ measured views.
- **07-09 ungated debug map handle:** now dev-only in production. This audit had to work around it.
- **React render cost:** not a bottleneck. react-dom takes about 0.6 s of main thread against MapLibre's 10.5 s at 4x CPU, so no React refactor is needed for speed.

### Regressed, or marked shipped and never effective

- **08-22 P1 deep-link camera,** "shipped" in Batch 0: it never worked on cold loads, because the poll waits on a handle that stays empty and the test fills the handle by hand. Now top-10 item 1.
- **07-09 raster-above-labels fix:** never in effect live. Item 6.
- **07-18 scan, "MapLibre dynamically imported correctly":** contradicted. It is a static part of the landing bundle (item 8).
- **07-18 scan, R2 cache headers:** worse. There is now no Cache-Control at all, and a repeat visit re-downloads about 15 MB of tiles (decision in section 5).

### Partly fixed

- **08-22 F2/T2 old-growth definition:** the Forest Age legend got the new label and note. The old-growth layer's own legend item has no note, popups still say "Old Growth", and the note is 9 px below AA.
- **08-22 S2 satellite:** labelled "(base map)" with a grey swatch, but still a dismissable legend row rather than a base-map switch.
- **09-02 unknown-age ruling:** values fixed. The labelled row is unreachable live (Relay 3).
- **07-09 fourth preset unreachable on mobile:** now reachable by scrolling; the bug-report flag still covers a chip.

### Still open, diagnosis corrected

- **08-22 P2, vectors attach after 14-40 s.** The real cause is the `load` gate waiting on opacity-0 rasters, and on desktop `load` may never fire. Items 2 and 4.
- **08-22 P4, nothing at z5.** Desktop never fires `load`; phones draw z5 fine but download 35.8 MB to do it. Do not ship the August `[6,18]` fix. The usability lane's "fixed" verdict was a phone-only view.
- **08-22 P5, satellite gated at z10+.** It is not gated: it renders at z7, and is blank wherever `load` did not fire. It also downloads tiles while switched off.
- **08-22 PR3, Fire + Logging.** At z10 and above, fire now draws above forest age, so "registry order draws age over fire" no longer holds. The colour collision remains.
- **08-22 PR1, K1 and C2 at z9 and below.** Most of the cause is the raster order (item 6). Re-score after Relay 1.
- **08-22 C3, tenure rectangles.** Still open, but the proposed 500 ha cap contradicts your 2026-09-02 ruling.
- **Parking Lot prefetch gating (~8 MB).** Now about 11 MB eager plus 3-5 MB of terrain.

### Still open, unchanged

- **08-22 P3, single archive:** 26.47 MB for every desktop z7 preset, the same as August. Relay 6.
- **08-22 P9, Back/Forward:** worse than described. The second Back loops, Forward never works, and leaving /map takes 2N presses. Relay 1.
- **08-22 paint items (Phase C):**
  - T1, the gold lattice (a blocker);
  - T3, empty states (Relay 4);
  - F1, collapsed dots;
  - F3, E&N grey;
  - C1, scale-dependent red (interior coverage 33.0 / 24.2 / 4.0% at z7 / 9 / 11, against 29.7 / 17.5 / 3.1% in August);
  - H1, flat fire;
  - H2, the amber lane;
  - CP1, gold meaning three things;
  - S1, the daylight jump.
- **07-15 protanopia collapse:** old growth against harvested about 7 under protanopia. Decision in section 5.
- **07-09 hidden class rasters fetched:** 160 404s, 4.38 MB per desktop view. Item 4.
- **07-18 scan:**
  - data vintage not shown (Relay 3);
  - tile manifest 404s (Relay 6);
  - deep-link latitude not range-checked (Relay 1).
- **Parking Lot:**
  - hero `srcset`;
  - cache headers for `/raster` and `/images`;
  - CSP still report-only;
  - the z10+ rectangle artifact, re-seen as a straight 55 km seam in parks at Vancouver Island z11.
- **09-01 refresh routed items:**
  - R1-02, the timeline year (now confirmed live);
  - R1-03, the stale status;
  - R1-05, the early tap (now reproduced live);
  - R1-08, the duplicate hash parsing;
  - R1-13 / R4-16, the test harness;
  - R3-04, the PDF methodology pointer;
  - R3-13, the binary manifest.
- **ROADMAP, conservation-priority ungated from z0:** partly measured, 14% of a z7 tile and 27% of a z5 tile. No frame-rate trace.

### Covered for the first time, and owed live QA

- **08-22 X1 (mobile) and X2 (interaction):** now measured (Relay 4, items 1, 5 and 9). X3, the hidden layers, stays out by your ruling.
- **Live QA owed on the 09-02 deploy:**
  - the hero line, the overlays without tenure blocks, and /privacy all check out (with a stale date on /privacy);
  - the calculator's "excluded from all values" label cannot be checked by eye, because that row never renders.
- **Not covered:** no lane reported on the play-to-2025 lockstep check from the honest-timeline relay. It stays owed.

## 5. Decisions for Lee

Eight decisions, then three checks only you can make. Each decision covers the same points in the same order: the question, what exists today, what it touches, the tension, the options, a recommendation, and whether it can be undone.

### A. May two fix-up relays go ahead of Phase B?

- **Question:** should the map-plumbing fixes and the landing-story honesty fixes ship before Phase B rather than after it?
- **Today:** your confirmed order (2026-08-26) is global-state, then B, C, D, E. One plumbing relay is already owed "before the paint batch". Phase B sits finished on its own branch, waiting for a 2-3 hour rebase.
- **What it touches:** the live map, the landing page, and when Phase B starts.
- **Tension:** the worst problems on /map are in its core functions: search, sharing, the story's map button, and desktop showing no data. On the landing page, four sentences and the overlay picture break the charter's "never show a number or a picture the underlying data does not support". If Phase B goes first, it rebases onto code the plumbing fixes then change again, and its leaderboard gets shared through links that do not land.
- **Options:**
  1. Both go first, in parallel; they touch different files. Phase B starts one or two relays later.
  2. Plumbing first, the story after Phase B. B slips less; the landing overstates for longer.
  3. Keep the order: fold plumbing into B's rebase, and do the story after paint. Least change to the schedule, but the biggest Phase B relay and the longest time with false sentences on the front page.
- **Recommendation:** option 1. The defects are live and cheap to fix, and B rebases once instead of twice. If that is wrong, B lands a week or two later.
- **Undo and urgency:** this is ordering only. Whatever you choose, deleting the two false landing sentences takes minutes and can happen today.

### B. What should the story do with blocks the record does not date?

- **Question:** should the story keep painting undated cutblocks as logging that happened "before the records began"?
- **Today:**
  - About 1.1M ha of cutblocks under the 2,000 ha cap have no harvest date (about 1M ha once overlapping blocks are merged).
  - Your 2026-09-02 ruling paints them as "the muted pre-record baseline" and never counts them.
  - The chapter over them says "Much of what you see in red was already gone by 1950."
  - The government's own planned-harvest dates say otherwise. Of 36,730 undated blocks, 2 were planned before 1950, 89% from 1990 on, and 13,091 in the 2020s.
  - A side count, not checked against the government's status-code table, suggests about 8,000 of them may be proposals that were never logged.
- **What it touches:** the story's opening chapters, its 1950 frame, the baseline chapter's text and the logging scrub. It means one overlay rebuild.
- **Tension:** the charter says the story base "must not imply pre-1950 logging", and painting these blocks in the 1950 frame does exactly that. In your own words on 2026-09-02, it is "better to underestimate than to provide a higher number we can't source".
- **Options:**
  1. Keep painting them at the start and change only the words to "date not recorded". The cheapest option, but the picture still implies pre-1950 logging.
  2. Move them to the end of the timeline in a distinct tone, labelled "logged or planned, date not recorded". They stay visible without being dated, but proposals may still show as logging.
  3. Take them out of the story picture until the status codes are checked, and drop or rewrite the baseline chapter. This understates the logged area by up to about 1M ha.
- **Recommendation:** option 3 now, and reconsider option 2 once the status codes are checked. It is the only option that cannot overstate, which is what your ruling asks for. If that is wrong, the story under-shows up to about 1M ha of real logging for a while. Options 2 and 3 amend the 2026-09-02 ruling.
- **Undo and urgency:** fully reversible with one rebuild. Decide before the overlay rebuild so it runs once. The false sentence can go today regardless.

### C. What should the closing reveal show?

- **Question:** should the final full-screen reveal keep painting everything younger than 250 years in the loss colour?
- **Today:** the reveal has two colours, green for stands of 250+ years and red for everything else, under the caption "The full picture is worse." About 92% of that red is not recorded harvest. It breaks down as 61% mature forest, 16% non-forest (non-treed land and water) and 7.5% stands that are themselves 250+ years old.
- **What it touches:** the last image of the landing story, the moment before "Explore the Map".
- **Tension:** the two-colour design was a deliberate June choice, but it was never recorded as a ruling. The caption presents the extra red as loss, which conflicts with the charter's done item 3.
- **Options:**
  1. Three tones: green for 250+ years, grey for younger forest, red for recorded harvest. Caption: "Green is what the inventory still dates at 250+ years. Red is what it records as harvested. Grey is younger forest." Needs a tile rebuild (a few days). The ending becomes much less red.
  2. Keep two colours and change the caption to "Everything not green is younger than 250 years: logged, burned, or naturally young." Small, but the colour still reads as loss.
  3. Drop the reveal and end on the last dated-logging frame. Small, but the closing image is lost.
- **Recommendation:** option 1, with option 2 as today's stopgap. It is the only version where the colour means what the caption says. If that is wrong, the ending carries less punch. Under any option, stop painting non-forest and 250+ stands red.
- **Undo and urgency:** reversible. Until it changes, every reader leaves on a picture in which most of the red is not logging.

### D. Should the carbon calculator keep its dollar comparison?

- **Question:** should the calculator keep comparing "value if protected" with "revenue if logged" in dollars?
- **Today:** the protect-side bar multiplies the whole ecosystem carbon stock, soil and roots included, by a carbon-credit price and calls the result "avoided emissions credits". One Carmanah selection showed $570M against $89M of logging revenue. The method is confirmed in the code and on the live site; the dollar figures were not re-run. The PDF repeats the comparison.
- **What it touches:** the calculator panel and every exported PDF.
- **Tension:** avoided emissions are the difference from what logging would release, not the whole standing stock, so the protect bar is overstated by construction. The charter says the calculator never shows a number the data does not support, and none of your rulings covers this.
- **Options:**
  1. Remove the dollar comparison. Keep tonnes and the everyday equivalents, and add "Carbon is not priced here: no market pays for a standing stock." Small.
  2. Replace it with an avoided-emissions estimate: the stock times one minus a published retained fraction, at the voluntary price only. A few days of work, and it needs a source nobody has chosen yet.
  3. Keep it and add a stronger caveat. Small, but it still shows an unsupported number.
- **Recommendation:** option 1 now, and option 2 later only if a defensible source turns up. No version of the current number survives the charter. If that is wrong, the panel loses its most persuasive bar.
- **Undo and urgency:** reversible. The risk while it stands is a journalist quoting the $570M.

### E. Should the forest colours change for colour-blind readers?

- **Question:** should the map and the story switch to a palette that people with red-green colour blindness can read?
- **Today:** old growth is dark green and harvested is red.
  - For red-blind readers (protanopia), the colour difference between those two is about 7. For normal vision it is 60, so the pair is readable but weak.
  - For green-blind readers (deuteranopia, the commonest form) that pair holds at 23, but young against harvested drops to about 9.5.
  - The story separates logged from forest by hue alone (not re-checked).
- **What it touches:** every forest-age view on /map, the raster tiles, the story overlays, the legend and the share-card swatches.
- **Tension:** this has been open since July and was meant to be settled in Phase C, the paint work. But the story overlays are about to be rebuilt for the area fix, and deciding later means building them twice.
- **Options:**
  1. Adopt the tested alternative: old growth dark green (#0d5c2a), mature teal (#5eead4), young yellow (#facc15), harvested light red (#f87171). The worst-case difference rises to about 18 for every common type. It changes the look of everything and needs the rasters and overlays rebuilt.
  2. Keep the map colours, add a hatch to harvested from z10, and separate the story by lightness. Red-blind readers stay near 7 at the zooms people arrive at.
  3. Leave it to Phase C as planned.
- **Recommendation:** option 1, decided now, so the story rebuild happens once. The project's central contrast, old against logged, should survive for every reader. If that is wrong, the map looks less like a classic forest map.
- **Undo and urgency:** reversible: one palette file plus rebuilds. It becomes urgent only when the story rebuild is about to run.

### F. What should a first-time /map visitor see?

- **Question:** should /map open on a view, such as forest age plus parks, instead of an empty dark map?
- **Today:**
  - Since your 2026-06-02 change ("Disable Old Growth and Provincial Park by default"), a first visit shows a basemap with no data, no legend and no view selected.
  - The story's "Skip to map" lands there; the story's "Explore the Map" already opens with forest age on.
  - Returning visitors have an empty layer list saved, so a new default reaches them only if the saved setting is reset.
- **What it touches:** the first five seconds of every direct /map visit.
- **Tension:** no reason for the June change is written down, and reviewers in two lanes read the empty map as broken. Turning parks on by default before the plumbing fix would put a lit Parks legend over nothing on desktop.
- **Options:**
  1. Keep it empty, with a one-line caption that disappears on the first gesture: "BC forest age from government inventory. Tap a view below." Small.
  2. Open on Overview (forest age plus parks) after the plumbing fix, and reset the saved setting. Small, with a heavier first load.
  3. Open on forest age only, matching the story's hand-off. Small.
- **Recommendation:** option 2, unless the June change had a reason worth keeping. If it did, option 1. The map's job is to show the data, and an empty map looks like a failure. If that is wrong, whatever drove the June change comes back.
- **Undo and urgency:** reversible, but each reset of the saved setting clears every returning visitor's layers. Low urgency.

### G. Should the tiles move off the r2.dev development address?

- **Question:** should the map's tiles come from your own domain (for example tiles.opencanopy.ca) instead of the storage bucket's r2.dev address?
- **Today:**
  - Every tile comes from r2.dev over the old HTTP/1.1 with no caching headers.
  - A repeat phone visit to the Logging view re-downloaded 15 MB of tiles.
  - A missing tile comes back as a 27 KB error page.
  - Cloudflare's own documentation says r2.dev access "is rate-limited and should only be used for development purposes", and that caching needs a custom domain.
- **What it touches:** every map view, every returning reader, the tile upload routine and a monthly bill.
- **Tension:** your 2026-09-11 ruling ("I don't mind that it becomes a tool of change") invites traffic onto an address documented as dev-only and rate-limited. No rate limiting was observed in this audit.
- **Options:**
  1. Attach a custom domain straight to the bucket, with no Worker. This gives HTTP/2+ and caching; whether browsers then cache the archive's partial reads is unproven.
  2. A custom domain plus the Protomaps Worker, serving individual tiles with year-long caching and empty replies for missing tiles. About $5 a month for Workers, a change to the upload routine, the cross-origin lock moves into the Worker, and the map switches to plain tile addresses. A few days of work.
  3. Stay on r2.dev.
- **Recommendation:** option 2. It removes the repeat-visit download and the error-page tiles together, and puts the site on production infrastructure before advocacy sends traffic. If that is wrong, it costs $5 a month and one more moving part.
- **Undo and urgency:** reversible with one configuration value. Medium urgency: nothing breaks this month unless a post drives a spike.

### H. Should the accountability leaderboard wait for company attribution?

- **Question:** should Phase B's "who logged the most" leaderboard wait until logged blocks are reliably tied to the companies that logged them?
- **Today:**
  - In the live map data, the company field reads "other" for 43% to almost 100% of logged area in the five regions checked: Quesnel 43%, Prince George 57%, Williams Lake 60%, Revelstoke 78%, Port Alberni 99.7%.
  - Only seven companies are switched on. BC Timber Sales and Mosaic are in the company list but not switched on.
  - The finished Phase B leaderboard reports the top five, "Other" and undated. Nobody checked whether it uses the same seven-company list.
- **What it touches:** the accountability view, the first founding promise beyond the map (charter done item 2), and anything an advocate quotes from it.
- **Tension:** a leaderboard topped by "Other" answers the advocate's question with a shrug. The charter asks that every proponent be named neutrally and every claim be reproducible.
- **Options:**
  1. Build the company list from the government's tenure data, ranked by area, before Phase B ships, and still show unattributed area as its own row. Adds a few days of data work to Phase B.
  2. Ship Phase B as built, with an explicit "Not attributed in this dataset" row. No delay, but the top row may be "Other".
  3. Hold Phase B until the full tile rebuild. The longest delay.
- **Recommendation:** option 1. The leaderboard's whole value is naming who logged, and with "Other" on top it names no one. If that is wrong, Phase B takes a few days longer.
- **Undo and urgency:** reversible. Decide before the Phase B rebase starts.

### Three checks only you can make

1. **On your iPhone, open opencanopy.ca/map.** See whether the bottom bar sits under Safari's toolbar. The page is sized in a way that can do this on iOS, and no lane had Safari to check.
2. **Tap the Ko-fi link on the landing page from your phone.** A bot wall blocked the auditors. The code points at ko-fi.com/opencanopy, while the ROADMAP recorded ko-fi.com/toasted40013. The "Sponsor on GitHub" link reportedly lands on a profile with no sponsor option.
3. **After the plumbing relay ships, check the hand-off and the story.**
   - Tap "Explore the Map" on your phone and on a desktop, and confirm it lands on the Vancouver Island pocket.
   - Read the story once on cellular.

## Appendix A. Dropped findings and withdrawn claims

Nothing below appears in the body as fact.

### Whole findings dropped

- **map-visual F-12, "/map uses 100vh; on iOS Safari the bottom bar can sit under the toolbar"**
  - Skeptic verdict: could not reproduce.
  - The code fact is true (`h-screen`, no safe-area offsets, no `viewportFit`), but only Chromium was installed and its emulation has no dynamic toolbar. The auditor rated its own confidence medium.
  - It is now check 1 in section 5.
- **usability P4-0822, "vector layers do render at province z5 (fixed)"**
  - Superseded.
  - It is true on the phone profile that lane used. On desktop `load` never fires, so nothing renders (map-visual F-16, confirmed P0 by its skeptic).
  - The scoreboard carries P4 as open with the diagnosis corrected.

### Claims inside kept findings that were refuted or did not reproduce

- **Map-visual: the landing CTA "landed in all 5 checked loads"**
  - Refuted. The skeptic saw it miss 2 of 4 on desktop.
  - The pages and usability skeptics saw it miss 4 of 5, and the performance skeptic 15 of 16 without input.
- **Pages F-19: a direct visit to the CTA URL lands while the CTA click does not**
  - Refuted. A direct visit also missed 4 of 5.
  - The defect is the general mount race, not something specific to the CTA.
- **Performance SPD-01: on a phone the CTA camera landed by 2.6 s**
  - Not reproduced. The skeptic's phone runs never landed (0 of 6) without input.
- **Pages F-24, unthrottled: "the same empty map 4 s after load"**
  - Not reproduced. Unthrottled, the first chapter was 79.5% green at the first frame.
  - Only the throttled case stands.
- **Performance SPD-02: "hero photo 38 s to 8 s"**
  - Not reproduced. Throttled, the hero photo finished at 9.25-9.34 s in three runs, because it loads from the HTML before the prefetch begins.
- **Performance SPD-04: terrain costs "2-2.6 MB of terrain data per phone view"**
  - Overstated two to four times. The skeptic measured 0.4-0.9 MB, because terrain shares cached tiles with the basemap hillshade.
  - The frame-rate and main-thread gains stand.
- **Performance SPD-07: blank hero beat, "entry completes about 1.4 s sooner"**
  - Unproven estimate.
  - The skeptic found the blank beat's root cause is CSS that hides it until hydration (pages F-15). That is the cheaper fix.
- **Usability U-15: "other holds 51-100% of drawn cutblock area"**
  - The lower bound fails: Quesnel is 43.3% at z10.
  - "BC Timber Sales and Mosaic absent" is also wrong. They are in `src/data/companies.ts`, just not switched on.
- **Usability R1-02, the timeline year was "not reproduced live"**
  - Superseded. That probe tested a different window. Map-visual's skeptic confirmed the opening frame live (P0).
- **Map-visual F-02: "Logging and Fire + Logging show forest age"**
  - Overstated. A valid A/B shows the data attenuated, not replaced.
  - Severity moved from P0 to P1.
- **Map-visual F-24: framed as WCAG 2.2 failures across 13 controls**
  - Overstated. Attribution links are exempt, several targets pass on spacing, and 44 px is AAA or HIG guidance.
  - The clear AA failure is the 13 px class-filter rows. Severity P2.
- **Map-visual F-15: "collapses the palette"**
  - Overstated. Deuteranopia, the commonest form, keeps old growth against harvested at 23.2.
  - The protanopia figure is 7.3 by the skeptic's method, against 6.4 from rendered pixels.
- **Map-visual F-01 and usability U-01: empty first visit framed as a defect**
  - Reclassified as a decision (section 5 F). It was your deliberate commit of 2026-06-02.
- **Map-visual F-04: the phone "screen is silent about which view is on"**
  - Overstated. The legend lists the active layers.
- **Map-visual F-08 and usability U-10: the 15-second abandonment as a likely event**
  - Natural reproductions happened only under starved software rendering.
  - The skeptic measured natural index latency at 0.8-4 s. Severity P2 (the two skeptics split P1 and P2).
- **Pages F-13: three counter-examples to "nothing is modelled"**
  - Two of the three are semantic. Only the 2,000 ha filter and the proxy year are real.
  - Severity P2.
- **Pages F-03: proposed replacement copy, "This darker red was logged too, but the record does not say when"**
  - Withdrawn. The skeptic found that 89% of these blocks carry planned-harvest dates from 1990 on.
- **Usability U-07: "5/5 sampled popups overflowed"**
  - True only for taps near the screen edge. Taps in the middle third fit.
- **Usability U-03, U-04, U-21; map-visual F-05; pages F-16 and F-07; performance SPD-07 and SPD-01**
  - Each skeptic-downgraded, as noted in the body. SPD-01 is kept at P0 here because it merges into item 1.
  - The facts stand; only the severity changed.
- **08-22 proposals withdrawn by this audit:**
  - the P4 fix (zoomRange [6,18] plus a "zoom in" chip), which would hide data that renders;
  - the PR3 claim that registry order draws forest age over fire, which no longer holds at z10 and above;
  - the P5 claim that satellite is gated at z10+, because it renders at z7.
- **07-18 scan: "maplibre dynamically imported correctly"**
  - Contradicted. MapLibre is static on the landing.

## Appendix B. Kept without a skeptic check

These stay at the auditor's severity. Each is grounded in the auditor's own measurement and code reference, but no second party re-ran it.

- **Map-visual:**
  - F-06, search over the zoom controls (P2; usability U-02 found it independently);
  - F-07, contrast (P2);
  - F-11, old-growth caveat and descriptions (P2; usability U-13 independently);
  - F-19, timeline chrome (P2);
  - F-21, Back/Forward (P2; usability P9-0822 independently);
  - F-22, polish (P3);
  - F-23, no name, vintage or link (P2).
- **Pages:**
  - F-08, 404 page (P2);
  - F-09, Sponsors link (P2);
  - F-10, privacy date (P2);
  - F-14, Roman Empire line (P2);
  - F-15, hero beat hidden until hydration (P2; the performance skeptic independently named it the root cause);
  - F-17, story colour-blindness (P2);
  - F-18, P3 batch;
  - F-21, PDF pages (P2);
  - F-22, reduced motion (P2);
  - F-23, chrome contrast (P2);
  - F-25, closing number typography (P2);
  - R3-04, PDF footer (P2; usability U-17 independently).
- **Performance:**
  - SPD-08, calculator timeout (P2);
  - SPD-09, palette PNGs (P2);
  - SPD-10, hero image (P3);
  - SPD-11, font (P3);
  - SPD-12, cache headers (P3);
  - SPD-13, turf split (P3);
  - SPD-14, manifest 404s (P3).
- **Usability:**
  - U-02 (P2);
  - U-06, legend mis-taps (P2);
  - U-08, popup vocabulary (P2, folded into the confirmed map-visual F-20);
  - U-12, geolocate (P3);
  - U-13 (P2);
  - U-14, Discover numbers (P2, folded into the confirmed map-visual F-10);
  - U-16, touch draw (P2);
  - U-17, PDF (P2);
  - U-18, /map meta (P2, folded into the confirmed map-visual F-09);
  - U-19, attribution (P2);
  - U-20, watershed and visible-area on touch (P3);
  - U-22, Explore labels (P3);
  - R1-03 (P2);
  - R1-08 (P3);
  - R1-13 (P2);
  - F6-scan07 (P3);
  - P3-0822 (P2).
- **Usability skeptic side note, not verified further:** after `load`, satellite tiles download while satellite is off, on a metered MapTiler key. The performance lane measured the same pattern before `load` (item 4).
- **Pages skeptic side note, not verified to the code table:** about 8,000 undated blocks have statuses (S, PE) that may mean proposed and never logged (decision B).

## Appendix C. Sources

**Audit lanes (full reports, data, scripts, screenshots):**
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/map-visual/REPORT.md`
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/pages-visual/REPORT.md`
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/performance/REPORT.md`. Its executive summary line reads "pending" because the final write was blocked; the final ranked content is the lane's returned summary, reflected here.
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/usability-refactor/REPORT.md`. Same note; a raw-log copy is at `usability-refactor/data/REPORT-rawlog.md`.

**Skeptic verifications:**
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/map-visual.md`
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/pages-visual.md`
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/performance.md`
- `/home/leesalo/marvin/research/opencanopy-ui-perf-audit-20261001/verify/usability-refactor.md`
- Evidence for each is in `verify/*-evidence/`.

**Project documents (repo worktree session-f8d7c3, origin/main 3db5823):**
- `.claude/CHARTER.md` (amended 2026-09-11)
- `.claude/DECISIONS.md`
- `.claude/handoff.md`
- `ROADMAP.md`
- `research/map-visual-audit-2026-08-22.md`
- `research/improvement-scan-2026-07.md`

**External facts the lanes relied on:**
- Price, Holt & Daust 2020, BC's old growth forest report: https://ancientforestalliance.org/wp-content/uploads/2014/10/bcs-old-growth-forest-report-web.pdf. Gives 13.2M ha of old forest, ~35,000 ha at site index >25 m, and 50M ha of forest.
- BC Environmental Reporting, timber harvest indicator: https://www.env.gov.bc.ca/soe/indicators/land/timber-harvest.html. Harvest peaked at almost 90 million m³ in 1987.
- Statistics Canada, land area by province (Table 15.6, as cited by the pages lane): Nova Scotia 55,284 km².
- Cloudflare R2 public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/. Covers r2.dev rate limiting and the custom-domain requirement for caching.
- Protomaps on Cloudflare: https://docs.protomaps.com/deploy/cloudflare. Covers the Worker, caching on your own domain and Workers pricing.
- Wilderness Committee on Canada's oldest tree: https://www.wildernesscommittee.org/publications/canadas-oldest-tree.
- Colour-vision simulation: Machado, Oliveira & Fernandes (2009), as implemented in the lanes' `scripts/colour.py` and `verify/map-visual-evidence/scripts/cvd.py`.
