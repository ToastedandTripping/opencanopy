# OpenCanopy carbon calculator: teardown (working copy)

*2026-10-02. Plan mode activated mid-task, so after the header was written to
`/home/leesalo/marvin/research/opencanopy-calculator-20261002/teardown.md` every later section
is saved here instead (the only writable file). Copy this file over teardown.md on exit.*

Verdict scale: MEASURED / DERIVED / EXTRAPOLATED / UNSUPPORTED.

## 0. Already measured (not re-derived)

- SYNTHESIS decision D: protect bar = whole ecosystem stock x credit price labelled "avoided emissions credits"; Carmanah 5,179.4 ha showed $570M (BC compliance) vs $89M logging. Recommendation option 1 (remove $).
- pages-visual F-06 (verified): proxy drops every polygon with no HARVEST_DATE and no PROJ_AGE_1 > 0; Sooke box 314 treed unaged stands (7,025 ha) on BC WFS, 0 returned by live proxy. unknownHa always 0; "Unknown age (excluded)" row never renders.
- pages-visual F-20 (verified code + bundle; $ not re-run).
- performance PF-H / SPD-08: coastal 100 km2 11.6 s, 200 km2 ~36 s -> HTTP 500 edge timeout; client budget 20 s; guard 500 km2 calibrated on Kootenay (6.08 s); 500 error cached `public, max-age=604800`.
- usability U-16: draw is tap-two-corners, no instruction; equivalences at 5 sig figs off a headline rounded with ~20% band; drag pans map on phone.
- usability U-20: watershed mode says "Click map..."; watershed gives area only (carbon "not available"); visible-area z11 ~175 km2 timed out at 20 s (n=1).

## 2. VRI data: what BC exposes vs what the pipeline uses (live probe 2026-10-02)

DescribeFeatureType (190 attributes):
`https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows?service=WFS&version=2.0.0&request=DescribeFeatureType&typeName=pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY`

Present on the layer the proxy already queries (all confirmed by name + type): WHOLE_STEM_BIOMASS_PER_HA, BRANCH_BIOMASS_PER_HA, FOLIAGE_BIOMASS_PER_HA, BARK_BIOMASS_PER_HA (decimal); LIVE_STAND_VOLUME_125/175/225, DEAD_STAND_VOLUME_125/175/225; LIVE_VOL_PER_HA_SPP1..6_125/175/225 and DEAD_ equivalents; SPECIES_CD_1..6 + SPECIES_PCT_1..6; PROJ_AGE_1/2, PROJ_HEIGHT_1/2; CROWN_CLOSURE, SITE_INDEX, EST_SITE_INDEX; BASAL_AREA, VRI_LIVE_STEMS_PER_HA, VRI_DEAD_STEMS_PER_HA, STAND_PERCENTAGE_DEAD; BEC_ZONE_CODE/SUBZONE/VARIANT; BCLCS_LEVEL_1..5; HARVEST_DATE, OPENING_ID, EARLIEST_NONLOGGING_DIST_TYPE/DATE, LINE_7B_DISTURBANCE_HISTORY; PROJECTED_DATE, REFERENCE_YEAR, INTERPRETATION_DATE; FOR_MGMT_LAND_BASE_IND; COAST_INTERIOR_CD.

Proxy requests ALL 190 (no propertyName, wfs-proxy.ts:80-86) then whitelists 9 (wfs-proxy.ts:353-356): class, PROJ_AGE_1, SPECIES_CD_1, PROJ_HEIGHT_1, POLYGON_AREA, BEC_ZONE_CODE, HARVEST_DATE, OBJECTID, FEATURE_ID. Calculator reads 4: SPECIES_CD_1, PROJ_AGE_1, HARVEST_DATE, class (calculator.ts:95-112). Biomass, volume, species 2-6 and %s, crown closure, site index, BCLCS dropped at the edge after being downloaded.

