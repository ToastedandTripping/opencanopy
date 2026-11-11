Overall verdict: CONCERN (round 2)

# Critic, round 2: MEASURE (`2026-11-measure-fix.md`)

Reviewer: plan-reviewer agent (Opus, xhigh), not the plan's author. Plan at commit 6548b6a (the fold of round 1, diffed against a44b775). Review ran 2026-11-11 05:57Z to 06:20Z (`date -u`). Rubric: `rules/plan-critic-rubric.md` v2. DECISIONS read at `origin/main@b5c0753` (identical to the worktree copy; 29 entries, no shrink). Also read: round 1, both builders, the hero test, `HeroSection.tsx`, `chapters.ts`, `ci.yml`, `netlify.toml`, the HEAVY plan, the hand-off, beta-resequence (S1-lite, T-pre), C5 and C5b in `glowing-dazzling-brooks.md`, the 2026-10-08 accuracy report and its `regions.py`.

**The short version.** Every round-1 FAIL is folded, and the folds hold up on real data. I ran the plan's union method and its tile method on the densest logged window in the province (north Vancouver Island, 5,226 kept polygons, 1.12 M vertices). They agree with each other and with a single `union_all` to one part in 10^15. The rank filter never unions more than 28 lower-rank neighbours, and geometry costs 43.5 bytes per vertex, about 2.6 GB for the whole kept set. Every one of the 220,745 features builds, repairs and projects without raising, so the new fatal geometry path will not stop a run on this checkpoint, and no shipped frame depends on a skipped geometry. The Fort Nelson box reproduces at 1,418.02 to 1,418.76 ha by every clipping method, against the report's 1,418. Nothing gating fails.

What remains is a set of weak or vacuous checks and a few unfolded small items:
- Acceptance 1 is true by construction. It was my round-1 advice, and I should not have offered it.
- Acceptance 2 passes the sum-not-union bug, because the kept set's drawn sum is 5,875,854 ha, under the shipped figure.
- Acceptance 3's 0.01% tolerance is about 10^11 times looser than the two methods' real agreement.
- No check verifies the kept set on real data, since both methods share it.
- The fixture misses the multipolygons and holes that Review Focus 2 says it covers.
- `crosscheck.json` sits outside the test's output fence.
- The CI step installs into an unpinned system Python on `ubuntu-latest`.
- Four round-1 items were not folded: the line citations, hand-off line 29, T-pre's scope note and the fire line.

Every one of these is fixed by a sentence or a test assertion.

## Round-1 must-fix ledger

| # | Round-1 must-fix | State in 6548b6a |
|---|---|---|
| 1 | Replace the window with identities, a second derivation, the sparse box and a no-increase stop; drop 5,805,557; amend the program sentence | **Folded.** One check is vacuous and one too loose (see 9). |
| 2 | `make_valid`, polygonal parts, cap after repair; fatal geometry `except`; accounting line | **Folded.** The accounting line carries no expected counts (see 6). |
| 3 | Test pinning `total <= 5888477.44`; Review Focus 5 points at it | **Folded.** "On this checkpoint" is not defined (see 8). |
| 4 | Output fence and byte check; EPSG:3005 squares; four mutants; Python deps in CI or fail under CI | **Folded**, with three gaps: `crosscheck.json` is outside the fence, the fixture has no multipolygon or hole, and the CI Python is unpinned (7, 9, X8). |
| 5 | One STRtree with a rank filter; `total = Σ annual`; pre-1950; drawn-area semantics in `areaMeasure` | **Folded.** Measured correct and tractable. |
| 6 | Order of work, two batches | **Folded.** No waiver for B1 spanning three roots (4). |
| 7 | Docs section, hand-off line, citations | **Partly folded.** The Docs section exists, but it names hand-off line 57, not line 29, which is the one round 1 quoted. The citations are still wrong (10). |
| 8 | Divergence and owner, proxy CQL, cite C5, /raster report, hand MERGE the definition | **Partly folded.** T-pre is named but its scope note is not amended. C5 is cited by name only, and C5b's area contract is not mentioned (1). |
| 9 | Pin `CAP_HA`; `areaCapRule` and checkpoint in the JSON | **Folded.** The checkpoint is a file mtime (8). |
| 10 | Constrain the reviser; route the claims; Nova Scotia on the shown figure; subline | **Folded.** |
| 11 | Release text: both Lee texts, conditions, partial application | **Folded.** |

Two of round 1's dimension fixes, outside the numbered list, are not folded: the response to 240 and 241 and the kill behaviour (dimension 6), and the one line on fire (dimension 3).

