Overall verdict: FAIL (round 1)

# Critic, round 1: MEASURE (`2026-11-measure-fix.md`)

Reviewer: plan-reviewer agent (Opus, xhigh), not the plan's author. Plan at commit a44b775. Review ran 2026-11-11 05:39Z to 05:53Z (`date -u`). Rubric: `rules/plan-critic-rubric.md` v2. DECISIONS read in full; CHARTER, beta-resequence (S1-lite, S0b, MERGE, NUM), C5 in `glowing-dazzling-brooks.md`, the 2026-10-08 accuracy report and its `measure.py`, both builders, the hero test, the hero, `chapters.ts`, the scrub JSON, the registry cap and the HEAVY plan all read.

**The short version.** The diagnosis is right. The two defects are real, I counted the nine polygons myself, and the union method is the correct quantity. It is also tractable on this data. Three things block it. First, the cross-check that decides whether the new number ships would very probably reject the correct answer. The plan reads the 2026-10-08 "1.7% union shortfall" as the overlap correction alone. That 1.7% was measured with the nine polygons inside the union at their drawn size, on a raster instrument whose own error is about 1%. Removing the nine alone takes 77,791 ha (1.32 points) out of the union, which I measured here. So the expected shortfall is about 2.7%, outside the plan's 1.2 to 2.2% window. The upper bound repeats the program's arithmetic slip too: it subtracts drawn area from a sum of recorded areas. Second, 431 of the in-scope polygons are invalid, and the plan says nothing about them. On this host's GEOS, 12 of them raise `TopologyException` in a representative overlay. Both builders already wrap per-line work in `except Exception: continue`, so the obvious patch would silently drop area from a public number. Third, the guard named for "no public number goes up" cannot catch an increase. The Python fixture test also has no isolated output path and no Python dependencies in CI. Every fix is small and none of them changes the design.

## Applicability

Project type: civic data pipeline plus a public-number copy change on a deployed site (opencanopy.ca), released under the standing yes.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X1 Physical & human safety | **does not fire** | | No hardware, heat, firmware or physical output. |
| X2 Privacy & data stewardship | **does not fire** | | FTEN cutblocks plus `company_id` (licensee companies, not persons). No personal, health, child or client data. |
| X3 Evidence & source integrity | fires | **GATING** | Changes a public figure ("5.8 million hectares") and the chapter's figure. Lee's ranked first anti-goal is a wrong number spreading (DECISIONS 2026-10-23). |
| X4 Audience, brand & money accuracy | fires | ADVISORY | Public copy on the landing page. No money, legal terms or signature. |
| X5 Concurrency & re-entrancy | fires | ADVISORY | A heavy run on a shared host, and a test that writes into the repo while vitest runs files in parallel. |
| X6 Operability & observability | fires | ADVISORY | A deployed release with live guards. |
| X7 Self-modification safety | **does not fire** | | Uses HEAVY's lock; changes no MARVIN gate, hook or skill. |
| X8 Dependencies, performance & cost | fires | ADVISORY | A 1.86 GB input and a new hard dependency on shapely and pyproj, which are user-site installs here and absent from CI. |

## Dimension verdicts

**1. Problem-fit: CONCERN.** It serves the anchor and matches Lee's 2026-10-23 amendment ("a downward correction may ship before the merge"). Four gaps:
- (a) After this ships, the story count uses max(recorded, drawn) while /map and the WFS proxy still cap on the attribute (`registry.ts:241-244`, `netlify/edge-functions/*` `cqlFilter: "PLANNED_GROSS_BLOCK_AREA < 2000"`). That is a temporary breach of the DECISIONS heading "in the story and on the map alike". The Out of scope line names only the MapLibre filter and leaves the owner as "T-pre or REBUILD".
- (b) The coordinator's brief item 5 (ROADMAP `next`) includes the /raster max-age. The plan defers it to S2-pages per the program, which is technically right, but it does not say the deviation is reported back.
- (c) The plan never cites C5's story truth checks (`glowing-dazzling-brooks.md:368-385`), which define exactly these semantics: unique area first recorded per year, cumulative as the dissolved union, overlaps dissolved before summing. C5 also requires headline figures "asserted equal to an independently derived, versioned total ... never against a preferred threshold".
- (d) The ruling says the corrections "go out with S1-lite". Shipping them alone and earlier fits "as soon as they are built", but the plan should say so.

