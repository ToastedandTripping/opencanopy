# OpenCanopy Landing Page — Visual Spec
**Jen / design review + visual spec — 2026-06-12** (spawned on Fable per Lee)
Inputs: Lee's audit (`landing-page-audit-2026-06-12.md`), live walkthrough of
opencanopy.ca at 1440×900 and 375×812, photo pool review (~/Downloads),
story code vocabulary (`chapters.ts`, `setup-layers.ts`, `StoryMap.tsx`,
`useScrollytelling.ts`).

**Design tokens in play:** surface-0 `#0a0a0c`, surface-1 `#111114`, overlay
`#0a0a0cd9`, accent `#2dd4bf`, display font Plus Jakarta Sans. Canonical data
palette untouched: old-growth `#0d5c2a`, mature `#4ade80`, young `#f97316`,
harvested `#ef4444`, cutblock-red `#dc2626`, fire-amber `#f59e0b`.

**The one-sentence diagnosis:** the story has exactly one color grammar worth
keeping — green is what stands, red is what was cut, amber is what burned —
and today the page violates it in four places (overview, timeline entry,
fire, old-growth). Everything below enforces that grammar.

---

## 1. Hero imagery treatment

**Current.** Three text-on-black beats (`HeroSection.tsx`). No imagery.
Beat 2 renders "5 million" in accent teal `#2dd4bf` — the explore/act color
applied to a loss statistic.

**Spec.**

**Beat 1 — "British Columbia is home to the last great temperate rainforests
on Earth."**
- Photo: `PXL_20240915_192437668.MP.jpg` (mossy canopy looking up, cedar
  trunk). It is the only photo in the pool that says *rainforest* — moss is
  rain made visible. EXIF orientation 1 (no rotation fix needed); it is a
  `.MP` motion photo — strip the video payload on export.
- Treatment: full-bleed, `object-fit: cover`. Desktop `object-position: 50% 42%`
  (cedar trunk just above center); mobile is native portrait,
  `object-position: 50% 45%`.
- Darken: `filter: brightness(0.55) saturate(0.85)`. The canopy is busy; the
  photo becomes atmosphere, not subject.
- Scrim (over the image, under the text): `linear-gradient(180deg,
  rgba(10,10,12,0.60) 0%, rgba(10,10,12,0.25) 35%, rgba(10,10,12,0.35) 65%,
  rgba(10,10,12,0.85) 100%)`. Heavy top (nav legibility), heavy bottom
  (scroll cue + seam to beat 2).
- Text: unchanged headline; no text-shadow — the scrim does the work. Verify
  white headline ≥ 7:1 against the darkest scrim band behind it; subhead
  bumps zinc-500 → zinc-300.
- Motion: image static within the beat. One Ken Burns on beat 1 only:
  `scale(1.04) → scale(1.0)` over 8s ease-out on load, disabled under
  `prefers-reduced-motion`. No parallax anywhere — 12MP JPEGs plus
  scroll-linked transforms is how you buy jank on mobile.
- Export: AVIF/WebP at 2560w and 1280w, quality ~70, JPEG fallback. Never
  ship the 4080px original.

**Beat 2 — "5 million hectares."**
- **No photo. Deliberate.** The pool has no clearcut image, and a single
  clearcut photo would undersell the number anyway — one frame shows one
  wound and invites "that's just one spot." The number is the visual, and
  the next 8,000px of scroll shows all five million hectares drawn from
  records. Design around the gap; the map is the devastation photo.
- One change, the cheapest highest-impact fix on the page: **"5 million"
  goes from accent teal to harvested-red `#ef4444`.** Teal means
  "act/explore" in this system (nav mark, Explore CTA). Red means harvested.
  The number is harvested. (`#ef4444` on `#0a0a0c` ≈ 4.6:1 — passes WCAG
  large-text comfortably at 8xl bold.)
- Background stays pure `#0a0a0c`. The black gap between two photographs is
  compression before release — keep it.
- Flag for sourcing (below): the aerial clearcut/boundary shot remains the
  future upgrade for this beat.

**Beat 3 — "We mapped it."**
- Photo: `IMG_3284.JPG` (dark fog-bound mountainside, near-monochrome
  blue-gray). It reads as terrain seen from a distance — the surveyor's
  view — which is the right semantic for "We mapped it." The near-monochrome
  palette can't fight white text.