## Applicability

Project type: a civic data pipeline plus a public-number copy change on a deployed site, released under the standing yes. A CI workflow edit rides along.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X1 Physical & human safety | **does not fire** | | No hardware, heat, firmware or physical output. |
| X2 Privacy & data stewardship | **does not fire** | | FTEN cutblock geometry, dates, areas and licensee company ids. No personal, health, child or client data. |
| X3 Evidence & source integrity | fires | **GATING** | It changes the landing page's headline figure and the chapter's figure. |
| X4 Audience, brand & money accuracy | fires | ADVISORY | Public copy. No money, legal terms or signature. |
| X5 Concurrency & re-entrancy | fires | ADVISORY | A heavy run on a shared host, and a test that runs the builder while vitest workers read committed files. |
| X6 Operability & observability | fires | ADVISORY | A deployed release with live guards. |
| X7 Self-modification safety | **does not fire** | | The CI workflow is the project's automation, not a MARVIN gate, hook or skill. HEAVY's lock is used, not changed. The workflow risk is judged under 7. |
| X8 Dependencies, performance & cost | fires | ADVISORY | A new pinned shapely/pyproj step in CI, user-site installs on the host, and a 1.86 GB input. |

## Dimension verdicts

**1. Problem-fit: CONCERN.** The plan serves the anchor and the 2026-10-23 amendment. Three gaps:
- (a) The Intent quote of the 2026-10-23 amendment elides "with S1-lite". The plan reads "go out ... as soon as they are built"; DECISIONS reads "go out with S1-lite as soon as they are built". An ellipsis over a qualifier in a quoted ruling is not how to deal with that qualifier. Round 1's 1(d) asked the plan to say why shipping ahead of S1-lite fits "as soon as they are built". It still does not.
- (b) C5b ("One area contract", `glowing-dazzling-brooks.md:390-418`) has S1-lite build `area-contract v1` "in TypeScript with a Python twin for the build scripts". It comes with a shared fixture set ("overlap, re-harvest, cap boundary, year boundary") and twin equivalence checked in CI. `scripts/lib/cutblock_area.py` is that Python twin, built early. The plan never says so, so S1-lite will either build a second Python implementation or inherit this one without knowing.
- (c) C5 is named, but the plan does not say which story truth checks it satisfies and which it leaves. It satisfies the area semantics, the dissolve and the independently derived total. It leaves the frame checks to S0b and the per-year 2% reconciliation to S1-lite.

*Fix:*
- Quote the amendment whole, and add one sentence: item 5 ships the corrections before S1-lite, under "as soon as they are built", and S1-lite inherits them.
- Name `cutblock_area.py` as C5b's Python twin. Its fixture (see 9) seeds the shared fixture set, and its label is the one S1-lite versions as v1.
- Add one line mapping C5's checks: done here, owed by S0b, owed by S1-lite.

**2. Approach soundness: PASS.** The rank-filtered single-STRtree union is the telescoping identity, and it holds in practice. On the dense window (`r2_union.py`):
- The rank filter gave 132,928.6261 ha in 5.6 s, with at most 28 lower-rank hits for any polygon (3,482 in all) and no exceptions on repaired input.
- Tiles at 10 km and at 2 km gave the same figure to 9e-16 and 2e-16, and a single `union_all` gave it too.
- The prefixes through 1990 and through 2005 match the tile method to 4e-16, so the annual split is right as well as the total.
- **Memory does not blow up.** Lower-rank hits stay in the tens even where logging is densest, and resident geometry costs 43.5 bytes per vertex, about 2.6 GB for 59.96 M vertices. "A few GB" stands.

Two notes for the implementer, advisory:
- Do not pre-clip hits with `clip_by_rect` to save work. I tried it, and 30 of the 5,226 overlays raised `TopologyException: unable to assign free hole to a shell`, because `clip_by_rect` can return invalid geometry. Under the plan's fatal rule that ends the heavy run. If you clip at all, use `intersection` with a box, in both methods.
- Valid input can still, rarely, raise in a GEOS overlay. Fatal is the safe default, but name the one allowed recovery so nobody improvises it mid-run: retry that single overlay with a fixed `grid_size` (for example 0.001 m), then count it and print it. Otherwise say plainly that a raise means no number and a rerun.

