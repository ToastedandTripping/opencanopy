# Plan Critic — Phase 1b: Static Forest Base Regeneration

**Plan:** `/home/leesalo/.claude/plans/jazzy-booping-sunrise.md`
**Probe (oracle):** `.claude/plans/phase-1b-static-base-probe.md`
**Reviewer:** separate critic subagent, session model (no override). Adversarial pass.

> **Output-path note:** the rubric says the critic file should be
> `jazzy-booping-sunrise-critic.md` next to the plan. Plan mode write-locked me to
> this single agent file, so the review lives here. **Action for the author:** copy
> this content to `/home/leesalo/.claude/plans/jazzy-booping-sunrise-critic.md` (or
> the repo `.claude/plans/` canonical dir) so the gate sees a properly-named file.

Verified against the real code: `scripts/build-year-overlays.py`,
`src/lib/story/setup-layers.ts`, `src/test/pipeline/source-registration.test.ts`,
`src/test/pipeline/visibility-lifecycle.test.ts`, `scripts/lib/` (listing),
`scripts/pipeline/simplify-for-raster.py`, and the on-disk PNGs.

---

## The 16 dimensions

**1. Problem-fit — PASS.** Regenerating the over-dilated hand blob from real VRI
polygons directly fixes the three stated problems (ocean bleed, "too much green,"
clean substrate for Phase 3). The probe's "green = forest comes from using the real
polygons" insight is correct and the plan is built on it. Solves the actual need.

**2. Architecture correctness — CONCERN.** The grid/rasterize/Mercator-resample
approach is sound and matches the overlay builder. But two arithmetic/registration
details are wrong as written:
 - **`int` vs `round` height.** The plan (lines 47–48) says
   `height = round(2048 × 12.5/25.5)`. The overlay builder uses
   `height = int(width * (north-south)/(east-west))` (build-year-overlays.py:194).
   `round(1003.92) = 1004`; `int(1003.92) = 1003`. Implemented literally, the base
   is **one row taller** than the overlays — the precise misregistration the new test
   is meant to prevent. **Fix:** copy the overlay builder's exact expression
   (`int(...)`), do not introduce `round`. Better: derive height from the *same shared
   helper* so it cannot drift.
 - **Single-color base vs the resample.** `resample_to_mercator` uses
   `order=0, mode="constant", cval=0` (lines 154–157). A single-fill green silhouette
   resampled at order-0 is fine, but the all-or-nothing alpha edge after Mercator
   row-remap will be a 1-px-jagged coastline — acceptable for a base, but the plan
   should state it expects nearest-neighbor edges, not antialiased ones, so Jen
   doesn't flag the jaggies as a defect.

**3. Security — PASS.** No secrets, no network, no auth, no new attack surface. Local
script reads a local NDJSON and writes a PNG into `public/`. The output is a
same-origin static asset (correct per the R2-CORS memory). Blast radius is one
committed binary.

