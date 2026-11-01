# Skeptic verification: usability-refactor findings

Verifier: skeptic subagent, 2026-10-01. Own headless Chromium via Playwright scripts, production opencanopy.ca, fresh context per shot.
Evidence dir: verify/usability-refactor-evidence/
Repo: /home/leesalo/.local/share/marvin/worktrees/opencanopy/session-f8d7c3 @ 3db5823 (read-only)

Findings under test: U-05, U-11, P1-0822, U-01, U-03, U-04, U-07, U-09, U-10, U-21, U-15, P2-0822

## Verdicts (appended as reached)

### U-03 Bug-report flag over the preset bar -- PARTIALLY CONFIRMED, P1 -> P2
Method: scripts/hitprobe.mjs, fresh context per width, real `touchscreen.tap` at chip centre with a capture-phase recorder on `a[aria-label="Report a bug"]` (data/hitprobe.jsonl, shots/hit-*.png).
- 360x780: flag rect x309-353 y689-733; "Old Growth + Parks" chip x229-388 y697-741, centre (309,719). Real tap at centre fired the bug link (bugLinkActivated=true), chip stayed aria-pressed=false. Reproduced.
- 375 / 390 / 412: centre hits the chip itself, but the flag still sits over the right ~17-33% of the right-most visible chip (412: flag x361-405 over chip x229-388).
- Code: page.tsx bottom bar `absolute bottom-8 left-3 right-3` vs flag `fixed bottom-14 right-3 w-11 h-11`, both z-10, flag later in DOM so it wins. `pr-14` only pads scroll-end.
Why not P1: the overlap is visible (the flag is drawn on top of the chip), the uncovered two-thirds of the chip works, nothing is lost (a mail compose opens and is dismissed), and only 360 px puts the geometric centre under the flag. Real defect, cheap fix, P2.

### U-04 Actions off-screen in an unmarked horizontal scroll row -- PARTIALLY CONFIRMED, P1 -> P2
Same probe. At 360/375/390/412 the bar is scrollWidth 911 vs clientWidth 334-386; Fire + Logging, Select, Visible area, Watershed and Copy link (5 of 8 controls, Timeline absent on a fresh load) start at x>=396, i.e. off-screen at every phone width; computed mask-image none, scrollbar-width none. The code comment at page.tsx (bottom bar) states the overflow is intentional ("scrolls horizontally").
Why not P1: everything is reachable by a swipe, and the right-most chip is cut mid-label at every width, which is itself the conventional "more this way" cue. Discoverability of Copy link/Watershed on phones is a genuine usability cost; no function is broken. P2.

### U-05 Search / share hash / hot-spot / deep-link camera no-op on cold loads -- CONFIRMED, P0 stands
Method: scripts/camprobe.mjs (data/camprobe.jsonl, camprobe-batch*.log, shots/deeplink-*, search-*, cta-*). No popstate, no injected handle. Signals: ScaleControl text (authoritative), MapReadout, location.hash.
- Search, cold /map, 20 s settle, first search "Port Alberni" -> result clicked: camera unmoved (scale "100 km", z5) and hash empty in 4/4 (desktop r0,r1; phone r2,r3). Then ONE page-only re-render (open the layer panel, Escape) and a second search flew to z12 in 4/4.
- Pan after the failed search: hash stayed empty 4/4, and stayed empty even after the re-render + successful second search (the moveend effect in useMapState.ts:196-233 only re-subscribes when enabledLayers/activePreset change).
- Mechanism proof (deep link, desktop r0/r1, phone r1): camera held at z5 / "100 km" for 40 s, then landed on z12 within 3 s of the page-only re-render. The poller was alive and waiting on a null ref the whole time.
- Code: CanopyMap.tsx:68 `useImperativeHandle(ref, () => mapRef.current!)` runs only when CanopyMap commits; @vis.gl/react-maplibre 8.1.0 map.js creates the map in a promise and calls setMapInstance, which re-renders only the inner _Map. Every page-level `mapRef.current` read (search, hot spots, deep-link poll, hash sync, share URL, bug-report body, export canvas) depends on some later page re-render happening to occur.
Severity: kept at P0. Search is the primary navigation control and is dead on a cold load until the visitor happens to touch page state; the address bar never tracks the camera. It heals on any preset tap, which is why it hides from casual testing.

