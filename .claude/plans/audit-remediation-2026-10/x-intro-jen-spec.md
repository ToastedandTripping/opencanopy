# X spike: landing intro film, visual spec (Jen, Stage 0.7)

*2026-10-08. Ted's contract for both `/intro-lab` prototypes. Captions are verbatim from `x-intro-beat-sheet.md` (approved 2026-10-08). Not critic-reviewed.*

## 1. Direction

**One unbroken camera, one unit of measure, one voice.** No cuts: the film starts at a person's place (Echo Lake, Squamish beside it), rises to the province and comes back down. Scale rides on a unit the reader first sees enclosing a town. Colour is spent like ink: dark ground, land in low green-grey, and red only where the record dates a cutblock, brightest when new and fading with age, so the eye follows the front rather than a flood. Captions are a documentary lower third. They carry every number; the map carries none.

"Fully realized", measured against renders v1-v3 (scratchpad `renders/*sheet.png`):
1. **The red flood was mostly data, and is fixed there.** The interim 1950 frame already paints 29,176 undated pixels (`cutblocks-by-year/1950.png`), and the binary reveal paints mature and young forest red (`build-raster-tiles.py:136-142`). Both go (section 5).
2. **Human scale.** The film opens at z13, and the square encloses Squamish.
3. **Captions sit in the frame, never on cards over the map.**
4. **Motion inside every beat, and holds between beats instead of cuts.**

## 2. Frame and caption strip

The stage is `position: fixed; inset: 0; height: 100dvh`, and the page never scrolls during the film. `/intro-lab` sets `viewportFit: "cover"`; at 390x844 the insets are 47 px top and 34 px bottom. Every camera call passes `padding: {top: safeTop, bottom: stripSolid}`.

| Strip, top to bottom | Phone 390x844 | Desktop 1280x800 |
|---|---|---|
| Feather | 40 px | 48 px |
| Segment bar | 2 px line, 24 px hit area | same |
| Gap / caption block (reserved) / gap | 12 / 3 lines, 84 px / 12 | 16 / 2 lines, 68 px, cols 1-7 of 12 (24 px gutters) / 16 |
| Controls row | 44 px | 40 px |
| Bottom padding | `max(16px, env(safe-area-inset-bottom) + 8px)` | 24 px |
| `stripSolid` | 208 px | 182 px |
| Gutters | 16 px | 1120 px box, centred |

**Scrim:** `linear-gradient(to top, rgba(10,10,12,.92) 0, rgba(10,10,12,.92) calc(100% - feather), transparent 100%)`, with no `backdrop-filter` (a blur over WebGL re-composites every frame). Text sits only in the .92 zone. Over pure white, the worst case, #ededed is 14.3:1, #94a3b8 6.5:1 and #f59e0b 9.2:1.

| Element | Set | Phone | Desktop |
|---|---|---|---|
| Caption | Literata 500, `font-optical-sizing: auto`, #ededed, left, `text-wrap: balance`; each number and its unit and the citation in `nowrap` spans | 20/28, max 34ch | 26/34, max 44ch, -0.005em |
| Year readout (beats 3-5) | Literata 600, `lining-nums tabular-nums`, #ededed; the year whose frame has painted | 22/24, in the controls row, left | 40/44, right-aligned on the caption's first baseline |
| "wildfires" (beat 5) | Existing `counterLabel` (`chapters.ts`); Public Sans 500, uppercase, .12em, #f59e0b | 11 | 11 |
| Citation | Public Sans 400, #94a3b8, upright (no italic file loaded), its own line 4 px below the caption | 13/18 | 14/20 |
| Lab badge | "Prototype · interim data"; Public Sans 500, uppercase, .08em, #a1a1aa; pill rgba(10,10,12,.72), padding 4/8, at `safeTop + 12`, x 16 | 11 | 11 |

**Caption motion:** in 400 ms (opacity, 6 px rise, `cubic-bezier(.33,1,.68,1)`), out 250 ms (`cubic-bezier(.32,0,.67,0)`), out before in, on screen at least max(2.5 s, characters ÷ 15).

