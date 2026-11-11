# OpenCanopy remediation traceability index

Checkable form of the beta bar "no known serious bug" (DECISIONS 2026-10-23). SERIOUS = breaks a feature, shows wrong or missing data, or overstates. Everything else = COSMETIC. PROCESS = not a product defect.

Built 2026-11-01 at `bdf0d2b`, for G0. Re-classified at each wave close (`beta-resequence.md`).

## Summary

**59 distinct SERIOUS defects are open (54 from the audits, 5 FB rows serious until diagnosed); 8 of them are owned only in the Beta wave and 1 has no owner, so the program as sequenced cannot meet the bar.** The tables hold 203 rows: 75 SERIOUS, 79 COSMETIC, 49 PROCESS. One SERIOUS row is fixed (P8). 20 more SERIOUS rows repeat a defect from another source and are not counted again below.

| Closes in wave | SERIOUS open | Which |
|---|---|---|
| G0 | 0 | |
| G1 | 10 | Cold-load plumbing (F-17, F-16, U-11, F-18); S0a copy and privacy (pF-03, pF-02 copy, pF-01, pF-13, pF-10, C6-client) |
| G2 | 3 | Back/Forward (F-21); MapLibre 6 popups and overlays, unverified (ML6-a, ML6-c) |
| G3 | 18 | S1-lite (pF-02 picture, pF-05, pF-04, pF-12, SPD-02(e), pF-14, Merge 1, Merge 2); M2 (F-09, F-10, F-20, U-07, F-11, U-19); M1b + MAPFIX (F-02, RAST-1, RAST-2) |
| G4 | 9 | M3a (F-08, F-14, F-03, U-03); T-pre (Z10-HOLES); S1′ and MERGE (pF-24, Ending v2 bug, two measures); S2-pages (pF-09) |
| G5 | 10 | VIEWSTATE (U-21); K.4 (pF-20, pF-06, SPD-08, U-17 twice) |
| Gate | 0 | MATRIX and REBUILD will add to this |
| **Beta** | **8** | Contradict the bar; see Serious but deferred |
| No owner | 1 | pF-16; see Unowned |

Counting rule: a row split across relays counts in the latest wave it closes. The 14 `[bar c]` rows are COSMETIC by the literal definition and gated by SPEED instead. Nothing was re-measured live for this index, so `open*` and `unverified` rows are the audit's word or nobody's.

## Unowned

No relay in `beta-resequence.md` or `glowing-dazzling-brooks.md` names these. Proposals only; no owner has been assigned.

| ID | Item | Class | Closest relay (proposed) |
|---|---|---|---|
| pF-16 | Phone story shows 58% of BC's forest. It was S2 story half, which does not run under L = film | SERIOUS | S1′: make "fit BC to the screen" an acceptance criterion of the film's camera |
| pF-15 | Hero's second beat hidden until hydration. Hero stays under the film; fix was in S2 story half | COSMETIC | S1′ |
| SPD-10 | Hero `srcset`. Not in S2-pages' list; was in S2 story half | COSMETIC [bar c] | S1′ (its weight budget), or S2-pages |
| R1-16 | `loadData` runs twice on a visibility change | COSMETIC | M1b |
| R3.1 | `zRank`, the structural z-order piece. C′'s keep-list omits it | COSMETIC | MAPFIX, which must pin raster order anyway (RAST-2); else C′ |
| S2 (08-22) | Satellite as a base-map switch. Not in C′'s keep-list | COSMETIC | C′ |
| LT4 | R2 `Cache-Control` sweep. Ruling G holds the domain, not this | COSMETIC [bar c] | T-pre (same data release), or Parking Lot beside G |
| R0.6 | Plans onto main, stale ROADMAP citations | PROCESS | Phase 0 |
| R4.1 | Scheduled `audit:live`. OPS monitors uptime; M1a's guards run per release. In Parking Lot P3 ops, no relay | PROCESS | OPS |
| R4.3, D4 | Branch protection | PROCESS | CI, on Lee's D4 |
| R4.4, D5 | CSP report endpoint | PROCESS | OPS, on Lee's D5 |
| R4.5 | `/production` re-audit. The 2026-08-27 D grade is the source of bar (e) | PROCESS | MATRIX |
| R5b, LT8, D6 | Per-preset share cards | PROCESS | Parking Lot, on Lee's D6 |
| R5c, D7 | Embed mode | PROCESS | Parking Lot, on Lee's D7 |
| R5d (citation) | Copy citation | PROCESS | M2, beside the vintage line; else Parking Lot |
| R5e, D8, X3 | Surface hidden layers | PROCESS | Parking Lot, on Lee's D8 |
| F-12 | iOS `h-screen`: MATRIX and Lee's phone look check it, but nothing owns a fix if it reproduces. It would be SERIOUS on a named beta device | PROCESS | M3a (phone chrome), or BETA if found at the gate |

Also owed, not unowned: Phase 0.4's Parking Lot lines for G, C3 and the iOS check, and the beta-wave index, are not in ROADMAP yet. Rulings A, B, C, F and H are not yet in DECISIONS. Both are G0's job.

## Serious but deferred

These are SERIOUS by the definition and their only owner sits in the Beta wave. For the orchestrator: each is fixed before the label, hidden with a test, or re-ruled.

