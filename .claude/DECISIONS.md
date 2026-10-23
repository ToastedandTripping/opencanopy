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
*2026-09-02, per Lee, amended 2026-10-08, amended 2026-10-23*

The FTEN cut-block layer carries 230 polygons of 2,000-92,000 ha with no client and repeated areas under different dates: tenure boundaries, not cutblocks. The /map cutblocks layer has always excluded them (`CUTBLOCK_AREA_CAP_HA`); the story's scrub table and year overlays did not, so the red picture and its caption included 2.45M ha that the map itself refuses to call logging. Both pipelines now apply the same cap and the scrub JSON declares it. Undated blocks (1.12M ha under the cap) are painted as the muted pre-record baseline but never counted in a "since 1950" figure, because their timing is unknown. Phase B's harvest leaderboard must use the same definition or its public totals will diverge from the map.

**Amended, Lee, 2026-10-08:** Lee, 2026-10-08: the FTEN record alone hides early logging (78,488 ha dated before 1990, against 3,136,257 ha by the forest inventory's HARVEST_DATE; research/vri-harvest-by-year-2026-10-08.json), while the inventory lags recent years (6,733 ha for 2023 against FTEN's 115,143). Logged area becomes a merge of both records with no stand counted twice, built and reconciled before any public number changes. Until then the public figure stays 5.8 million ha (FTEN). The intro spike may use a labelled interim splice (inventory to 1999, FTEN from 2000: 10,096,541 ha).

**Amended, Lee, 2026-10-23:** Lee, 2026-10-23 (beta decisions, "Film, correct now"): a downward correction may ship before the merge. The cap fix (on max(attribute, geometry); nine polygons, 82,920 ha) and the overlap dissolve go out with S1-lite as soon as they are built, and the headline takes the corrected, floored figure (very likely 5.7 million against the shipped 5,888,477 ha); the merge then changes it once more. The hold "until then the public figure stays 5.8 million" no longer applies to a figure that would overstate.

### A stand we cannot age contributes to no value: not carbon, not timber, not ecosystem services.
*2026-09-02, per Lee*

VRI polygons with no PROJ_AGE_1 and no harvest date classify as "unknown". Until 2026-09-02 they got zero carbon (age clamped to 0) but full stumpage (200 m³/ha) and full ecosystem-services credit, so every unknown-age hectare tilted the protect-versus-log chart toward logging. If we do not know what stands there we do not price it either way; the area stays visible in the breakdown, labelled as excluded. Estimating one side with a mid-class assumption was rejected as inventing data.

### OpenCanopy may advocate: it tells the public when and how to act on what the data shows, not only what the data shows
*2026-09-11, Lee*

Lee found Interfor's Wilson Lake logging map through a Facebook post, a fortnight into a thirty-day comment window, and said a lot of people never learn these windows exist. Asked whether the project should speak rather than only show, he ruled yes: I don't mind that it becomes a tool of change. The charter was amended the same day with his approval, because the drift tripwires read the charter and a session judging the alert work against the old text would have flagged it as off-purpose. What does not change is the honesty regime: an alert's hectares come from the portal's own API and never from a post, a proponent is named and never characterized, and the does-not-dramatize non-goal binds a sentence exactly as it binds a visual. Some proponents are First Nations forestry partnerships, which is why neutral naming is a constraint and not a courtesy. The first application is the FOM watch in the Parking Lot; the human review step is part of the design, not a safeguard bolted on, because Lee is the reviewer and asked for semi-automated with just a review.

### The landing intro is a beat-paced film that starts on the first scroll and hands over to the live map in place.
*2026-10-08, Lee, amended 2026-10-08, amended 2026-10-08*

The hero (photo and text) stays. Each beat plays on its own and a scroll or swipe advances it; scrolling never drives the camera, because the 2026-06 live scroll-zoom showed a reader-driven camera outruns tile loads. The film's clock waits for each frame to paint (Phase A's honest-timeline contract). Its last frame becomes the explorable map with no route change, and the URL updates to the matching /map deep link. Early years keep even pacing per year and say on screen when the dated record begins, rather than being stretched. It opens by dissolving the hero photo into the map near Echo Lake, Squamish, where it was taken; the spike prototypes both endings (return to Echo Lake, or descend to Clayoquot Sound) and Lee picks on his phone. Decided after reviewing the first-ever renders of all three docked ending versions; amends the 2026-08-21 ending ruling's scope only for the intro, which is a new film, not an un-dock.