**4. Completeness — CONCERN.** Gaps:
 - No handling for **degenerate/invalid geometries** in the 6.2M-feature stream.
   `build-year-overlays.py` wraps the whole load in `try/except: pass` per line
   (250–251) and the rasterize in try/except (268–283). The plan's "lazy `(geom, 1)`
   generator" gives rasterize no per-feature recovery — one malformed geometry can
   abort the entire single rasterize call, losing the whole mask. **Fix:** filter
   `if not geom: continue` and decide explicitly whether to skip-on-error per feature
   or fail loud; don't inherit silent `except: pass` by accident, and don't let one
   bad geom nuke the only rasterize pass.
 - No statement of what happens if the input NDJSON is absent on the build box (the
   overlay builder `sys.exit(1)`s — reuse that, don't crash with a traceback).

**5. Reuse vs reinvention — CONCERN (factual error in the plan).** The plan claims
`scripts/lib/` is "the existing shared dir" and frames the new module as reuse.
**`scripts/lib/` contains 24 `.ts` files and zero Python** — no `__init__.py`, no
Python package, no precedent. Sibling Python scripts (`build-raster-tiles.py`,
`water-subtract-gdal.py`, `simplify-for-raster.py`) import only stdlib + shapely/rasterio
and use `Path(__file__).parent.parent`; **none imports a sibling local module.** So:
 - Placing `mercator_grid.py` in `scripts/lib/` is a *new* pattern, not reuse of an
   existing one — fine, but call it that.
 - A bare `import mercator_grid` from `build-forest-base.py` / `build-year-overlays.py`
   **will not resolve** unless the scripts add `sys.path.insert(0, str(Path(__file__).parent / "lib"))`
   or the module sits directly in `scripts/`. **Fix:** either put `mercator_grid.py`
   in `scripts/` (flat, matches how the other py scripts live) or add the explicit
   `sys.path` shim in both scripts and verify the import works *before* editing the
   shipped overlay builder.

**6. Simplicity / elegance — PASS (with the inversion caveat below).** One new
generator + one extracted module + one test is a minimal, proportionate set of
primitives. The single-pass single-color mask is simpler than the overlay builder's
year-grouped compositor, appropriately.

**7. Failure modes & error handling — CONCERN.** Covered partly under #4. Additional:
the plan asserts peak RAM "below the existing overlay builder's." The overlay builder
holds **all geometries grouped by year in `by_year`** (a dict of lists of GeoJSON
dicts) simultaneously before rasterizing (lines 222–285) — that is the entire 6.2M
feature set in memory at once for cutblocks-scale data. A streaming generator into a
*single* rasterize is genuinely lighter **only if** it does not first materialize a
list. `rasterio.features.rasterize` accepts an iterable and consumes it lazily, but
**it still builds one shapely/affine-projected burn per feature and accumulates into
one `(1003, 2048)` uint8 array** — the array is ~2 MB, trivial; the real cost is
transient per-feature geom parsing, which is bounded only if the generator is truly
lazy (don't wrap it in `list(...)` or a comprehension that the probe's "lazy" wording
hides). See the memory pre-mortem. **Fix:** state explicitly that features are read
line-by-line and yielded one at a time into `rasterize`, never collected into a list,
and add a `--limit` smoke-test flag to prove the path on 10k features before the full
run.

**8. Data integrity / single-source-of-truth — PASS.** Extracting `BC_BOUNDS` + grid
math into one module so base and overlays share it is the correct SSOT move and
mirrors the `forest-age-palette.json` precedent. This is the strongest part of the
plan. (Conditional on #5 actually compiling.)

**9. Sequencing & destructive-step safety — CONCERN.** The one destructive step is
overwriting the committed `forest-base.png`. The plan gates it behind verification
but the gate (verification #2, byte-identical 1950.png) is **invalid — see #12.** The
*base* overwrite itself is safe because git tracks it (revert = `git checkout`), but
the plan should sequence: (a) generate to a *temp* path, (b) eyeball it, (c) only then
`mv` over the committed asset — not write directly over the only copy.

**10. Dependencies / supply chain — PASS.** No new deps. `rasterio`, `numpy`, `scipy`
already used by the overlay builder; the new script uses the same set. No typosquat
surface.

**11. Performance / load — CONCERN.** Two sub-points:
 - **Build-time:** 6.2M features through one rasterize at 2048×1003 is fine
   compute-wise; the risk is memory (see #7), not latency. One-time offline cost.
 - **Runtime/client:** the plan asserts 2048×1003 is "under every device texture cap,
   so no capability code needed." 2048 max-dimension is safe on essentially all WebGL1
   hardware (min guaranteed `MAX_TEXTURE_SIZE` is 2048; real devices are ≥4096).
   **1003 < 2048 < 4096 — PASS on the cap.** But the **on-disk byte size** of a
   2048×1003 RGBA PNG vs the current 1024×501 1-bit blob is ~?× bigger and ships in
   the static bundle to every visitor. **Fix:** state the expected file size and run
   the same quantization the overlays get (the committed frames are paletted — see
   #12), or the base could balloon the page weight. A single-green-on-transparent
   image quantizes to ~2 colors trivially; do it.

**12. Verifiability / testability — FAIL.** The headline safety check is broken.
 - **Verification #2 ("regenerate 1950.png, `cmp` byte-identical to committed")
   cannot pass — even with a perfect zero-behavior refactor.** Proof from disk:
   `build-year-overlays.py` writes `driver=PNG, count=4, dtype=uint8` → **truecolor
   RGBA**. But the committed frames are **colormap PNGs of varying bit depth**:
   `1950.png` is *1-bit colormap*, `2000.png` is *2-bit colormap*, `2025.png` is
   *4-bit colormap*, and `fire-by-year/2025.png` is *768×376 8-bit RGBA* (a different
   width entirely). A post-generation quantization step (pngquant/optipng-class) — **not
   present anywhere in the repo** (`grep` for pngquant/optipng/oxipng/quantize finds
   nothing) — produced the committed colormap files. So `cmp` against the committed
   `1950.png` will diff on byte 1 regardless of the refactor's correctness. **The
   plan's central no-regression proof is a false signal.**
   **Fix:** prove the refactor is byte-neutral by **diffing the script's raw RGBA
   output before vs after the extraction** (run pre-refactor → save `1950-pre.png`;
   refactor; run → `1950-post.png`; `cmp` those two), OR `git stash` the refactor and
   compare the function outputs directly in a tiny unit harness. Do **not** compare to
   the committed paletted asset. Separately, document the missing quantization step or
   the regenerated overlays/base will be heavier than the committed ones.
 - The new dimension-equality test is correct *in intent* but, given the `int`/`round`
   bug (#2), could itself fail or — if both sides drift the same way — pass while
   misregistered. **Fix:** assert against the *computed* expected dims from the shared
   helper, plus the literal `2048×1003`, not just base-vs-overlay equality.
 - Verification #4 (live z5) is the real correctness check and is well specified.

**13. Reversibility / rollback — PASS.** Every changed artifact is git-tracked: the
PNG, the two scripts, the test. `git checkout` reverts cleanly. The refactor is a pure
move. Good.

**14. Scope discipline — PASS.** "Out of scope" section is explicit and disciplined:
FWA lakes deferred (measure-first), no 4096/capability code, Phase 3/4/5 named and
excluded. Nothing gold-plated. The shared-module extraction is the one piece of scope
expansion and it is justified (SSOT, prevents drift).

**15. Operational impact — CONCERN.** The plan says "run the script" but doesn't name
**where** (the 32 GB build box per the risks section, not the dev laptop) or **who**
runs it, and the 2.37 GB input lives at `data/checkpoint/preprocessed/` which the
probe confirms is present locally but is **not in the repo** (it's an 18 GB checkpoint
dir). **Fix:** state that regeneration runs on the box with the data checkpoint, that
the input is gitignored and won't be on a fresh clone, and that the *output PNG* is the
only committed artifact. Also: no deploy mechanism change (correct — same-origin
static asset, deploys CLI-driven per the production-readiness memory).

**16. Maintainability / evolution — PASS.** Extracting the grid into a shared module
makes the next change (4096 tier, a third dataset) a one-line import. The new
generator mirrors the overlay builder's structure so a maintainer reads one and knows
the other. Docstring/AGENTS conventions should be followed; the plan should note the
overlay builder's module docstring needs a one-line "grid helpers moved to lib/" pointer.

---

## Stress tests

### Pre-mortem — "It's 3 months out, this failed."

1. **The byte-identity check passed by accident and shipped a misregistered base.**
   The author ran verification #2, saw it "fail" on the committed-vs-regenerated diff,
   assumed the refactor broke something, spent a day chasing a non-bug, then disabled
   the check and shipped — and the `int`/`round` row offset went out undetected. The
   base sits one pixel-row off the overlays at z5; scars land slightly north of their
   forest. **What we should have seen:** the committed frames are paletted, not RGBA —
   the baseline was never reproducible. (This is the #12 FAIL.)

2. **OOM on the build box mid-run.** The "streaming generator keeps memory bounded"
   assumption was wrong because the implementation wrapped the geom iterable in a list
   (or rasterize buffered it), and 6.2M GeoJSON dicts parsed by `json.loads` blew past
   32 GB — the same reason `simplify-for-raster.py` exists (it documents the 6.5×
   object-blowup that forced the slim file). The run died at feature ~4M with no
   partial output. **What we should have seen:** the probe already documents the memory
   cliff for this exact dataset.

3. **The regenerated base is 8–15× the old file's bytes and tanks the page weight.**
   No quantization step (the missing pipeline stage from #12) meant a 2048×1003
   truecolor-alpha PNG shipped where a 2-color paletted image would have been ~50 KB.
   Lighthouse/LCP on `/story` regressed. **What we should have seen:** the committed
   frames are paletted precisely to keep them small.

### Load-bearing assumptions

1. **"Regenerating 1950.png will be byte-identical to the committed copy."**
   *Confidence: DISPROVEN (verified false on disk).* Consequence if wrong: the plan's
   primary no-regression gate is a false signal; a real refactor bug could ship while
   the author chases the paletting diff, or the author disables the check. **Must fix
   before implementation** — compare pre/post script output, not committed asset.

2. **"`scripts/lib/` is the existing shared dir for these helpers."**
   *Confidence: DISPROVEN (it's TypeScript-only).* Consequence: `import mercator_grid`
   fails at runtime; first run of the *edited shipped overlay builder* crashes,
   breaking a working script. **Must resolve the import mechanism before editing
   build-year-overlays.py.**

3. **"Streaming into rasterize keeps peak RAM below the overlay builder's."**
   *Confidence: MEDIUM, unverified.* The claim is plausible (one rasterize vs
   year-grouped compositing) but depends entirely on the generator never materializing
   the feature list and on `json.loads` GC keeping up. Consequence if wrong: OOM, no
   output. **Verify with a `--limit` smoke run and watch RSS before the full pass.**

4. **"Lakes are excluded for free by absence of forest polygons."**
   *Confidence: MEDIUM-HIGH for big lakes, LOW for the edge claim.* The probe proves
   the slim source is forest-class-only (no water class), so lake *interiors* have no
   polygon and will be transparent — true. But two unverified risks at 2048×1003:
   (a) `all_touched=True` paints every pixel a polygon *touches*, so forest polygons
   ringing a small lake will bleed green over the shoreline and can close small lakes
   entirely at this resolution; (b) the probe never confirmed there are no
   thin-treed-island or riparian polygons inside large lakes. Consequence if wrong:
   small lakes read as solid green, exactly the "floods lakes" defect the plan claims
   to fix. **This is why the plan's "measure at z5" deferral is correct — but z5 is too
   coarse to see small-lake bleed; add a z7–z8 spot-check on a known lake-dense area
   (Cariboo/Nechako) to verification #4.**

### Inversion — what would make a rejected alternative win?

- **Alternative A: extend `build-year-overlays.py` with `--dataset forest-base` instead
  of a new script** (the probe's own recommendation, line 58–59). This wins if the
  marginal logic is small (it is: one green, no age ramp, no year loop) and if a second
  top-level script is judged higher maintenance than one more `DATASETS` entry + a
  branch. **Condition already true:** the file is *already* a multi-dataset dispatcher
  (`DATASETS` dict, `--dataset` arg, per-dataset `output_subdir`). Adding a third entry
  is the idiomatic extension. The plan's new-script choice is *defensible* (the base
  has no year/age/undated machinery, so it'd need conditional branches around the whole
  composite loop), but the plan does not argue why a new script beats a `--dataset`
  mode — it should, given the probe explicitly recommended the mode. **The new-script
  path also still requires the shared-module extraction**, so it is strictly more work
  than the `--dataset` mode (which needs no extraction at all — the code is already
  co-located). Inversion verdict: the `--dataset` alternative is *stronger than the
  plan credits* and removes the entire #5 import-mechanism risk. Re-justify or switch.

- **Alternative B: `importlib`/`sys.path` import the helpers in place instead of
  extracting a module.** This wins only if you want zero edits to the shipped overlay
  builder. But it's uglier than extraction and you'd still need the `sys.path` shim, so
  extraction (or the `--dataset` mode) dominates. Not a contender.

---

## Overall verdict

The plan's *strategy* is right — regenerate from real polygons, share the grid math as
one source of truth, defer lake masking — and the probe behind it is unusually solid.
But the plan ships with **one broken safety check and one false reuse claim that will
bite on first run.** The byte-identical-`1950.png` no-regression gate (verification #2)
**cannot pass**, because the committed overlay frames are post-quantized paletted PNGs
(1-/2-/4-bit colormap, verified on disk) while the script writes truecolor RGBA — the
baseline is not reproducible, so the gate is a false signal, not a guard. `scripts/lib/`
is TypeScript-only with no Python precedent, so the extracted-module import will not
resolve without a `sys.path` shim the plan never mentions, and editing the *working*
overlay builder around that broken import risks regressing a shipped script. The
`int`-vs-`round` height formula (1003 vs 1004) is a one-row misregistration waiting to
happen and undercuts the test it's paired with. The memory claim is plausible but
unverified against a dataset the repo *already documents* as a 6.5× object-blowup. None
of these are fatal to the approach; all are concrete and fixable. **CONCERN overall —
do not exit to implementation until the must-fix list is folded in.**

## Prioritized must-fix list

1. **Replace verification #2.** Compare the script's *raw RGBA output* pre- vs
   post-refactor (or unit-diff the moved functions), never against the committed
   paletted asset. Document the missing quantization step and decide whether the new
   base/overlays must be quantized to match committed file sizes.
2. **Fix the import mechanism / reuse claim.** Either put `mercator_grid.py` flat in
   `scripts/` (matches existing py layout) or add an explicit
   `sys.path.insert(...)` shim in both scripts, and prove the import works *before*
   editing `build-year-overlays.py`. Correct the plan's "existing shared dir" wording.
3. **Pin height to `int(...)`, sourced from the shared helper.** Drop `round`. Make the
   new test assert the literal `2048×1003` *and* base==overlay, computed from one place.
4. **Justify new-script vs `--dataset forest-base` mode**, given the probe recommended
   the mode and the file is already a multi-dataset dispatcher (the mode removes the
   entire extraction + import risk).
5. **Prove the streaming/memory path** with a `--limit` smoke run and an RSS check
   before the full 6.2M-feature pass; ensure the geom iterable is never listified.
6. **Strengthen lake verification:** add a z7–z8 spot-check over a lake-dense region
   (`all_touched=True` + small lakes is the residual "floods lakes" risk), and write to
   a temp path then `mv` over the committed PNG rather than overwriting in place.