*Fix:* add an "Alike, temporarily" line. Name the divergence, the WFS CQL beside the MapLibre filter, and one owner. T-pre is the program's tile relay; add the drawn-area property to its scope note in beta-resequence. Add one sentence telling the coordinator the /raster part stays with S2-pages. Cite C5 and say which of its checks MEASURE satisfies (semantics, dissolve, independently derived total) and which it leaves to S0b and S1-lite (frame checks).

**2. Approach soundness: CONCERN.** The method is the right quantity. Summing `area(p − ∪ earlier)` over polygons in any total order is the telescoping identity for the area of a union, so the total is exact. Within a year, polygon order changes nothing, because `annual[y]` = area(∪year y − ∪years < y) is order-free. The data is tractable: 183,726 kept polygons and 59.96 M vertices (p99 2,191, max 126,360 per polygon). My streaming passes held 116-237 MB, and a full in-memory run should need a few GB, not 12. Five gaps in the specification:
- (a) "A per-year tree rebuilt as years advance" holds only earlier years. shapely 2's STRtree is immutable, and the plan never says what supplies "earlier polygons of the same year". Skip that and same-year overlaps count twice.
- (b) "`total` is the dissolved union" does not say whether it is Σ annual or a separate union.
- (c) Today's builder folds pre-1950 dated blocks into 1950 (`build-scrub-tables.py:128-130`; there is one, 14.64 ha). The plan says "dated 1950-2025 polygon" and leaves the fold undecided.
- (d) The quantity silently changes from the recorded `PLANNED_GROSS_BLOCK_AREA` to drawn area. That is benign: for the large blocks I computed, EPSG:3005 area matches the attribute to about 0.01 ha. It still needs declaring.
- (e) `geometry_area_ha` must be computed after repair (see 6).

*Fix:* use one STRtree over every kept, reprojected, repaired polygon. Rank polygons by (year, file index). For polygon i, query with `predicate="intersects"` and subtract the union of hits with a lower rank. Define `total = Σ annual` (exact by construction) and get independence from a separate method (see 9). State the fold, keep it or drop it, and name the 14.64 ha. Change the docstring and the JSON's `areaMeasure` to say drawn area (EPSG:3005), not "PLANNED_GROSS_BLOCK_AREA".

**3. Completeness: CONCERN.** Missing paths:
- (a) No order of work. The copy depends on the heavy run, and the heavy run depends on HEAVY being on the branch. `scripts/heavy-run.mjs` does not exist at a44b775; the HEAVY plan has only just passed its critic.
- (b) Invalid geometry (see 6).
- (c) No docs (see 10).
- (d) The sentence being re-authored makes two claims the shipped data does not carry. "Each red mark is a cutblock" is false of today's frames: a mark is a 470 ha `all_touched` cell, and the 1950 frame is the undated baseline (accuracy report 2.2). "Every tree was removed" cannot be checked: the preprocessed file carries three properties only, with no harvest method.
- (e) The Nova Scotia condition tests the raw total, not the figure the reader sees.
- (f) "Fire scrub unchanged" gives no reason, though fire is the same sum-against-union class at +16% (accuracy report 2.1).

*Fix:*
- Add a sequence: HEAVY merged → B1 code + fixture + mutants → heavy run under HEAVY → recorded cross-checks → B2 JSON + copy + tests + docs → reviser + Part 1 → checks → Razor → release.
- Brief the reviser to change the figure and the em dash only. Record the two claims as S0b/S1′ copy items, since the 2026-10-09 dots ruling already fixes what a dot means.
- Make the Nova Scotia test compare the hero's shown figure.
- Add one line on fire: a sum of fire sizes is a defensible "hectares burned" if no copy compares it to a land area, and NUM owns the /map readout.

**4. Right-sizing & reuse: CONCERN.** The shared `cutblock_area.py` is the right primitive, and reusing HEAVY is right. Proportion is fine at 48 lines with no code bodies. But about 11 files across two subsystem roots ride in one undivided batch with no dependency graph: the new lib, both builders, the JSON, the hero, `chapters.ts`, the hero test, the new fixture test, ARCHITECTURE, ROADMAP and handoff. *Fix:* the two batches above, B2 dependent on the recorded run, each declared independent or not.

