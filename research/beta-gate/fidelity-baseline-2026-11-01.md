# Fidelity suite baseline, 2026-11-01

**Overall: the suite prints SUITE FAILED under `--ci --fail-on-warn`.** That summary was produced before
the build inputs were linked, so its Fidelity row reads FAIL. The per-audit rows below use the runs with
inputs. Fails and warnings are as found and not yet diagnosed.

**What ran.** Code at `b45f191` (includes the pbf 5 fix in `scripts/lib/mvt-reader.ts`), tsx 4.23.15 from the npx cache; maplibre-gl 6.15.0, pbf
5.1.2, @mapbox/vector-tile 3.0.0, Node 22.22.1. Command: `npm run audit:ci`, about 1.5 hours, with Fidelity,
Precision and Tiles re-run once inputs were linked. Result JSONs: `fidelity-baseline-2026-11-01/` beside this
file (`data/reports/*`), with the suite and Tiles logs. Tiles writes no report during a suite run, so its row rests on its log.

**Inputs.**
- Live tiles: `opencanopy-v10.pmtiles`, 3,831,441,244 bytes, R2 last modified 2026-05-09, downloaded locally.
- Build inputs: the NDJSON at `~/Projects/opencanopy/data/checkpoint/preprocessed/`, manifest dated
  2026-05-06. That they are v10's exact inputs is inferred from the dates and the A2 counts, not proven.
- Lakes: `data/geojson/reference/fwa-lakes.ndjson` (475 MB), fetched 2026-11-01. So the Spatial water checks compare May tiles with November lakes.
- **Apart from the lakes, nothing here was re-measured against current government data; that is REBUILD's job.**

| Audit | Result | Measured or no input | What it says |
|---|---|---|---|
| Tiles | 32 pass, 4 warn, 0 fail (with inputs); the suite's summary prints UNKNOWN | Measured | Warnings: A3 could not verify conservancies or mining-claims (no features in the z10 sample tile); A7 finds null `DISTURBANCE_START_DATE` in 2 of 20 on cutblocks and tenure-cutblocks |
| Fidelity | F1 599/600 features found (99.8%); F2 all 30 keys at 90%+; F4 warns: forest age 15/20 near WFS seams against 98% interior | Measured, with inputs | Pass, one warning |
| Spatial | 205 pass, 202 warn, 2 fail | Measured | Fails: water overlap for fire-history (2 of 84 features at R2C4) and mining-claims (1 of 97 at R1C2). Most warnings are "no tile data" at grid points that may be outside the data |
| Adversarial | 32 pass, 0 fail | Measured | Named places and layers are present |
| Property-Deep | 17 pass, 2 warn, 1 fail | Measured | **tenure-cutblocks: 772 of 4,511 features (17.1%) miss a required property** (`company_id`, `PLANNED_GROSS_BLOCK_AREA` or `DISTURBANCE_START_DATE`) |
| Precision | Exits 0, prints PASS in the suite summary; 15 layer-zoom pairs exceed the ±10% area tolerance | Measured, with inputs | z7: forest age 19/19, cutblocks 17/20, fire 16/20, mining claims 18/20 (max 4,366%), wildlife areas 14/20, parks 8/20, watersheds 3/20, conservancies 1/20. z10: forest age 18/19 (max 548%), mining claims 12/20 (max 4,333%), conservancies 5/20, cutblocks 3/20, fire 2/20, parks 2/20, wildlife areas 2/20. **Warnings only, so a large divergence still reads PASS.** Could be real, or the audit clipping to a tile; forest age's Hausdorff mean of 17,331 m at z10 bears on whether matching is at fault. `conservation-priority` is excluded from this audit |
| Temporal | Warn; nothing compared | **No input**: no previous archive on this machine | Says nothing about v10 |
| CrossSource (lite) | 17 tiles checked, 19 missing; 6 consistent, 11 conflict (internal consistency 35.3%). Exit 1, while the summary prints PASS | Measured | All 11 conflicts are R1, which the script itself calls an expected data limitation while still exiting 1 below 90% |

## Defects in the suite itself (PIPE's to fix)

1. **MapLibre 6 silently broke it.** pbf 5 exports only `PbfReader`, so `new Pbf()` threw, and the bare
   `catch` in `scripts/lib/tile-reader.ts` turned every parse error into "tile doesn't exist". Parks and
   cutblocks then read as missing. The CI relay fixes the reader; the `catch` is still open.
2. **Empty runs pass.** With no inputs: F2 "no found features to compare" PASS, F4 PASS, Precision PASS on
   zero features. "All 0 features within tolerance" PASS appears for ogma and ungulate winter range even
   with inputs. Zero checked must never read PASS. `audit-geometry-precision.ts:353` also skips `conservation-priority` silently.
3. **The gate can fail open.** `scripts/audit-all.ts:178-197` sets its failure flag only from the report file
   on disk and never reads the exit code. Tiles writes no report during a suite run, so a Tiles exit 1 reads
   UNKNOWN and cannot fail the suite; an audit that crashes over an older PASS report reads PASS; and
   CrossSource exit 1 prints PASS.
4. **Input paths do not match the pipeline.** Audits read `data/geojson/*.ndjson`; `rebuild.sh:42-46` writes
   `data/geojson/preprocessed/`, then a dated checkpoint, so a fresh run reports "file not found".
5. **The archive path is hardwired** to a local `data/tiles/opencanopy.pmtiles` that nothing downloads.
6. **Temporal has no prior archive** to compare with; PIPE must keep one.
7. **"Green" is undefined.** PIPE has to say, per audit, what counts as green at REBUILD, including whether
   warnings fail.