**Amended, Lee, 2026-10-08:** Lee, same day: the film runs 1900 to 2025; 1900-1959 (166,144 ha, 2% of the spliced total) passes condensed in a few seconds, labelled as condensed on screen, with even pacing per year from 1960. The hero keeps both panels (photo, then the number panel). The map wakes up with cutblocks and old-growth-250 on, matching the film's last frame. Beat 6 carries a key: 'Stands 250+ yr (VRI)' in the map-only film, '■ 10,000 ha' in the blend.

**Amended, Lee, 2026-10-08:** Lee changed the hand-off layers the same day: "maybe it should end on forest ages so as to not make the map seem like a change of graphics." The film's final beat resolves into the forest-age layer as /map draws it, and the map wakes up on forest age, so the reader takes over a picture that is already the live map. This replaces 'cutblocks and old-growth-250 on' above. The change of look happens inside the film, as a deliberate last beat, not at the hand-off.

### At province scale, logging and fire are drawn as area-true dots, never as cells painted wherever a polygon touches.
*2026-10-09, Lee*

The shipped story frames painted 5.66x the logged area in 2025 (32.75M ha painted for 5.79M ha of blocks), almost all from rasterizing with all_touched on a ~494 ha cell when the median cutblock is 16 ha, plus an undated baseline that was nearly all the red in the 1950 and 1990 frames (research/overpaint-2026-10-08/). A picture that overstates the data breaks the reproducible-number rule in spirit. Each dot stands for about 500 ha, placed within one cell of the logging, and the dots sum to the stated hectares (measured within 1.25% for every year since 2001). The whole record ships as one first-year-encoded file per dataset, decoded on the CPU (not a shader, so the Phase-3 pin is untouched) and served same-origin. From zoom 8 inward the picture hands over to /map's vector shapes. The film says what a dot is: "Each dot is about 500 hectares of logged forest, placed where the logging was."

### The map and the intro film share the Canopy palette: old growth and logging are the only loud colours, everything else recedes.
*2026-10-11, Lee*

Lee picked Canopy from three candidates in his 'two loud, rest quiet' direction, after seeing them recoloured on live /map views and on the film's ending. Forest age: old growth #80e691 at 0.85 (seen #72c980), logged #ff3a26 at 0.85 (seen #de3726), mature #586156 and young #97a195 at 0.60 (one sage-grey hue at two lightness steps, seen #434842 / #696f67). Fire is ash (#e1dcd5 fill 0.55, #f0eeea edge), so it never competes with logging's red; cutblocks are scarlet edges with a light fill; parks are edges only; the film's land is the mature token, so the hand-off adds only young and the loud classes. Full token set and the colour-blind checks: research/palette-2026-10-11/ (palettes.json, checks.csv; no failing pair, three marginal). Replaces palette E (ruling E, 2026-10-05), which was never applied. Applying it means an area-true rebuild of the z4-9 forest-age tiles, not only a recolour.

### OpenCanopy opens an open public beta once charter goals (1) and (3) are met; goal (2) is built during the beta.
*2026-10-23, Lee (path-to-beta grill)*

Lee: "I guess I would like to satisfy all of the primary goals before taking this into beta, whereby people will poke around and inevitably find further issue." Before beta: goal (1), a correct and honest core map, and goal (3), a landing page and calculator that never overstate. Goal (2), the watershed report card, accountability view and priority analysis, is built during the beta and shaped by what testers find. The beta is open to the public at opencanopy.ca with a visible beta label, not an invited group (Lee overrode the invited-group recommendation). The label is a small, persistent "Beta" tag with a one-line note linking to the report form and the known-issues note. The two failures this guards against, in Lee's ranking: a wrong number spreads (someone screenshots a figure the data does not support), and testers hit bugs we already knew about. Capture: marvin session-d09d2c, .claude/grills/2026-10-22-opencanopy-path-to-beta.md.

### The beta label goes up only when the beta-day bar is met, and a layer that cannot meet it is hidden rather than holding the beta back.
*2026-10-23, Lee (path-to-beta grill), amended 2026-10-23*

The bar, all of it: (a) zero known serious bugs on current iPhone Safari, current Android Chrome, and desktop Chrome, Firefox and Safari, where serious means it breaks a feature, shows wrong or missing data, or overstates, and everything else is cosmetic and listed on a short public known-issues note; (b) every public figure on the landing page, the calculator and the map popups traced to a script and a test under the reproducible-or-not-shown ruling, with outside figures shown only as cited, with a visible source link; (c) map data visible within about 10 seconds on an ordinary phone on 4G (the Oct 2 audit measured 37-42 s on Slow 4G; the worst connections come later); (d) tiles freshly rebuilt from current government data just before the label goes up; (e) error monitoring and uptime alerting live, on free tiers, tool choice the session's (the only two FAILs in the 2026-08-27 production audit); (f) CI green, with lint running again and the fidelity suite either in CI or run on each tile rebuild with a recorded result. A layer or feature that cannot clear the bar in time is hidden for the beta and returns when fixed. Any figure questioned during the beta is checked and corrected in public.

