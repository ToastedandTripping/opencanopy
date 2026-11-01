# Fidelity suite baseline, 2026-11-01

Live tiles: `opencanopy-v10.pmtiles` (3,831,441,244 bytes, R2, last modified 2026-05-09), downloaded
locally. Build inputs: the May 2026 NDJSON at `~/Projects/opencanopy/data/checkpoint/preprocessed/`,
linked into `data/geojson/`. Reader: `scripts/lib/mvt-reader.ts` with the pbf 5 fix. Command:
`npm run audit:ci` (`audit-all.ts --ci --fail-on-warn`), about 1.5 hours; Fidelity and Precision
re-run once the inputs were linked correctly. **Nothing below was re-measured against current
government data; that is REBUILD's job.** Failures are recorded as found and not yet diagnosed.

| Audit | Result | Measured or no input | What it says |
|---|---|---|---|
| Tiles | 20 pass, 16 warn, 0 fail; the summary prints UNKNOWN | Measured for tile contents. Its A2 feature-count warnings ran before the inputs were linked | Cutblocks present at z8, large features present, zoom consistency holds |
| Fidelity | 599/600 features found (99.8%); F2 all 30 keys match at 90%+; F4 warns on forest age near WFS seams | Measured, with inputs | Pass, one warning |
| Spatial | 205 pass, 202 warn, 2 fail | Measured | Fails: water overlap for fire-history (2 of 84 features at R2C4) and mining-claims (1 of 97 at R1C2). Most warnings are "no tile data" at grid points that may be outside the data |
| Adversarial | 32 pass, 0 fail | Measured | Named places and layers are present |
| Property-Deep | 17 pass, 2 warn, 1 fail | Measured | **tenure-cutblocks: 772 of 4,511 features (17.1%) miss a required property** (`company_id`, `PLANNED_GROSS_BLOCK_AREA` or `DISTURBANCE_START_DATE`) |
| Precision | Exits 0, prints PASS in the suite summary; 15 layer-zoom pairs exceed the ±10% area tolerance | Measured, with inputs | z10: forest age 18/19 (max 548%), mining claims 12/20 (max 4,333%), conservancies 5/20, cutblocks 3/20. **Warnings only, so a large divergence still reads PASS.** Not diagnosed: could be real or the audit's clipping to a tile |
| Temporal | Warn; nothing compared | **No input**: no previous archive on this machine | Says nothing about v10 |
| CrossSource (lite) | 17 tiles checked, 19 missing, 6 consistent, 11 conflict (35.3%). Exit 1, while the summary prints PASS | Measured | The `R1:true, R2:false` conflicts are not diagnosed |

## Defects in the suite itself (PIPE's to fix)

1. **MapLibre 6 silently broke it.** pbf 5 exports only `PbfReader`, so `new Pbf()` threw, and the bare
   `catch` in `scripts/lib/tile-reader.ts` turned every parse error into "tile doesn't exist". Parks and
   cutblocks then read as missing. Fixed for the reader by the CI relay; the `catch` is still open.
2. **Empty runs pass.** With no inputs: F2 "no found features to compare" PASS, F4 PASS, Precision PASS on
   zero features. "All 0 features within tolerance" PASS appears for ogma and ungulate winter range even
   with inputs. Zero checked must never read PASS.
3. **The summary disagrees with the exit code:** CrossSource exit 1 prints PASS; Tiles exit 0 prints UNKNOWN.
4. **Input paths do not match the pipeline.** Audits read `data/geojson/*.ndjson`; the pipeline's outputs
   are under `data/checkpoint/preprocessed/`, so a fresh run reports "file not found".
5. **The archive path is hardwired** to a local `data/tiles/opencanopy.pmtiles` that nothing downloads.
6. **Temporal has no prior archive** to compare with; PIPE must keep one.
