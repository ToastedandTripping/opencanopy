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
*2026-08-21, per Lee, amended 2026-10-07*

The in-story ending zoom (the dolly) went through three relays and never shipped smooth: the live scroll-scrub lags and drops tiles, and the pre-rendered video needs an ffmpeg -> R2 chain that only runs from Lee's terminal. Lee's call: the landing page was trying too hard and absorbing effort that belongs to /map, which is the product. So the story closes on `ending` ('35,000 hectares') and the CTA's 'Explore the Map' carries the reader to STORY_END_CAMERA on /map, where the zoom is interactive and free. The dolly is docked, not deleted (tags `dock/dolly-live-scrub`, `dock/dolly-phase2-video`); an in-story zoom comes back only by a deliberate decision to un-dock it, never by drift — `cameraTo` was removed from the `Chapter` type for exactly that reason.

**Amended, Lee, 2026-10-07:** Lee corrected the reason given above: "I don't think that I meant to imply that the page was trying too hard. I think that maybe the scroll effect wasn't really working." The dock stands; its cause is a working-quality problem with the effect, not a judgement that the page should not zoom. None of the three versions had been rendered or assessed when it was docked: the live scrub was judged on the live site in June, and the 2026-10-07 recording on a GPU showed it scrolling at 60 fps with soft tiles mid-zoom; the play-on-scroll video's render page had a bug that left the reveal at opacity 0, so its video would have been blank; the whole-story video (branch relay/story-video-phase2-render-spec) was never recorded anywhere. Any new ending is judged against rendered output, not memory.

### A public number must be reproducible from the shipped data; when in doubt, understate.
*2026-09-02, per Lee*

The landing page said "8 million hectares" from 2026-06-18 to 2026-09-02 on a count nobody could rerun; the repo's own scrub table said 7.06M, and once the /map layer's 2,000 ha tenure-boundary cap was applied to the story pipeline the supportable figure was 5.89M. Lee's ruling: better to underestimate than to provide a higher number we can't source. So every figure shown to the public (hero stats, chapter copy, calculator values, the PDF) is derived from a file in the repo by a rerunnable script, pinned by a test that reads that file (`src/test/lib/hero-figure.test.ts` is the pattern), and floored when rounded for copy. A figure that cannot be derived is not shown.

### Logged hectares means dated 1950-2025 FTEN cutblocks under the 2,000 ha cap, in the story and on the map alike.
*2026-09-02, per Lee*

The FTEN cut-block layer carries 230 polygons of 2,000-92,000 ha with no client and repeated areas under different dates: tenure boundaries, not cutblocks. The /map cutblocks layer has always excluded them (`CUTBLOCK_AREA_CAP_HA`); the story's scrub table and year overlays did not, so the red picture and its caption included 2.45M ha that the map itself refuses to call logging. Both pipelines now apply the same cap and the scrub JSON declares it. Undated blocks (1.12M ha under the cap) are painted as the muted pre-record baseline but never counted in a "since 1950" figure, because their timing is unknown. Phase B's harvest leaderboard must use the same definition or its public totals will diverge from the map.

### A stand we cannot age contributes to no value: not carbon, not timber, not ecosystem services.
*2026-09-02, per Lee*

VRI polygons with no PROJ_AGE_1 and no harvest date classify as "unknown". Until 2026-09-02 they got zero carbon (age clamped to 0) but full stumpage (200 m³/ha) and full ecosystem-services credit, so every unknown-age hectare tilted the protect-versus-log chart toward logging. If we do not know what stands there we do not price it either way; the area stays visible in the breakdown, labelled as excluded. Estimating one side with a mid-class assumption was rejected as inventing data.

### OpenCanopy may advocate: it tells the public when and how to act on what the data shows, not only what the data shows
*2026-09-11, Lee*

Lee found Interfor's Wilson Lake logging map through a Facebook post, a fortnight into a thirty-day comment window, and said a lot of people never learn these windows exist. Asked whether the project should speak rather than only show, he ruled yes: I don't mind that it becomes a tool of change. The charter was amended the same day with his approval, because the drift tripwires read the charter and a session judging the alert work against the old text would have flagged it as off-purpose. What does not change is the honesty regime: an alert's hectares come from the portal's own API and never from a post, a proponent is named and never characterized, and the does-not-dramatize non-goal binds a sentence exactly as it binds a visual. Some proponents are First Nations forestry partnerships, which is why neutral naming is a constraint and not a courtesy. The first application is the FOM watch in the Parking Lot; the human review step is part of the design, not a safeguard bolted on, because Lee is the reviewer and asked for semi-automated with just a review.

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
*2026-07-17, standing constraint, migrated from handoff.md 2026-08-21, amended 2026-10-07*