| ID | Defect | Owner today | Cheapest way off the list (proposal) |
|---|---|---|---|
| F-06, U-02 | Phone zoom buttons untappable. Weakest of the eight: auditor calls it "degraded, not broken" because pinch works | M3b | One class at `page.tsx:722` (`right-14`), moved into M3a |
| U-07, U-15 | Popups say company "Other" on 31 of 32 features | B′ | M2 labels it "Not attributed" or drops the row until B′. Otherwise ruling H's data work moves into the gate |
| F3 | E&N private land (~800k ha) reads as no forest | rest of T | Pull the mask into T-pre's build, or M2 adds a legend line. Needs a call on which |
| C1 | Cutblock outlines coalesce at z7-9 and overstate logging against z11 | C′ | C′-lite in G3 or G4: the width and opacity ramp only. Re-measure after M1b first |
| C2, PR1 | Cutblocks vanish red-on-red in Logging | C′ | Same C′-lite: Canopy's scarlet edge. May shrink after M1b and MAPFIX; R3.3 is the same work |
| K1 | Parks vanish under forest age at z10+ once M1b fixes z≤9 | C′ | Same C′-lite: Canopy's edge-only parks |
| PR3 | Fire + Logging colours collapse; MAPFIX fixes order at z≤9, not colour | C′ | Same C′-lite: Canopy's ash fire |
| C3 | Tenure rectangles under the cap read as 30 km² clearcuts. The audit's 500 ha fix contradicts Lee's 2026-09-02 ruling ("in the story and on the map alike") | C′ | **Lee's call.** Amend the ruling, filter on another attribute, or a legend note. S1-lite's geometry cap catches nine polygons, not these |

Four of the eight (C1, C2, K1, PR3) resolve together if Canopy's vector tokens and the cutblock ramp move from C′ to a small gate relay; the 2026-10-11 ruling already chose those colours. M1b's re-measure decides how much is left, so that call belongs after M1b.

The bar's own table lists the relays that clear this set and omits VIEWSTATE, which clears U-21.

## Borderline calls

Literal classifications someone could fairly reverse. Listed so the orchestrator can overrule them in one place.