- Treatment: full-bleed, `brightness(0.50)`. Desktop `object-position: 35% 50%`
  (keeps the dark ridge diagonal in frame); mobile `object-position: 30% 50%`.
- Scrim: `linear-gradient(180deg, rgba(10,10,12,0.5) 0%, rgba(10,10,12,0.3)
  40%, rgba(10,10,12,1.0) 100%)` — bottom runs to **fully opaque** surface-0
  so the handoff into the dark map chapter is seamless. The photo should
  feel like it dissolves into the data.
- Reserve `PXL_20240915_192251695.MP.jpg` (person dwarfed by mossy giants)
  for the old-growth beat (§6) — human scale is that beat's payload, don't
  spend it here. `IMG_2818-EDIT` and `IMG_3291` are too fog-white for text
  (and 3291 has EXIF orientation 8 — bake rotation if ever used).
  `IMG_3293`/`IMG_3335`/`IMG_3324` are the bench.
- Alt text: beat 1 "Looking up into an old-growth canopy, moss-covered
  branches and a red cedar trunk." Beat 3 "A forested mountainside in fog."

**Rationale.** Two photographs, both Lee's, both dark-mode native,
bracketing a typographic black beat. Awe → number → resolve. Photos never
compete with text because each beat has exactly one subject.

---

## 2. Opening map grammar — "See what's left."

**Current.** `overview` renders the 4-class `forest-age` raster at 0.6. Red
and orange appear with zero explanation; the province reads as camo noise.

**Spec.**
- **New story raster theme, "story-green"** (one THEMES entry in the Wave 2
  palette-driven builder + a tile run). All four classes map to a green ramp
  graded by age:
  - old-growth → `#2e9e5b` (brightest — the treasure reads as light)
  - mature → `#1f7a44`
  - young → `#14532d`
  - harvested → `#10231a` (near-background green-black — present, recessed,
    unexplained)
  - nodata/ocean → transparent
- The brightness ramp is the message: **brighter green = older forest.**
  Harvested areas sit as dark voids in the field — the opening quietly poses
  the question ("why the holes?") that the timeline answers in red. The
  canonical 4-class colors are not modified anywhere; this is an additional
  story-only theme, and class identity is never asserted with non-canonical
  colors.
- Chapter values: `overview` layers →
  `[{ id: "forest-age-story-green", opacity: 0.8 }]`. The 4-class raster
  does not appear in this chapter. (If the theme/tile run gets cut for time,
  fallback is `story-forest-base` silhouette at 0.8 — acceptable, mute.)
- **Color meaning introduction:** one subheading line in the overview panel —
  heading "See what's left." subheading **"Brighter green, older forest."**
  Nothing else. Red is introduced by the timeline panel's existing copy
  ("Each red mark is a cutblock…"); amber by the fire panel (§5).
- **When does the full 4-class palette appear in the story? Never.** It
  belongs to `/map`, where a legend exists. The story speaks exactly three
  colors over green: red (cut), amber (burned), white (UI).

**Rationale.** A color that arrives before its meaning is noise; noise at
the first map impression costs trust on a data-credibility site. The graded
green keeps the opening alive (a flat silhouette says "BC has forest"; the
gradient says "some of it is ancient") and pre-loads the timeline's
contrast: red will accumulate into exactly the dark voids the viewer
already noticed.

---

## 3. Timeline — "75 years of logging."

**Current.** Entering `logging-timeline`: 4-class raster snaps 0.6→0.4 while
the 1950 overlay snaps 0→0.85; harvested-red shows beneath cutblock-red (two
reds, two meanings); 1950→1980 occupies 40% of an 800vh scrub with +12%
visible change; year counter is `text-5xl md:text-8xl font-light text-white/30`
bottom-right, colliding with map labels and attribution on mobile.

**Spec.**
- **Entry crossfade.** The story-green base persists from overview (same
  layer, no theme change). On chapter enter: base dims 0.8 → 0.65 over
  **800ms ease-out** (set `raster-opacity-transition: 800` on the
  story-green layer); year overlay fades 0 → 0.9 over **600ms ease-out**
  starting at 1950.png. Since 1950 is nearly empty, the perceived entry is:
  map breathes down slightly, a year appears. Calm before accumulation. The
  two-reds problem is structurally dead — harvested is dark green-black in
  the base, so the **only red on screen is the overlay's**.
