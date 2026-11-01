# Skeptic verification: pages-visual findings (2026-10-01)

Target: opencanopy.ca (production), repo worktree session-f8d7c3 (read-only).
Method: own headless Chromium via Playwright node scripts (scratch dir), own Python
re-derivations from source data. Auditor's screenshots and numbers are not reused.

Findings under test: F-05, F-02, F-01, F-03, F-11, F-24, F-19, F-16, F-04, F-12, F-20, F-13, F-07, F-06.

Verdicts are appended below as reached.

## F-01 — "0.3% of the province's forest" misquotes Price, Holt & Daust
**Verdict: CONFIRMED. Severity: P1 (auditor P0).**
- Own source fetch: https://ancientforestalliance.org/wp-content/uploads/2014/10/bcs-old-growth-forest-report-web.pdf (25 pp, pdftotext). Summary p.2: "provincial total area of old forest (~13.2 million hectares)"; "only ~35,000 hectares of old forest have a site index greater than 25m". p.22: "Of the 50 million hectares that grows trees ... 3% is expected to grow very large trees (SI > 25); of that 2.7% (~35,000 hectares) is old today"; "~380,000 hectares" for large trees (SI 20-25); "About 400,000ha of remaining old forest have SI > 20m, representing less than 1% of BC's total forest area of 50 million ha."
- 35,000 / 50M = 0.07% of the forest; 35,000 / 13.2M = 0.27% of old forest. No reading of the source yields "0.3% of the province's forest". Copy in src/data/chapters.ts ending subheading; same figure in registry.ts:119 legend note (seen live in my own /map screenshot).
- Not ruled in DECISIONS; ROADMAP 08-26 only records that a note links to "the story's 0.3%" (no correctness review).
- Severity note: the denominator error runs in the UNDER-dramatizing direction (0.3% > the true 0.07%); "large" vs the source's "very large" runs the dramatizing direction (by the source's own classes, large+very large old forest is ~415,000 ha, not 35,000). The 35,000 ha figure itself is correct for SI>25. A citation misquote a journalist can check in two minutes, fixed in one copy edit; P1, not P0, because the headline number is right and the two errors partly offset rather than compound.