- **COSMETIC, arguably SERIOUS:** T1 (the audit's blocker, but paint only); H1 (flat fire reads "a quarter of the land burnt, now", yet every polygon is true); PR4 (the preset no longer claims protection); F-15 (a colour-blind reader loses the central contrast; the definition has no accessibility clause).
- **SERIOUS, arguably COSMETIC:** F-06 (above); pF-09 and pF-10 (a dead link and a wrong date, both literal and both cheap); ML6-a and ML6-c (risks nobody has observed).
- **The definition has no home for privacy.** C6-client is SERIOUS only because /privacy says no precise location is collected; the leak itself would be COSMETIC by the literal words.

## How to read the tables

- Verified against the tree at `bdf0d2b` (branch `marvin/canopy`). `git diff bdf0d2b origin/main` (120cc10) on `src/`, `netlify/`, `scripts/`, `public/`, `e2e/` is empty, so the tree equals what is live. Checked 2026-11-01.
- `open` = the cited code still has the defect, by reading it. `open*` = no file:line to check, or the defect only shows on a real load or in the data; status carried from the audit, not re-run here. Nothing was re-measured live.
- `[bar c]` = no feature breaks and no data is wrong, so the literal definition says COSMETIC, but the item feeds the separate ~10 s speed bar and SPEED gates it regardless.
- `pF-nn` = pages lane F-nn, to keep them apart from map-visual's `F-nn`. Severity shown is the synthesis's corrected one.
- Wave is from `beta-resequence.md`: G0-G5, Gate, Beta. `—` = no wave.
- Under Lee's rulings (L = film, K = redesign, S = faster 4G, V = fix): S2 story half runs only on the film-failure fallback, HIDE-K is dropped, VIEWSTATE and K.4 are in the gate.

## Source 1: SYNTHESIS.md (2026-10-02)

### P0, P1, P2

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| F-17, F-13, U-05, P1-0822, SPD-01, pF-19 | P0. Empty map handle on cold load: search no-op, share bare `/map`, deep links and "Explore the Map" miss | SERIOUS | M1a | G1 | open (anchor moved: `CanopyMap.tsx:76-80`, `useImperativeHandle` with no mergeRefs; poll `useMapState.ts:150-190`; hollow test `deeplink-hydration.test.ts`) |
| F-16, SPD-03 (load gate) | P0. Vector source registers on `load`, which never fires on desktop; no data until a drag | SERIOUS | M1a | G1 | open (`DataLayer.tsx:423-427`) |
| U-11, R1-05 | P0. Preset tapped before `load` stays blank while chip and legend say on | SERIOUS | M1a | G1 | open (no `visibleRef` in PmtilesLayers; `:291`, `:312`, deps `:445`) |
| F-18, R1-02 | P0. Timeline reads "1917, 0 ha burned" over every fire to 1950 | SERIOUS | M1a | G1 | open (`page.tsx:326`, `CanopyMap.tsx:94`) |
| R1-13, R4-16 | P2. MapLibre mock cannot fail: `isSourceLoaded` true at once, global state unrecorded; no rendered PmtilesLayers tests | PROCESS | M1a | G1 | open (`mocks/maplibre.ts:94`, `:252`) |
| pF-03 | P0. "Much of what you see in red was already gone by 1950": record dates them recently | SERIOUS | S0a | G1 | open (`chapters.ts:131`) |
| pF-02 (copy) | P0. "The full picture is worse." over a reveal where ~92% of red is not recorded harvest | SERIOUS | S0a | G1 | open (`chapters.ts:190`) |
| pF-02 (picture) | P0. Reveal paints mature, young, non-forest and some 250+ stands in loss red | SERIOUS | S0b (drops fade-in), S1-lite (three-tone tiles) | G2, G3 | open (`build-raster-tiles.py:135-143`) |
| pF-01 | P1. "0.3% of the province's forest" misquotes Price, Holt & Daust (0.07%); same in the legend note | SERIOUS | S0a | G1 | open (`chapters.ts:189`, `registry.ts:119`) |
| pF-13 | P2. "Nothing is modelled, estimated, or editorially filtered": 2,000 ha filter and proxy year exist | SERIOUS | S0a | G1 | open (`CtaSection.tsx:77-78`) |
| pF-05 | P0. Year overlays paint about 5x the logged area (32.75M ha against 6.52M) | SERIOUS | S1-lite (S0b caption and sunset as interim) | G3 | open (`build-year-overlays.py:495`) |
| pF-04 | P1. "75 years of logging" scrub draws record-keeping, not logging | SERIOUS | S1-lite | G3 | open (`chapters.ts:141`) |
| pF-12 | P1. Forest base cut to zero, 120vh of forest-less province before the reveal | SERIOUS | S1-lite | G3 | open* |
| SPD-02(e) | P1. Year counter runs over an empty map, not gated on its overlay | SERIOUS | S1-lite | G3 | open* |
| pF-14 | P2, unverified. "Older than the Roman Empire" outruns the documented record | SERIOUS | S1-lite (hero stays under film) | G3 | open (`HeroSection.tsx:78`) |
| pF-24 | P1. Slow phone: "See what's left." over a blank map for minutes | SERIOUS | S1′ (replaces the scroll story) | G4 | open* |
| pF-16 | P2. Fixed z5 camera shows a phone 58% of BC's forest; Okanagan, Kootenays, Haida Gwaii never appear | SERIOUS | none under L = film; see Unowned | — | open* |
| F-02 | P1. z4-9 rasters draw above labels and data; Logging reads mostly as forest age | SERIOUS | M1b (labels), MAPFIX (data order) | G2, G3 | open (`DataLayer.tsx:1091`; see Source 5 on why M1b alone cannot finish it) |
| F-08, U-10 | P2. PMTiles header past 15 s abandons all six layers for the session; toast blames BC data | SERIOUS | M1b (no abandon), M3a (copy) | G2, G4 | open (`DataLayer.tsx:408-418`) |
| R1-03 | P2. Stale status survives toggle-off for tile-backed layers | COSMETIC | M1b | G2 | open (`DataLayer.tsx:1144` returns before `:1151`) |
| F-21, P9-0822 | P2. Back loops on second press, Forward never works, leaving /map takes 2N presses | SERIOUS | M1b | G2 | open (`useMapState.ts:237`, `:300`; no `restoring` ref) |
| SPD-03, SPD-04, U-19 (raster), F-22 (satellite), P2-0822 | P1. Tiles fetched for layers that are off; 3D terrain on a flat map; 160 desktop 404s | COSMETIC [bar c] | M1b | G2 | open (`DataLayer.tsx:1326`, `:1351` opacity 0; `CanopyMap.tsx:85-91`) |
| F-14, U-09 | P1. No public layer ever says loading, empty or failed; legend lit over nothing | SERIOUS | M3a | G4 | open (`MapLegend.tsx:232-236` badge only when collapsed) |
| F-03 | P1. Desktop "Copy shareable link" clipped out of the bar; hit-tests to the map 3/3 | SERIOUS | M3a | G4 | open (`page.tsx:897`, `:1029`) |
| U-03 | P2. Bug flag covers a chip; at 360 px tapping "Old Growth + Parks" opens mail | SERIOUS | M3a | G4 | open (`page.tsx:1071-1091`) |
| F-04, U-04 | P2. Phone: active chip and 5-6 controls off-screen with no cue; reachable by scrolling | COSMETIC | M3a | G4 | open* |
| F-05, F-24, U-06 | P2. Phone legend capped 25vh, hidden scrollbar, 13 px class rows easy to mis-tap | COSMETIC | M3a | G4 | open* |
| R4 (panel slot) | One panel slot, needed by leaderboard and calculator | PROCESS | M3a | G4 | open |
| F-06, U-02 (buttons) | P2. Phone search bar covers the zoom buttons on every width; they cannot be tapped (pinch still works) | SERIOUS | M3b | Beta | open (`page.tsx:722`, `left-3 right-3`) |
| F-06 (readout) | P2. Zoom readout hidden under the search bar and nav control | COSMETIC | M3b | Beta | open* |
| F-07 | P2. Inactive chips and legend note below AA | COSMETIC | M3b | Beta | open* |
| F-19 | P2. Timeline: 23 px buttons, readout does not say province-wide, phone legend under the panel | COSMETIC | M3b | Beta | open* |
| U-21, R1-08 | P2. Shared links drop the timeline year and class filters | SERIOUS | VIEWSTATE (decision V) | G5 | open (`useMapState.ts`, `useLayerState.ts:67`: no year or filter param, two parsers) |
| F-09, pF-07, U-18 | P1. Share card and meta say "17 data layers", "species at risk", "Fish streams", "real-time" | SERIOUS | M2 | G3 | open (`opengraph-image.png`, alt txt, `layout.tsx:24-37`, `map/layout.tsx:6`) |
| F-10, U-14 | P1. Discover "1,131 hectares" has no derivation; 96 m and 2.6M ha uncited | SERIOUS | M2 (derivation; NUM registers it) | G3 | open (`hotspots.ts:27`, `:32`, `registry.ts:546`) |
| F-20, U-08 | P1. Popup says "Old Growth", "Mature Second Growth" against the legend; species codes | SERIOUS | M2 | G3 | open (`forest-age.ts:57-62`) |
| U-07 (null, clip) | P1. Cutblock popup prints literal "null" and clips off a phone at the edge | SERIOUS | M2 | G3 | open (`MapPopup.tsx:97`, `anchor="bottom"`) |
| U-07 (company), U-15 (popup) | P1. Cutblock popup says company "Other" on 31 of 32 features; Other holds 43-99.7% of area | SERIOUS | B′ (ruling H; nothing earlier touches it) | Beta | open (`MapPopup.tsx:100`, data) |
| F-11, U-13 | P2. Old-growth caveat absent on Old Growth + Parks; descriptions hover-only, phones cannot see them | SERIOUS | M2 | G3 | open (`registry.ts:119` has the only note) |
| U-19 (attribution) | P2. Attribution credits VRI when none is shown, and no BC dataset at data zooms | SERIOUS | M2 | G3 | open (PMTiles source at `DataLayer.tsx:252` sets no attribution) |
| F-23 | P2. /map has no name, data date or way out | COSMETIC | M2 | G3 | open* |
| F-01, U-01 | P1. First visit is an empty dark map (Lee's 06-02 commit; ruling F moves it to Overview) | COSMETIC | M2 | G3 | open (no `DEFAULT_PRESET_ID`; ruling F not yet in DECISIONS) |
| F-15 | P1. Protanopia: old growth against harvested about 7 | COSMETIC | MAPFIX (rasters, Canopy), C′ (vectors) | G3, Beta | open* |
| pF-17 | P2. Story separates logged from forest by hue alone | COSMETIC | S1-lite (Canopy) | G3 | open* |
| pF-20 | P1. Dollar bar prices the whole stock as avoided emissions ($570M vs $89M); accepted until K.4, must go before the label | SERIOUS | K.4 | G5 | open (`calculator.ts:236-242`) |
| pF-06 | P1. "Unknown age" row unreachable: proxy drops every unaged stand, so the 09-02 ruling is untrue live | SERIOUS | K.4 | G5 | open (`wfs-proxy.ts:325-331` returns null) |
| SPD-08, U-20 | P2. Coastal selections ~200 km² time out; 5xx cached; "Click map" on touch | SERIOUS | K.4 | G5 | open* |
| U-17, R3-04 | P2. PDF: dead methodology pointer behind a "~20%" figure, no view link, no data date | SERIOUS | K.4 | G5 | open (`pdf-generator.ts:287`) |
| U-17 (popup blocked) | P2. PDF export silently does nothing when pop-ups are blocked | SERIOUS | K.4 | G5 | open (`pdf-generator.ts:302`) |
| pF-21 | P2. Phone PDF prints four pages, map sliced | COSMETIC | K.4 | G5 | open* |
| U-16 | P2. Touch draw has no instruction; result hides the selection | COSMETIC | K.4 | G5 | open* |
| pF-09 | P2. "Sponsor on GitHub" lands on a profile with no sponsor option | SERIOUS | S2-pages | G4 | open (`CtaSection.tsx:90`; Lee's check 2 confirms) |
| pF-10 | P2. /privacy "Last updated June 2026" though the policy changed 09-02 | SERIOUS | S0a | G1 | open (`privacy/page.tsx:21`) |
| pF-08 | P2. 404 is Next's default white page | COSMETIC | S2-pages | G4 | open (no `not-found` under `src/app`) |
| pF-15 | P2. "5.8 million hectares" invisible until hydration, forever without JS | COSMETIC | none under L = film; see Unowned | — | open (`globals.css:243-248`) |
| SPD-02, SPD-07 | P1. Landing pulls about 17 MB before a scroll; MapLibre in the hero bundle | COSMETIC [bar c] | S1′ (weight budget under 2 MB) | G4 | open (`HeroSection.tsx:43-45`) |
| pF-11 | P1. Phone: caption on screen at 7 of 30 stops, after its animation | COSMETIC | S1′ (captions in sync; scroll retired) | G4 | open* |
| pF-22 | P2. Reduced motion keeps full scroll for five pictures | COSMETIC | S1′ (a11y contract) | G4 | open* |
| pF-23 | P2. Counter and nav below AA over the red | COSMETIC | S1′ (scroll retired) | G4 | open* |
| pF-25 | P2. Closing number set as a caption | COSMETIC | S1′ (scroll retired) | G4 | open* |
| SPD-09 | P2. Palette PNGs cut overlays from 10 MB to 3.4 MB | COSMETIC [bar c] | S1-lite | G3 | open* |
| SPD-05 | P1. Tiles on r2.dev: HTTP/1.1, no caching, 15 MB re-download, 27 KB error pages | COSMETIC [bar c] | Parking Lot (ruling G, held); line owed by Phase 0.4, not yet in ROADMAP | — | open* |
| SPD-06, P3-0822 | P1. One archive for all layers; z7 Logging tile is 12.5% cutblocks | COSMETIC [bar c] | T-pre | G4 | open (`registry.ts:10`, v10) |
| U-15 (leaderboard) | P1. Leaderboard topped by "Other" if shipped without tenure attribution; not public today | PROCESS | B′ | Beta | open |
| R6 | Class filters become attribute filters | PROCESS | B′ | Beta | open |
| R7, R2-02 | WFS client race and GeoJSON path before the FOM layer; non-public today | PROCESS | D′ | Beta | open (`wfs-client.ts:137-143`) |

### P3 and scoreboard items (not required by the bar's source list; carried so nothing vanishes)

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| F6-scan07 | Deep-link latitude not range-checked | COSMETIC | M1b | G2 | open (`useMapState.ts:68`) |
| F-22 | Phone attribution sprawl, one-colour swatch, 5 px overflow | COSMETIC | M3b | Beta | open* |
| U-12 | Geolocate lands at street zoom | COSMETIC | M3b | Beta | open* |
| U-20 (labels) | "Click map" on touch; 0.1 ha precision on 318,000 ha | COSMETIC | K.4 | G5 | open* |
| SPD-10 | Hero image has no `srcset`, 584 KB | COSMETIC [bar c] | none under L = film; see Unowned | — | open (no srcset in `components/story`) |
| SPD-11 | Literata optical axis doubles the font; preloaded on /map | COSMETIC | S2-pages | G4 | open (`layout.tsx:7`) |
| SPD-12 | `/raster`, `/images` at `max-age=0` | COSMETIC [bar c] | S2-pages | G4 | open (no rule in `netlify.toml`) |
| SPD-13 | `@turf/intersect` in the main path | COSMETIC | K.4 | G5 | open (`carbon/clip.ts:1`) |
| SPD-14, R3-13 | Empty-tile 404s, binary manifest undeployed | COSMETIC | rest of T | Beta | open* |
| U-22 | Five identical "Explore" names | COSMETIC | S2-pages | G4 | open (`HotSpotPanel.tsx:53`) |
| pF-18 | P3 copy and hygiene batch, incl. Ko-fi URL and the 2023 fire figure (not printed today) | COSMETIC | S2-pages | G4 | open* |
| pF-18 (hero) | Guard the hero's Nova Scotia comparison; true today (5,888,477 ha against 5,528,400) | PROCESS | S1-lite, NUM | G3, G2-Gate | open (`HeroSection.tsx:125`) |
| SYN verdict 3 | First data tile 37-42 s on Slow 4G | COSMETIC [bar c] | SPEED (guard), M1b, T-pre | G2, G4 | open* |
| Scoreboard, lockstep | Play-to-2025 lockstep never checked by any lane | PROCESS | M1a (timeline guard) | G1 | open |
| Scoreboard, CSP | CSP still report-only | COSMETIC | Parking Lot (Held) | — | open (`netlify.toml:40`) |
| Scoreboard, priority | Conservation priority ungated from z0, 14-27% of low-zoom tiles | COSMETIC [bar c] | T-pre | G4 | open* |
| F-12, Lee's check 1 | /map uses `h-screen`; bottom bar may sit under iOS Safari's toolbar. Dropped by the skeptic as unreproducible on Chromium | PROCESS | MATRIX (WebKit), Lee's phone look; no owner for a fix if it reproduces | Gate | unverified (`page.tsx:693`) |

## Source 2: superseded 2026-09-20 relay plan

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| R0.1 | Primary checkout onto main | PROCESS | Phase 0.1 | G0 | fixed (`~/Projects/opencanopy` on main at 120cc10) |
| R0.2 | PDF methodology pointer | SERIOUS | K.4 (K.3 absorbs) | G5 | open (`pdf-generator.ts:287`) |
| R0.3 | `audit:live` asserts two non-public layers, fails by construction | PROCESS | M1a | G1 | done 2026-11-11 by brief item 4 (relay small-routed-fixes): `:187` retargeted to cutblocks, `:243` replaced by a direct proxy request |
| R0.4 | wfs-client finally-block race; non-public path only | COSMETIC | D′ | Beta | open (`wfs-client.ts:137-143`) |
| R0.5 | Back/Forward (P9) | SERIOUS | M1b | G2 | open (`useMapState.ts:237`, `:300`) |
| R0.6 | Plans onto main, ROADMAP citations reworded | PROCESS | none; see Unowned | — | open (phase-c, d, e plans only on `relay/phase-b-harvest`) |
| R0.7 | Handoff bookkeeping | PROCESS | each relay's close | — | open |
| R1.1 | Timeline ticks dropped (R1-02) | SERIOUS | M1a | G1 | open (`page.tsx:326`) |
| R1.2 | Stale status clear (R1-03) | COSMETIC | M1b | G2 | open (`DataLayer.tsx:1144`) |
| R1.2 (R1-16) | `loadData` invoked twice on a visibility change | COSMETIC | none; see Unowned | — | open* |
| R1.3 | PmtilesLayers stale closure (R1-05) | SERIOUS | M1a | G1 | open |
| R1.4 | Mock records global-state calls (R4-16) | PROCESS | M1a | G1 | open (`mocks/maplibre.ts:252`) |
| R1.5 | Rendered PmtilesLayers tests (R1-13) | PROCESS | M1a | G1 | open (no such file in `src/test/pipeline`) |
| R2.1-R2.2 | Rebase Phase B; leaderboard uses the map's cap definition | PROCESS | B′ | Beta | open (branch 12 ahead, 67 behind main) |
| R2.3 | Regenerate leaderboard at the primary | PROCESS | B′ | Beta | open |
| R2.4 | `#company=` round-trip; delete `tenure-cutblocks` | PROCESS | B′ | Beta | open |
| R2.5-R2.6 | Re-gates, docs | PROCESS | B′ | Beta | open |
| R3.1 | `zRank` on LayerDefinition, monotone insertion audit | COSMETIC | none; see Unowned | — | open (no `zRank` in `registry.ts`) |
| R3.2 | Old-growth outline (T1) | COSMETIC | C′ | Beta | open* |
| R3.3 | Cutblock edge and recency (C1, C2; PR1 follows) | SERIOUS | C′ | Beta | open*; see Source 3 |
| R3.4 | Fire opacity by year (H1, H2) | COSMETIC | C′ | Beta | open* |
| R3.5 | Priority hue (CP1) | COSMETIC | C′ | Beta | open* |
| R3.6 | Parks as an edge when stacked (K1) | SERIOUS | M1b (z≤9 order), C′ (edge) | G2, Beta | open*; see Source 3 |
| R3.7 | Satellite range and dim (S1, P5). Range half withdrawn: satellite renders at z7 | COSMETIC | C′ | Beta | open* |
| R3.8 | z5 "zoom in" chip (P4, D2). Withdrawn by the synthesis: it would hide data that renders. Real fix is M1a | SERIOUS | M1a | G1 | open (fix withdrawn, defect stands) |
| R3.9 | Legend and audit tests follow paint | PROCESS | C′ | Beta | open |
| R4.1 | Scheduled `audit:live` with alerting | PROCESS | none (OPS covers uptime only); Parking Lot P3 lists it; see Unowned | — | open (no `live-monitor.yml`) |
| R4.2 | Error reporting (bar e) | PROCESS | OPS | G1 | open (`MapErrorBoundary.tsx:25` console only) |
| R4.3 | Branch protection on main (D4) | PROCESS | none; see Unowned | — | open |
| R4.4 | CSP report endpoint (D5) | PROCESS | none; see Unowned | — | open (`netlify.toml:40` no `report-to`) |
| R4.5 | `/production` re-audit to grade B | PROCESS | none; see Unowned | — | open |
| R5a | FOM proposed-logging layer | PROCESS | D′ | Beta | open (feature) |
| R5b | Per-preset share cards (D6) | PROCESS | none; see Unowned | — | open (feature) |
| R5c | Embed mode (D7) | PROCESS | none; see Unowned | — | open (feature) |
| R5d (vintage) | Data vintage on the map | COSMETIC | M2 | G3 | open (none in `MapLegend.tsx`) |
| R5d (citation) | "Copy citation" | PROCESS | none; see Unowned | — | open (feature) |
| R5e | Re-verify and surface hidden layers (D8) | PROCESS | none; see Unowned. Q1 ruling keeps them hidden meanwhile | — | open (feature) |
| Not this week: report card | Watershed report card, goal (2) | PROCESS | W | Beta | open (no plan yet; grill owed) |
| Not this week: FOM watch | FOM watch persona | PROCESS | Parking Lot (charter phase 6) | — | open |
| Not this week: Batch 4 | Tile rebuild: holes, per-layer, dissolve, raster | SERIOUS | T-pre, MAPFIX, rest of T | G3, G4, Beta | open*; see Source 3 |
| LT1 | Primary onto main | PROCESS | Phase 0.1 | G0 | fixed |
| LT2 | `npm i -D @mapbox/vector-tile pbf @types/geojson` | PROCESS | CI (Lee's terminal) | G0 | open (absent from `package.json`) |
| LT3 | Deploy the `ocbin://` tile manifest | COSMETIC | rest of T | Beta | open* |
| LT4 | R2 `Cache-Control` metadata sweep on versioned tile dirs | COSMETIC [bar c] | none; see Unowned | — | open* |
| LT5 | One real `audit:live` after the fix | PROCESS | M1a | G1 | open |
| LT6 | Webhook secret, `workflow_dispatch`, branch protection | PROCESS | OPS (alert test); branch protection unowned | G1 | open |
| LT7 | Live-QA lists | PROCESS | MATRIX, Lee's phone look | Gate | open |
| LT8 | Four preset screenshots (D6) | PROCESS | with R5b; unowned | — | open |

## Pending decisions from the 2026-09-20 plan (for Lee)

These are the plan's own questions; none is recorded in DECISIONS as answered in these words. "Where it stands" is how later rulings bear on each. Each still needs the seven-part shape before it goes to him.

| ID | Question | Where it stands | Blocks |
|---|---|---|---|
| D1 | Does the accountability view ship by rebasing the reviewed branch, or get rebuilt? | Practically answered: B′ is a rebase, and ruling H adds tenure attribution first. Needs only his nod; branch is now 67 behind, not 39 | B′ |
| D3 | When the live site crashes, who is told and through what: Sentry or a same-origin function? | Overtaken: 2026-10-23 made tool choice the session's, on free tiers (OPS, under C6). Note the 2026-09-02 same-origin ruling covers the tracker, and a third-party tool must be named on /privacy | OPS |
| D4 | Should `main` refuse merges that have not passed CI? | Open. Nothing in the program owns it. A session hotfix would wait out the CI run | nothing today |
| D5 | Report CSP violations now and enforce later on his say? | Open. CSP sits in the Parking Lot as report-only | CSP enforce flip |
| D6 | Four preset share links with their own preview images? | Open. No relay. Needs four screenshots from him | R5b |
| D7 | Build the embeddable map now, or after the first journalist asks? | Open. No relay. Beta outreach is a journalist note, so the timing is live | R5c |
| D8 | Surface the eleven hidden layers first, or add caribou and friends from the catalogue? | Open. The 08-26 Q1 rule ("Keep hidden. Verify layer-by-layer") binds until then; hide-don't-block leaves them out of the beta | R5e |

D2 (z5 treatment) was not on the list: the synthesis withdrew its recommended option, and M1a's fix replaces the question. D9 was a slot, not a decision.

## Source 3: 08-22 visual audit, findings not closed

The checklist's status column is stale (the synthesis says so). Rows below use the synthesis's fresh measurement and the tree. Excluded as closed by the checklist itself: F4 (wontfix). C4, H3, K3, CP3, S3 are pointers to P4, T3, P5.

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| P1 | Deep-link camera dropped. Checklist says shipped; never worked on cold loads | SERIOUS | M1a | G1 | open (regressed; beebeb6 and b65abb3 poll the empty handle) |
| P2 | Vectors attach after 14-40 s; real cause is the `load` gate on opacity-0 rasters | COSMETIC [bar c] | M1a (gate), M1b (rasters) | G1, G2 | open* |
| P3 | One PMTiles archive for 12 layers; 26.5 MB per z7 view | COSMETIC [bar c] | T-pre | G4 | open (`registry.ts:10`) |
| P4 | Nothing at province z5; real cause is F-16. August's `[6,18]` fix withdrawn | SERIOUS | M1a | G1 | open |
| P5 | Satellite "gated at z10+": withdrawn; renders at z7, blank where `load` missed | COSMETIC | M1a (blank), C′ (dim) | G1, Beta | open* |
| P6 | 11 hidden layers | PROCESS | Lee's ruling 08-26 Q1 ("Keep hidden") | — | closed (ruling) |
| P7 | Preset active state | COSMETIC | Batch 1 | — | fixed 585dd0b (`PresetChips.tsx:41`) |
| P8 | `preset=` alone restores nothing | SERIOUS | Batch 0 | — | fixed beebeb6 (confirmed by two audit lanes) |
| P9 | Back/Forward | SERIOUS | M1b | G2 | open |
| F1 | Collapsed chip dots; young and harvested near-equal | COSMETIC | MAPFIX (raster Canopy), C′ | G3, Beta | open* |
| F2 | Old-growth 60-70% of pixels against 0.3%: Forest Age legend fixed; popup, layer legend still say Old Growth | SERIOUS | M2 | G3 | partly fixed 585dd0b; rest open |
| F3 | E&N private land (~800k ha), alpine and towns all one grey: no-data reads as no-forest | SERIOUS | rest of T | Beta | open* |
| T1 | Gold lattice at z10+. Audit: blocker | COSMETIC | C′ | Beta | open* |
| T2 | Big-tree subset layer (rename done) | COSMETIC | rest of T | Beta | copy fixed 585dd0b; data open |
| T3 | Empty interior reads as broken | SERIOUS | M3a | G4 | open (= F-14) |
| C1 | Outlines coalesce at z7-9: same ground reads "everything logged" at z9, "barely anything" at z11 (33.0 / 24.2 / 4.0% coverage) | SERIOUS | C′ | Beta | open* |
| C2 | Cutblocks red on harvested red, ΔE about 6: cutblocks disappear in Logging and Fire + Logging | SERIOUS | C′; re-score after M1b, MAPFIX | Beta | open* |
| C3 | 2-6 km tenure rectangles pass the filter, read as a 30 km² clearcut. The 500 ha fix contradicts the 09-02 ruling; S1-lite's cap fix catches only nine polygons | SERIOUS | C′, with amendment; Parking Lot line owed by Phase 0.4 | Beta | open* |
| H1 | 1917 and 2023 fires one flat amber | COSMETIC | C′ | Beta | open* |
| H2 | Fire, priority and old-growth outline in one colour lane | COSMETIC | C′ | Beta | open* |
| K1 | Parks vanish under forest age: enabled layer not visible | SERIOUS | M1b (z≤9 cause), C′ (edge at z10+) | G2, Beta | open* |
| K2 | Parks swatch | COSMETIC | Batch 1 | — | fixed 585dd0b |
| CP1 | Gold means three things | COSMETIC | C′ | Beta | open* |
| CP2 | Layer id renames | COSMETIC | Batch 1 | — | fixed 585dd0b |
| S1 | z9 to z11 jump to daylight imagery | COSMETIC | C′ | Beta | open* |
| S2 | Satellite as a legend row, not a base-map switch (partly fixed) | COSMETIC | none; see Unowned | — | partly fixed 585dd0b |
| PR1 | Logging preset pixel-identical to forest age at nine views; most cause is raster order | SERIOUS | M1b, MAPFIX, then C′ | G2, G3, Beta | open* |
| PR2 | Threats shows the past: renamed Logging; forward-looking half is the FOM layer | COSMETIC | Batch 1 (rename), D′ | Beta | rename fixed 585dd0b; rest open |
| PR3 | Fire + Logging: four colours collapse to one orange-red; fire hidden at z≤9 | SERIOUS | MAPFIX (order), C′ (vector colour) | G3, Beta | open* |
| PR4 | Old Growth + Parks: renamed; still gold-dominant, parks faintest | COSMETIC | C′ | Beta | rename fixed 585dd0b; rest open* |
| PR5 | Overview | COSMETIC | Batch 1 | — | fixed 585dd0b |
| CH1 | Legend truncation | COSMETIC | Batch 1 | — | fixed 585dd0b |
| CH2 | Attribution contrast | COSMETIC | Batch 1 | — | fixed 585dd0b (13.1:1 measured) |
| CH3 | Badge label | COSMETIC | Batch 1 | — | fixed 585dd0b |
| X1 | Mobile pass owed | PROCESS | done by the 10-02 audit; findings above | — | closed |
| X2 | Interaction pass owed | PROCESS | done by the 10-02 audit; findings above | — | closed |
| X3 | Non-public layers pass | PROCESS | with R5e; unowned | — | closed for beta (Q1 ruling) |
| X4 | Light base styles | COSMETIC | — | — | closed (passes, 10-02) |

## Source 4: handoff "Owed right now", defect items

Process items in that list (local checkout, Lee's phone checks, agent checks, GPU driver, dot layer and spike queue, path-to-beta next steps) are excluded as instructed; the agent checks fold into MATRIX. The IDs are the handoff's own where it has them, otherwise its item name.

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| R1-02 | Timeline ticks dropped behind `isStyleLoaded()` | SERIOUS | M1a | G1 | open (`page.tsx:326`) |
| R1-03 | Stale-status clear below the early return | COSMETIC | M1b | G2 | open (`DataLayer.tsx:1144`, `:1151`; handoff's `:1143` moved one line) |
| R1-05 | PmtilesLayers stale-closure visibility | SERIOUS | M1a | G1 | open |
| Small: PDF footer | "see methodology at opencanopy.ca" points at no route | SERIOUS | K.4 | G5 | open (`pdf-generator.ts:287`) |
| Small: `audit:live` | Asserts tenure-cutblocks and fish-streams, both non-public; two tests fail by construction | PROCESS | M1a | G1 | open (`live-health.spec.ts:187`, `:243`) |
| Small: wfs-client | Finally-block bookkeeping race; non-public layers only until D′ | COSMETIC | D′ | Beta | open (`wfs-client.ts:137-143`) |
| Small: dev deps | `@mapbox/vector-tile`, `pbf`, `@types/geojson` transitive only | PROCESS | CI (Lee's terminal) | G0 | open (`package.json`; the 10-23 CI spec omits `@types/geojson`) |
| Ending v2 bug | Binary-reveal opacity write dropped if the style is not loaded, never retried. The effect is on main, not only the docked branch; a reveal at 0 is missing data | SERIOUS | S0b (ends the fade-in), S1′ (replaces it) | G2, G4 | open (`StoryMap.tsx:152`; re-runs only when opacity or `mapLoaded` changes, so scrolling usually heals it) |
| Ending v3 | Render spec treats ocean-tile 404s as fatal; `encode-dolly.sh` exits 141 | COSMETIC | none needed: docked branches only (ruling) | — | open, docked |
| Merge (1) | 2,000 ha cap reads the attribute, not the shape: nine polygons, 82,920 ha; 1991-2003 up to 15% high | SERIOUS | S1-lite | G3 | open (`build-scrub-tables.py:65`; `total` 5,888,477) |
| Merge (2) | Scrub total sums overlapping blocks, +1.7% in 2025 | SERIOUS | S1-lite | G3 | open (no dissolve in `build-scrub-tables.py`) |
| Merge (3) | `/raster/*` served `max-age=0` | COSMETIC [bar c] | S2-pages (C1 versioned paths) | G4 | open (`netlify.toml`) |
| Spike: jitter | Film clock gated every frame; camera stop-started | COSMETIC | X | G3 | fixed on the spike (10-11 log: holds 38% to 0%), awaiting Lee's phone check |
| Spike: two measures | Hero's 5.8M (FTEN since 1950) against film's 10M (splice since 1900) must share one measure | SERIOUS | MERGE | G4 | open (not live: film unreleased) |
| Spike: MapLibre | Spike still on MapLibre 5 | PROCESS | X | G3 | open (see Source 5) |
| Palette (1) | z4-9 forest-age rasters overstate logging about 1.7x | SERIOUS | MAPFIX | G3 | open*; see Source 5 |
| Palette (2) | Those rasters draw above fire and cutblocks; fire invisible at z≤9 | SERIOUS | MAPFIX | G3 | open*; see Source 5 |
| Palette (3) | Intro hand-off jump: land fades below z8.8, forest age 0.82 to 0.64 | COSMETIC | S1′ | G4 | open (spike only) |

## Source 5: MapLibre 6 follow-through and z4-9 rasters

MapLibre 6.15 is live (2ba3280, 120cc10). Nobody has looked at the three v6 items; the 10-22 ship note records only a basemap render and PMTiles 206s. They are risks, not measured defects, and ML6-a and ML6-c stay SERIOUS until seen because a miss would break popups or data.

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| ML6-a | Popups under v6's overscale default of 4: tiles stop at z12 (`registry.ts:12`), layers run to z18, so hit-testing above z12 changed underneath `interactiveLayerIds` | SERIOUS | M1b | G2 | unverified (no overscale setting anywhere in `src`) |
| ML6-b | Overlapping semi-transparent lines render differently in v6; may move C1's coverage figures | COSMETIC | M1b | G2 | unverified (`style.outline` path, `DataLayer.tsx:300-318`) |
| ML6-c | Data overlays at zoom: the ship note says overlays were "not visibly distinct" at default zoom | SERIOUS | M1b | G2 | unverified |
| ML6-d | Spike port: merge main, namespace imports, re-verify dot source, warm-up map, film clock | PROCESS | X | G3 | open |
| RAST-1 | z4-9 rasters overstate logging about 1.7x (49.5% of painted pixels at z6 against 28.6% at z9); recoloured-capture measurement, re-verify first | SERIOUS | MAPFIX | G3 | open (`build-raster-tiles.py:246`, `all_touched=True` default) |
| RAST-2 | Rasters above fire and cutblocks. By reading, `getFirstSymbolId` (`layer-utils.ts:1-5`) places them just under labels, so M1b's guard removal fixes labels only; data order then depends on add timing. MAPFIX has to pin it with a test | SERIOUS | MAPFIX | G3 | open (`DataLayer.tsx:1089-1096`) |
| RAST-3 | Rasters above place names; the 07-09 fix never took effect | SERIOUS | M1b | G2 | open (`DataLayer.tsx:1091`) |
| RAST-4 | 160 raster 404s per desktop view, 90 out of archive bounds | COSMETIC [bar c] | M1b | G2 | open (no `bounds` on raster sources, `DataLayer.tsx:1312-1318`) |
| RAST-5 | Canopy palette on /map rasters | COSMETIC | MAPFIX | G3 | open (ruled 10-11, unapplied) |
| RAST-6 | Canopy's vector tokens (ash fire, scarlet edges, edge-only parks): MAPFIX's spec names the rebuild, so these fall to C′ | COSMETIC | C′; see Serious but deferred for the proposed pull-forward | Beta | open |
| Z10-HOLES | z10+ straight-line holes in forest age and parks (55 km seam at Vancouver Island z11): missing data | SERIOUS | T-pre | G4 | open* |

## Program-carried exposures (the plan says this index tracks them)

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| C6-client | Tracker sends full URLs, map hash included, in `pageUrl`, `referrer`, `cta_click`, `nav_click`, `outbound_click`, while /privacy says no "precise location" is collected: a false statement | SERIOUS | S0a | G1 | open (`tracker.js:54`, `:56`, `:140`, `:150`, `:180`; `privacy/page.tsx:55`). `email_click` fixed 5c7377f (the handoff and resequence cite 16dc5e9, the push head, which is docs) |
| C6-stored | Receiver side and existing records; C6 stays open until SO1's verification artifact exists | PROCESS | SO1 (`ssc-ops` repo) | — | open |
| S0b sunset | Coarse overlays stay disclosed on screen until S1-lite is live or the 21-day sunset fires | PROCESS | S0b, S1-lite | G2, G3 | not started |
| Next, MapLibre | Next 16.4.2, MapLibre 6.15.0 (security) | PROCESS | outside the program | — | fixed bc230f5, 2ba3280, 120cc10 |
| CI | `npm audit --audit-level=high` red, so Lint never runs | PROCESS | CI | G0 | open (`ci.yml:38-41`) |

## Source 6: fidelity baseline, 2026-11-01 (`research/beta-gate/fidelity-baseline-2026-11-01.md`)

| ID | Finding | Class | Owner relay | Wave | Status |
|---|---|---|---|---|---|
| FB-1 | tenure-cutblocks: 772 of 4,511 features (17.1%) miss a required property; may show as missing popup data | SERIOUS until diagnosed | PIPE (diagnose); M2 (popups) | G3-G5 | open |
| FB-2 | CrossSource lite: 11 of 17 checked tiles conflict | SERIOUS until diagnosed | PIPE | G5 | open |
| FB-3 | Precision: 15 layer-zoom pairs over the ±10% area tolerance, up to 4,366% on mining claims | SERIOUS until diagnosed | PIPE | G5 | open |
| FB-4 | Spatial: fire-history and mining-claims water overlap at two grid points (2 of 84, 1 of 97) | COSMETIC unless it shows on the map | PIPE | G5 | open |
| FB-6 | F4: forest age found 15/20 near WFS seams against 98% interior: possible loss along seams | SERIOUS until diagnosed | PIPE | G5 | open |
| FB-7 | A7: null `DISTURBANCE_START_DATE` in 2 of 20 sampled cutblocks; these fall outside the timeline (Ruling B subject) | SERIOUS until diagnosed | S1-lite (status check), M2 | G3 | open |
| FB-5 | The suite's own defects: empty runs pass, a swallowed parse error, the gate failing open in `audit-all.ts`, hardwired paths, no prior archive | PROCESS | PIPE (pbf reader fix in CI) | G0, G5 | open |

## Orchestrator assignments, 2026-11-01 (supersedes the proposals above; Lee shown, no objection)

- F-06, U-02 (phone zoom buttons): M3a.
- U-07, U-15 (company "Other"): M2 labels it "Not attributed" until B′.
- F3 (E&N private land): M2's legend line; the mask stays in the rest of T.
- C1, C2/PR1, K1, PR3: a small colour relay (C′-lite) using Canopy's tokens, sized after M1b's re-measure, G3-G4.
- C3 (tenure rectangles): the attribute check runs first, legend note meanwhile (Lee, 2026-11-01).
- pF-16 (phone story shows 58% of BC's forest): S1′.