Samples (4-corner Albers bbox, propertyName list; URLs in scratchpad urls.txt):
- Carmanah (-124.70,48.64,-124.62,48.70): 179 polys; CWH vm; species table matches 97.3% of classified ha. OC/VRI-above-ground C ratio 1.50. OG: VRI AG 231 tC/ha vs OC 341; mature 143 vs 290; young 125 vs 91.
- Nelson (-117.40,49.45,-117.30,49.52): 614 polys; ICH/ESSF; species table matches only 32.8% (FDI 2,902 ha, PLI, LW, BL fall to DEFAULT). Ratio 1.39.
- Prince George (-122.85,53.85,-122.75,53.92): 431 polys; SBS; table matches 32.8% (EP 1,578 ha top). Ratio 1.42.
- Sooke (-123.98,48.41,-123.84,48.49): 630 polys; 411 treed unaged (8,478 ha whole-polygon) dropped by the proxy rule; table matches 59.6% (FDC top). Ratio 0.94: OC BELOW VRI above-ground biomass for young (113 vs 158) and mature (154 vs 229).
- Species code tally over all 4 boxes: CW 290, FDI 268, FDC 262, HW 214, null 147, AT 140, EP 117, SX 95, PLI 73, LW 67, BL 50, YC 32, AC 24, PLC 19, BA 17, DR 13, SB 9, SS 5, SE 5, BG 4, PW 3. Table keys "FD" and "PL" never occur: VRI codes Douglas-fir FDC/FDI and lodgepole PLI/PLC. So the two keys for BC's most common conifers are dead; both fall to DEFAULT 250 tC/ha (lodgepole's own entry says 140).
- Harvested polygons: PROJ_AGE_1 is the regrowth age (2005 harvest -> 19-20 y; 2022 -> 2; 1966 -> 61; 1920 -> 107). Contradicts forest-age.ts:38 "harvested stands retain a stale PROJ_AGE_1". Consequence: a 107-yr stand harvested in 1920 is shown "Harvested", earns 0 stumpage and 0 ecosystem services, but still earns carbon from its age.
- Real LIVE_STAND_VOLUME_125 means by class vs TIMBER_VOLUME constants (800/500/150/0): OG 633 / 425 / 265 (Carmanah/Nelson/Sooke); mature 369 / 311 / 196 / 637; young 300 / 58 / 102 / 425; harvested 17-135 (constant 0). Wrong in both directions, by up to ~3x.
- Biomass fields are populated (0, not null) even for 2-yr regen; crown closure and site index present on 99-100% of classified polygons.

### 2b. Units source
VRI Relational Data Dictionary v5.0 (2019), https://www2.gov.bc.ca/assets/gov/farming-natural-resources-and-industry/forestry/stewardship/forest-analysis-inventory/data-management/standards/vegcomp_poly_rank1_data_dictionaryv5_2019.pdf : whole_stem / bark / branch / foliage biomass_per_ha = "total ... biomass per hectare of all species based on a utilization of 4.0cm expressed as tonnes/ha", Data Origin "derived". live_stand_volume_125 = "total net live volume per hectare of all species ... at the 12.5 cm utilization level ... gross volume less decay, waste, and breakage". Carbon comparison above uses 0.5 C fraction of dry biomass (my assumption for comparison only; the dictionary does not state dry vs green or a C fraction). Above-ground only: no roots, soil, deadwood.

