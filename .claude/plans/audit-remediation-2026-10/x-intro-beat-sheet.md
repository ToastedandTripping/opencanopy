# X spike: intro film beat sheet (draft for Lee's copy approval)

Binding rulings: DECISIONS 2026-10-08 (beat-paced film, starts on first scroll, map wakes up in place,
even pacing with an on-screen note about the record, opens at Echo Lake); plan X amendment of
2026-10-08 (map-only film vs blend; both endings). Register: quiet documentary, captions as a
bottom strip, near-silent. Every number floored and reproducible from shipped data.

Two prototypes share this script. **[blend]** marks squares beats that only the blend shows; the
map-only film holds on the map with the same caption.

| # | Beat | ~Time | On screen | Caption (exact copy) | Source |
|---|---|---|---|---|---|
| 0 | Hero | until first scroll | Unchanged hero photo + headline. Film tiles prefetch here. | (current hero copy, unchanged) | — |
| 1 | Echo Lake | 0-7 s | Photo dissolves into the map where it was taken; camera holds, then begins to rise. | Echo Lake, near Squamish. | BCGNIS 1699 (49.7139, -123.2142); Lee 2026-10-08 |
| 2 | Scale | 7-14 s | **[blend]** a square drawn at true size around the lake. Map-only: the rise continues to the province. | **[blend]** This square is 10,000 hectares. / Map-only: British Columbia's cutblock record, year by year. | geometry (100 km²) |
| 3 | The record begins | 14-30 s | 1950-1989 tick past at even pace; almost nothing paints. | The provincial cutblock record starts thin. By 1990 it holds less than 80,000 hectares. | cutblocks-scrub.json: 78,488 ha through 1989 |
| 4 | Logging | 30-46 s | 1990-2025 paints red; year + running total in the strip. | {N} hectares by {year}. → closing hold: 5.8 million hectares of dated cutblocks since 1950. | cutblocks-scrub.json: 5,888,477 ha, 2,000 ha cap |
| 5 | Fire | 46-56 s | 2017-2025 burns amber over the red. | Since 2017, fire has covered more than six times the area of the cutblocks dated in those same years. | fire-scrub.json 9,254,192 ha vs cutblocks-scrub.json 1,479,845 ha, 2017-2025 (ratio 6.25, floored) |
| 6 | What remains | 56-66 s | **[blend]** the map recedes to 588 red squares beside 3.5 green. Map-only: red dims, the green pockets hold. | 35,000 hectares of BC's largest old-growth trees remain. *(Price, Holt & Daust, 2020)* | as cited on the live site today |
| 7a | Ending: Echo Lake | 66-76 s | Camera descends back to Echo Lake. | Back where we started. Find your own corner of it. | — |
| 7b | Ending: Clayoquot | 66-76 s | Camera descends to STORY_END_CAMERA. | Clayoquot Sound. | STORY_END_CAMERA (49.38, -125.86) |
| 8 | Hand-off | 76-80 s | Controls fade in; the map is live. Chip opens the comment-period plans. | {N} logging plans are open for public comment right now. | FOM public API (spike: labelled sample) |

## Copy notes for Lee

- **Beat 3 is the honest answer to the empty early years.** It says only what the record shows. A
  line saying logging before 1990 happened but went undated would need a source we do not ship
  (the live story's "Much of what you see in red was already gone by 1950" has the same gap; S0
  owns that one).
- **Beat 5's fire figure is burned area summed year by year**, so land that burned twice counts
  twice, and it includes non-forest. The caption says "area", not "forest", for that reason.
  The live story's "Since 2017, wildfire has taken more forest than logging did in decades" is
  the version this replaces.
- **Beats 7a/7b claim nothing about the place.** Whether Echo Lake or Clayoquot holds large old
  growth is not something the film asserts.
- **No Nova Scotia comparison.** The live hero's "larger than Nova Scotia" is still unsourced
  (owed check since 2026-09-02); the film does not repeat it.