The sandbox is keyless and R2 serves no CORS headers to localhost, so MapLibre cannot load tiles in-browser from a worktree. Any relay that changes what the map looks like ships with a live-QA item owed, not a self-certified screenshot. Only Lee can eyeball the live site.

**Amended, Lee, 2026-10-07:** Lee, in the 2026-10-07 grill: Lee's phone check applies to visual releases only (story, film, colours, phone layout, new layers; about 13 of the program's 22), and the live production guards gate everything else. An owed phone check never blocks a release and the owed list has no cap. The premise above is half true: a worktree still cannot render tiles on localhost, but the 2026-10 audit rendered production in headless Chromium, so agents verify non-visual behaviour on the live site. The July backlog is cut to two phone checks (Batch 1 labels and colours; the 2026-09-02 story changes).

### ffmpeg is not in the agent sandbox; the dolly-video render, encode and upload chain is a Lee-terminal job end to end.
*2026-07-10, standing constraint, migrated from handoff.md 2026-08-21, amended 2026-10-07*

The Phase 2 play-on-scroll dolly video needs ffmpeg for the encode step and the sandbox does not have it. Do not attempt to work around it in a relay; the whole render -> encode -> upload chain runs from Lee's terminal.

**Amended, Lee, 2026-10-07:** Lee approved the correction: ffmpeg is installed on the build machine (/usr/bin/ffmpeg, verified 2026-10-07), and the render route now runs headless on its GPU (GTX 1060, ANGLE). Render and encode can run in a session; upload to R2 and deploy still wait on Lee's yes, like any release.

### Deploy is git-triggered: pushing to main auto-builds and deploys via Netlify's GitHub integration.
*2026-07-17, corrected per Lee, migrated from handoff.md 2026-08-21, amended 2026-10-05*

Two earlier sessions logged the opposite (CLI-driven deploy) and were wrong; the Netlify build env holds the key. Standard deploy = merge to main + push, then watch `netlify api listSiteDeploys` for `state:ready` and HTTP-verify. Deploys remain human-in-the-loop by choice because they are outward-facing.

**Amended, Lee, 2026-10-05:** Lee, in the marvin portfolio grill (round 2): the session pushes a release to main after Lee's yes in conversation, with green checks and a named rollback; Lee no longer pushes from his terminal. Deploys stay human-in-the-loop through that yes, and stay outward-facing. This resolves the conflict between the line above and MARVIN's 2026-09-01 Tier 3 rule, and Lee's 2026-09-02 "I don't want to repeat the auto classifier issue where I need to manually push everything". The same grill approved the full seven-wave 2026-10 remediation program.

### The analytics script is served from opencanopy.ca itself and its source lives in this repository.
*2026-09-02, per Lee*

The privacy page promises that the full source, tracker included, is in the public repo. That was false while the script loaded from ssc-ops.netlify.app. `public/tracker.js` is now the shipped copy (sessionStorage only, no cookies; events still go to the ssc-ops track function, which the page names). `src/test/lib/privacy-claims.test.ts` pins the same-origin script, the absence of cookies and localStorage in it, and that every field it sends is disclosed. Changing the tracker means changing the copy here first, and vice versa.

### Each child plan of the 2026-10 remediation program gets at most three critic rounds, and the first runs at the critic's highest effort.
*2026-10-07, Lee, amended 2026-10-07*

The program plan itself took eight critic rounds, every one a FAIL, each finding something the previous round could have found. Lee: "Three rounds but be sure to deploy adequately high level plan critics to avoid repeated critics for things that could have been caught right away." Round one is briefed to report every finding, not stop at the first blocker. A child plan still failing after round three goes to Lee in plain words, never to a fourth round by default.

**Amended, Lee, 2026-10-07:** Lee, same day: "Let's set critic to xhigh instead as I think max actually has diminishing returns." Round one dispatches with `--effort xhigh`, not max. `codex-agent.mjs` runs the plan critic at astra's own default (low) unless told otherwise, which is how all eight rounds of the program plan ran, so the flag is passed explicitly at every child-plan dispatch.

## Evidence corrections