### 2c. NEW: the proxy's bbox loses polygons inside the drawn rectangle
wfs-proxy.ts:695-696 converts only the SW and NE corners to BC Albers. In Albers (conic, CM -126) a lat/lon rectangle east of -126 is a tilted trapezoid; the SW/NE envelope cuts off a wedge on the north-west and south-east sides. Polygons wholly inside the wedges are never fetched; clip.ts cannot recover them. Measured with WFS resultType=hits, CQL INTERSECTS(densified true rectangle) vs same AND BBOX(proxy's 2-corner box) (script cmp2.py):

| box (WGS84) | ~km2 | classifiable polys in rectangle | reached by proxy bbox | lost |
|---|---|---|---|---|
| -117.50,49.40,-117.22,49.60 (Nelson) | 450 | 3,683 | 3,279 | 404 (11.0%) |
| -120.5,50.6,-120.2,50.8 (Kamloops) | ~500 | 884 | 757 | 127 (14.4%) |
| -123.10,49.30,-122.80,49.50 (North Shore) | 483 | 3,589 | 3,418 | 171 (4.8%) |
| -125.0,49.0,-124.8,49.15 (VI) | 243 | 2,430 | 2,329 | 101 (4.2%) |

Polygon counts, not area; loss grows with distance east of -126 and with box height. Silent: no caveat fires. Fix is one line (envelope of all four corners, or a densified INTERSECTS polygon).

## 1. Every number and claim the user sees

Paths: C = src/lib/carbon/calculator.ts, M = src/lib/carbon/markets.ts, P = src/components/panels/CalculatorPanel.tsx, R = src/lib/export/pdf-generator.ts, X = netlify/edge-functions/wfs-proxy.ts. All constants date from the founding commit d5c1749 (2026-03-21) and were never revisited, except TIMBER_VOLUME.unknown 200 -> 0 (e73ecae, 2026-09-02).

### 1.1 Area: "N hectares (forested area analyzed)" (P:506-512, R:241, Share P:373)
- Formula: sum over clipped polygons of @turf/area / 10,000 (C:91-92, C:175). Polygons = proxy response (X:717-797) clipped to the drawn rectangle (clip.ts:212-271).
- Inputs: VRI geometry, simplified at 0.0002 deg (X:268-271), clip by turf intersect; failed intersects keep the FULL polygon if its vertex-average centroid is inside (clip.ts:243-262).
- Verdict: DERIVED for the geometry, but the label is wrong by construction. It includes harvested polygons (C:175 sums all classes) and silently excludes (a) every treed unaged stand (X:723, F-06) and (b) polygons lost to the 2-corner bbox (section 2c, 4-14%). So it is neither "forested area" nor the selection's area.

### 1.2 Headline "X tonnes CO2 stored in this area" (P:565-566, R:248-249, Share P:373)
- Formula per polygon: areaHa x C_max(species) x (1 - e^(-k x max(0, PROJ_AGE_1))) x 3.67 (C:115-122); summed (C:173-174); rounded to 3 s.f. (C:294-296).
- Constants and claimed sources:
  - C_max/k table, 9 species + DEFAULT (C:32-43): CW 350/.008, HW 400/.008, FD 300/.008, SS 350/.008, PL 140/.012, SX 200/.01, BA 250/.008, AT 115/.012, YC 300/.006, DEFAULT 250/.008. Claimed: "Kurz et al. 2013 (CBM-CFS3)", "Smithwick et al. 2002", "BC Carbon Stock Estimation Framework" (C:17-20; METHODOLOGY.md:35-39). No value is traceable to any page or table in any of them. The CBM-CFS3 paper METHODOLOGY cites (Ecol. Model. 220(4):480-504) is Kurz et al. 2009, not 2013 (confirmed: https://ideas.repec.org/r/eee/ecomod/v220y2009i4p480-504.html). Smithwick 2002 reports old-growth total ecosystem C of 671 Mg C/ha area-weighted for the PNW, 1,127 in coastal Oregon (abstract, via search: https://andrewsforest.oregonstate.edu/publications/2833) -- 2-4x the table's "upper-range" maxima. No document called "BC Carbon Stock Estimation Framework" could be identified.
  - Keys FD and PL never match VRI codes (FDC/FDI, PLI/PLC; section 2). DEFAULT 250 applies to ~67% of classified area in Nelson and Prince George samples.
  - "Logistic curve" (C:15, P:627 "standard curve", METHODOLOGY.md:9): the formula is a monomolecular/Chapman-Richards-without-exponent form, not logistic. Mislabelled.
  - 3.67 (C:122): 44/12 = 3.667. DERIVED (correct).
  - Uses SPECIES_CD_1 only; ignores SPECIES_PCT_1..6 and every VRI biomass/volume attribute that is sitting in the same response.
- Verdict: EXTRAPOLATED at best, UNSUPPORTED as shipped. Live comparison with the province's own derived above-ground biomass on the same polygons (section 2): ratio 0.94-1.50, with young and mature stands in Sooke BELOW the province's above-ground figure alone despite the panel claiming roots + soil + deadwood are included. The number is not reproducible from the shipped data in the sense the 2026-09-02 ruling requires (no script, no pinned file, sources not traceable).

### 1.3 "may be as low as Y tonnes" (P:567, R:250) and "Approximate -- may overestimate by up to ~20%" (P:608-611, R:287, P:631-633)
- Formula: rounded x 0.8, 3 s.f. (C:296).
- Source: the code's own comment "may overestimate by 10-20%" (C:22-24); METHODOLOGY.md:73 "Published ranges for above-ground biomass alone are typically 10-20% lower".
- Verdict: UNSUPPORTED. No source; the direction is contradicted by both the cited Smithwick totals (model far below) and the VRI above-ground comparison (model sometimes below above-ground alone). A one-sided band asserts the error can only be upward.

### 1.4 "N forest polygons analyzed" (P:568, R:251)
- Formula: clipped feature count (C:167). MEASURED as a count of what reached the client; but omits dropped unaged stands and bbox-lost polygons, so "analyzed" is literally true and materially incomplete.

### 1.5 Breakdown rows (P:587-591, R:59-65, R:142-152 with % of total)
- Old growth 250+ / Mature 80-250 / Young <80 / Harvested / Unknown: proxy rule X:325-332 (HARVEST_DATE wins, then PROJ_AGE_1 thresholds), mirrored in src/lib/taxonomy/forest-age.ts:43-52.
- Verdict: MEASURED classification of government attributes, with two defects: (a) "Unknown age (excluded from all values)" is unreachable live (X:723; F-06) so the 2026-09-02 ruling's "area stays visible" is false; (b) "Harvested" means "has ever had a HARVEST_DATE": a 107-year-old stand cut in 1920 (Nelson sample) is reported as Harvested. Also, "Old growth (250+ yr)" is an age threshold, which the audit already flagged as not equal to the province's old-growth definitions.

### 1.6 Equivalences (P:598-602, R:261-276, Share P:374)
- Formula: rounded tonnes / constant (C:216-222), displayed to whole units (P:214, R:265-273).
- cars 4.61 t/yr "EPA 2024" (C:48; METHODOLOGY.md:55). DERIVED: EPA's typical passenger vehicle figure is 4.6 t (not re-fetched this session); it is a US vehicle labelled generically "cars".
- homes 7.5 t/yr "per Canadian home" (C:49), METHODOLOGY says "NRCan residential energy use" with no table or year. UNSUPPORTED (not reproducible). Label differs: panel "Canadian homes for a year" (P:601), PDF "Canadian homes heated for a year" (R:270).
- flights 1.6 t per YVR-YYZ round trip, METHODOLOGY "ICAO Carbon Emissions Calculator" (C:50). UNSUPPORTED: no captured ICAO output; not verified this session.
- Precision: five significant figures from a 3-s.f. headline (U-16).

### 1.7 "Value If Protected vs. Revenue If Logged" (P:300-341, R:129-137)
- Carbon bars: totalCo2eTonnes x price (C:239-242). Prices (M:28-47): BC Compliance $94 "BC GGIRCA 2026"; Voluntary premium $40 "Nature-based voluntary avg"; Voluntary standard $25 "Verra/Gold Standard avg".
  - Verdict: UNSUPPORTED, wrong by construction (decision D / F-20): a standing stock is not an avoided emission. Additionally $94 matches no year of the BC OBPS schedule, which follows the federal backstop (CAD 65 in 2023 rising CAD 15/yr: $95 in 2025, $110 in 2026 by that schedule; IEA policy page https://www.iea.org/policies/18435-british-colombia-output-based-pricing-system). Voluntary prices cite no report or year; not reproducible.
- "Logging revenue" bar: (OG ha x 800 + mature ha x 500 + young ha x 150 + unknown ha x 0) m3/ha x $24/m3 (C:245-249; M:49-68). Claimed "FLNRORD stumpage tables (BC average)".
  - $24/m3: BC Ministry of Forests sawlog tabular rates effective 2025-12-01 give Coast Area average $10.01/m3 (district averages 2.31-21.28) and Interior zone averages 2.02-22.01 $/m3 (coast_non-appraised_tabular_rates_dec_25.pdf, interior_non-appraised_tabular_rates_dec_25.pdf on www2.gov.bc.ca). $24 exceeds every published zone/district average. UNSUPPORTED.
  - Volumes 800/500/150: no source. VRI's own LIVE_STAND_VOLUME_125 per polygon is in the response and disagrees by up to ~3x in both directions (section 2). UNSUPPORTED, and replaceable by MEASURED-grade (province-derived) data.
  - Concept: stumpage is the Crown's royalty, not "logging revenue", and is not charged on private land (e.g. the Sooke box). Label UNSUPPORTED.
  - Harvested polygons get 0 volume though VRI shows 17-135 m3/ha regrowth.
- Ecosystem services "$X/yr" = (total - harvested - unknown ha) x $2,300 (C:254-255; M:70-75). Claimed: Costanza et al. 2014, "temperate forest avg (~$3,800/ha/yr total); carbon component removed (~40%)".
  - Costanza et al. 2014 Table 2 (robertcostanza.com PDF): $3,800/ha/yr is the 2011 unit value for ALL forest (tropical-weighted); Temperate/Boreal is $3,137; its climate-regulation share is $152 (4.8%), not ~40%. Units are 2007 US$ and global benefit transfer. UNSUPPORTED (misread table, wrong carbon share, wrong currency/year, not BC).
- Footnotes "Carbon values represent avoided emissions credits" (P:323-327, R:134) UNSUPPORTED; source line (P:338-341, R:136) names sources that do not produce these numbers.
- Display: each figure rounded to 2 s.f. (C:303-305); bars drawn on one scale mixing one-time and annual concepts.

### 1.8 Prose claims
- "Calculated from official BC government forest inventory data" (P:609-610): true only for age, leading species code and geometry; every quantity is a hard-coded constant. EXTRAPOLATED framing.
- "How this is calculated" (P:621-634): "calibrated from published forest-carbon research" UNSUPPORTED (no calibration exists in repo); "soil and root carbon included" not demonstrable.
- PDF footer "see methodology at opencanopy.ca" (R:287): no methodology route exists (src/app has page, map, privacy only); METHODOLOGY.md is in the repo but not served. UNSUPPORTED pointer. "Carbon model: species-specific density curves" (R:288) true as description.
- METHODOLOGY.md:69 and :87-89 ("Unknown ... shown in the area breakdown", "Data is refreshed weekly at minimum") false live (see section 3).
- Too-large copy "max ~500 km2" (P:494) true to code; loading copy "up to 20 seconds" (P:530) true to client timeout.

## 3. Operational limits

- **Selection shape:** axis-aligned lat/lon rectangle only: mouse drag (DrawTool.tsx:186-210, 5 px minimum), touch two-tap (DrawTool.tsx:217-247, no instruction shown, U-16), or "Visible area" = map bounds (page.tsx:540-548; DrawTool.tsx:78-87). No polygon draw, no parcel/tenure/park/watershed selection. Watershed mode returns area only and is hard-wired to "too-large" (page.tsx:496-512).
- **Area cap:** 500 km2 on the bbox (forest-carbon-client.ts:67, :153-155), checked before fetch (page.tsx:162-167). Calibrated on Kootenay interior latencies (forest-carbon-client.ts:40-66); coastal selections of 100-200 km2 already time out (PF-H/SPD-08).
- **Feature cap:** count=8000 at zoom 12 (X:699), sent with no sortBy (wfs-bbox-url.ts:36-44), so a capped response is an arbitrary subset. Unclassifiable polygons are dropped AFTER the cap (X:723), so the client's backstop `>= 7800` (forest-carbon-client.ts:34-35, :309) can under-fire, as its own comment admits.
- **Timeouts:** client 20 s over full fetch+parse (forest-carbon-client.ts:74, :226-314). Edge: fetchWithRetry 3 attempts x 30 s abort + 1 s + 2 s backoff (X:419-465), worst case ~93 s, far beyond the platform's edge response limit (live 500 "the edge function timed out" at ~35-36 s, PF-H), so a slow upstream gets ~1 attempt and the retry design is mostly fiction. The client gives up at 20 s while the edge keeps working.
- **Caching:** success = `public, max-age=604800` (X:480); proxy-generated errors = `no-cache` (X:491); platform timeout 500 carried `public, max-age=604800` (PF-H). netlify.toml:10-12 declares the edge function without any cache directive; a live double request (2026-10-02, bbox -124.70,48.64,-124.68,48.65) returned identical bodies with no Age/Cache-Status header (2.1 s then 0.53 s): no evidence of CDN caching. Cache key would be the exact float bbox of a hand-drawn rectangle anyway, so hit rate is effectively zero. METHODOLOGY.md:88 "Edge function cache has a 7-day TTL. Data is refreshed weekly" describes nothing real.
- **Payload:** the proxy fetches all 190 VRI attributes (no propertyName, X:80-86) then discards all but 9 (X:747-756); upstream payload and edge parse time are the latency driver (PF-H: 200 km2 = 5.45 MB after stripping).
- **Geometry fidelity:** Douglas-Peucker 0.0002 deg at z12 (X:268-271; client claims 0.4% mean / 2% p95 area error vs POLYGON_AREA, forest-carbon-client.ts:19-22, not re-run). Degenerate rings that throw in turf intersect are kept whole if the vertex-average centroid is inside (clip.ts:243-262), overstating area; disclosed only above 5% (P:576-580). Main-thread clip at ~1.6 ms/feature, chunked every 12 ms (clip.ts:126-138).
- **bbox projection bug (new):** SW/NE-only Albers conversion loses 4-14% of in-rectangle polygons (section 2c). No caveat.
- **Rate limit:** 60 req/min/IP per isolate (X:511-550); 429 surfaces as "Too many requests" with countdown (page.tsx:233-244; P:157-174).
- **Error paths:** no-data ("No forest data in this area."), schema drift (all features lack class, or none carry age/harvest date; forest-carbon-client.ts:119-133), timeout, network, http, rate-limit, too-large. Error copy never distinguishes "BC WFS slow" from "edge timed out". Supersession by a newer selection is handled by a sequence guard (forest-carbon-client.ts:168-199).
- **Unknown-age stands:** dropped at the edge (X:325-332 returns null when no HARVEST_DATE and PROJ_AGE_1 not > 0; X:723 `continue`), before the whitelist and before the client. The calculator's "unknown" branch (C:67-75, C:191-193, P:591, R:64) is dead code on the live path. Measured this session (Sooke box): 411 treed (BCLCS_LEVEL_2='T') unaged polygons, 8,478 ha whole-polygon area, would be dropped. The 2026-09-02 ruling's "the area stays visible in the breakdown, labelled as excluded" is false live (F-06 confirmed). Check 9 of src/test/audit/proxy-consistency-audit.test.ts requires the proxy's ForestClass type to equal the canonical four classes exactly, so the obvious fix (a fifth "unknown" class in the proxy) turns that test red; the taxonomy contract has to change with it. No test anywhere asserts that an unaged treed polygon reaches the panel.
- **PDF:** opens a pop-up and calls print after 500 ms (R:299-311); a blocked pop-up returns silently (R:302). Map image via canvas.toDataURL with preserveDrawingBuffer (CanopyMap.tsx:193). No selection coordinates, no data date, no link to the view.

## 4. Test coverage: could each test fail if the formula were wrong?

| File | What it covers | Would it catch a wrong formula? |
|---|---|---|
| src/test/lib/carbon-calculator.test.ts (225 lines) | classification thresholds; carbon > 0; CW > PL; CO2e = 3.67 x C; equivalences > 0; species-breakdown ratio; 3 markets present and > 0; stumpage > 0; ecosystem = forested x 2300; unknown -> all zeros; harvested -> 0 stumpage | Almost never. Only absolute pins: 3.67 (re-derived from the implementation's own output) and 2300 (literal copy of the constant). Every C_max, k, price, stumpage rate, volume and equivalence constant could change 10x with the suite green. Fixtures use codes "PL" and "FD" that never occur in VRI (section 2), so the species test exercises a branch real data cannot reach. Harvested fixtures use PROJ_AGE_1 null; real harvested polygons carry regrowth age, so "all-harvested -> 0 carbon" is a shape the live data does not produce. |
| src/test/lib/forest-carbon-regression.test.ts (103) | "never a confident 0": aged features through clip + stats yield > 0 | Catches only the original zeroing bug class. Claims "exactly the WFS schema ... probe-verified" yet uses FD/PL codes; would pass at any magnitude. |
| src/test/lib/carbon-presentation.test.ts (108) | sig-fig rounding, one-sided 0.8 band, dollar rounding, equivalence self-consistency (cars x 4.61) | Real pins for rounding mechanics. The 0.8 band is pinned to itself (`bandLow === round(rounded*0.8)`), so it guards the code, not the claim. |
| src/test/lib/clip.test.ts (171) | edge-straddle clip, MultiPolygon, non-overlap exclusion, degenerate ring -> skipped, null geometry, abort | Genuinely behavioural for clip. Does not test the centroid fallback's area overstatement. |
| src/test/lib/forest-carbon-client.test.ts (384) | guard predicate, fetch error taxonomy, timeouts over body read, abort semantics, zoom=12 request, schema drift, seq guard | Good for plumbing; asserts nothing about what the proxy returns. Guard test asserts `500` is positive and finite. |
| src/components/panels/CalculatorPanel.test.tsx (378) | status gating of Export/Share, rounded headline, band, equivalences from rounded, too-large copy, aria-live, reduced motion | UI-state tests on a hand-built stats object (totalCo2eTonnes 1,234,567.89). No financial-section assertion; the "Unknown age" row's reachability is never tested. |
| src/lib/export/pdf-generator.test.ts (123) | equivalences from rounded tonnage; area label | Same as panel; financial block untested. |
| src/test/pipeline/wfs-proxy-url.test.ts | CQL/bbox URL shape for given Albers numbers | Passes pre-computed Albers coordinates in; the WGS84->Albers conversion and the SW/NE-only corner choice (X:695-696) are untested anywhere. |
| src/test/audit/proxy-consistency-audit.test.ts Check 8/9 | whitelist covers registry paint props; proxy taxonomy == canonical | Check 9 actively defends dropping unknown-age stands (section 3). |
| e2e/ | no calculator spec (grep for carbon/calculator under e2e: none) | No end-to-end test drives draw -> proxy -> panel. |

Net: no test pins any carbon, dollar or equivalence output to an external source or to a value derived from shipped data, which is exactly what the 2026-09-02 ruling requires ("pinned by a test that reads that file", hero-figure.test.ts pattern). The calculator is guarded against crashing and against showing 0; it is not guarded against being wrong.

## 5. Why it exists as an afterthought (structural)

1. **The numbers were written once, on day one, and nothing has read them since.** Every density, price, volume and equivalence constant is from the founding commit of 2026-03-21. The July redesign and the September fixes rebuilt the plumbing around them (fetch, clip, timeouts, rounding, state machine) and never opened the model. Their cited sources don't produce them, and the one test that touches them checks their sign, not their value.
2. **It ignores the government's own answer, which it already downloads.** BC's inventory publishes biomass and volume for every stand. The proxy fetches all of it and throws it away at the edge. The calculator then rebuilds a cruder version from two fields (leading species and age), using a lookup table whose codes for Douglas-fir and lodgepole pine don't exist in the data. A tool whose charter says "render government data faithfully" runs on numbers it made up while the real ones pass straight through it.
3. **It borrowed the map's plumbing instead of having its own.** The calculator rides a display proxy built for drawing layers: simplified geometry, an 8,000-feature cap with no ordering, a classifier that drops whatever the map can't colour, a two-corner box conversion, a 30-second retry loop the platform never allows, and cache headers that do nothing. Each of those shapes the result, and none was designed with a measurement in mind. That is how the "unknown age" ruling got implemented in the calculator and quietly cancelled one layer upstream.
4. **Its framing is an advocacy device with no ruling behind it.** "Value if protected vs. revenue if logged" puts a standing stock priced as credits next to the Crown's royalty mislabelled as revenue, plus an ecosystem-services figure misread from a global table. It reaches a conclusion before the data does. That is what the charter's "never a number the data does not support" was written to stop, and no decision ever authorised it.
5. **Nobody can see whether it's right.** No method page is served (the PDF points to one that doesn't exist), no test pins a figure to a source, no end-to-end test drives a selection, and the one verification Lee owes for it (the unknown-age row) can't fail, because that row never renders.