### P1-0822 Batch 0 deep-link fix does not hold -- CONFIRMED (same root cause as U-05; count once)
- Cold deep link #lat=48.65&lng=-124.45&z=12 (40 s, no input): dropped 3/7 (desktop 2/4, phone 1/3); every drop landed within 3 s of a page-only re-render.
- Landing CTA (real click on the plain <a> "Explore the Map", href /map#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age): camera dropped 4/5 (phone 2/3, desktop 2/2), scale "100 km" at 49 s.
- src/test/lib/deeplink-hydration.test.ts builds a stub whose `attach()` sets `ref.current = handle` by hand, so it exercises the poll but never the forwardRef chain that fails in production. Confirmed hollow for this bug.
The 08-22 audit row says "shipped (Batch 0)"; on production it is not fixed. Severity follows U-05 (P0); it is one defect with U-05, not two.

### U-01 /map opens with zero layers -- PARTIALLY CONFIRMED (facts true, deliberate choice), P1 -> P2
Method: scripts/layerprobe.mjs firstload (data/layerprobe.jsonl, shots/firstload-phone-r0-25s.png). Fresh context, /map no hash: all four chips aria-pressed=false, no legend, 0.000 colour fraction at 5/10/20/25 s, localStorage opencanopy-layers-v2 = "[]".
Not an accident: commit 48406d3 (Lee, 2026-06-02) "Disable Old Growth and Provincial Park by default" flipped the last two defaults to false and bumped the storage key. No DECISIONS.md entry, so it is not a standing ruling, but it is a product choice, not a regression. The landing CTA (the main funnel) carries layers=forest-age, and four labelled preset chips are visible on the empty map. The auditor's fix (Overview default) is a reasonable proposal for Lee, with one correction: the persisted "[]" means a changed default would not reach anyone who has already visited unless the storage key is bumped again (the 06-02 commit did exactly that). P2, framed as a decision for Lee.

### P2-0822 Invisible raster prefetch ahead of vector attach -- CONFIRMED still open, already tracked; P1 -> P2
- Zero layers enabled, phone 412: 96 raster requests (16 v3/forest-age, 32 v2/old-growth, 16 each v2 mature/young/harvested), all before the first PMTiles request. Desktop 1280x800: 254 raster requests, zero layers enabled. Code: DataLayer.tsx:1307-1351 mounts the five raster sources with raster-opacity 0 but layout visible, so MapLibre fetches them.
- It is already in ROADMAP "Known issues" and in research/map-visual-audit-2026-08-22.md row P2 (severity M, batch 3, open). Not new, not escalated by anything found today on its own; the 14-40 s attach was not reproduced unthrottled (PMTiles header at 2.4-4.5 s on phone).
- BUT see U-11 below: the PMTiles source is registered only inside a `load` handler, and on desktop I measured `load` never firing at all (5/5 cold desktop loads). That registration-on-`load` part of the auditor's fix ("register PMTiles source at style.load") is the important half; the prefetch half is a P2 bandwidth cost.

### U-11 Preset tapped before map `load` never renders until re-toggled -- CONFIRMED, P0 stands (and it is more common than the auditor says)
Method: scripts/layerprobe.mjs early/late, scripts/userflow.mjs, scripts/diag-load.mjs, scripts/diag-repaint.mjs (data/layerprobe.jsonl, userflow*.jsonl/log, diag-*.jsonl; shots/userflow-desktop-r0-w15-zoomed.png vs -after-retoggle.png).
- Early tap (1.8 s, right after canvas) at z11 Prince George: colour fraction 0.000 for 75 s, chip aria-pressed=true, legend lit; one off/on toggle -> 0.676 desktop / 0.568 phone. Reproduced on both.
- The window is not a narrow race on desktop. On every cold desktop load I ran with no early input (1280x800, 9/9: firstload, late r0/r1, diag-load, diag-repaint, userflow r0-r3; waits of 5 to 100 s), MapLibre's `load` event never fired by itself. Where read through the fiber: map.loaded() true, map._loaded false, no PMTiles source. In every case, no header request before the first input. Diagnosis: 130 of 346 tile responses are R2 404s for empty tiles; MapLibre's tile_manager handles a 404 by calling update() without firing a `data` event, so when the last tile to settle is a 404 no render frame follows and `load` (fired only at the end of _render) waits. One `map.triggerRepaint()` at 12 s fired `load` and requested the header within 40 ms (diag-repaint.jsonl). Phone 412 px fired `load` at 2.4-4.5 s (3/3).
- Consequence, measured as a real first visit (userflow.mjs): desktop /map, wait 5/15/30/45 s, tap "Logging", search "Prince George": z5 shows the raster overview (0.36), then at z12 colour 0.000 for 45 s with layer-forest-age-tiles-fill and layer-cutblocks-tiles-fill at visibility none, chip pressed and legend lit. 4/4 desktop runs. Off/on toggle -> 0.445. Phone 2/2 fine because `load` had already fired.
- Code: DataLayer.tsx:290/311/357 bake mount-time `visible` into addLayersToMap; deps at :445 exclude it; the visibility effect (:448-475) no-ops before the layers exist. A tap triggers the first repaint, `load` fires, and the layers are added with the stale `visible=false`.
So the normal desktop first visit (blank map per U-01, tap a preset, zoom in) ends on an empty map whose legend claims two layers. P0 is right. The auditor's fix (visibleRef, read inside addLayersToMap) is necessary; registering the PMTiles source at style.load rather than `load` (their U-09/P2-0822 step) is the second half, because `load` is not a dependable signal on this site.

### U-10 >15 s PMTiles header stall permanently kills all six vector layers -- CONFIRMED mechanism, P1 -> P2 on likelihood
Method: scripts/stallprobe.mjs (data/stallprobe.jsonl, stall-*.log, shots/stall-D17000-r0-*.png). Phone, deep link with layers, only the first .pmtiles request delayed.
- D=17 s: all six "[OpenCanopy] PMTiles source for <id> failed to load within 15s" at 18.1 s; header released 20.1 s; zero further PMTiles requests; colour 0.001 through 75 s; preset off/on still 0.000 at +20 s. Toast "Couldn't reach BC data" listing six layers when two were enabled, gone by 30 s; chip and legend stay lit. Reproduced exactly.
- D=8 s control: tiles requested at 11.1 s, colour 0.562 by 16 s.
- Likelihood, measured without interception: header round-trip 0.8 s at 1.6 Mbps/563 ms and about 4 s at 500 kbps/2000 ms RTT (request 39.2 s, next range read 43.3 s). Neither came near 15 s.
Impact is permanent until reload, so it is a real defect, but it needs a genuine stall of a 16 KB read beyond 15 s, which two throttle profiles did not produce. P2.

### U-09 Public layers never show Loading / No data / Zoom in -- CONFIRMED, P1 stands
- Code: all six public data layers are tile-backed (registry.ts PUBLIC_LAYER_IDS; each has tileSource). For them the only status writer is handlePmtilesError -> "error" (DataLayer.tsx:1104-1106); loadData returns early for tile-backed layers (:1144) before any loading/ok/empty/zoom write. LoadingBar (components/ui/LoadingBar.tsx) renders only for status "loading", so it can never appear for a public layer. MapLegend.tsx:232 shows a status badge only when a row is collapsed; rows start expanded.
- Measured (stallprobe natural throttle, no interception): 1.6 Mbps/563 ms -> blank at 15 s, coloured by 30 s; 500 kbps/2 s RTT -> blank (<=0.001) from 15 s to at least 60 s, coloured by 90 s. Every sample: no role=status or role=alert text, chip pressed, legend lit.
The "per-layer error/empty/zoom status states" shipped in the production-readiness push apply to WFS-only layers, and the public surface has none. CHARTER done-1 names "honest status states instead of silent blanks"; on the public map that is unmet. P1 holds.

Note on U-11 status: it is refresh finding R1-05, already routed in .claude/handoff.md "Owed right now" ("One relay for the three DataLayer public-path bugs before Batch 2"). Known and owed, not new. What is new today is the exposure: on desktop the window is open-ended, because `load` does not fire until something repaints.

### U-07 Cutblock popup: 'Other', literal 'null', unrounded area, off-screen -- CONFIRMED, P1 -> P2
Method: scripts/popupprobe.mjs (data/popupprobe.jsonl, shots/popup-phone-williams-click-*.png). Phone 412, z12.5 cutblocks, real taps on rendered cutblocks.
- Williams Lake view: 32 rendered features, 15 with DISTURBANCE_START_DATE === "null" (string), 31 company_id "other". Popup text "Company / Other / Disturbance Date / null / Planned Block Area (ha) / 4.3935"; dated blocks show "2020-12-18 ... 34.4483".
- Rect vs viewport: taps at x=60 gave x=-42..162; at x=380 gave 275..485 (viewport 412); a tap at y=120 put the top at -10. 5/5 edge taps overflowed. MapPopup.tsx:169 anchor="bottom" fixed, :97 treats only JS null as missing, :105-110 omits PLANNED_GROSS_BLOCK_AREA from the ha formatter; build-tiles.ts:187 stringifies the date.
Caveat on "5/5": I chose edge taps on purpose. Taps within about 105 px of either edge on a 412 px phone clip; the middle third fits. All facts reproduce. The popup is ugly and partly clipped, but nothing in it is false: the date really is unknown and the licensee really is unmapped. A user can pan to read a clipped popup. P2.

### U-21 Share links omit timeline year and class filters -- CONFIRMED, P1 -> P2
Method: scripts/shareprobe.mjs (data/shareprobe.jsonl, shots/share-sender.png, share-recipient.png). Desktop: opened the timeline, slider to 1950 (aria-valuetext "1950"), clicked Copy shareable link, read the clipboard: `https://opencanopy.ca/map#lat=48.6500&lng=-124.4500&z=11.0&layers=forest-age,cutblocks&preset=threats` (no year). Fresh recipient context: timeline closed (aria-pressed=false), and the camera had dropped to the province view as well ("100 km", U-05).
useMapState.ts:84-117 buildHash serialises camera, layers and preset only; classFilters live in page state (page.tsx:116). The URL contract never promised year or filters, so this is a missing feature, not a regression. P2. U-05 is the bigger reason shared links mislead today.

### U-15 'Which companies logged most' has no answer; 'other' dominates tile attribution -- PARTIALLY CONFIRMED, P1 -> P2 (input for Phase B.1)
Method: scripts/company-share.mjs, an independent decode of opencanopy-v10.pmtiles from R2 (3x3 z10 tiles per town, layer tenure-cutblocks, 2,000 ha cap, blocks de-duplicated by property tuple, area = PLANNED_GROSS_BLOCK_AREA). data/company-share.json.
- 'other' share of planned block area: Williams Lake 59.7%, Prince George 57.2%, Port Alberni 99.7%, Quesnel 43.3%, Revelstoke 78.1%. The auditor's z9 numbers (63.7 / 62.5 / 99.8 / 51.5 / 70.0) are the same picture by a different method. Their "51-100%" lower bound does not hold at Quesnel (43% in mine).
- Date stored as the string "null": 15% Williams Lake, 16% Prince George, 30% Port Alberni, 43% Quesnel, 18% Revelstoke of features under the cap (auditor said 16-38%).
- Correction: BC Timber Sales and Mosaic are in src/data/companies.ts (lines 41-42) but without `present: true`. They are missing from the tiles, not from the registry.
- Context: the live cutblocks layer paints one colour (registry fill-color #dc2626), so company appears only in the popup. The leaderboard that would answer "who logged most" is Phase B.1, NEXT in the ROADMAP and ruled "province-wide static" (handoff, 2026-08-26). Nothing live claims a ranking, so this is not a live P1. It is a real and important prerequisite: a B.1 built on the current tiles would rank "Other" first. P2 as a defect, and a must-read for whoever plans B.1.

## Summary

| ID | Verdict | Auditor | Verified | One line |
|---|---|---|---|---|
| U-05 | confirmed | P0 | P0 | Page map ref fills only on a later page re-render: first search no-op 4/4, hash never tracks pans 4/4, deep link dropped 3/7, CTA dropped 4/5 |
| P1-0822 | confirmed | P0 | P0 (same defect as U-05, count once) | Batch 0 "shipped" fix does not hold on production; its test hand-attaches the ref |
| U-11 | confirmed | P0 | P0 | Stale `visible` closure; on desktop `load` never fires until a repaint (9/9), so the first preset tap + zoom gives an empty map 4/4 |
| U-09 | confirmed | P1 | P1 | No loading/empty/zoom status for any public layer; 15-90 s silent blanks on throttled links; charter done-1 unmet |
| U-10 | confirmed | P1 | P2 | Permanent death after a >15 s header stall reproduces; natural header latency 0.8-4 s, so it is rare |
| U-03 | confirmed | P1 | P2 | 360 px tap opens the mail app; at 375-412 the flag covers a third of the chip |
| U-04 | confirmed | P1 | P2 | 5 of 8 bar controls off-screen, no fade; reachable by swipe; cut chip is a cue |
| U-07 | confirmed | P1 | P2 | 'null' string, 'Other', 4-decimal area, edge taps clip; nothing false |
| U-21 | confirmed | P1 | P2 | Year and filters not in the URL; a missing feature, not a regression |
| U-01 | partially-confirmed | P1 | P2 | True, but a deliberate 2026-06-02 commit by Lee; a decision for him, and the stored "[]" needs a key bump |
| U-15 | partially-confirmed | P1 | P2 | 'other' = 43-100% of block area; a B.1 prerequisite, not a live defect; BCTS/Mosaic are in the registry, just not in the tiles |
| P2-0822 | confirmed | P1 | P2 | 96 (phone) / 254 (desktop) hidden raster fetches with zero layers on; already tracked open in ROADMAP |

New beyond the auditor's report:
1. On desktop (1280x800) MapLibre's `load` did not fire on its own in 9/9 cold loads (no input for 5-100 s). Cause: the last tile to settle is one of ~130 R2 404s, and MapLibre does not repaint after a 404 (tile_manager.ts: 404 -> update(), no `data` event). One triggerRepaint fires it at once. Everything gated on `load` waits for user input: PMTiles source registration, terrain, global-state init in CanopyMap.onLoad, and SatelliteLayers' source. This turns U-11 from an early-tap race into the default desktop first visit. Fix direction: register sources on style.load / styledata, or nudge one triggerRepaint after style load. A 404-free tile manifest (already a ROADMAP known issue, "Empty-tile 404 console noise") would also remove the trigger.
2. After `load`, the satellite source loads MapTiler satellite tiles with satellite switched off (diag-repaint.jsonl, last 8 responses all satellite-v2). Same hidden-prefetch pattern as P2-0822, and on a metered MapTiler key. Not verified further.
