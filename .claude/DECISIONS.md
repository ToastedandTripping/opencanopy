# OpenCanopy — Standing Decisions

**Write rule: APPEND AND AMEND. Never rewrite, never delete.**

A decision leaves this file only by being explicitly reversed, and a reversal is written
*into* the entry it reverses — struck through, dated, with the reason. Nothing here is
removed because it looks stale, because a rewrite felt cleaner, or because the reader
doesn't recognise it. If an entry seems wrong, that is a reason to investigate it, not to
delete it.

**Why this file exists.** On 2026-08-16 a Fern hand-off was written that *replaced* the
hand-off rather than extending it, silently dropping six standing gates — including the
fact that the household's live data had no backup. They survived only as an untracked file
in the primary checkout, where a routine `git merge --ff-only` would have erased them
without a trace. The diagnosis was that the hand-off was mostly permanent content and only
partly actual hand-off, so a legitimate rewrite of the volatile part destroyed the
permanent part. Permanent content lives here instead, where rewriting is not a thing anyone
does. The convention is documented in `.claude/rules/project-docs.md`.

**Scope.** Decisions and permanent operating constraints. Not work-in-flight (that is
`.claude/handoff.md`) and not the schedule (that is `ROADMAP.md`). MARVIN fleet convention.

---

## Product rulings

### The landing page ends on the province-wide red reveal; the zoom into the old-growth pocket is /map's job, via the CTA deep-link.
*2026-08-21, per Lee*

The in-story ending zoom (the dolly) went through three relays and never shipped smooth: the live scroll-scrub lags and drops tiles, and the pre-rendered video needs an ffmpeg -> R2 chain that only runs from Lee's terminal. Lee's call: the landing page was trying too hard and absorbing effort that belongs to /map, which is the product. So the story closes on `ending` ('35,000 hectares') and the CTA's 'Explore the Map' carries the reader to STORY_END_CAMERA on /map, where the zoom is interactive and free. The dolly is docked, not deleted (tags `dock/dolly-live-scrub`, `dock/dolly-phase2-video`); an in-story zoom comes back only by a deliberate decision to un-dock it, never by drift — `cameraTo` was removed from the `Chapter` type for exactly that reason.

### A public number must be reproducible from the shipped data; when in doubt, understate.
*2026-09-02, per Lee*

The landing page said "8 million hectares" from 2026-06-18 to 2026-09-02 on a count nobody could rerun; the repo's own scrub table said 7.06M, and once the /map layer's 2,000 ha tenure-boundary cap was applied to the story pipeline the supportable figure was 5.89M. Lee's ruling: better to underestimate than to provide a higher number we can't source. So every figure shown to the public (hero stats, chapter copy, calculator values, the PDF) is derived from a file in the repo by a rerunnable script, pinned by a test that reads that file (`src/test/lib/hero-figure.test.ts` is the pattern), and floored when rounded for copy. A figure that cannot be derived is not shown.

### Logged hectares means dated 1950-2025 FTEN cutblocks under the 2,000 ha cap, in the story and on the map alike.
*2026-09-02, per Lee*

The FTEN cut-block layer carries 230 polygons of 2,000-92,000 ha with no client and repeated areas under different dates: tenure boundaries, not cutblocks. The /map cutblocks layer has always excluded them (`CUTBLOCK_AREA_CAP_HA`); the story's scrub table and year overlays did not, so the red picture and its caption included 2.45M ha that the map itself refuses to call logging. Both pipelines now apply the same cap and the scrub JSON declares it. Undated blocks (1.12M ha under the cap) are painted as the muted pre-record baseline but never counted in a "since 1950" figure, because their timing is unknown. Phase B's harvest leaderboard must use the same definition or its public totals will diverge from the map.

### A stand we cannot age contributes to no value: not carbon, not timber, not ecosystem services.
*2026-09-02, per Lee*

VRI polygons with no PROJ_AGE_1 and no harvest date classify as "unknown". Until 2026-09-02 they got zero carbon (age clamped to 0) but full stumpage (200 m³/ha) and full ecosystem-services credit, so every unknown-age hectare tilted the protect-versus-log chart toward logging. If we do not know what stands there we do not price it either way; the area stays visible in the breakdown, labelled as excluded. Estimating one side with a mid-class assumption was rejected as inventing data.

## Engineering pins

### Do not merge the Phase 2 dolly-video branch until real video assets exist.
*2026-07-17, per Lee, amended 2026-08-21*

Branch `relay/story-phase2-dolly-video` is code-complete and Razor-passed, but merging it before the rendered video exists would drop the ending's live zoom: the `remains` chapter falls back to static. Lee explicitly deprioritized it ("leave it till later", 2026-07-17). Blocked on the ffmpeg constraint above.

**Amended, per Lee, 2026-08-21:** Still true, and now moot: the ending dolly was DOCKED on 2026-08-21. Both versions are preserved as annotated tags — `dock/dolly-live-scrub` (main's `remains` + `cameraTo` scroll-scrub, as it was before the cut) and `dock/dolly-phase2-video` (the video branch, `relay/story-phase2-dolly-video` merged into `dolly/phase2-video`). Neither merges to main. If the video version ever comes back it still needs real assets first; the restore recipe is in the ROADMAP Parking Lot.

### The GFW decode-shader endgame stays behind the pre-committed scroll-story Phase-3 gate; do not pull it forward.
*2026-07-03, per Lee*

Feasibility study done and the encoding spec is frozen in the memo, but every surface that would use the year-encoded raster + custom WebGL shader has a cheaper native path today and only the encoder is shared. The Phase-3 fork is decided by the memo's pre-committed thresholds, not by enthusiasm for the technique.

## Operating constraints

### The agent sandbox cannot render the map; all visual and map QA happens on the live deploy, by Lee.
*2026-07-17, standing constraint, migrated from handoff.md 2026-08-21*

The sandbox is keyless and R2 serves no CORS headers to localhost, so MapLibre cannot load tiles in-browser from a worktree. Any relay that changes what the map looks like ships with a live-QA item owed, not a self-certified screenshot. Only Lee can eyeball the live site.

### ffmpeg is not in the agent sandbox; the dolly-video render, encode and upload chain is a Lee-terminal job end to end.
*2026-07-10, standing constraint, migrated from handoff.md 2026-08-21*

The Phase 2 play-on-scroll dolly video needs ffmpeg for the encode step and the sandbox does not have it. Do not attempt to work around it in a relay; the whole render -> encode -> upload chain runs from Lee's terminal.

### Deploy is git-triggered: pushing to main auto-builds and deploys via Netlify's GitHub integration.
*2026-07-17, corrected per Lee, migrated from handoff.md 2026-08-21*

Two earlier sessions logged the opposite (CLI-driven deploy) and were wrong; the Netlify build env holds the key. Standard deploy = merge to main + push, then watch `netlify api listSiteDeploys` for `state:ready` and HTTP-verify. Deploys remain human-in-the-loop by choice because they are outward-facing.

### The analytics script is served from opencanopy.ca itself and its source lives in this repository.
*2026-09-02, per Lee*

The privacy page promises that the full source, tracker included, is in the public repo. That was false while the script loaded from ssc-ops.netlify.app. `public/tracker.js` is now the shipped copy (sessionStorage only, no cookies; events still go to the ssc-ops track function, which the page names). `src/test/lib/privacy-claims.test.ts` pins the same-origin script, the absence of cookies and localStorage in it, and that every field it sends is disclosed. Changing the tracker means changing the copy here first, and vice versa.

## Evidence corrections