- **Red accumulation grammar:** keep the existing age-graded ramp in
  `build-year-overlays.py` (fresh `#ef4444` α220 → 25yr `#b91c1c` α200 →
  50yr `#7f1d1d` α180). Fresh cuts burn bright; old cuts scar dark. It's
  already built and it's correct. Add one body line to the panel after the
  existing cutblock sentence: **"Bright red is recent. Dark red is decades
  old."**
- **Dead-zone fix: nonlinear scrub, keep the 1950 start.** Map scroll
  progress to year via **cumulative harvested area**, not linearly. Ted: at
  build time, compute cumulative hectares per year from the cutblocks data,
  normalize to [0,1], invert (progress → year lookup, baked as a small JSON
  table next to `chapters.ts`). Result: 1950–1980 compresses to roughly the
  first sixth of the scrub; the post-1980 acceleration gets the screen time.
  The counter sweeping fast through early decades and slowing as cutting
  accelerates *is* the data — scrub speed becomes meaning. No additional
  easing on top; the mapping is the easing.
- **"Records begin" honesty caption:** while year < 1980, a small line under
  the year counter: **"Records are sparse before 1980."** — `text-xs
  text-white/40`, fades out over 400ms as the counter passes 1980. Keeps the
  75-year claim honest without surrendering the headline to a 1970 start.
  (Rejected: starting at 1970 — it amputates the headline and the history;
  rejected: linear scrub + caption alone — it leaves 320vh of dead scroll.)
- **Year counter treatment:**
  - `font-variant-numeric: tabular-nums` (digits must not jitter while
    scrubbing).
  - Opacity white/30 → **white/40**.
  - Desktop: keep `bottom-8 right-8`, `text-8xl font-light`.
  - Mobile: `bottom-16 right-4`, `text-4xl` — clears the attribution control
    and the Vancouver/Victoria labels it currently collides with (verified
    at 375px).
  - Fade in/out 200ms with chapter state instead of conditional
    mount/unmount (the current unmount is part of the exit snap).

**Rationale.** One red, one meaning, introduced by one sentence. The
1980→2025 spread already reads well. The job is to get there without lying
about the early record or boring the viewer en route.

---

## 4. Timeline conclusion persistence

**Current.** `yearFilter → null` at chapter exit snaps the overlay to
opacity 0 (`StoryMap.tsx:195-198`). The province goes innocently green again
right before "And fire." — the story un-tells itself.

**Spec.**
- Decouple overlay opacity from `yearFilter` presence. The overlay layer's
  opacity is driven by **chapter layer declarations** like every other
  layer; `yearFilter` drives only the image URL swap and the counter. On
  scrub end, pin the source to `2025.png`.
- Chapter declarations:
  - `fire`: `story-year-overlay` at **0.75** (fade 0.9 → 0.75 over 600ms
    ease-out on enter — dips just enough for amber to take the lead).
  - `explore`: `story-year-overlay` at **0.5** (fade 0.75 → 0.5 over 800ms
    as the camera pulls back).
  - Year **counter** fades out (300ms) when the scrub ends; the scars stay.
- The lasting image of the story is the province wearing 75 years of red
  while the CTA arrives. That is the point of the whole page.

---

## 5. Fire beat — "And fire."

**Current.** Renders nothing. Root cause per audit:
`story-fire-history-fill/-outline` have minzoom 9; chapter camera is z5.

**Spec.** **Amber accumulation over the persisted red — a compressed second
timeline.** Not one held frame: fire's story in BC *is* its acceleration,
and the dataset (FIRE_YEAR 1917–2024) carries that story natively.

- **Asset:** cumulative fire-by-year PNG sequence,
  `public/raster/fire-by-year/{year}.png`, built `build-year-overlays.py`-
  style from `fire-history.ndjson` (FIRE_YEAR), same OVERLAY_BOUNDS, same
  image-source mechanism. Chosen over raster tiles for grammar consistency
  with the cutblock overlays and because it's a proven path in this codebase.
- **Color ramp (inverse-age, mirroring the cutblock logic):** recent burns
  bright fire-amber `#f59e0b` α210 → 25yr `#d97706` α180 → 50yr+ burnt umber
  `#92400e` α140. Recent catastrophe glows; old burns are faded scars.
  Amber-over-red overlap reads as hot orange — acceptable and honest (cut,
  then burned).
