# Phase 1b — Static Forest Base Regeneration

## Context

The scroll-story's green forest substrate (`public/raster/cutblocks-by-year/forest-base.png`)
is a **hand-made 1024×501 1-bit blob** with no generator. It's over-dilated, so it bleeds
into the ocean and floods lakes + alpine with green — wrong at province scale and it
undercuts the narrative ("green = actual forest"). The consolidated story-render plan calls
this the **keystone**: regenerating from real data fixes coastline bleed, the "too much
green" disconnect, and gives every future scrub path (Phase 3) a clean substrate.

The probe (`.claude/plans/phase-1b-static-base-probe.md`, 2026-06-23) reshaped scope: the
slim source `forest-age-rasterizable.ndjson` already contains **only the 4 forest classes**
(non-forest VRI dropped upstream), so "green = forest" comes from *using the real polygons* —
no alpine dataset, no coastline mask. Lakes are excluded by absence of forest polygons;
explicit FWA subtraction deferred (Lee: skip v1, measure). Resolution: **2048×1003** (Lee).
1a/1c shipped in Batch A, so this batch is the base regen only — **no client code changes**
(a same-bounds image source stretches a crisper PNG identically).

## Critic gate

A separate critic (session model) reviewed v1: **CONCERN** (1 FAIL, 8 CONCERN, 7 PASS),
verified against real code. Findings at `jazzy-booping-sunrise-agent-aab8f2ec35a9c71f9.md`
(plan-mode write-lock blocked the canonical `-critic.md` name — **needs a copy/override
before the ExitPlanMode gate passes; Lee's action**). All six must-fixes are folded below;
the biggest is **switching from a new script to a `--dataset forest-base` mode** (the
critic's inversion: the file is already a multi-dataset dispatcher, so the mode removes the
shared-module extraction AND the Python-import risk entirely).

## Approach — a `--dataset forest-base` mode in `build-year-overlays.py`

The base is structurally a *single-pass, single-color, single-file* job; the year overlays
are a year-grouped compositor. `build-year-overlays.py` already dispatches on `--dataset`
(`DATASETS` dict, per-dataset `output_subdir`), so add a third entry + an **early-branch**
in `main()` that runs the simple path and returns BEFORE the year loop. The existing
`cutblocks`/`fire` code paths are left byte-for-byte untouched (early `return`), and the
grid helpers (`BC_BOUNDS`, `build_mercator_row_map`, `resample_to_mercator`) are used
**in-place** — perfect single-source-of-truth, zero drift, zero extraction.

1. **`DATASETS["forest-base"]`**: `{ filename: "forest-age-rasterizable.ndjson",
   output_subdir: "cutblocks-by-year", single_output: "forest-base.png",
   color: "#15803d", year_field: None }`. (Green `#15803d` = calm mid-forest green, the
   value the retired a97dab WIP reached for; it's a single silhouette fill, not a class
   color. One-arg `--green` override; Jen confirms at live-verify.)

2. **Early-branch `run_forest_base()` in `main()`** (before the year loop):
   - Resolve input via existing `_data_path()`; if absent, `sys.exit(1)` with the same
     message style as the year path (don't crash with a traceback). [must-fix #4 completeness]
   - **Stream** features: read NDJSON line-by-line, `json.loads` each, **skip** null/empty
     geometries with a counter (don't inherit a silent `except: pass`; don't let one bad
     geom abort the single rasterize pass), and `yield (geom_dict, 1)` **one at a time** —
     never collect into a list. Feed that generator straight to
     `rasterio.features.rasterize(out_shape=(height, width), transform=from_bounds(*BC_BOUNDS_wsen, width, height), all_touched=False, fill=0, dtype=uint8)`. [must-fix #5]
   - **`all_touched=False`** (NOT the overlays' `True`): the base wants forest *extent*, not
     disturbance *reach* — center-in-polygon gives clean lake/coast edges and avoids
     bleeding green over shorelines. Document the intentional divergence from the overlays.
   - `width = args.width` (default **2048**); `height = int(width * (north-south)/(east-west))`
     — the builder's **exact `int(...)` expression**, NOT `round` → **1003**. [must-fix #3]
   - Resample the single-band mask equirect→Mercator with `build_mercator_row_map` +
     `resample_to_mercator` (order-0 nearest — expect a 1-px nearest-neighbour coastline,
     not antialiased; not a defect).
   - **Write a paletted PNG** (rasterio `count=1, dtype=uint8` + `write_colormap(1,
     {0:(0,0,0,0), 1:(r,g,b,255)})`) → matches the committed colormap-PNG format and keeps
     the file tiny (2 colors). This closes the page-weight risk — no truecolor-RGBA balloon,
     no dependency on the (unscripted, repo-absent) manual quantization the year frames got.
     [must-fix #1 quantization, pre-mortem #3]
   - Write to a **temp path, eyeball, then `mv`** over the committed asset — never overwrite
     the only copy in place. [must-fix #6]
   - `--limit N` flag for a smoke run (prove the path + watch RSS on ~10k features before the
     full 6.2M pass). [must-fix #5]

3. **No client change.** `setup-layers.ts` image-source bounds/URL unchanged; the crisper
   PNG registers identically. `visibility.ts` opacity (0.7) unchanged.

4. **Tests:** add a **registration-invariant** test asserting `forest-base.png` is exactly
   **2048×1003** AND equal to a year-overlay frame's dimensions (computed from one place,
   so it can't pass-while-both-drift). [must-fix #3] Existing 543 tests are unaffected
   (no test asserts base dims; only opacity 0.7, the 14-layer count, and source-ID existence
   — verified by the critic).

## Critical files

- **Edit:** `scripts/build-year-overlays.py` — add the `forest-base` `DATASETS` entry + an
  early-branch `run_forest_base()` in `main()`. Existing dataset paths untouched (early
  return). One-line module-docstring note that `forest-base` is a single-pass dataset.
- **Regenerate:** `public/raster/cutblocks-by-year/forest-base.png` (1024×501 1-bit →
  2048×1003 paletted).
- **New test:** registration-invariant (dims) near `src/test/pipeline/`.
- **No change:** `setup-layers.ts`, `visibility.ts`, registry.

## Reuse (don't reinvent)

- In-file helpers (no extraction): `build_mercator_row_map`/`resample_to_mercator`
  (`build-year-overlays.py:122-165`), `BC_BOUNDS` (:99), `_data_path()` (:52-57),
  the `rasterio.features.rasterize` + colormap-PNG-write pattern, the `DATASETS`/`--dataset`
  dispatcher and `--width` arg (:164-194).
- `forest-age-rasterizable.ndjson` — slim 2.37 GB WGS84 input, `class`-preserving, on disk.

## Verification

1. **No-regression on existing datasets (replaces the broken byte-identity check):** run
   `build-year-overlays.py --dataset cutblocks` for ONE year **before** the change → save
   its RGBA output; apply the change; run again → `cmp` the two **script outputs** (both
   RGBA, same path) → byte-identical. This proves the early-branch didn't touch the year
   path. (Do NOT compare against the committed *paletted* frames — those went through an
   unscripted quantization step that isn't in the repo. [must-fix #1])
2. **Base output shape:** generated PNG is exactly **2048×1003**, paletted (2 colors,
   transparent index 0), small file (target ≤ ~100 KB); open it — green BC silhouette,
   transparent ocean/lakes.
3. **Tests:** full `npx vitest run` green (543 + the new dims-invariant); `tsc`/`npm run
   build` clean.
4. **Live registration (the real correctness check):** deploy, then at **z5** confirm crisp
   coastline (no ocean green), no alpine green, base pixel-aligned under the per-year
   cutblock overlays (scrub 1950→2025; scars land on forest). **Add a z7–z8 spot-check over
   a lake-dense region (Cariboo/Nechako):** with `all_touched=False` small lakes should read
   as holes — if they still flood green, the deferred FWA-subtraction path is the fix.
   [must-fix #6] Key'd dev server or live site (base PNG is same-origin; basemap needs the
   MapTiler key).
5. **Jen gate:** green value + substrate read on the live deploy.

## Risks / mitigations

- **Edits regress the shipped overlay builder** → early `return` for the new dataset leaves
  year paths untouched; verification #1 (pre/post RGBA `cmp`) proves byte-neutrality.
- **OOM on 6.2M features** → stream geom dicts one at a time into `rasterize`, never
  listify; no year-grouping (lighter than the year path, which holds `by_year`); `--limit`
  smoke + RSS watch first. Run on the box with the data checkpoint. [pre-mortem #2]
- **Small lakes still flood** (residual `all_touched`/resolution risk) → `all_touched=False`
  + z7–z8 verification; FWA subtraction is the logged fallback (tooling exists).
- **Green misreads** → one `--green` arg; Jen confirms.

## Operational notes

Regeneration runs **on the box holding `data/checkpoint/preprocessed/`** (the 2.37 GB input
is gitignored — NOT on a fresh clone; ~18 GB checkpoint dir). The **only committed artifact
is the output PNG**. No deploy-mechanism change: it's a same-origin static asset shipped by
the normal CLI build+deploy (no R2).

## Out of scope

FWA lake subtraction (deferred, measure first); 4096/`MAX_TEXTURE_SIZE` capability code
(2048 is universally safe); scripting the year-frame quantization gap (pre-existing, not this
batch); Phase 3 scrub architecture; Phase 4 gold old-growth; Phase 5 z10+ rectangle rebuild.