**3. Completeness: CONCERN.**
- (a) Not folded from round 1: "Fire scrub unchanged" still gives no reason. The cutblock count becomes a union while the fire table stays a sum, so the fire chapter now compares a sum with a union ("Since 2017, wildfire has taken more forest than logging did in decades", `chapters.ts:158`). The claim only gets safer, because logging falls. Say that in one line, and route the mixed measure to NUM.
- (b) Not folded: what the session does on heavy-run's 240 and 241 (`--retry`, then the coordinator, as HEAVY specifies), and on a killed run (the JSON is written last, so the committed file stands).
- (c) Acceptance 4 does not say which code computes the box or how it clips. I measured four ways (`r2_box.py`):
  - the 2026-10-08 method (`buffer(0)`, clip in lon/lat, then project): 1,418.06;
  - the plan's repair with the same clip: 1,418.06;
  - clipping in EPSG:3005 by the four projected corners: 1,418.76;
  - clipping in EPSG:3005 by a densified box: 1,418.02.

  All four pass at 0.5%, so the check is sound. Name the method anyway: the box in EPSG:4326 as `regions.py` defines it, clipped before projection.
- (d) Nothing says what happens if the total falls but lands far from the plausibility band (see X3).
- (e) Nobody is named as the writer of `crosscheck.json`. The run command is the scrub builder alone, so the builder must write into `research/`. Every future scrub rebuild, Lee's quarterly REBUILD included, would then overwrite a file in a directory dated 2026-11 with another checkpoint's numbers (see 10).

*Fix:* one line each for (a), (b) and (c). For (d) and (e), see X3 and 10.

**4. Right-sizing & reuse: CONCERN (minor).** Proportion is fine: 65 lines, no code bodies. B1 spans three roots (`scripts/`, `src/test/` and `.github/workflows/`) with no waiver, and its independence from B2 is implied by the order rather than declared.

*Fix:*
- Add one waiver line: "tests and the CI step travel with the code they exercise".
- Declare "B2 depends on the recorded run; B1 is independent".
- Commit the fixture as a data file with expected values, not an inline temp file, so C5b's TypeScript twin can reuse it.

**5. Security: PASS.** No secrets, auth or attack surface. The output override is fenced to `VITEST`; see 7 for the stronger fence shape.