- **Chapter:** `scrollHeight` 120 → **300vh**. Scrub 1917 → 2024, **nonlinear
  by cumulative burned area** (same build-time lookup mechanism as §3). The
  burned-area curve is brutally weighted to 2017/2018/2021/2023, so most of
  the scrub lives in the last two decades — the data paces its own climate
  story.
- **Layers:** `story-green` base 0.65 → 0.55 (600ms), `story-year-overlay`
  0.75 (persisted, §4), `story-fire-overlay` 0 → 0.85 (600ms ease-out on
  enter). Remove the dead z9 vector fire layers from this chapter's
  declarations.
- **Year counter:** reused, identical treatment. To disambiguate the second
  sweep, a small static label under the counter: **"wildfires"** — `text-xs
  uppercase tracking-[0.25em] text-white/40`. Nothing else changes; the
  panel heading "And fire." has already set context.
- **Panel copy:** add one body line: **"Each amber scar is a wildfire. The
  largest seasons on record are all recent."** (Ted: verify "all recent"
  against FIRE_SIZE_HECTARES by season before shipping; if the data
  disagrees, drop the second sentence rather than soften it.)
- Camera: keep the existing gentle pitch 5 / bearing 10 shift.

**Rationale.** One held frame would make fire a footnote; a full 800vh
second epic would make the page exhausting. 300vh of self-pacing
accumulation lands the coda — *and* fire — without upstaging the logging
story it modifies.

---

## 6. Old-growth beat — "Zoom in. / This is what old growth looks like."

**Current.** Camera flight compresses into ~24vh of scroll (jitter), terrain
toggles at the boundary, and the destination shows the full 4-class palette
at 0.7 — at the moment the headline says "old growth," roughly 60% of the
viewport is orange and red. The copy and the screen contradict each other.

**Spec.**

**`zoom-in` chapter — strip to the subject.**
- During/after the flight to Port Renfrew: **old-growth polygons only.**
  `story-forest-age-fill` with `classFilter: ["old-growth"]` (machinery
  exists), fill `#0d5c2a` at **0.85**, plus the outline layer filtered to
  old-growth at `rgba(74,222,128,0.45)`, 1px — a faint living rim so stands
  read as objects against terrain, not stains. Mature/young/harvested fills:
  **0**. Hillshade and terrain carry everything else in darkness.
- The message becomes spatial truth: the province looked green from orbit;
  up close, the actual ancient forest is *these few islands on the hillside*.