**5. Security: PASS.** No secrets, auth or attack surface. A path override in a local build script is the only seam (see 7 for how to fence it).

**6. Failure modes: FAIL.** The plan has no behaviour for junk input, and the junk is in the real data. 431 in-scope dated polygons are invalid: 269 self-intersection, 121 ring self-intersection, 41 too few points; 22,775 ha drawn. On this host (GEOS 3.13.1, shapely 2.1.2), `difference` and `unary_union` raise `TopologyException` for 12 of them against a shifted copy of themselves, so a real run can stop mid-way. Both builders wrap per-line work in `except Exception: continue` (`build-scrub-tables.py:114` and `:135`, `build-year-overlays.py:470`). The predictable patch, skipping what raises, would silently undercount a public number and leave it irreproducible from the stated rule. `make_valid` costs essentially nothing here: polygonal area after repair differs from raw by 2 parts in 10^8 across all 431. Also unstated: what the session does on HEAVY's 240 or 241 refusals (wait, `--retry`, or report), and what happens if the run is killed. The JSON is written at the end, so a kill leaves the old file, which is fine, but say so.

*Fix:*
- In `cutblock_area.py`, repair with `shapely.make_valid`, keep polygonal parts only (`get_parts`, Polygon or MultiPolygon), and compute the cap area after repair.
- Remove the blanket `except` from the geometry path, or make it count and fail.
- Print an accounting line: read = kept + capped by recorded + capped by drawn only (expect 9) + undated + after 2025 (+ pre-1950 per the decision) + repaired (expect 431). Fail the run if any feature is unaccounted for.
- Name the response to 240 and 241 (`--retry`, then coordinator).

**7. Change safety: CONCERN.** The release is reversible by revert, and the JSON is written only at the end. Three risks:
- (a) The fixture test points the builder's input at a temp ndjson "by an env override", but the builder always writes to `src/data/scrub/cutblocks-scrub.json` (`_OUTPUT_DIR`, line 41). Run as described, `npm test` overwrites the committed table with fixture data.
- (b) Changing `build-year-overlays.py` now ships an untested edit that S0b inherits: a new shapely/pyproj import and a new cap path in a 12 GB build.
- (c) Nothing at release time stops an upward move (see 9, and the standing-yes note below).