**6. Failure modes: CONCERN.** Round 1's FAIL is closed: there is repair, the geometry path is fatal, and the run prints an accounting line. I checked the fatal path against the real file (`r2_construct.py`). All 220,745 features build in shapely, repair where needed (539 file-wide, 431 of them in the kept set or the nine), project to finite EPSG:3005 areas and keep a polygonal part. None raises, so the new rule stops nothing on this checkpoint. Two gaps:
- (a) **The accounting line closes by construction.** An if/elif chain with a counter on every branch always sums to `read`; it only catches a branch that skips without counting. The falsifiable version compares each bucket with counts measured independently of the builder (`r2_box.py`, round 1's `scan.py`). With the date tested before the cap, those counts are:

  | Bucket | Count |
  |---|---|
  | kept | 183,725 |
  | undated | 36,608 |
  | after 2025 | 332 |
  | out of range low (the year-1200 block) | 1 |
  | tenure boundaries among dated 1950-2025 | 79 (70 by recorded area, 9 by drawn area only; the nine total 83,233.26 ha) |
  | zero-area | 0 |
  | unparseable | 0 |
  | **Sum (= read)** | **220,745** |

  Separately, 431 are repaired and none is empty after repair. A run whose buckets differ stops and reports.
- (b) Two things are undefined under the new rule: "zero-area" (recorded ≤ 0, or drawn 0 after repair?) and the order of the bucket tests. Today the builder tests the cap before the date. If the new builder does the same, the boundary bucket also takes undated and post-2025 polygons (160 undated by recorded area alone), and the expected counts above must be re-derived for that order.

*Fix:* state the bucket order (date first matches the table) and the zero-area rule, and assert the measured counts as acceptance check 0. A JSON parse error stays "skippable and counted", but the expected count on this checkpoint is 0, so a non-zero count stops the run.

**7. Change safety: CONCERN.**
- (a) **`crosscheck.json` is outside the output fence.** The fixture test runs the same builder, and the builder writes `research/measure-2026-11/crosscheck.json`. Unless that path also moves under the override, `npm test` overwrites the committed evidence with fixture totals. The byte-identical check covers only `cutblocks-scrub.json`, and the "scrub total equals crosscheck.json" test then reads fixture numbers in a parallel worker. This is round 1's 7(a) again, in a new file.
- (b) **The fence is weaker than the shape it cites.** "Honoured only when `VITEST` is set" reads as "silently ignored otherwise". HEAVY's path guard (`2026-11-heavy-run.md:32`, modelled on `release-ledger.mjs:132-151`) refuses the override without `VITEST` and requires it under `VITEST`, so a test can never write a committed path at all.
- (c) **The CI edit changes the release path and never runs before main.** `ci.yml` installs Node only. The new step is a bare `pip install shapely==2.1.2 pyproj==3.7.2` on the system Python of `ubuntu-latest`. Ubuntu 24.04 marks that interpreter externally managed under PEP 668, and pip then refuses to install ([fixdevs](https://fixdevs.pages.dev/blog/pip-externally-managed-environment/), [pythonspeed](https://pythonspeed.com/articles/externally-managed-environment-pep-668)). I could not confirm from a first-party source whether the GitHub runner image ships the marker, so this is unverified. The step also sits before `npm test`, so a failed install turns the whole job red. Deploys do not wait on CI (Netlify builds on push), so the cost is a red CI on main after release, which is beta bar (f), noticed late.

*Fix:*
- (a) Route `crosscheck.json` through the same override, and extend the byte-identical assertion to it.
- (b) Adopt HEAVY's full fence: refuse the override without `VITEST`, and require it under `VITEST`.
- (c) Use `actions/setup-python@v5` with `python-version` pinned to the host's 3.12, then the pinned pip install. Prove the workflow with a CI run on the relay branch (`workflow_dispatch` exists, or open a PR) before release, and record the run URL in the release evidence.

**8. Data integrity & compatibility: CONCERN.**
- (a) `"checkpoint": "<preprocessed file mtime date>"` is a weak version: a copy or re-download changes it, and two different files can share a date. The checkpoint already carries `data/checkpoint/preprocessed/_manifest.json` (`"timestamp": "2026-05-06T15:26:00.354Z"`). Record that, plus the ndjson's byte size (1,863,260,083) or its sha256.
- (b) "`total ≤ 5888477.44` on this checkpoint" needs the test to key on that field. Unkeyed, it goes red on a legitimate future rebuild in which late-recorded 2025 blocks raise the total. Keyed, it stays silent on any other checkpoint, which is correct, but say so.
- (c) The hero test's first case is titled "the scrub table declares the cutblock area cap the map uses". After this change the map caps on the attribute and the story on max(recorded, drawn). Docs names the header comment, not the test name.

*Fix:*
- (a) As stated.
- (b) The test asserts `checkpoint === "2026-05-06T15:26:00.354Z"` before it applies the bound.
- (c) Rename the case, or have it say "the cap value".

**9. Verifiability: CONCERN.** The checks can now fail, which round 1's window could not do honestly. Several still prove less than they appear to:
- (a) **Acceptance 1 is true by construction.** The plan defines `total = Σ annual`, then checks that Σ annual = total. That was my round-1 suggestion, and it was wrong to offer it. The useful identity is per year: the tile method, run on the polygons dated up to Y, must equal Σ annual through Y. I measured it at 1990 and 2005 on the dense window, to 4e-16. Run it at three or four probe years (for example 1990, 2005, 2015 and 2025) in the same run.
- (b) **Acceptance 2 passes the most likely bug.** The kept set's drawn EPSG:3005 sum is **5,875,854.39 ha** (`r2_box.py`), under 5,888,477.44. A sum-not-union run passes both clauses (the second with equality), and the hero would floor to the shipped 5.8. Only acceptance 3 catches it. Keep acceptance 2 as a sanity line, but do not count it as a guard. Record 5,875,854.39 as the independent value the run's Σ drawn must reproduce.
- (c) **Acceptance 3's tolerance is far too loose.** At 0.01% it allows about 570 ha, while the two methods actually disagree by about 1e-15 relative. A bug worth hundreds of hectares would pass. Use 1 ha absolute.
- (d) **No check verifies the kept set on real data.** Both methods share the parser, the cap rule, the repair and the projection. The Fort Nelson box has 51 features and none of the nine, and the band is "not a test". The fixture and its mutants cover the rule's logic, but not a real-data mistake the fixture does not model, such as dropping holes on re-projection (the kept set has 22,716 holes). The independent counts and Σ drawn in 6(a) and 9(b) close this cheaply.
- (e) **Review Focus 2 points at a fixture that lacks its subject.** It says "Multipolygons and holes in the area function (fixture test)". The fixture as listed has:
  - two overlapping same-year squares;
  - one square overlapping an earlier year;
  - one large-drawn, small-recorded square;
  - one bowtie.

  That is no MultiPolygon and no hole. Nothing straddles a tile edge, so the tile method's seam handling is untested. Nothing sits at the cap boundary (recorded exactly 2,000) or the year boundaries (1949, 1950, 2025, 2026, a malformed year, undated), which C5b also asks for. There is no mutant for the tile method.
- (f) "A test pins the scrub total to `crosscheck.json`" only checks that two committed files agree. The test should also assert that the two methods agreed within the tolerance in (c), and the checkpoint.

*Fix:*
- Replace acceptance 1 with the per-year prefix comparison.
- Add acceptance 0: the measured counts, Σ drawn 5,875,854.39 ha, and the nine at 83,233.26 ha.
- Tighten acceptance 3 to 1 ha.
- Extend the fixture with:
  - a MultiPolygon with a hole that overlaps another block;
  - a pair of squares straddling a tile edge;
  - a block recorded at exactly 2,000 ha;
  - years 1949, 1950, 2025 and 2026, a malformed date and an undated feature, one per accounting bucket.
- Add mutants for "holes dropped", "tile assignment by centroid instead of clip" and "`>` for `>=`".
- Have the crosscheck test assert the agreement and the checkpoint.

**10. Maintainability: CONCERN.** The Docs section is a real improvement. Still missing:
- (a) The line citations round 1 corrected are unchanged. The cap test is at `build-scrub-tables.py:122-124`, not 113-115, and the sum is at `:133`, not `:125`. The plan's "verified in code" heading sits over the wrong lines.
- (b) Hand-off line 29 ("Measure-merge defects ... fold into the inventory+FTEN merge, before any public number changes") contradicts the 2026-10-23 amendment and this plan. Docs replaces line 57 only, and both lines are in "Owed right now".
- (c) T-pre is named as owner of the /map and proxy divergence, but its scope in beta-resequence (`:126-132`) is per-layer archives, forest-age from z10, non-public layers and tippecanoe flags. It carries no drawn-area cap and no proxy CQL, and Docs does not add them. Also note that the proxy's server-side CQL filters on the attribute. Whether the BC WFS can filter on drawn area at all is unverified, so T-pre may need a different mechanism.
- (d) `crosscheck.json` belongs to one dated investigation, but the builder will rewrite it on every rebuild (3(e)). Either the builder writes its cross-check beside the scrub JSON (for example `src/data/scrub/cutblocks-crosscheck.json`, keyed by checkpoint) and `research/measure-2026-11/` keeps a frozen copy, or the cross-check is a separate script that runs once.
- (e) `scripts/lib/` is the TypeScript lib directory and has no `__init__.py`. `from lib.cutblock_area import ...` resolves as a namespace package, which any installed regular package named `lib` would shadow. Insert `scripts/lib` on `sys.path` and `import cutblock_area`, or put the module at `scripts/cutblock_area.py`.

*Fix:* (a) to (e) as stated. Also add a Parking Lot line, or a note in S0b's and MERGE's hand-off, saying that the year-1200 block (ndjson line 181,679, `1200-11-01`, 14.64 ha) has a malformed date, so S0b's picture and MERGE treat it as undatable.

**X3. Evidence & source integrity: CONCERN [GATING].** Round 1's FAIL is closed: the misread 1.7%, the mixed-unit 5,805,557 and the window are gone, replaced by identities and a second derivation. The plan's own statements still carry four accuracy defects, and it lacks one tripwire:
- (a) The plan says that until S0b the story pictures overstate, painting "about 5.66 times the logged area, mostly the undated baseline". The source says the opposite. Accuracy report 2.2 attributes ×5.24 of it to all_touched on 1024 px (30.33/5.79), calling that "the whole story". The undated baseline is +2.43 M of the 32.75 M painted in 2025, and DECISIONS 2026-10-09 says the same. The conclusion to defer survives, because the nine are 0.24% of the paint.
- (b) "The one block dated before 1950 (14.64 ha)" is dated `1200-11-01` (ndjson line 181,679). It is an entry error, not early logging. Excluding it is right under "dated 1950-2025" and understates by at most 14.64 ha, but name it for what it is.
- (c) The quoted amendment elides "with S1-lite" (1(a)).
- (d) The line citations under "verified in code" are wrong (10(a)).
- (e) **The band needs a consequence that is not a threshold.** The plan is right not to make 5.65 to 5.81 M an acceptance test, which would be C5's "preferred threshold". With no consequence at all, though, a 5.4 M result from a shared kept-set bug would ship under the standing yes, and the C5 rule would silently drop the Nova Scotia comparison. Lee's text said "very likely 5.7 million". A result outside the band should stop and go to the coordinator for Lee, with a diagnosis, before anything ships. That is an escalation, not an adjusted window, and it never moves the figure.

*Fix:* correct (a) to (d) in place, and add (e) as a stop condition in Acceptance and in Release.

**X4. Audience, brand & money accuracy: PASS [ADVISORY].** Both figures are floored and equal. The reviser is limited to the figure and the em dash. The two unsupported claims, the subline fragments and the Nova Scotia source are routed to named relays still ahead in the program (S0b/S1′, S0a, NUM). Part 1 (`~/marvin/knowledge/email-voice.md`, lines 11-101) is re-run on the touched sentence.

One note. Removing the em dash from "Each red mark is a cutblock — an area where every tree was removed" leaves the sentence's known-unsupported claims live, re-touched by this relay. That is acceptable only because S0b replaces the sentence with the ruled dot caption (DECISIONS 2026-10-09). Say so in the reviser's brief, so the reviser does not polish a sentence that is already on its way out.

**X5. Concurrency & re-entrancy: CONCERN [ADVISORY].** The committed-JSON race is fenced, but the `crosscheck.json` race is not (7(a)). The heavy run itself is single-process, and HEAVY's lock covers it. Keep it that way: HEAVY's stated limits (`2026-11-heavy-run.md:36`) cover only builds that start no subprocesses. Say that the builder must not use `multiprocessing` unless that limit is revisited.

**X6. Operability & observability: PASS [ADVISORY].** The guards are named, the before and after figures go to the coordinator, and the phone check is owed and non-blocking. Round 1's note still stands: say that the hero guard reads the static HTML of `/`, and show it can fire (today's live 5.8 against a committed 5.7 is red).

**X8. Dependencies, performance & cost: CONCERN [ADVISORY].**
- shapely 2.1.2 and pyproj 3.7.2 are user-site installs on this host. `python3 -I` cannot import them (measured), so a run in isolated mode or as another user fails at import. There is still no `scripts/requirements.txt`.
- CI pins the packages but not the interpreter (7(c)).
- "Peak memory and wall time recorded" names no instrument, and heavy-run records neither. Use `/usr/bin/time -v` inside the heavy-run command (present on this host; I used it), or have the builder print `ru_maxrss`.
- Expected scale, extrapolated from the dense window and my streaming passes: geometry about 2.6 GB resident, about 2 to 4 minutes to parse and project, and minutes for both unions.

*Fix:* add `scripts/requirements.txt` with both pins, use it in CI, and name the instrument in the run command.

## The brief's questions, answered

- **Is the rank-filtered single-STRtree union correct?** Yes. It is exact as an identity, and on real data it matches two other methods to 1e-15, per year as well as in total.
- **Is it tractable, or does memory blow up in dense areas?** No blow-up. In the densest window the largest lower-rank union for any polygon is 28 polygons. The whole window takes 5.6 s and about 325 MB with every method loaded. Province-wide, geometry is about 2.6 GB at 43.5 bytes per vertex. Do not pre-clip with `clip_by_rect` (30 raises measured).
- **Is the tile method genuinely independent, and can tile edges double count?** It is independent of the rank and difference logic, which is the bug class it catches: sum-not-union, same-year overlaps not subtracted, a wrong rank comparison. It is not independent of the parser, the cap rule, the repair or the projection, which both methods share; hence acceptance 0 in 9. Clipped by `intersection`, tile edges cannot double count, because neighbouring pieces share only a boundary of zero area; 10 km and 2 km tiles gave identical totals. Tiles would double count only if polygons were assigned to tiles whole rather than clipped, which deserves a mutant.
- **Can the acceptance checks fail, or are they satisfiable by construction?**
  - Acceptance 1 holds by construction. Replace it.
  - Acceptance 2 can fail, but not on sum-not-union (5,875,854.39 < 5,888,477.44).
  - Acceptance 3 can fail, but its tolerance hides about 570 ha.
  - Acceptance 4 can fail, and a correct run passes it by every clipping method (1,418.02 to 1,418.76 against 1,418).
  - The accounting line holds by construction unless it carries expected counts.
- **Does the pre-1950 exclusion fit the 2026-09-02 and 2026-10-23 rulings?** Yes. The entry's definition is "dated 1950-2025", the 2026-10-23 amendment does not touch the date range, and "when in doubt, understate" covers the 14.64 ha. The block is dated year 1200, which makes the case stronger.
- **Does any existing overlay frame depend on skipped geometries?** No:
  - every line parses (round 1);
  - every feature builds, repairs and projects without raising (this round, all 220,745);
  - the 2026-10-08 replica matched the shipped 1990, 2010 and 2025 frames with 0 mismatched pixels, and a dropped year mask would have broken the cumulative 2025 frame.

  Two notes. Scope the fatal change to the cutblocks cap path, so that fire and `run_forest_base` (its own `except` at `build-year-overlays.py:272-274`) keep their behaviour. And say whether the overlay builder rasterizes the repaired geometry or only measures it: 539 features would change, and that is S0b's decision.
- **Is the CI change safe?** Not as written (7(c)). The interpreter is unpinned, the PEP 668 risk is unverified for the runner image, and the step never runs before main.
- **Copy constraints and routing:** sound (X4).
- **Release conditions against the standing yes:** inside it. The 2026-11-10 exclusion covers changing a public number before the cap and dissolve fixes, and this release is those fixes. Lee's 2026-10-23 words authorize the downward correction directly. The conditions are the right ones. Add the out-of-band stop (X3(e)), and note that "the number falls" refers to the raw total: the floored hero may legitimately stay at 5.8 if the total lands between 5.80 and 5.89 M.

## Measurements behind this review (scratch, this round)

All runs were at nice 19 on the shared 4-core host, with the 1-minute load at 4.4 to 8.7 (`uptime`). The streaming passes peaked at 179 to 261 MB RSS and the window union at 325 MB. The scripts are in the session scratchpad under `measure/`: `r2_profile.py`, `r2_union.py`, `r2_box.py` and `r2_construct.py`.
- **Kept set under the plan's rule:** 183,725 polygons, with Σ drawn EPSG:3005 = **5,875,854.39 ha**. There are 9 drawn-only boundaries (83,233.26 ha). 431 polygons are repaired, and none is empty after repair. The pass took 3 min 17 s.
- **The out-of-range-low block:** ndjson line 181,679, `DISTURBANCE_START_DATE` `1200-11-01`, recorded 14.6362 ha.
- **Dense window** (lon -127.40 to -126.00, lat 49.80 to 50.65): 5,226 kept polygons with 1,115,603 vertices, all valid after repair. Σ drawn is 139,147.21 ha. The union is 132,928.6261 ha by all four methods:

  | Method | Time |
  |---|---|
  | rank filter | 5.6 s, 0 errors |
  | 10 km tiles | 8.6 s |
  | 2 km tiles | 4.9 s |
  | single `union_all` | 7.7 s |

  Both methods give the same prefixes through 1990 (990.0919 ha) and 2005 (46,651.0401 ha). Pre-clipping with `clip_by_rect` raised 30 `TopologyException`s.
- **Memory:** repaired EPSG:3005 geometry takes 43.5 bytes per vertex resident. The STRtree adds under 1 MB per 5,000 polygons.
- **Fort Nelson box, 2025** (51 features):

  | Method | Union (ha) |
  |---|---|
  | `buffer(0)`, lon/lat clip (the 2026-10-08 method) | 1,418.06 |
  | `make_valid`, lon/lat clip | 1,418.06 |
  | EPSG:3005, 4-corner box | 1,418.76 |
  | EPSG:3005, densified box | 1,418.02 |
- **Whole file:** 220,745 features. 220,206 are valid and 539 repaired; none raised, none is null or empty, and every area is finite. The pass took 4 min 14 s.
- **Host libraries:** shapely 2.1.2, GEOS 3.13.1 and pyproj 3.7.2, all user-site installs. `python3 -I` fails at `import shapely`.

## Stress tests

**Pre-mortem: it is February and this failed.**
1. *The evidence ate itself.* `npm test` runs the fixture through the builder, which rewrites `research/measure-2026-11/crosscheck.json` with fixture totals. The crosscheck test reads it in another worker and goes red some of the time. The session "fixes" the flake by regenerating the evidence from a rerun, and the committed proof of the public number becomes whatever the last run wrote. This is the type-specific worst case: a public figure whose evidence file no longer matches the run that produced it, against "reproducible from the shipped data" (DECISIONS 2026-09-02).
2. *Red CI on main.* After the release push, the pip step hits PEP 668, or a missing wheel on a newer `ubuntu-latest`. The site deploys anyway (Netlify), CI sits red on main, and it surfaces days later as a beta-bar failure. The fix is then made under time pressure in a workflow nobody tested.
3. *A kept-set slip both methods share.* A re-projection helper rebuilds polygons from their exteriors and drops 22,716 holes. Both methods agree to the hectare, the Fort Nelson box moves by less than 0.5%, the total stays under 5,888,477, and the floored hero still reads 5.7. The number is wrong in a way the floor hides, until MERGE splices FTEN with the inventory and the two disagree. Acceptance 0 (Σ drawn 5,875,854.39) catches it at once.

**Load-bearing assumptions.**
1. *The union method is right and tractable province-wide.* **High confidence:** measured on the densest window, extrapolated to the province. If it is wrong, the run is slow rather than wrong, and acceptance 3 catches any error.
2. *The kept set is what the ruling defines.* **Moderate, as planned,** because no real-data check verifies it. With acceptance 0 it becomes high. Resolve before the run.
3. *The CI step works on `ubuntu-latest`.* **Unverified.** Resolve before release with a CI run on the branch.
4. *The standing yes covers this release.* **High,** given the plan's conditions plus the out-of-band stop.

**Inversion.**
- *Drop the tile method, since the rank filter is exact.* That would win only if the shared code were the only risk. It is not: the tile method is what catches the arithmetic bug class, and it costs minutes. Keep it.
- *Keep the 0.01% tolerance.* That would win only if the methods could differ by floating-point noise at that scale. Measured, they differ by 1e-15. Tighten it.
- *Fold the year-1200 block into 1950 as today.* That would win only if the date meant "early". It is an entry error. Exclude it.
- *Skip the CI step and let the Python fixture skip in CI.* That is the hollow-guard pattern round 1 named. Keep the step, pinned and proven.

## Close

**Overall: CONCERN.** Round 1's three gating FAILs (Failure modes, Verifiability and Evidence) are folded, and I tested the folds against the real checkpoint rather than on paper. The union is exact and cheap, the two methods agree to machine precision, the repair and the fatal path stop nothing that exists, and the sparse box reproduces. No gating dimension fails.

What keeps this from a PASS is a set of checks that look stronger than they are:
- one holds by construction;
- one is blind to the likeliest bug;
- one has a tolerance that swallows hundreds of hectares;
- nothing independently checks the kept set.

On top of that, an evidence file sits outside the test fence, the CI change is unproven, four small round-1 items are undone, and the plan's own justification misattributes the 5.66×. Each is fixed by a line or an assertion. The relay may proceed once they are in, and no round 3 is needed if the author folds the list below as written.

**Must-fix, in priority order.**
1. **Acceptance (9, 6, X3).**
   - Add check 0: the measured counts, Σ drawn 5,875,854.39 ha, the nine at 83,233.26 ha, and 0 unparseable.
   - Replace check 1 with per-year prefix comparisons by the tile method.
   - Tighten check 3 to 1 ha.
   - Name check 4's clipping: EPSG:4326, clipped before projection.
   - Add an out-of-band stop that escalates to Lee and never adjusts the figure.
2. **The output fence (7, 10).**
   - Route `crosscheck.json` through the `VITEST` output override, and extend the byte-identical assertion to it.
   - Adopt HEAVY's full fence: refuse the override without `VITEST`, and require it under `VITEST`.
   - Decide where the builder writes its cross-check on future rebuilds.
3. **The fixture (9, 4).**
   - Add a MultiPolygon with a hole, a tile-straddling pair, a block recorded at exactly 2,000 ha, the years 1949, 1950, 2025 and 2026, a malformed date and an undated feature.
   - Add mutants for holes dropped, centroid tile assignment and `>` for `>=`.
   - Commit the fixture as a data file, the seed for C5b.
   - Have the crosscheck test assert the agreement and the checkpoint.
4. **CI (7, X8).** Pin `actions/setup-python` to 3.12, add `scripts/requirements.txt`, and record a CI run on the branch before release.
5. **Checkpoint identity (8).** Record the manifest timestamp plus the file size or sha256, and key the no-increase test on it.
6. **The plan's facts (X3, 1, 10).**
   - Correct what the 5.66× consists of: all_touched, not the undated baseline.
   - Name the year-1200 block for what it is.
   - Quote the 2026-10-23 amendment whole, with one line on shipping ahead of S1-lite.
   - Correct the line citations.
7. **Unfolded round-1 items (10, 3).**
   - Replace hand-off line 29 through the writer.
   - Add the drawn-area cap and the proxy to T-pre's scope note in beta-resequence, flagging the WFS capability as unverified.
   - Add the fire line and its route to NUM.
   - State the responses to 240, 241 and a killed run.
8. **C5 and C5b (1).** Name `cutblock_area.py` as C5b's Python twin, and map C5's checks to what is done here and what is owed elsewhere.
9. **Implementation notes (2, 6, X5, X8, 10).**
   - No `clip_by_rect` pre-clipping.
   - One named recovery for a GEOS raise, or "a raise means no number".
   - The bucket order and the zero-area rule.
   - The fatal change scoped to the cutblocks cap path.
   - Whether the overlays rasterize the repaired geometry.
   - A single-process builder.
   - The import path for `scripts/lib`.
   - The instrument for peak RSS.