**Amended, attribution note, plan critic r1, 2026-10-23:** Who decided which part: Lee chose the gate (goals 1 and 3), the serious-bug bar with a known-issues note, the number bar, the 10-second speed bar, the fresh rebuild and hide-don't-block. The device list, error monitoring and uptime alerting, and green CI are MARVIN's calls in the grill capture, part of what Lee confirmed at its gate; he can change them without reopening the rest.

### The beta ends after four weeks with no open serious bug and no unverified number, and only once goal (2) has shipped.
*2026-10-23, Lee (path-to-beta grill), amended 2026-10-23*

The four weeks run from the day the beta label goes up. A serious bug found during the beta pauses the clock until it is fixed; it does not reset it, so one late bug cannot keep the beta open forever ("beta never ends" was offered as a risk and the pause rule is the answer). The label comes off only when both halves hold: the quiet four weeks, and goal (2) live.

**Amended, attribution note, plan critic r1, 2026-10-23:** Lee chose the quiet stretch and goal (2) shipped; "four weeks" and pause-not-reset are MARVIN's calls in the grill capture, confirmed at its gate.

### The beta launches quietly; after a clean first week, a short note goes to a few conservation groups and a local journalist.
*2026-10-23, Lee (path-to-beta grill)*

An open beta with no announcement still has visitors, so the first week is a soak with real traffic and nobody pointed at it. If that week is clean (no serious bug open), a short targeted note goes out to a handful of conservation groups and one local journalist. No broad launch during the beta. Outreach has been dormant since March and there is no mailing or tester list, so the note is written fresh.

### Beta feedback comes through an in-map report form on Netlify Forms, with no accounts and an optional email, named on the privacy page.
*2026-10-23, Lee (path-to-beta grill)*

The form captures place, zoom and visible layers automatically, so a report points at what the tester saw. Reports land in one list the session triages for Lee. Netlify's built-in forms mean no new database or backend; the email field is optional; /privacy names the form and what it stores, keeping the no-accounts promise and the privacy page true. The existing mailto address stays as a fallback. Cosmetic issues found this way go on the public known-issues note; serious ones pause the exit clock.

### The beta opens on the intro film, not the scroll story.
*2026-10-23, Lee (beta decisions)*

Lee chose the film over opening on the corrected scroll story. The film (S1′) and the inventory + FTEN merge are inside the beta gate, under the film's weight budget (under 2 MB before interaction). If the film fails Lee's smoothness check on his phone, the corrected scroll story opens the beta instead and the film follows during it. Plan: .claude/plans/audit-remediation-2026-10/beta-resequence.md.

### The carbon calculator is redesigned before the beta opens, not hidden for it.
*2026-10-23, Lee (beta decisions)*

Lee chose the redesign (K.2 grill, K.3 design plan, K.4 relays) inside the gate over hiding the calculator for beta. The teardown shows no small patch meets the number bar. The live dollar bar, kept by Lee's choice on 2026-10-02 until the redesign ships, therefore ends with K.4, before the label goes up; no known overstatement is live on beta day. He can still switch to hiding it if the road to beta grows too long; hide-don't-block stands.

### The beta speed bar is measured on Chrome's faster 4G profile, not Slow 4G.
*2026-10-23, Lee (beta decisions)*

Lee chose the faster 4G preset over the program's Slow 4G milestone (recommended) for the 10-second first-map-data bar. The SPEED guard states the raw network and CPU values it passes to Chrome, and records the Slow 4G figure beside it as a measurement, not acceptance. On the landing, the bar applies to the first frame of map data the reader is shown, not the hero photo (MARVIN's reading, put to Lee with the question).

### Shared /map links keep the timeline year and class filters before the beta opens.
*2026-10-23, Lee (beta decisions)*

A shared link is how the beta spreads (a journalist's link opening on a different picture is close to a broken feature). M3b's view-state parser is pulled into the gate as its own small relay; the rest of M3b stays in the beta.

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

### Tiles are rebuilt from current government data right before the beta, and then every quarter by Lee with one command.
*2026-10-23, Lee (path-to-beta grill)*

The live tiles are v10 of 2026-05-09, built by a manual local rebuild.sh. Lee's 2026-09-25 call, confirmed in the grill: the pipeline bar is one command run by Lee on a set rhythm, not an unattended rebuild, and the rhythm is quarterly. The matching wording change to the charter's goal (1) is with Lee for approval through marvin session-d09d2c; until he approves it the charter is not edited, and this entry is the operative rule.

## Evidence corrections