## F-07 — Share card and meta advertise the internal catalog
**Verdict: CONFIRMED. Severity: P2 (auditor P1).**
- Own fetch: live /opengraph-image.png md5 10f129588224e0a254c4f1896cbecfbd == src/app/opengraph-image.png (git: 115437e, 2026-06-09). Viewed: "17 data layers", "species at risk", swatches "Deferrals", "Fish streams".
- Live meta (curl /): description, og:description, twitter:description, og:image:alt and twitter:image:alt all say "species at risk". PUBLIC_LAYER_IDS (registry.ts:893-901) = 7 ids, none species-at-risk or fish.
- Downgraded: stale marketing copy about features, not a misstatement about forest data; CHARTER non-goal 2 is about exposing the catalog, and the card advertises what is not exposed (disappointment, not deception about BC's forests). Cheap fix, worth doing.

## F-05 — Story overlays paint ~4.7x the hectares the data holds
**Verdict: CONFIRMED (worse than claimed against the union area). Severity: P0 (holds).**
- Own measurement of the LIVE PNGs (curl https://opencanopy.ca/raster/cutblocks-by-year/{1950..2025}.png, forest-base.png, fire-by-year/2025.png), exact spherical cell areas per Mercator row over OVERLAY_BOUNDS [-139.5,48,-114,60.5] (setup-layers.ts:17): frame 229.8M ha; forest base 68.35M ha painted.
  - 2025 frame: 67,640 px painted = **32.75M ha** (alpha-weighted 26.34M ha); covers **40.1%** of the forest base. 1950 frame: 14.23M ha. 2010: 27.0M; 2016: 30.1M. Fire 2025: 41.2M ha painted.
- Own ground truth, independent of the scrub JSON: streamed all 1.86 GB of ~/Projects/opencanopy/data/checkpoint/preprocessed/tenure-cutblocks.ndjson with the build's own filters (cap 2,000 ha, DISTURBANCE_START_DATE[:4]), rasterized at 12288x6023 (~3 ha cells) with all_touched=False. Attribute sums: dated 5.888M ha (matches cutblocks-scrub.json total 5,888,477 exactly), undated/pre-1950 1.124M ha (matches DECISIONS "1.12M"). **Union footprint: 6.52M ha** (dated 5.79M, undated 0.97M; overlaps removed).
  - Inflation: 2025 frame 32.75 / 6.52 = **5.0x** by area; share of forest 40.1% painted vs ~9.5% in the data. 1950 frame 14.23 / 0.97 = **14.7x**.
- Cause confirmed in code: scripts/build-year-overlays.py:488-495 `all_touched=True` at 1024 px (~450 ha cells at 54N) vs forest base `all_touched=False` (:297).
- Not a false positive: the footprint is not a bbox or edge effect; it is the binary-mask rasterization of sub-pixel polygons. Not ruled in DECISIONS (09-02 rulings fixed the cap, not the rendering); not parked in ROADMAP. By the project's own precedent (06-20 "falsely implied BC was logged before 1950", 06-20 v3 paint-order fix) a visual that misreads the data is a must-fix, and CHARTER done-3 / non-goal 3 name exactly this. P0 stands.

## F-03 — "Much of what you see in red was already gone by 1950"
**Verdict: CONFIRMED, with stronger evidence than the auditor had. Severity: P0 (holds).**
- Copy (chapters.ts baseline body) confirmed in source; the red at that beat is the undated bucket painted at proxy year 1949 (build-year-overlays.py `undated_proxy_year: 1949`).
- Own check against the live government record (BC WFS, WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW, resultType=hits, same 2,000 ha cap): 36,730 undated blocks. Their PLANNED_HARVEST_DATE: before 1950: **2**; 1950-1979: 5; 1980s: 38; 1990s: 1,874; 2000s: 11,531; 2010s: 7,233; **2020s: 13,091**; null: 1,742. 89% of the undated blocks carry a planned harvest date of 1990 or later. Example record: TFL35 block 15A, West Fraser, planned harvest 2022-06-30, no disturbance date.
- So the government's own record dates the "pre-1950" red to the 1990s-2020s. The sentence is false, not merely unsupported. It also contradicts DECISIONS 2026-09-02 ("their timing is unknown") and the CHARTER non-goal 3 text verbatim: "the story base must not imply pre-1950 logging".
- Side observation for Lee (not verified to code-table level): undated blocks by BLOCK_STATUS_CODE: LC 12,506, HB 12,202, S 5,824, HX 3,721, PE 2,352, ID 109. If S/PE are submitted/pending (FTEN code table not retrieved), ~8,000 undated blocks may be proposals never logged, which would also undercut the 09-02 premise that undated blocks are logging at all.
- On screen (my phone 390 run, 400-500vh): the baseline reads as a faint darkening; almost no red is visible, so "what you see in red" points at nearly nothing. Visual part is P2; the copy carries the P0.

## F-04 — The scrub teaches "nothing until ~1990, then a surge"
**Verdict: CONFIRMED. Severity: P1 (holds).**
- Recomputed from src/data/scrub/cutblocks-scrub.json: 1950s 130 ha, 1960s 777, 1970s 4,004, 1980s 73,577, 1990s 407,424, 2000s 2,107,733, 2010s 2,477,006, 2020-25 817,827. Cumulative passes 1% in 1988, 5% in 1997, 50% in 2011.
- Independent live-record check (BC WFS hits, cap 2,000 ha): blocks with a DISTURBANCE_START_DATE 1950-1969: **11** province-wide; 1970s: 69; 1980s: 1,212; 1990s: 13,498; 2000s: 69,891; 2010s: 70,007. The dated record barely exists before 1990: the curve is the history of record-keeping.
- External: BC Environmental Reporting, Timber Harvest indicator (https://www.env.gov.bc.ca/soe/indicators/land/timber-harvest.html, fetched 2026-10-01): harvest "generally increased since 1900, to a peak of almost 90 million cubic metres in 1987"; 1988-2013 "fluctuated around an average of 75 million cubic metres".
- My phone run: counter 1983 at 500vh, 1991 at 600vh, map visibly unchanged until ~700vh. A reader is shown a post-2000 acceleration that the harvest record contradicts. Not ruled (09-02 defines what "logged hectares" counts, not the time axis), not parked. CHARTER non-goal 3.

## F-11 — Story cards are not sticky; phone captions land after the animation
**Verdict: CONFIRMED. Severity: P1 (holds).**
- Code: NarrativePanel.tsx outer div `absolute inset-0 ... flex items-end md:items-center` inside `.story-step` with `minHeight: {scrollHeight}vh` (ScrollytellingContainer.tsx). Never sticky in history (git log -S sticky on the file: no hits).
- Own phone 390x844 walk (fresh context, settle to network-quiet 13 s, 5vh steps, 1.8 s settle per 50vh stop, card counted if >=60% on screen at opacity >0.5): card visible at 250, 400, 1000, 1300, 1350, 1600, 1650vh only. 500-950vh (counter 1983 -> 2016): no text. "75 years of logging." first at 1000vh with counter 2020 and overlapping the counter; "And then it burned." first at 1300vh with counter 2002 and orange already on the map (the designed hold never happens), overlapping the counter; 1400-1550vh (forest vanish + red flood): no text.

## F-12 — Forest base cut to 0 before the binary fades in
**Verdict: CONFIRMED. Severity: P1 (holds, but S to fix).**
- Code: visibility.ts sets story-forest-base opacity `revealBinary ? 0 : ...` on chapter enter; the binary ramps only over `revealBinaryFadeIn: [0.4, 0.6]` (chapters.ts). The hide predates the fade window (the comment explains it was meant to keep green from obscuring the binary), so the gap is an unintended interaction, not a design.
- Own phone run: 1350vh green present; **1400 and 1450vh: no green anywhere, red cutblocks on the dark basemap, no card on screen**; 1500vh binary fading in. The image says the forest is gone, which no dataset in the story says.

## F-16 — Fixed z5 camera shows a phone reader about half the province
**Verdict: CONFIRMED. Severity: P2 (auditor P1).**
- Own computation (512 px world at z5, centre -125.5/54, area-weighted over the live forest-base.png): 390x844 sees lon -129.8..-121.2, lat 48.2..59.1 = 57.9% of the forest base; 360x740 = 50.6%; 1440x900 = 93.8%. My 390 screenshots: Prince Rupert and Fort St John clipped at the edges; Kamloops, Okanagan, Kootenays never on screen.
- Downgraded: nothing on screen is false, the crop is roughly representative of the red/green mix, and the story's claims are province-level copy, not "look at your region". It is a phone-audience framing loss, worth fixing with the F-11 relay, not a P1.

## F-19 — Landing CTA drops readers on the province view
**Verdict: PARTIALLY CONFIRMED. Severity: P1 (holds). The symptom reproduces; the auditor's control and diagnosis do not.**
- Own script (phone 390x844 DPR 2, fresh context per run, no popstate assist; reads the MapLibre scale bar and the page's own "zN.N" readout at 5/10/20/40/60 s; CTA href confirmed live = `/map#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age`):
  - CTA click from `/` (3 s on landing): landed z8 in **1 of 4**; the other 3 stayed at z5 ("100 km", Prince George on screen) for the full 60 s.
  - CTA click after scrolling the whole story like a reader (10vh / 250 ms): **0 of 1** landed.
  - Direct `goto` of the identical URL in a fresh context: landed in **1 of 5** (the auditor reported 2/2 "10 km").
  - Warm-cache `goto` (landing first, then goto): 1 of 2.
- So the failure is not specific to the CTA path: the one-shot mount fly in useMapState.ts:141-193 is lost on most loads in my environment whichever way the page is reached. The map-visual lane measured 7/8 (desktop) and 5/6 (phone) direct landings, so the rate is environment-dependent (headless SwiftShader, machine load 4-11 during my runs). "Regressed on the CTA path, fine on the direct path" is a sampling artifact.
- Real defect, real P1: DECISIONS 2026-08-21 makes this deep link the story's ending, and the same race breaks every shared /map link. The auditor's fix (initialViewState from the hash at construction, no fly) addresses the general race, which is the right target; the proposed e2e should cover direct links too, repeated, not one CTA run.

## F-20 — Calculator prices the whole ecosystem CO2 stock as credits
**Verdict: CONFIRMED (code + live bundle); live dollar figures not re-run. Severity: P1 (holds), needs Lee's ruling.**
- calculator.ts:232-242 `value: stats.totalCo2eTonnes * m.pricePerTonne`, commented "AVOIDED EMISSIONS ... Directly comparable to one-time stumpage revenue". The panel's own "How this is calculated" says the tonnage is "upper-range ecosystem estimates (soil and root carbon included, not just merchantable timber)".
- Live bundle (/_next/static/chunks/2xscwfumjupwg.js, fetched 2026-10-01) carries "Carbon values represent avoided emissions credits. Both figures are one-time" in both the panel and the PDF block; heading "Value If Protected vs. Revenue If Logged".
- Avoided emissions from not logging are the difference against a harvest baseline, not the standing stock: soil carbon, roots and wood products are not all emitted on harvest, so labelling stock x price as "avoided emissions credits" overstates the protect side by construction. Not ruled in DECISIONS (09-02 ruled only on unknown-age stands); not parked (Parking Lot carries an unrelated compliance/voluntary caveat for the PDF). CHARTER done-3 names the calculator.
- Not reproduced: the auditor's $570M vs $89M Carmanah run (I did not drive the panel). The verdict does not depend on the magnitude.

## F-13 — "Nothing is modelled, estimated, or editorially filtered"
**Verdict: PARTIALLY CONFIRMED. Severity: P2 (auditor P1).**
- Live: curl https://opencanopy.ca/ HTML contains the sentence verbatim (CtaSection.tsx:78-80).
- What holds: OpenCanopy itself drops the 230 FTEN polygons >= 2,000 ha (CUTBLOCK_AREA_CAP_HA; DECISIONS 09-02) and places undated blocks at a proxy year: those are filters the project applies, so "nothing is ... filtered" is literally false. The /map legend's own note says "modelled at 250+ yr" (seen live in my /map screenshot).
- What does not: the paragraph's scope is "Every layer on this map"; VRI's modelling is the government's, which is exactly what the next sentence says ("If the government says a stand is 250 years old..."), and the carbon calculator is not a layer. Two of the four counter-examples are semantic. One true contradiction (the cap) plus one wording overreach is a P2 copy fix, not a P1 trust failure.

## F-06 — "Unknown age (excluded from all values)" row unreachable live
**Verdict: CONFIRMED on production with a fresh case. Severity: P1 (holds).**
- Code: wfs-proxy.ts classifyVRIFeature returns null when no HARVEST_DATE and no positive PROJ_AGE_1; the bbox loop does `if (!cls) continue; // Skip unclassifiable polygons`. The calculator's only data path is fetchForestAgeForSelection -> /api/wfs?layer=forest-age (src/lib/data/forest-carbon-client.ts:212-224; map/page.tsx:174-209), so `unknownHa` can never be non-zero.
- Own live test, a box the auditor did not use (BC Albers 1150000,380000-1160000,388000; WGS84 -123.98..-123.84, 48.41..48.49, west of Sooke): BC WFS returns 489 VRI polygons, **314 of them treed (BCLCS_LEVEL_2='T') with no age and no harvest date, 7,025 ha**. The live proxy (`/api/wfs?layer=forest-age&bbox=...&zoom=12`, Origin opencanopy.ca) returned 143 features: 136 of the 137 aged/harvested polygons, and **0 of the 314 treed unaged ones**.
- Consequence is larger than the auditor's Harrison sample suggested: on southern Vancouver Island private forest land a selection silently loses most of its stands, so the panel's hectares and the PDF understate the selection, and the DECISIONS 2026-09-02 clause "the area stays visible in the breakdown, labelled as excluded" is false live. Values are unaffected (the ruling prices unknown stands at zero anyway), which keeps this at P1, not P0.
- (Province-wide hit count could not be re-run: BC WFS timed out on the unbounded query during this session.)

## F-02 — End reveal paints standing forest in the loss red under "The full picture is worse"
**Verdict: CONFIRMED, by an independent method, and worse than claimed. Severity: P0 (holds; the three-tone rebuild needs Lee's ruling, the copy stopgap does not).**
- Code: build-raster-tiles.py binary theme maps mature, young AND harvested to palette["harvested"] #ef4444. Deliberate Phase 1b design (ROADMAP 2026-06-28, "old-growth vs everything else"), never entered in DECISIONS. Live bundle (chunk 193u03rpot715.js) carries "What you just watched was only the permit record. The full picture is worse."
- Own method (not the auditor's isolation-raster overlay): fetched every production binary z6 tile over BC from R2 (raster/v3/binary; images are 512 px served at tileSize 256, so z6 is what map zoom 5 draws): 1,670,103 red px, green only 4.5% of painted px. Drew 160 random red pixels (seeded), converted each pixel centre to BC Albers and point-queried the live VRI (WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY) with the proxy's own class rule (HARVEST_DATE -> harvested; else PROJ_AGE_1 >=250 old, >=80 mature, >0 young):
  - mature 97 (61%), young 13 (8%), **harvested 12 (7.5%)**, old 250+ 12 (7.5%), no age and non-treed (BCLCS_LEVEL_2 N/L/W: water, rock, non-vegetated) 25 (16%), outside VRI 1.
  - So **~92% of the red at the climax is not recorded harvest**; ~69% is standing mature or young forest; ~16% is not forest at all (all_touched spill); and ~7.5% is the very 250+ forest the green is meant to show, painted red (disturbance classes paint last in mixed pixels).
- Auditor's figure (69-75% of red px with no harvested class anywhere in the pixel) is the generous bound; the point sample agrees and goes further. Even under the design's own intent ("everything not old growth is red"), the water/rock and old-growth-painted-red shares (~23% of red) are defects.
- (Note on my first pass: a 256-px assumption put sample points in Alberta and Washington; corrected to the real 512-px tile size before the counts above. Nothing outside BC is painted.)

## F-24 — Slow phone: "See what's left." over an empty map
**Verdict: PARTIALLY CONFIRMED. Severity: P1 (holds for the throttled case); the unthrottled claim is refuted.**
- Own throttled run (CDP: 150 ms RTT, 1.6 Mbps down, 750 kbps up, 4x CPU; phone 390 DPR 2; machine load 4.0): `load` at 40.1 s; forest-base.png finished downloading at **43.9 s**; scrolled to the first chapter at ~45 s; the card "See what's left." was on screen with **0.0% green from 47 s to 88 s** (8 frames), green 79.5% from 96 s on. 255 /raster/ requests during the landing session (prefetch).
- The image arrived ~45-50 s before it was painted, which fits the auditor's mechanism (visibility.ts gates on isStyleLoaded() and otherwise waits for `idle`, which a prefetch-saturated throttled map does not reach). Mechanism not instrumented by me either.
- Duration: ~45 s of empty first chapter in my run vs the auditor's 87+ s (they ran at load ~24). Real, P1 for the CHARTER's phone audience.
- Unthrottled (same script, no throttling): load 7.3 s; first chapter showed 79.5% green at the first frame (~12 s after navigation, ~5 s after load) and stayed so. The auditor's "unthrottled confirmation: same empty map 4 s after load" did not reproduce.

## F-11 addendum (desktop 1440x900, own run)
Card >=60% on screen at 200-250, 350-400, 750, 1200, 1500vh only. "75 years of logging." visible only at 750vh (counter 2002); "And then it burned." first at 1200vh with the counter at 1956 and orange already drawn; 1350-1400vh show no green and no card (F-12 holds on desktop too).

## Summary

| ID | Auditor | Verdict | Corrected | One line |
|---|---|---|---|---|
| F-05 | P0 | confirmed | P0 | 2025 frame paints 32.75M ha vs a 6.52M ha union footprint (5.0x); 40% vs ~9.5% of the forest. |
| F-02 | P0 | confirmed | P0 | ~92% of reveal red is not recorded harvest (61% mature, 16% non-forest, 7.5% old growth painted red). |
| F-03 | P0 | confirmed | P0 | 89% of "pre-1950" undated blocks carry planned-harvest dates of 1990+; only 2 before 1950. |
| F-01 | P0 | confirmed | P1 | 35,000 ha is 0.07% of BC forest / 0.27% of old forest; citation misquote, headline number right. |
| F-11 | P1 | confirmed | P1 | Phone: cards on screen at 7 of 30 stops; 500-950vh scrub silent; designed holds never happen. |
| F-24 | P1 | partially confirmed | P1 | Throttled: empty first chapter 47-88 s although the image arrived at 43.9 s. Unthrottled claim refuted. |
| F-19 | P1 | partially confirmed | P1 | CTA lands on z5 in 4 of 5 runs, but direct links also fail 4 of 5: general mount race, not CTA-specific. |
| F-16 | P1 | confirmed | P2 | 57.9% / 50.6% of the forest in view on 390 / 360 px; a crop, not a misstatement. |
| F-04 | P1 | confirmed | P1 | 11 dated blocks 1950-69 province-wide; the scrub draws record-keeping, not logging (harvest peaked 1987). |
| F-12 | P1 | confirmed | P1 | 1400-1450vh phone (1350-1400 desktop): no green, no card, before the binary fades in. |
| F-20 | P1 | confirmed | P1 | Stock x price labelled "avoided emissions credits"; dollar magnitudes not re-run. Needs Lee. |
| F-13 | P1 | partially confirmed | P2 | The 2,000 ha cap is a real filter; "modelled"/calculator counter-examples are semantic. |
| F-07 | P1 | confirmed | P2 | Card and meta: "17 data layers", "species at risk", "Fish streams"; stale marketing, not data. |
| F-06 | P1 | confirmed | P1 | Sooke box: 314 treed unaged stands (7,025 ha) on BC WFS, 0 in the live proxy response. |

Evidence: scripts, raw data and contact sheets in `verify/pages-visual-evidence/` (copied from the session scratchpad).
(binsample.py, binout.py and data/binsample.json are the superseded 256-px versions kept for the record; binsample2.* is the corrected run used above.)
