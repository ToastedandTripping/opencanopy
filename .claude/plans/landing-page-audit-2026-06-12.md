# Landing-page audit — 2026-06-12 (pre-plan notes, not a plan)

Lee's verbal audit of opencanopy.ca, each item verified against the story
code and the live site by the orchestrator. Input for a Jen design spec +
landing-page wave. The story machinery lives in `src/data/chapters.ts`,
`src/lib/story/{setup-layers,visibility,prefetch}.ts`,
`src/components/story/`, `src/hooks/useScrollytelling.ts`.

## Findings (Lee's observation → verified root cause)

### 1. Hero sections have no imagery (content gap)
"BC is home to the last great temperate rainforests" should sit on an
old-growth rainforest photo; "5 million hectares" on a clearcut photo;
"We mapped it" on an old-growth/fresh-cutblock boundary photo.
`HeroSection.tsx` is text-on-dark only today. **Blocker: photo sourcing +
licensing** (options: Lee's own photography, CC-licensed (Wikimedia/Flickr
CC), or licensed stock; TJ Watt/AFA imagery is NOT freely usable).

### 2. "See what's left." shows an unexplained 4-class palette
Chapter `overview` renders the forest-age 4-class raster at 0.6 — red
(harvested) + orange (young) appear before any legend/explanation exists.
Lee's direction: open in **shades of green only**, let red mean exactly one
thing (cutblocks) and arrive with the timeline.
Note: `story-forest-base` (a green BC-forest silhouette PNG) already exists
as a registered layer — the green-only base costs nothing. If graded greens
are wanted instead, Wave 2's palette-driven theme builder makes a custom
story raster theme cheap (one THEMES entry + a tile run).

### 3. Timeline entry: sudden shade change / red jump
Verified mechanics: entering `logging-timeline` drops the 4-class raster
0.6→0.4 AND snaps the year-overlay image (1950.png) 0→0.85 — while the
4-class raster keeps showing its own harvested-red underneath the overlay's
cutblock-red. Two reds with different meanings + an abrupt opacity flip.
Same fix direction as #2: green base + accumulating red only.

### 4. 1950→1980 shows almost no change — DATA-TRUTHFUL, not a bug
Year overlay PNGs (public/raster/cutblocks-by-year/): 1950=12.7KB,
1980=14.2KB (+12% over 30 years = 40% of the scrub), 2025=34.2KB (+140%
over the last 45). BC cutblock records are genuinely sparse pre-1980, and
early scattered blocks are sub-pixel at province zoom. Options (design
decision): nonlinear scrub mapping (scroll ∝ cumulative change), start the
story at ~1970 with an honest "records begin" caption, or both.

### 5. Timeline conclusion is lost — map snaps back to green
When `yearFilter` goes null at chapter exit, the year overlay snaps to
opacity 0 (StoryMap.tsx:196-198). The `fire` chapter declares cutblocks 0.6
but its cutblock layer is the z9+ VECTOR (see #6) — invisible at chapter
zoom 5. Fix: persist the 2025 overlay into the fire/explore chapters
(declare it, fade rather than snap).

### 6. "And fire." renders no fires — layer cannot render, ever
`story-fire-history-fill`/`-outline` have **minzoom: 9**; the fire chapter
camera is **zoom 5**. The chapter's only visible layer is the dimmed
forest-age raster → "it all goes green." Fix: a province-scale fire raster.
Assets exist: `fire-history.ndjson` (86MB preprocessed, props FIRE_YEAR /
FIRE_SIZE_HECTARES / FIRE_CAUSE) + two ready-made paths: a
build-raster-tiles theme, or build-year-overlays-style PNGs — FIRE_YEAR
even enables an animated burn accumulation as a second timeline beat
(amber over the cutblock red).

### 7. "Zoom in. / This is what old growth looks like." — jittery + not communicating
Jitter root cause: camera interpolates to the next chapter ONLY in the last
20% of a chapter's scroll (useScrollytelling.ts:32-41) — the whole z5→z12.5
+ pitch 0→55 + bearing 0→-30 flight compresses into ~24vh of scroll, set
synchronously per scrollama event with no damping; terrain also toggles on
at that boundary. Fixes: damped rAF lerp toward target camera, widen the
interpolation window, or chapter-entry easeTo.
Narrative gap: the chapter shows green polygons over hillshade — it doesn't
show what old growth *looks like*. Camera points at the Port Renfrew /
Avatar Grove area. Jen to design: photo interlude, old-growth-only emphasis
(everything else darkened), annotation, or replace the beat.

### 8. Console noise: 16 prefetch 404s per landing (found during audit)
`prefetch.ts` fetches the full tile rectangle per chapter viewport incl.
ocean/Alberta tiles that have never existed on R2. Invisible to users;
masks real errors. Cheap fix: clamp prefetch to BC data coverage. Note:
post-Wave-2 deploy, /map raster 404 noise GROWS by design (v2 stopped
shipping blank ocean tiles) — 404-on-empty is now the intended raster
behavior; monitoring should treat it as such (Wave 4).

## What Lee said is fine
The overall structure and the rest of the story ("the rest of it is quite
decent"). 1980→2025 cutblock spread reads well.

## Proposed routing (pending Lee)
1. Jen design spec over the landing page with this audit as input
   (visuals: hero imagery treatment, green-base + red-accumulation grammar,
   timeline pacing, fire beat, old-growth beat).
2. Photo sourcing decision (Lee's photos vs CC research task).
3. Then a landing-page relay wave (after Wave 2 ships; independent of
   /map Waves 3-4 but could share the Jen engagement).