**`old-growth-hatch` chapter — becomes the photo interlude.** Two phases
within one chapter; `scrollHeight` 150 → **250vh**.
- **Phase A (0–55% progress): the photograph.**
  `PXL_20240915_192251695.MP.jpg` — a person dwarfed among mossy giants and
  ferns. Full-bleed fixed overlay above the map, fading in 0 → 1 over
  **700ms ease-out** on phase entry. `brightness(0.7) saturate(0.95)` (this
  frame is already shadow-rich; don't crush it). Scrim bottom-anchored:
  `linear-gradient(0deg, rgba(10,10,12,0.78) 0%, rgba(10,10,12,0.25) 40%,
  rgba(10,10,12,0.15) 100%)`. Panel (heading "This is what old growth looks
  like." + body) sits lower-left over the dark understory; mobile keeps the
  bottom-anchored card. Crop: keep the person lower-center — desktop
  `object-position: 50% 60%`. Alt: "A hiker dwarfed by moss-covered
  old-growth cedars and ferns."
- **Phase B (55–100%): the reveal.** Photo fades 1 → 0 over 700ms;
  subheading "And this is what's left." times with the crossfade; beneath is
  the old-growth-only emphasis view from `zoom-in`, `bearingDrift: 3`
  retained. Moss texture, then the map's sparse dark-green islands — the
  photo/data pairing is the emotional payload of the entire page.
- **Hatch layer: retired from the story.** At this zoom it reads as texture
  noise, and red/orange already had their chapters. One message per beat:
  how little remains.

**Camera motion feel (engineering implements; this is the target):**
- Big flights are **chapter-entry flights, not scroll-coupled**: on entering
  `zoom-in`, a single `easeTo`/`flyTo` of **~2.4s**, standard decelerate
  easing (cubic-bezier(0.4, 0.0, 0.2, 1) character — fast launch, long soft
  landing). No flight work inside a 20%-progress window.
- Scroll-coupled segments (small moves between adjacent close chapters) use
  a **damped rAF lerp** toward the target camera — critically damped, ~600ms
  settle, zero overshoot.
- **Terrain and fog pre-enable before the flight begins**, never mid-flight
  (the toggle is the visible pop).
- Walkthrough note: jump-scrolling past the interpolation window leaves the
  camera stranded at the previous chapter's pose (reproduced — `explore`
  displayed at z13). Entry-flights fix this class of failure entirely; fast
  scrollers always converge on the declared camera.

---

## 7. Console noise

Out of scope (engineering). Noted: 16+ R2 prefetch 404s per landing,
reproduced on every page load during the walkthrough.

---

## 8. Whole-page pass (CONCERNs — non-blocking)

1. **`explore` chapter declares `parks` at 0.8, but both parks layers have
   minzoom 9 and the chapter camera is z5 — parks render nothing.** Same bug
   class as fire; NOT in the original audit (new finding). Spec: drop parks
   from the story; the explore beat's visual is the persisted full story
   state (green base + 2025 red at 0.5, §4). Parks belong to `/map`.
2. **Accent discipline** is otherwise good — teal lives on the nav mark and
   Explore CTA only. After the beat-2 fix (§1), teal never touches a data
   statement. Keep it that way as a standing rule.
3. **Micro-label contrast:** "SCROLL" and "Clearcut and never recovered."
   sit at zinc-600 (~3.2:1) — bump both to zinc-500 minimum, zinc-400
   preferred.
4. **Narrative panel vertical position** drifted to the top of the viewport
   on the overview chapter at 1440×900 despite `md:items-center` intent —
   verify after rebuild; spec is left-center desktop / bottom-anchored
   mobile, consistently.
5. **Mobile panel coverage:** on the old-growth beat the card covers ~45% of
   a 375px screen. The §6 redesign resolves it; for other chapters cap the
   mobile card with `max-height: 40dvh; overflow-y: auto`.
6. **Scroll pacing after changes:** overview 150 / timeline 800 / fire 300 /
   zoom-in 180 / old-growth 250 / explore 120 vh — total grows ~330vh. The
   additions land in the two beats that currently have nothing to show.
7. **"Skip to map"** is discoverable and honest where it is. Leave it.
8. **CTA section** is clean and in Lee's voice. Optional micro-trust line
   under the disclaimer: data vintage ("Harvest records through 2025.").
   Suggestion only.
9. **Typography hierarchy** holds (7xl hero → 3xl panels → xs micro). No
   changes beyond contrast bumps.

---

## Priorities (what moves the needle)

1. **Green-base grammar + timeline entry crossfade** (§2 + §3 entry) — kills
   the two worst legibility failures in one stroke.
2. **Fire beat + 2025 persistence** (§5 + §4) — repairs the only beat that
   renders nothing and the snap that erases the story's conclusion.
3. **Old-growth photo interlude + old-growth-only emphasis** (§6) — the
   page's emotional payload; uses photos already in hand.
4. **Hero imagery, beats 1 & 3 + red "5 million"** (§1) — first impression;
   the color fix is one line.
5. **Camera entry-flights + damped lerp** (§6 motion) — feel; fixes jitter
   and the stranded-camera failure for fast scrollers.
6. **Nonlinear scrubs + "records begin" caption** (§3, §5) — pacing honesty.
7. **Year counter mobile fix + micro-contrast bumps** (§3, §8) — polish.

## Needs sourcing / building (doesn't exist yet)

- **Aerial clearcut or old-growth/cutblock boundary photo** — future beat-2
  upgrade, not blocking. Shot spec for a Lee trip or CC search: oblique
  aerial/drone, 200–300m AGL, fresh cutblock sharing a hard edge with
  standing old growth, overcast flat light, Vancouver Island or Interior;
  frame the boundary as a diagonal. (TJ Watt/AFA imagery is not usable.)
- **`story-green` raster theme tiles** — one THEMES entry + tile run
  (Wave 2 builder).
- **Fire-by-year cumulative PNG sequence** (1917–2024) from
  `fire-history.ndjson`.
- **Cumulative harvested-hectares-by-year + burned-area-by-year JSON tables**
  (build-time, for the nonlinear scrubs).
- **Optimized hero exports** — AVIF/WebP 2560w/1280w from the three chosen
  photos; strip `.MP` motion payloads; bake EXIF rotation if `IMG_3291` is
  ever used (orientation 8).
- **Data check:** "largest fire seasons are recent" claim before the fire
  panel copy ships.