**Counting (beat 4):** `{N}` and `{year}` are `lining-nums tabular-nums` spans. `{N}` is floored to 1,000 (`Intl.NumberFormat('en-CA')`) and steps once per painted year, never tweened: a tween would show numbers no frame has.

**Hero.** `HeroSection.tsx`'s first panel, unchanged. The 5.8 million / fog panel is not on this page (Q3).

## 3. Beat-by-beat

**Cameras** (phone / desktop): E [-123.2142, 49.7139] (BCGNIS 1699); P, whole province, [-126.0, 54.5] z3.3 / [-126.5, 54.2] z4.35; F, southern focus, [-123.6, 52.4] z4.0 / [-124.5, 53.2] z4.6. **Easing:** IOC `cubic-bezier(.65,0,.35,1)`, IOS `cubic-bezier(.37,0,.63,1)`. **Clocks:** cutblock years an even 400 ms each, fire years 700 ms; film time advances only after a frame paints. **Ready** arms the next-beat affordance. While playing, the film auto-advances 2.0 s later (lab flag `advance=wait` turns that off), since pause and scrub imply it plays on.

| # | Camera | Layers / entries | Caption in | Ready |
|---|---|---|---|---|
| 1 | E z13.0/13.6, pitch 40, bearing -8. 0-3 s: bearing to -6 (linear). 3-7 s: z11.8/12.4, pitch 24, bearing -2 (IOC). | Labels 1.0. Hillshade (`setup-layers.ts:136`) fades in over 600 ms once painted; exaggeration 0.5 at z11+, 0.3 at z8 and below. A 10 px ring at E (1.5 px, #ededed .9) from 1.8 to 3.0 s. | 1.8 s | 7.0 s |
| 2A | `flyTo` P, pitch 0, bearing 0, 6,000 ms, curve 1.2, IOC | Forest base fades in between z7 and z5; labels .6 below z7 | 1.0 s | 6.0 s |
| 2B | E z10.45/11.05 (square 280/420 px), pitch 0, bearing 0, 2,200 ms, IOC | Square trace, 2.2-3.8 s (section 4) | 2.4 s | 5.4 s |
| 3 | B first runs 2A's rise. Then P to F, 16.0 s, IOS. | Frames 1950-1989. B: the square shrinks with the map and fades at 8 px (about z5.3). | Sentence 1 at 0.4 s; sentence 2 appended at 8.0 s (1970) | 1989 painted + 1.5 s |
| 4 | F, zoom +0.15, linear, 14.4 s | Frames 1990-2025 with the recency ramp | `{N}` line per painted frame. 600 ms after 2025 paints, the closing line replaces it and red goes uniform .62 over 1,200 ms. | Closing line + 3.5 s |
| 5 | F, held | Red falls .62 to .25 over 800 ms. Fire 2017-2025 from 0.8 s. | 0.8 s | 2025 painted + 2.0 s |
| 6A | F to P, 3,000 ms, IOC | Fire to 0 over 1,200 ms. Land to grey over 1,500 ms. Red .30. Old-growth-250 class raster to .92 between 0.6 and 2.4 s. Key (Q2). | 1.6 s, with citation | 6.4 s |
| 6B | Held | Fire to 0. The map recedes and the squares enter (section 4). Key (Q2). | 3.0 s, with the green squares | 7.8 s |
| 7a | B clears the squares first (1.4 s). `flyTo` E z12.0/12.6, bearing -8, pitch 0 rising to 35 over the last 40%, 6,000 ms, curve 1.42, IOC. | Descent crossfades | Arrival + 0.4 s | + 3.4 s |
| 7b | `flyTo` STORY_END_CAMERA (`chapters.ts:111`: [-125.86, 49.38] z8, pitch 0, bearing 0), 6,000 ms, curve 1.42, IOC | Descent crossfades | Arrival + 0.4 s | + 2.5 s |
| 8 | Held | Wake-up (section 4) | The chip | end |

Untouched, A runs about 91 s and B about 99 s.

## 4. Transitions that carry the film

UI fades are 400 ms `cubic-bezier(.33,1,.68,1)`. Animate opacity and transform only.

**Hero photo to map** (t from the first scroll). Before the scroll, the map sits mounted under the hero at beat 1's camera, opacity 0, loading basemap tiles only.

| t (ms) | Event |
|---|---|
| 0-400 | The cue, h1 and p fade out and rise 16 px |
| 0-800 | A #0a0a0c layer over the photo goes 0 to .5 (IOS), matching the map's luminance so the crossfade never goes muddy |
| 0-1,600 | Photo opacity 1 to 0 and scale 1.00 to 1.08 about 50% 42%, IOS |
| 200-1,600 | Map 0 to 1; beat 1's drift has been running since 0 |
| 1,600 / 1,800 | Strip in / caption in |

**True-size square (B).** Half-side 5,000 m from WGS84 degree lengths at 49.7139° (111,223.5 m per degree of latitude, 72,104.5 m per degree of longitude): N 49.7589, S 49.6689, W -123.2835, E -123.1449. Test: geodesic area 100.0 km² ±0.5%. The line (#ededed, 1.5 px, .92, miter) grows as a GeoJSON LineString via `setData`, clockwise from NW, over 1,600 ms (IOS); then the fill goes 0 to .06 over 600 ms. Squamish townsite should sit in the east half (verify on render), so labels stay at 1.0.

**588 and 3.5 squares, and back (B, beat 6).**
- A div over the map goes to rgba(10,10,12,.72) over 1,400 ms (IOS); the province stays faintly visible.
- The grid is a 2D canvas (DPR capped at 2, `aria-hidden`) of 21 x 28 = 588 squares, floor(5,888,477.44 / 10,000) from `cutblocks-scrub.json`. Phone: cell 14, gap 2 (334 x 446), x 16, centred vertically, with the green row 24 px below. Desktop: cell 16, gap 3 (396 x 529) at the content box's left edge, with green 48 px to the right, bottom-aligned.
- Red: rows fade in top-down from 1.0 s, 40 ms stagger, 480 ms each; #f87171 at .88, no stroke. Green: from 3.0 s, 300 ms apart, 400 ms each; #0d5c2a with a 1 px inside stroke of #4fae72, the fourth half a cell.
- Back: the squares fade over 600 ms, and the scrim lifts over 800 ms from 600 ms.

**Descent (7a/7b).** Opacities are smoothstep functions of the current zoom.

| Layer | Behaviour |
|---|---|
| Film cutblock overlay | .45 to 0, z6-z7 (2.7 km pixels go blocky past z6) |
| /map `cutblocks` (`registry.ts:197`, its own style) | 0 to 1, z6-z7 |
| Forest base | to 0, z6.5-z7.5 |
| `old-growth-250` (`registry.ts:355`) | held .92 |
| Hillshade, 7a only | 0 to 1, z8-z10 |

If the tiles for the current camera have not loaded, film time holds and the camera freezes. A blank tile never shows.

**The map wakes (beat 8).** Chrome lands at its own positions (`src/app/map/page.tsx:722-990`, `CanopyMap.tsx:199-205`).

| t (ms) | Event |
|---|---|
| 0 | Gestures on; strip out over 400 ms, scrim over 600 ms |
| 400 | Bottom bar, rising 8 px |
| 550 | Legend |
| 700 | Search, layer and hot-spot buttons, Replay |
| 850 | Nav, geolocate, scale, attribution |
| 1,000 | Comment-period chip, dropping 6 px; its border pulses once over 1,200 ms |
| 1,600 | `history.replaceState` to `/map#lat=…&lng=…&z=…&layers=cutblocks,old-growth-250` (Q4); focus moves to the chip |

**Where the film UI collapses:** into a 44x44 Replay button in /map's left column below hot-spots (phone top 168, desktop top 116), styled as `page.tsx:732`, "Replay the intro film". Replay reverses the chrome, flies to E over 2,000 ms and restarts at beat 1 without the photo.

**Comment-period chip.** Phone: top 64, left 64, right 12. Desktop: under search at top 64, max width 480. rgba(10,10,12,.85) with a 1 px rgba(52,211,153,.32) border, radius 12, padding 10/14, minimum height 44; Public Sans 500 14/18 (2 lines on a phone); a 6 px dot, #34d399 when live and #a1a1aa for the sample. C4 states: expired, "See logging plans open for comment"; zero, "No logging plans are open for comment right now". In the spike it carries a "Sample" tag and opens `fom.nrs.gov.bc.ca/public` (`ROADMAP.md:151`) in a new tab, because the on-map plans layer is Phase D′.

## 5. Colour

| Token | Value | Job |
|---|---|---|
| `--ground` | #0a0a0c (`--color-surface-0`) | Stage |
| `--ink` / `--ink-muted` | #ededed / #94a3b8 | Text and unit square / citation |
| `--land` | forest base `raster-opacity` .28, `raster-saturation` -.5 (about #14231b) | Forest, beats 2-5 |
| `--land-grey` | saturation -1, opacity .24 (about #18181a) | Younger forest, 6A (ruling C) |
| `--harvest` | #f87171 (palette E) | Cutblocks, red squares |
| `--fire` | #f59e0b (matches /map, `registry.ts:330`) | Burns |
| `--old-growth` / edge | #0d5c2a / #4fae72 | 250+ yr / green-square stroke only |
| `--accent` | #34d399 | The chip only: the one call to act |

**Keeping red from overwhelming.**
1. **A CPU canvas pre-pass over the interim PNGs, once per frame at load** (not a WebGL decode shader, which DECISIONS pins behind the Phase-3 gate). It drops undated pixels, exactly (127,29,29,120) (ruling B). It decodes age from the baked R channel (239 to 185 over ages 0-25, 185 to 127 over 25-50; `build-year-overlays.py:83-92`) and repaints in `--harvest` at alpha .80 (age 0-1), .50 (age 10) and .32 (25 and over). Fire frames are cumulative from 1917 (`2016.png` already paints 38,545 px), so it decodes their age from G (158 to 119 over 0-25) and keeps only burns from 2017 on, at .85 for the frame year and .60 before it.
2. **Uniform .62 at beat 4's total,** so old blocks never read as partial logging.
3. **Never full strength, one hue, never under text,** and `raster-resampling: linear`. The interim binary-reveal tiles are never used.
4. **Interim frames still paint about five times the footprint.** In 2025 they paint 32.75M ha against 6.52M (`SYNTHESIS.md` item 7). The badge says so, and S1-lite's area-true frames drop in unchanged (Q1).

**Colour-blind check.** Machado 2009, full severity, ΔE76 (scratchpad `jen-x/cvd.py`).

| Pair | Normal | Protan | Deutan |
|---|---|---|---|
| Harvest .70 vs old growth .92 | 72.7 | 17.7 | 20.6 |
| Fire .85 over harvest .25 | 77.3 | 75.6 | 76.2 |
| Fire .85 vs harvest .70 (luminance only 1.7:1, which is why red drops to .25) | 54.1 | 55.3 | 46.2 |
| Red square vs green square | 91.8 | 25.5 | 37.1 |

Red and green separate by lightness (L .33 against .08), not hue; the protan 17.7 matches the audit's "about 18" (§E). Green squares reach only 2.4:1 on ground, short of WCAG 1.4.11's 3:1, hence the #4fae72 stroke (7.2:1).

## 6. Controls and affordances

| Item | Spec |
|---|---|
| First-scroll cue | Looks unchanged (`HeroSection.tsx:85-90`). Becomes a 64x64 button, "Start the film". Triggers: wheel ΔY ≥ 40 px within 300 ms, swipe up ≥ 48 px, ↓, PageDown, Space, or tapping it. |
| Advance | The same gestures, or a tap outside the controls; one per 700 ms. Mid-motion, the beat finishes to its end state in 400 ms (`easeTo`), then the next starts. |
| Reverse | Wheel up, swipe down, ←, ↑, PageUp. More than 1.5 s into a beat, it restarts that beat; otherwise it goes to the previous one. From beat 1, back to the hero with an 800 ms reverse dissolve. |
| Segment bar (scrub) | One segment per beat, widths proportional to duration, 4 px gaps. Elapsed #ededed, remaining rgba(237,237,237,.24). Tap or drag to seek (`jumpTo`, render-gated). `role="slider"`, `aria-valuetext` like "Beat 4 of 8, 1994". Arrow keys ±5 s; PageUp/PageDown one beat. |
| Next | 44x44 (40 on desktop), 16 px chevron-down. Opacity .5 until ready, then 1, with two 4 px nudges (1,200 ms each, IOS); the next segment goes to .40. |
| Pause / Play | 44x44 (40), round; rgba(237,237,237,.08) background, .16 border, .14 on hover. Paused means no auto-advance; any advance resumes play. |
| Skip | "Skip to map", Public Sans 500 14, same pill. Goes straight to beat 8 at the ending's camera. |
| Buffering | After a hold of 800 ms or more: a 24 px highlight sweeps the current segment, 1,200 ms loop, opacity .5. |
| Focus | 2 px #ededed outline, 2 px offset |
| Keys and focus order | Space/K pause; →/↓/PageDown next; ←/↑/PageUp previous; Home beat 1; End/Esc skip. Order: hidden "Skip the film" link, segment bar, Pause, Next, Skip; after the hand-off, the chip, Replay, then /map's own order. |
| Screen reader | Stage `role="region"` "Intro film"; caption `aria-live="polite"` `aria-atomic="true"`, announcing only the first value and the closing line of beat 4's count. Readout and canvases `aria-hidden`. Auto-advance pauses while focus is in the controls (WCAG 2.2.1). |
| Map tap mid-film | Advances. MapLibre handlers stay off until beat 8. A pinch falls through to browser zoom (`layout.tsx:51`). |

## 7. Reduced motion

Same stage, strip and controls with the motion removed: every move is a `jumpTo`, every fade, trace and dissolve takes 0 ms, there is no auto-advance, and buffering shows as a static dotted segment. One live map; each still is its beat's end state:

| Still | Shows | Readout |
|---|---|---|
| 1 | E with the ring, beat 1 caption | — |
| 2 | A: P with land. B: the square, filled. | — |
| 3 | 1989 at F, both sentences | 1989 |
| 4 | 2025 uniform .62, the closing line only | 2025 |
| 5 | Fire over red .25 | 2017–2025, "wildfires" |
| 6 | A: three-tone. B: grid plus green. With the citation. | — |
| 7 | The ending's camera | — |
| 8 | All chrome at once; URL updated | — |

## 8. Prototype differences

Identical in both: stage, strip, type, palette, controls, clocks, every caption, the cameras for beats 1, 3-5, 7 and 8, and the wake-up.

| | A, map-only | B, blend |
|---|---|---|
| Beat 2 | Rise to P | True-size square at E |
| Beat 3 opening | At P | The rise; the square shrinks to a speck |
| Beat 6 | Three-tone map, pull back to P; key "Stands 250+ yr (VRI)" | Map recedes to 588 red and 3.5 green squares; key "■ 10,000 ha" |
| Into beat 7 | Direct | Squares clear (1.4 s) |
| Length | About 91 s | About 99 s |

Lab: `/intro-lab?concept=a|b&ending=echo|clayoquot&advance=auto|wait`, on the spike branch only.

## 9. Risks and open questions for Lee

1. **Q1.** The interim frames still paint about five times the captioned area, so A will look redder than its numbers and the test will lean to B. Judge on interim frames, or hold the map beats for S1-lite's area-true frames?
2. **Q2.** Beat 6 needs a key that is not approved copy:
   - A: "Stands 250+ yr (VRI)";
   - B: "■ 10,000 ha".

   No shipped layer draws the 35,000 ha (big-tree subset, ROADMAP Batch 4), so without A's key its green reads as the 35,000 ha. Approve both?
3. **Q3.** Is "the hero stays" the photo panel only, so that the 5.8 million / Nova Scotia panel goes (beat 4 carries the figure; Nova Scotia is unsourced)?
4. **Q4.** Should the hand-off open `cutblocks,old-growth-250` instead of the CTA's `forest-age`, whose orange and light-green classes would re-flood the frame at go-live? /map's reds will differ from #f87171 until C′ either way.
5. **Risk.** The hero (584 KB), MapLibre, the style and beat 1's tiles use most of the 2 MB budget. The 1990-2025 frames (3.57 MB) stream after the first scroll, so on the audit's throttled phone (37-42 s to the first tile) beat 3 will visibly buffer.