*Fix:* add an output-directory override alongside the input override, refused unless `VITEST` is set (HEAVY's path-guard shape). The test asserts the committed JSON is byte-identical after the run. Give the overlay builder's use of the shared rule its own unit test, via the shared function on the same fixture rows, or defer that edit to S0b and say so.

**8. Data integrity & compatibility: CONCERN.**
- (a) `areaCap: 2000` keeps its number but changes its meaning. The hero test still says it is "the cap the map uses", which stops being true: the map caps on the attribute.
- (b) "`CAP_HA` stays pinned to `CUTBLOCK_AREA_CAP_HA` ... by the existing hero-figure test" overstates the guard. That test pins the JSON's `areaCap` after a rebuild. It reads neither the Python constant nor anything the overlay builder uses.
- (c) The definition now changes under MERGE and the film (the handoff's "the hero's 5.8M and the film's 10M must come from the same merged measure"), and nothing tells MERGE.

*Fix:*
- Add `"areaCapRule": "max(recorded, drawn)"` and the checkpoint vintage, for C5's "versioned".
- Add a test that reads `scripts/lib/cutblock_area.py` and pins `CAP_HA` to `CUTBLOCK_AREA_CAP_HA`, the pattern `proxy-consistency-audit` uses for the proxy literal.
- Add a hand-off line for MERGE: the FTEN half must use `cutblock_area.py` and union semantics.

**9. Verifiability: FAIL.** Three defects in how the result is proven:
- (a) **The cross-check would reject the expected correct answer** (detail under X3). The window of 1.2 to 2.2% below 5,888,477 accepts only 5,758,927 to 5,817,816 ha, capped at 5,805,557. The expected result sits near 5.71 to 5.73 M, with the reference instrument's own ±0.6-1.4% around it (accuracy report §6). A run that is correct "is investigated, not shipped", and the likeliest real outcome is a window adjusted after seeing the answer.
- (b) **Review Focus 5 names a guard that cannot fire.** "No public number goes up (the hero test's upper bound)": that bound compares the hero to the newly rebuilt total. A union bug that raised the total to 5.95 M would let the hero become 5.9 and stay green.
- (c) **The fixture test is under-specified.**
  - It has one mutant (attribute-only cap). It needs at least: sum instead of union (drop the `difference`), same-year polygons not subtracted, years processed in reverse (the total holds but `annual` moves, so the test must assert per-year values, not only the total), and no `make_valid` (an invalid fixture polygon raises or reads area 0).
  - The expected areas must not come from calling `geometry_area_ha` (tautology). Define the squares in EPSG:3005 metres (1 km square = 100 ha) and inverse-project them, so the expectation is exact.
  - CI (`.github/workflows/ci.yml`) installs Node only and has no shapely or pyproj. The test will either go red in CI or, if guarded like `color-audit`'s python3 check, skip there and never fire.

*Fix:* replace the cross-check per the X3 fix. Add a test pinning `total <= 5888477.44` on this checkpoint, plus a run-time stop: any increase goes to Lee. Add the mutants above, the EPSG:3005 fixture, and output isolation (7). Either add a pinned `pip install shapely==2.1.2 pyproj==3.7.2` step to CI, or make the test fail, not skip, under `CI=true` when the imports fail. Review Focus 1 and 3 then point at those recorded artefacts and tests.

**10. Maintainability: CONCERN.** There is no Docs section. Owed:
- ARCHITECTURE's pipeline paragraph (lines 196-198: shared cap rule, union semantics, the heavy-run invocation).
- The `build-scrub-tables.py` docstring (still "cumulative PLANNED_GROSS_BLOCK_AREA").
- The hero test's header ("supports 5.89M ha").
- The hand-off line "Measure-merge defects ... fold into the inventory+FTEN merge, before any public number changes", which this plan contradicts and which must go through the writer.
- beta-resequence's S1-lite "scope added" paragraph and C5's "S1-lite documents whether today's scrub tables follow that definition", so S1-lite does not redo this.
- ROADMAP shipped.

Also, the plan says the defects were "verified in code" but cites the wrong lines. The cap test is at `build-scrub-tables.py:122-124`, not 113-115, and the sum at `:133`, not `:125`. *Fix:* add a Docs section listing these, and correct the citations.

**X3. Evidence & source integrity: FAIL [GATING].** The plan's acceptance numbers come from a misread measurement and a carried arithmetic error.
- (a) "Overlaps counted twice ... the dissolved union is 1.7% lower in 2025" attributes a net figure to one cause. The report's ladder (accuracy report §2.2) measured the attribute-capped union at 5.788 M. That union held the nine polygons at their drawn size, 82,920 ha spherical. The scrub sum held them at their recorded 1,619.4 ha. The union was a 16x raster supersample whose areas are spherical (0.37% under EPSG:3005 on the polygons I checked). The report's own `measure.py` also put pre-1950 blocks in the undated bucket, while the scrub folds them in. Measured here: the nine add **77,791.4 ha of unique area** to the union, since only 5,442 ha of them is covered by kept blocks. So the overlap-only shortfall is not 1.7%. On the report's own scale the new total is about 5.788 − 0.078 ≈ 5.71 M spherical, about 5.73 M at EPSG:3005, a shortfall near 2.7%.
- (b) The upper bound reads "5,888,477 ha minus the nine polygons' recorded areas (the cap alone, about 5,805,557 per the program)". The nine's recorded areas total 1,619.4 ha, which gives 5,886,858.0. 5,805,557 is 5,888,477 minus their drawn 82,920, a mixed-unit subtraction carried from `beta-resequence.md:192` ("the cap correction alone takes it to about 5,805,557"). Removing the nine from a sum of recorded areas removes only their recorded areas. The plan's words and its number disagree by 81,301 ha.
- (c) Lee's "very likely 5.7 million" (DECISIONS, 2026-10-23 amendment) came from that chain. By this measurement it still very probably holds. That is a coincidence worth recording, not a derivation.

*Fix:* drop the 1.2 to 2.2% window and the 5,805,557 bound. Gate on identities and an independent derivation instead (C5):
1. Σ `annual` = `total` to 0.01 ha, and the accounting line in 6 closes.
2. `total` < 5,888,477.44 (else stop, Lee) and `total` ≤ Σ drawn EPSG:3005 area of the kept set.
3. A second method yields the same total within 0.01%. For example, clip the kept polygons to a fixed grid and `unary_union` per tile, under the same HEAVY run. Write both totals, the method and the checkpoint date to a committed evidence file (say `research/measure-2026-11/crosscheck.json`), and have a test pin the scrub total to it.
4. The 2026-10-08 sparse Fort Nelson box (2025 truth union 1,418 ha, shapely, accuracy report §1.2; none of the nine nearby) reproduces within 0.5%.

Before the run, state the expectation as a plausibility band only (about 5.65 to 5.81 M from the ladder and its instrument error), not as the acceptance test. Correct the program's 5,805,557 sentence by an amendment in beta-resequence. Record in the plan that the nine are 83,233 ha by EPSG:3005, so the run's log will not read 82,920.

**X4. Audience, brand & money accuracy: CONCERN [ADVISORY].**
- The floor is right. "5.7 million" and the chapter carrying the same floored figure in place of the rounded-up "nearly 6" respect the 2026-09-02 ruling.
- The reviser should be briefed not to add or re-certify claims (see 3(d)).
- The hero subline is two stacked fragments, "Logged since 1950. An area larger than Nova Scotia." It sits beside the edited figure and should go through the same Part 1 pass (`~/marvin/knowledge/email-voice.md:22-31`), or be declared out of scope.
- "Larger than Nova Scotia" stays unsourced on the page. The handoff's own Owed list says the comparison "was from memory", and the beta bar (b) requires a visible source link. NUM owns it. Name NUM in Out of scope so this relay does not re-bless it.

**X5. Concurrency & re-entrancy: CONCERN [ADVISORY].** HEAVY covers two heavy jobs at once. The new risk is the fixture test writing the committed JSON while other vitest files import it in parallel workers, which gives flaky or falsely green results. *Fix:* output isolation, as in 7.

**X6. Operability & observability: PASS [ADVISORY].** Guards are named: identity, console, live hero text equal to the committed figure, `/` and `/map` 200, `story`. The phone check is owed and non-blocking, as the 2026-10-07 amendment allows, and before/after figures go to the coordinator. One note: say how the hero guard reads the live page (the static HTML of `/`) so it can be shown to fire. Its showing of the old defect is simple: today's live page says 5.8, which must be red against a committed 5.7.

**X8. Dependencies, performance & cost: CONCERN [ADVISORY].** shapely 2.1.2 and pyproj 3.7.2 become hard dependencies of both builders. On this host they are user-site installs (`~/.local/lib/python3.12/site-packages`), declared and pinned nowhere, and CI has neither. Performance is fine: about 184k polygons and 60 M vertices fit in a few GB, and running under HEAVY is the conservative call. *Fix:* pin both in a `scripts/requirements.txt` (and in CI if the test runs there). Record the run's peak RSS and wall time in ARCHITECTURE's Heavy builds paragraph. "Beside the job" is not a place.

## The brief's questions, answered

- **Is the union algorithm correct and tractable?** Correct as an identity, and tractable at 183,726 polygons and 59.96 M vertices. Two conditions: same-year polygons are subtracted (unspecified) and the geometry is repaired (unaddressed, 431 invalid).
- **Does order within a year matter?** No, for `annual` and `total`, provided same-year earlier polygons are subtracted. Floating-point noise is not an issue, but keep file order for byte-stable reruns.
- **Is "new area per year" the right quantity?** Yes. For "logged since 1950" set beside a land area (Nova Scotia), the cumulative union is the only honest measure. For `cumulativeNorm` it matches C5's "unique area first recorded as harvested that year" and the first-year-encoded dot film S0b will build. Re-harvest moves to the first year, which is the understate direction.
- **Does deferring the overlay PNGs to S0b leave an inconsistency "does not dramatize" forbids?** It leaves one, but the plan does not create it, and the deferral is right. The shipped frames already paint 5.66x the logged area (accuracy report §2.2). The nine's 77,791 ha of unique paint is 0.24% of the 32.75 M painted in the 2025 frame. Before this plan the count held the nine at only 1,619 ha, so the count-picture gap for them moves by 1,619 ha. A 12 GB rebuild that removes two blobs from a picture S0b replaces would be waste. Conditions: the plan should say plainly that the frames overstate until S0b, and that S0b inherits a tested shared rule.
- **Are the cross-check bounds sound?** No (X3, 9).
- **Does the copy plan respect the floor ruling?** Yes for the figure. The Nova Scotia check should test the shown figure, and the rewritten sentence's other claims need a decision (3, X4).
- **Is the release inside Lee's standing yes?** Yes, on three conditions. The relayed 2026-11-10 exclusion ("changing a public number before the measure-merge fixes (2,000 ha cap on max(attribute, geometry), overlap dissolve)") names these fixes as what must come first, and this release is them. Lee's own 2026-10-23 words authorize the downward correction "as soon as they are built", with the floored headline. The conditions:
  1. The number must fall. No test today enforces it (9).
  2. No critic round may stand at FAIL at release. This round is FAIL.
  3. `request --approval` should carry both texts, the 2026-11-10 one verbatim and marked relayed.

  An upward or unchanged-but-redefined figure is outside both texts. The partial application (count now, picture in S0b, map in T-pre) is within "the headline takes the corrected, floored figure", but the plan should say so in those words.

## Measurements behind this review (scratch, this round)

All runs at nice 19 on the shared host, 1-minute load 2.0 to 4.8 throughout (`uptime`), memory-light, under the session scratchpad (`measure/scan.py`, `nine.py`, `invalid.py`, `invalid2.py`). No union of the full set was run.
- `tenure-cutblocks.ndjson`: 220,745 features (187,970 Polygon, 32,775 MultiPolygon). 183,805 dated up to 2025, including 1 pre-1950 (14.64 ha); 332 dated after 2025; 36,608 undated; 70 dated at recorded ≥ 2,000 ha. No dated feature has a null or zero recorded area. Kept under today's rule: 183,735, recorded sum 5,888,477.44 (equals the shipped `total`), spherical drawn sum 5,935,474 (the report's 5.936). Scan: 2 min 41 s, 143 MB RSS.
- The nine: identical set by spherical area (82,919.6 ha) and EPSG:3005 area (83,233.3 ha). Recorded 1,619.4 ha. Years 1991, 1996, 2002, 2003 (four), 2008 (two). 267 kept blocks touch them, covering 5,442 ha. **Unique contribution to the union: 77,791.4 ha.** Six more blocks sit at 1,795 to 1,940 ha drawn, all under 2,000 by either method, so the count is not threshold-fragile.
- Validity: 431 invalid in scope (269 / 121 / 41 by reason). `make_valid` changes their total polygonal area by 2 × 10^-8. 12 of 431 raise `TopologyException` in `difference`/`unary_union` against a shifted copy on GEOS 3.13.1. A bowtie reads area 0; an overlapping-part MultiPolygon reads 8.0 against 6.0 after repair.
- The preprocessed file carries `DISTURBANCE_START_DATE`, `PLANNED_GROSS_BLOCK_AREA` and `company_id` only. No block id, no harvest method.
- One of the nine (2003, 18,625 ha, centroid -126.929, 50.112) lies inside the report's dense Nimpkish box, so that box's recorded truth (49,327 ha) changes under the new rule. The sparse Fort Nelson box is untouched.

## Stress tests

**Pre-mortem: it is February and this failed.**
1. *The number shipped on an adjusted check.* The run returns about 5.73 M. The 1.2 to 2.2% window says no, and the session widens the window to fit, or holds item 5 while G1 waits. The type-specific worst case for this plan: a public figure ships on an acceptance test bent after seeing the answer, which is exactly what C5 forbids ("never against a preferred threshold"). We should have seen that the 1.7% was measured on a different population and instrument.
2. *Silent drop.* Forty minutes in, GEOS throws on a self-intersecting 2003 block. The fix wraps the overlay in the builders' familiar `except: continue`. Up to 22,775 ha leave the count unrecorded, and a rerun with a repair step gives a different public number. "Reproducible from the shipped data" (DECISIONS 2026-09-02) breaks without anyone seeing it.
3. *The guard that ate the table.* The fixture test overwrites `cutblocks-scrub.json` in a parallel vitest run, the hero test reads fixture totals, and CI either reds on `import shapely` or skips the fixture forever. The beta bar (f), CI green, is lost, or worse, kept by a guard that cannot fire.

**Load-bearing assumptions.**
1. *The 2026-10-08 1.7% is the overlap correction for this population.* **False (measured).** The nine alone move the union by 1.32 points, and the instrument's error is about 1%. Consequence: the acceptance window is wrong. Resolve before implementation.
2. *GEOS overlays run clean on FTEN polygons.* **False (measured).** 431 invalid, 12 raise in a representative overlay. Resolve before implementation.
3. *The fixture test runs where it matters (CI) without touching committed data.* **Unverified, likely false** as written: no output override, no Python deps in CI. Resolve before implementation.
4. *The standing yes covers this release.* High confidence, if the number falls and no round is at FAIL. If wrong, a public number changes without Lee's yes, his ranked first anti-goal. Make the fall an enforced check.
5. *HEAVY is merged before the run.* Not true today (`scripts/heavy-run.mjs` absent at a44b775). Sequence it.

**Inversion.**
- *Rebuild the overlays now* would win if S0b were far off, or if the nine were a material share of the picture's overstatement. Neither is true: S0b follows HEAVY in G2 by the program, and the nine are 0.24% of 2025's painted area. Deferral stands.
- *Fix /map now* would win if the tiles carried a block id, so the nine could be filtered by id, or a drawn-area property. They carry neither (measured). It needs a rebuild. Deferral stands, but name one owner and add the proxy CQL.
- *A raster union in place of the vector union* would win only if its error were below the corrections being measured. It is about 1%, against corrections of 1.3 and 2.5%. The vector union is right.
- *Hold the correction for MERGE* would win only if Lee wanted one hero change. He ruled otherwise on 2026-10-23.
- *The plan's own window* would be right only if the 1.7% had been measured on the new population with an exact method. It was not.

## Close

**Overall.** FAIL, on three gating dimensions: Failure modes (6), Verifiability (9) and Evidence (X3). The plan has the right diagnosis, the right quantity and a tractable method. It fails on how it proves the number before it goes public. Its cross-check is built on a measurement taken with the nine polygons inside it and on a mixed-unit subtraction, so it would turn away the answer it expects. Its stated guard against a rising figure compares the figure with itself. And it is silent about 431 invalid polygons that the real run will meet. All of these are folds, not redesigns. Round 2 should be able to pass if they go in as written.

**Must-fix, in priority order.**
1. Replace the cross-check with identities, an independent second derivation committed as evidence, the sparse-box regression and a no-increase stop. Drop the 1.2 to 2.2% window and the 5,805,557 bound, and correct the program's sentence (X3, 9).
2. Repair geometry in `cutblock_area.py`: `make_valid`, polygonal parts, cap area after repair. Remove or make fatal the blanket `except` on the geometry path, and print an accounting line that must close (6).
3. Add a test pinning `total <= 5888477.44` on this checkpoint, and point Review Focus 5 at it (9).
4. Fixture test: output-directory override fenced to `VITEST` and a byte-identical check of the committed JSON; EPSG:3005-defined squares; mutants for sum-not-union, same-year, reverse-order and no-repair; Python deps pinned and present in CI, or a test that fails rather than skips under CI (7, 9, X5, X8).
5. Specify the same-year mechanism (one STRtree, rank filter), `total = Σ annual`, the pre-1950 fold, and drawn-area semantics in `areaMeasure` and the docstring (2).
6. Order of work and batches: HEAVY merged first; B1 code and tests, run, B2 JSON, copy and docs (3, 4).
7. Docs section: ARCHITECTURE, docstring, hero test header, hand-off line via the writer, beta-resequence S1-lite/C5 notes, ROADMAP. Correct the line citations (10).
8. Name the temporary story/map divergence with one owner and the proxy CQL. Cite C5. Report the /raster deviation to the coordinator. Hand MERGE the definition (1, 8).
9. Pin `CAP_HA` to `CUTBLOCK_AREA_CAP_HA` from the Python source, and add `areaCapRule` and the checkpoint vintage to the JSON (8).
10. Constrain the reviser to the figure and the em dash. Route "each red mark is a cutblock" and "every tree was removed" to S0b/S1′ copy. Compare Nova Scotia to the shown figure and name NUM for its source. Put the hero subline through Part 1 or declare it out of scope (3, X4).
11. Release text: quote both Lee texts, state the conditions (falls, no FAIL round) and the partial application (1, release).
