# OpenCanopy: audit remediation program (2026-10)

## Intent (grilled)

**Summary / key decisions.** Turn every confirmed finding of the 2026-10-02 UI, visual and
performance audit into a sequenced program of relays. Each relay is driven by its own critiqued
plan and carried out by Opus agents. The carbon calculator gets its own redesign phase, built on
research rather than a patch.

Lee's words, 2026-10-02:
- "take all of the suggestions found here and wrap it up into a multi-phase plan to be run
  through the relay pipeline. Ensure that everything uses properly critiqued plans and are
  designed to be carried out by Opus agents."
- On the calculator: "I would kind of like to find some way to refine this entire calculator
  ... it's something that only exists as a sort of afterthought ... having this could be one of
  the unique tools, but it needs to be more well thought out and properly engineered to capture
  real information and not just make extrapolations or exaggerations."

Rulings taken in this session (AskUserQuestion, 2026-10-02). Phase 0 records them in DECISIONS.md:

| # | Ruling | Audit option taken |
|---|---|---|
| A | The map-plumbing and story-honesty relays run **before** Phase B | A.1 |
| B | Undated cutblocks come **out** of the story picture until their status codes are checked. Amends the 2026-09-02 undated ruling | B.3 |
| C | The closing reveal goes to three tones: green 250+, grey younger forest, red recorded harvest | C.1 |
| E | Adopt the colour-blind-safe palette (#0d5c2a / #5eead4 / #facc15 / #f87171), decided now so overlays build once | E.1 |
| F | /map opens on Overview for a first-time visitor, after the plumbing fix | F.2 |
| H | Company attribution comes from tenure data **before** the leaderboard ships | H.1 |
| G | **HELD.** Tiles stay on r2.dev for now. Goes to the Parking Lot | (held) |
| D | **Superseded** by a full calculator redesign. The live "$570M" dollar bar **stays until the redesign ships** (Lee's choice; recorded as an accepted known-overstatement) | (redesign) |
| — | Deploys go **per relay**, each followed by live production guards | — |
| — | The map lane and the story lane run as **two parallel worktree sessions** | — |
| X1 | The landing story is **re-imagined as an animation** made by us, built as a prototype first to see the result | (new, Lee 2026-10-02) |
| X2 | The animation ends on the map **plus act now**: a live count of open FOM comment periods | ending option 1 |
| X3 | Tone: **quiet documentary**. Restrained, near-silent, the data does the work | register option 1 |
| X4 | It **plays like a short film**: about 60-90 s, autoplay, with pause, scrub and skip, and a still version for reduced motion. It replaces the 1,878vh scroll | control option 1 |
| X5 | **Two concepts are prototyped from the same honest data** (the province animated; data as form) and Lee picks one on his phone | concept option 1 |

Lee on the story: "Perhaps you could be creative here and revisit the entire story scroll idea and
the thought to perhaps replace the entire thing with an animation ... use all tools, internet,
other resources ... building out at least to see what the result of which would be." And: "I think
it's rather obvious the story I'm trying to tell through the landing page."

Skip line: no separate `/grill` for the program. The audit synthesis, its eight structured
decisions and Lee's answers above serve as the grill. **The calculator phase runs a real `/grill`**
before its plan is written (step K.2), because its intent is not yet written down.

## Context

On 2026-10-02 four auditors and four skeptics (Opus, xhigh) audited opencanopy.ca, and a
synthesis followed. Report: `~/marvin/research/opencanopy-ui-perf-audit-20261001/SYNTHESIS.md`;
lane reports and evidence sit beside it.

Headline findings:
- Search, share links, deep links and the story's "Explore the Map" button fail on cold loads
  (`CanopyMap.tsx:68`, verified).
- Desktop renders no vector data until the reader drags the map.
- Four landing sentences contradict the record (`chapters.ts:131,189,190`, `CtaSection.tsx:78`).
- Story overlays paint about 5x the logged area.
- A throttled phone waits 37-42 s for the first data tile, and the landing pulls 17 MB.
- No public layer ever reports loading, empty or failed.

Twenty-one prior findings hold, and two "shipped" fixes never worked live.

Existing program on the books:
- **Phase B** is built and unmerged on `relay/phase-b-harvest`; it needs a rebase.
- **Phases C, D and E** have critiqued plans from August on that same branch. They are stale
  against main: Batch 1 renames, global-state, the 09-01 refresh.
- Lee's order (2026-08-26) is B → C → D → E. Ruling A inserts the fix-up relays ahead of B.

## Strategy chosen

A **program plan** (this file) plus **one critiqued plan per relay, written just in time**:
- Each relay plan is written when its lane reaches it, against the code as it stands then.
- Each goes through the critic gate (`rules/plan-critic-rubric.md`) and runs through `/relay`.
- The Wave-1 plans (S0a, S0b, M1a, M1b, S1-lite, X) are written and critiqued immediately after
  this plan is approved.

Rejected alternatives:
- (1) Write every relay plan now. Phases C and later would be written against code that M1 and S1
  change underneath them. August's C/D/E plans went stale exactly this way, and the Phase E critic
  had to fold five "reality moved underneath it" must-fixes.
- (2) Fold everything into the existing B–E phases. The plumbing and story honesty work does not
  belong to any of them, and Ruling A puts it first.

## Agents and models (every relay)

| Role | Model | Source |
|---|---|---|
| Orchestrator / plan author | Opus 5.5 (session) | — |
| Ted, implement and fix | Opus, medium effort | relay-implement default, Lee 2026-09-19 |
| Razor, review gate | Opus, high effort (pinned) | Lee 2026-09-19 |
| Jen, visual spec and Stage 3 | Opus, xhigh (pinned) | Lee 2026-09-30 |
| Cross-reviewer | inherits the session (Opus 5.5) | integrations.md |
| Behavioral evaluator | Opus, low effort | relay-post-review |
| Specialists (Charity for deploy/CDN, Dao for data) | Opus, medium effort | — |
| Plan critic | astra by rule, Fable on fallback; `--effort xhigh` on every child plan (Lee 2026-10-07) | rubric; Lee 2026-09-11. The only non-Opus seat, by standing ruling. At most three rounds per child plan |

**Precondition checked at every relay load:** `scripts/worker-tier.sh status` must read
`anthropic`. If it reads `on` (proxy) or `codex`, the relay stops; it does not silently run a
non-Opus Ted.

## Program contracts (binding on every child plan; from the astra critic, 2026-10-05)

Target repo: `/home/leesalo/Projects/opencanopy`; lanes work in worktrees of it. Canonical
rulings: `.claude/DECISIONS.md` at `origin/main` (11 entries as of 3db5823).

**C1. Release identity and rollback.**
- Netlify deploys the app plus everything under `public/`: story overlays, `/raster`,
  `tracker.js`. Netlify instant rollback restores those together.
- **R2 objects are outside that rollback** (the PMTiles archives and raster overviews). Any relay
  that changes R2 data (T, C′, any forest-age raster rebuild):
  - publishes to a **new versioned path** and never overwrites;
  - adds the version to a single constant the app reads;
  - keeps the previous version for at least 90 days;
  - before switching, proves that the previous deploy still reads the old path and the new deploy
    reads the new one (old-tab and saved-link fixtures included).
- **Netlify-served assets and browser caches.** Rollback changes what the server serves, not what
  a browser has cached or an open tab holds. So:
  - any generated asset whose content can change (story overlays, `/raster`, story data JSON) is
    published under a **content-versioned path**, a hash or a data version in the directory name,
    and referenced through one constant;
  - long-lived cache headers (S2-pages) apply only to such versioned paths;
  - unversioned paths keep `must-revalidate`.
  - A test opens the old deploy's page, deploys the new one, then rolls back. An already-open old
    page keeps working across both transitions, because its referenced assets still exist at their
    versioned paths.
  - **Retention:** each release keeps the previous two asset versions in `public/` alongside the
    new one, so every deploy serves its own version and the two before it.
  - **Supported window:** a tab up to two releases old works fully. An older tab degrades through
    the missing-asset contract below. Both are tested, including a tab across a third subsequent
    deploy.
  - **Tested transitions:**
    - an old tab across an upgrade;
    - a new tab after a rollback;
    - a new tab opened before a rollback that lazy-requests uncached assets after it.
  - The last case can request a version the rolled-back deploy lacks. Contract: a missing overlay
    degrades gracefully. The frame is omitted and a small "reload to update" note is shown. It
    never paints a wrong frame or breaks the page, and a test proves it.
- **URL compatibility** (M1a and M3b). Every currently public hash form keeps its meaning. Fixtures
  cover:
  - existing shared links captured from production;
  - absent fields;
  - new fields;
  - malformed values;
  - legacy layer ids;
  - back and forward.

  Defaults are documented in the parser.
- Each relay close records commit sha, Netlify deploy id, data version and live-guard results in
  the handoff log (`log_entry`).

**C2. Serialized releases. Lanes are not runtime-independent.**
- **Two kinds of release, with different acceptance:**
  - **Instrumentation** (M1a batch 0 only). Accepted when:
    - the probe and `oc-build` are present on production;
    - the existing `audit:live` suite is green.

    The new behaviour guards are **expected red** on it. They are recorded as negative controls,
    not as release failures.
  - **Behaviour** (every other release). Accepted when every guard the release lists as blocking
    is green.
- **Before each push:**
  - the coordinator records the **last known-good deploy id**;
  - Lee pushes only when he can stay through verification, about 20 min.
- **On a red release:**
  - the failed candidate is live until Lee acts, and the coordinator records the pending recovery
    action;
  - Lee chooses one of two recoveries:
    - (a) roll back to the recorded known-good deploy;
    - (b) authorize one **corrective release** from the lane that broke it. It is labelled as such
      and is the only push allowed while halted.
  - The halt lifts when a release is green again.
- **Release claim:** an atomic lease. `mkdir ~/marvin/state/opencanopy-release.lock`, holding the
  claimant lane, the candidate SHA and a timestamp. Only the holder may ask Lee to push. A lease
  older than 2 h is stale, and is broken only after the coordinator reconciles against Netlify's
  live published deploy, read with the netlify CLI. A test covers two lanes claiming at once and a
  duplicate registration of the same SHA.
- **Push boundary.** Fencing in `release-ledger.mjs` binds sessions, not Lee's shell. So before
  every push Lee runs `node scripts/release-ledger.mjs check-push`, which prints GO only when:
  - the lease token is current;
  - the candidate SHA equals the local `main` head;
  - `origin/main` equals the recorded expected parent;
  - Netlify has no deploy in flight;
  - the ledger is readable and reconciled, and **either** the predecessor release is green **or**
    a recorded one-shot corrective authorization is bound to this exact candidate SHA.

  NO-GO exits nonzero. Command-level tests cover every predicate, and the documented human repair
  is for an unreadable ledger.

  Anything else prints NO-GO with the reason. **Enforcement here is cooperative.** Nothing
  technically stops a direct push, and the plan says so. A test covers a request queued before a
  takeover and checked after it, which must print NO-GO.
- **Fencing:**
  - each lease carries a monotonically increasing **token**;
  - every ledger write and release request carries the token;
  - `release-ledger.mjs` rejects any write or release with a token older than the current lease,
    so a resumed former owner cannot act;
  - reclamation is serialized through the same `mkdir` lock;
  - tests cover a resumed former owner and two competing reclaimers.
- **Coordinator takeover:** any session can take over by reading the ledger and reconciling it with
  Netlify first, covering the published deploy **and any deploy in `enqueued`, `building` or
  `processing` state**. Takeover completes only when no candidate is in flight, or the in-flight
  one is recorded and adopted. Any state it cannot classify halts scheduling. A candidate recorded `pending` or `unverified` **never**
  becomes known-good without a green guard entry. After any rollback, the ledger records the
  restored deploy as current.
- **Durable state:** every candidate SHA, deploy id, release kind, guard result, known-good target
  and halt/recovery state is appended to `~/marvin/state/opencanopy-releases.jsonl`. It sits
  outside both worktrees, so either lane can read it and a lost session loses nothing. Before
  publishing, a lane reconciles its view against that file.
- Only one push to main is in flight at a time.
- The next push waits until the previous deploy's live guards are green.
- A red guard **halts both lanes' pushes**. Lee rolls back (he owns the push and the Netlify
  console). The lane that shipped it fixes it, and its relay re-runs the guards.
- Conflict matrix:

| Shared surface | Touched by | Rule |
|---|---|---|
| `src/lib/layers/registry.ts` | S0 (legend note), M2, M3, B′, C′, D′, E′ | S0 first; later relays rebase |
| `src/app/layout.tsx` (meta, fonts) | M2 (share meta), S2-pages (Literata) | M2 owns; S2-pages rebases after M2 |
| `netlify.toml` / headers | S2-pages (cache), T | serialized; T after S2-pages |
| `src/test/mocks/maplibre.ts` | M1a (creates), M2, M3, K.4, B′ | M1a owns the shape; later relays extend, never replace |
| `playwright.live.config.ts` + live specs | M1a (creates), every relay | append-only per relay |
| panel slot (`src/components/panels/`) | M3a (creates), K.4, B′ | K.4 and B′ start after M3a merges |
| `ROADMAP.md`, `.claude/handoff.md` | every relay | written via the writers on the relay branch; conflicts resolved at merge, never by dropping lines |
| R2 tile paths and manifest | C′, T, D′ | C1 versioning; one data release at a time |

**C3. Guards observe the user outcome, with falsifiable negative controls.**
- **The probe ships first, alone.** M1a's batch 0 is an instrumentation-only release:
  - the probe only (the `oc-build` identity tag already shipped in P0b);
  - no behaviour change.
- Every behaviour guard is then run against **that** deploy, which has the probe but not the fix.
  It must fail on its **behaviour assertion** (the camera is not at the target; zero rendered
  features), never on a missing probe. A guard that fails for any other reason does not count as a
  negative control.
- Each guard also checks the outcome against an **independent oracle**, a screenshot pixel check,
  so a probe that reports intended rather than observed state cannot pass on its own.
- The relay report records, for each guard:
  - the failing assertion;
  - the deployed SHA it failed on;
  - the SHA it passed on.
- For pure regression guards, where today's production is already correct, the negative control is
  a **controlled revert on a Netlify draft deploy** that keeps the probe.
- **Deploy identity.** A guard run starts only once `oc-build` on production equals the candidate
  SHA. It polls for up to 10 min; past that, the release is "unverified" and C2's halt applies.
- **Retries** cover infrastructure failures only (navigation error, browser crash). Attempts are
  logged with timings. A retry never extends a performance budget: the 30 s render budget is the
  budget.
- **The probe's data:** it holds the current camera, which after geolocation is the visitor's
  approximate location. It is in-page only and never persisted. C6's payload test proves the
  tracker never sends it; it does not prove anything about other sinks.
- **Other location-bearing sinks, named:**
  - tile requests, which imply the viewport;
  - geocoder or search requests, which carry the query;
  - guard screenshots and logs, stored locally in the evidence dirs only and never published.

  Child plans that touch these list them.
- Production guards read a **read-only probe**:
  - a frozen object `window.__ocProbe` exposing only `{center, zoom, renderedFeatureCount(layerId),
    globalYear, layerStatus(layerId)}`;
  - no map handle, no setters, no user data.
  - Razor reviews it as an attack surface.
- Required assertions:
  - after a search, the **camera** is within tolerance of the target, not merely the hash;
  - after a province link, `renderedFeatureCount > 0` for an enabled layer within 30 s, plus a
    pixel check, not merely a `.pmtiles` request.
- Each guard declares one negative-control type: (i) red on the instrumentation deploy, for
  defects present today; or (ii) red on a controlled-revert draft deploy, for regression guards
  where production is already correct. The relay report records which, the SHA, and the failing
  assertion.
- Unit guards are mutation-verified with `scripts/mutation-battery.mjs`.

**C4. Status and freshness contracts.**
- Layer status is a **revisitable** state machine:
  `idle`, `loading`, `slow`, `rendered`, `empty`, `hidden-by-filter`, `zoom-in`, `error`.
  - Any viewport, source or filter change returns the layer to `loading`.
  - `slow` is entered after 15 s of `loading`. It keeps listening, and moves to `rendered`,
    `empty` or `error` when the data resolves.
  - Every async result carries the **generation** (viewport, source and filter key) it was
    computed for. A result from a stale generation is discarded.
  - `empty` requires all three of:
    - the source is loaded;
    - every tile in the current viewport is loaded;
    - zero features before class filters are applied.

    Zero features *after* filters reads `hidden-by-filter`.
  - Transition table, binding on M1b and M3a alike:

    | Event | Layer affected | New state |
    |---|---|---|
    | layer disabled (toggle or preset) | that layer | `idle`, pending work cancelled |
    | layer enabled (toggle or preset) | that layer | `loading` (new generation) |
    | viewport, source or filter change | enabled layers **inside** their zoomRange | `loading` (new generation) |
    | viewport change | enabled layers **outside** their zoomRange | stay `zoom-in`, never `loading` or `slow` |
    | any event | disabled layers | stay `idle` |
    | zoom leaves the layer's zoomRange | that layer | `zoom-in` |
    | zoom re-enters the zoomRange | that layer | `loading` |
    | 15 s in `loading` | that layer | `slow` |
    | data resolves | `loading` or `slow` layer | `rendered`, `empty`, `hidden-by-filter` or `error` |

  - Precedence: `idle` (disabled) beats `zoom-in`, which beats everything else.
  - Fixtures exist for every edge, including:
    - panning while out of range must never reach `slow`;
    - not-yet-loaded must never read `empty`;
    - a stale generation is ignored;
    - `slow` recovers to `rendered`.
- **FOM open-comment count:**
  - **Source.** A same-origin edge endpoint fetches the FOM public API. It has a **fixed upstream**
    URL and query, accepts no client-supplied parameters (anything extra gets a 400, tested), is
    GET only, has a 5 s upstream timeout, and caps the upstream response at 1 MB. It records `fetchedAt`
    server-side, validates the response shape, and caches for at most 15 min.
  - **Client display rule.** The count shows only when the response passed validation and
    `now - fetchedAt < 15 min`. A timer expires the count at the earlier of `fetchedAt + 15 min`
    and the next midnight Pacific. Freshness is also re-checked on `visibilitychange` and
    `pageshow` (bfcache resume), because timers stall in background tabs. An expired or unverifiable count is removed, and the numberless link "See
    logging plans open for comment" replaces it.
  - **Counting predicate.** `commentingOpenDate <= today <= commentingClosedDate` in Pacific time,
    computed against each project's own dates. Never inferred from the API's filter flag alone.
  - **Before implementation**, a `/probe` saves a representative response and verifies:
    - pagination or truncation;
    - which states the summary includes (withdrawn, incomplete, future);
    - date formats and time zone.

    If completeness cannot be established, the feature ships numberless.
  - **Fixtures:**
    - timeout;
    - invalid schema;
    - partial response;
    - a project closing at midnight Pacific;
    - a page resumed after 20 min;
    - a continuously visible page crossing the 15 min mark;
    - a page crossing midnight Pacific;
    - an empty list ("No logging plans are open for comment right now" is a true statement and
      shows).

**C5. Evidence labels never exceed their sources.**
- **Carbon** is labelled an "estimate" with its sourced range, never a "floor". Where VRI is known
  to undercount dense old forest (DellaSala et al. 2022), say so as context, not as a bound.
  Conversion factors carry their published ranges (IPCC 0.47-0.55).
- **Story truth checks**, shared by S1-lite, S1′ and the fallback:
  - **Area semantics are defined first.** A year's figure is the *unique* area first recorded as
    harvested that year, dissolved, so re-harvest of the same ground is not counted twice. The
    cumulative figure is the dissolved union. S1-lite documents whether today's scrub tables
    follow that definition. If they don't, it rebuilds them to match, and the reconciliation
    below compares like with like;
  - per-year totals reconcile with the (re)built scrub tables within 2%;
  - **headline figures are asserted equal to an independently derived, versioned total**, floored
    per the 2026-09-02 ruling, never against a preferred threshold. Comparisons such as "larger
    than Nova Scotia" are **conditional**: the copy changes or drops if the derived total no longer
    supports them, and the guard tests that the comparison is true, not that the total is big;
  - overlapping polygons are dissolved before area is summed;
  - each frame's area-weighted painted area is within ±15% of its source total, **and**
    independently selected geographic inclusion and exclusion samples pass (as S0b defines them),
    so correctly sized pixels in the wrong places still fail;
  - the record's start year comes from the dated data, never from a proxy year;
  - where fire and harvest overlap, both are shown;
  - the visual composition is legible from a legend or caption.
- **Dollar exception scope (Lee, 2026-10-02):** the calculator panel **and** its PDF stay exactly
  as live today until K.4. K.4's acceptance includes removing or replacing the figure in **both**.
  Nothing new is added on top in the meantime.

**C5b. One area contract.** It applies to **aggregate** logged-hectare figures only. A popup's
per-block area is the raw feature attribute (`plannedAreaHa` or the FTEN area field), labelled as
that block's recorded area, and is not a contract consumer. The aggregates are:
- the story's totals and frames (from the scrub tables, rebuilt by S1-lite);
- the leaderboard (computed at build time by the v1 Python twin in B′);
- the Discover panel's figure, which M2 derives through v1 or removes.

**Cross-route interval:** between S1-lite and B′ the only live aggregates are the story's and, if
kept, Discover's (migrated in M2). Nothing shows a pre-v1 aggregate after M2.

**Semantic negative control:** displayed values are tested against the shared overlap and
re-harvest fixtures, and the mutation battery must show those tests fail when the v1 area
function is reverted while the version label is unchanged. A label alone never passes.

The existing ruling, "Logged hectares means dated 1950-2025 FTEN
cutblocks under the 2,000 ha cap, in the story and on the map alike", is extended by S1-lite into a
versioned definition, `area-contract v1`, implemented once in TypeScript with a Python twin for the
build scripts:
- dedup by dissolve;
- a year's figure is the unique area first harvested that year;
- the time range and cap per the ruling;
- attribution by tenure holder (filled in by B′).

It ships with fixtures for overlapping blocks, re-harvest and cap edges, checked against an
independently derived total. Every aggregate consumer (story, Discover panel, leaderboard)
reads that version. Changing it is a `decisions_amend` plus a version bump with a migration note.
B′ and C′ adopt v1 or propose v2 through their critiqued plans.
- **Twin equivalence:** one shared JSON fixture set (overlap, re-harvest, cap boundary, year
  boundary). Both implementations run it in CI and their outputs are compared to the hectare.
- **Consumer migration, with owners and release edges:**

  | Consumer | Shows logged hectares from | Migrates in | Release edge |
  |---|---|---|---|
  | story (landing) | FTEN scrub tables | S1-lite | after S0b |
  | Discover panel (/map) | hotspot figures | M2 (derive through v1, or remove) | after S1-lite |
  | leaderboard (/map) | FTEN | B′ (it is not public before then) | after M2 |

  **The calculator is not a consumer.** It reports VRI stand-age classes, not FTEN logged hectares.
  Whether its "Harvested" class should adopt the contract is a K.3 design question, frozen until
  K.4 per Lee.

  **Mixed-version policy, mechanically enforced.** Every component that renders an **aggregate**
  logged-hectares figure declares `areaContractVersion`. Raw per-block popup values carry no
  version, and the test excludes them by type. A test renders each route (`/`, `/map` with every panel)
  and fails if one screen shows figures with differing versions. Because each screen's consumers
  migrate in a single release, no mixed interval exists on any screen. The test proves it.

**C6. Privacy.** `public/tracker.js` sends four URL-bearing fields, and each can carry map
coordinates or query data:
- `pageUrl: window.location.href` (:54);
- `referrer` (:56);
- `cta_click.href` and `nav_click.href` (:140, :150);
- `outbound_click.url` (:180);
- **`email_click.email` (:165)**, which sends the whole `mailto:` href. The crash-report links
  (`MapErrorBoundary.tsx:38`, `src/app/map/page.tsx:1087`) put a URL-encoded body in that href,
  containing the page URL and therefore the map hash.

S0a fixes all of them:
- `email_click` sends only the recipient address. Everything from `?` onward is dropped, so no
  subject or body is ever sent;
- every URL-bearing field passes through one `sanitizeUrl()`, which keeps origin + pathname only
  and drops query and fragment;
- outbound URLs keep the hostname only;
- a test **clicks the real crash-report and bug-report links**, captures the actual
  `sendBeacon`/`fetch` payloads with a sentinel `#lat=12.345&lng=67.89` and a `?token=` query, and
  asserts that neither appears in any payload value **after URL-decoding, repeated until stable**.
  The negative control is the old email-click handler, which must fail the test;
- the privacy page names exactly the fields sent.

**Old clients and ingestion.** A browser holding the old `tracker.js` keeps sending full URLs until
its cache expires. Client-side sanitization cannot stop that. Two controls:
- (a) S0a sets `tracker.js` to `Cache-Control: no-cache` (via `netlify.toml` headers). That makes
  the next page load fetch the fixed script. It does **not** bound an already-open page, which keeps
  running old code until it is closed or navigated, so (a) is a mitigation, not containment.
- (b) **Ingestion-side sanitization** in the track function, which strips query and fragment from
  every URL field before storage. That function lives in Lee's separate `ssc-ops` repo, so (b) is a
  cross-repo patch: drafted here, applied by an `ssc-ops` session with Lee's approval.

**Containment is claimed only after (b).** C6 counts as done only when:
- (b) is deployed;
- a legacy-format payload carrying sentinel coordinates, posted to the receiver, is verified
  stripped in storage.

Until then the exposure is reported to Lee as **open, mitigated by (a)**. The receiver is shared
with other sites (`ssc-ops`), so (b)'s own critiqued plan in that repo:
- scopes the policy (OpenCanopy origin only, or all tenants);
- tests the other tenants' payloads for compatibility.

**S0a's file list:** `chapters.ts`, `CtaSection.tsx`, `registry.ts` (note string),
`public/tracker.js`, `netlify.toml` (header), the /privacy page, the copy guard test and the
payload test. That is 8 files in `src/`, `public/` and the repo root, which the root waiver covers.
The `ssc-ops` patch is owned by that repo, not counted here. S0a also reports
who can read the stored analytics (access scope) and their current retention.

**Receiver inventory first.** Before S0a changes the privacy page, it inspects, read-only, the
deployed track receiver and its storage schema in `ssc-ops`, and lists every field actually stored,
including those the **receiver adds**, such as client IP address.
- The privacy page must state exactly what is stored **today**. If IPs are stored, the page says
  so until the receiver stops.
- Every "we do not collect or store" sentence on the page is checked against that inventory.
- The outbound-link minimization (hostname only) applies to legacy payloads at the receiver too.

**Program node SO1, the `ssc-ops` ingestion patch:**
- Owner: an `ssc-ops` session, with its own critiqued plan and Lee's approval.
- Build after S0a; no OpenCanopy release depends on it.
- Scope:
  - strip query and fragment, decoded;
  - reduce outbound URLs to hostname;
  - reduce `email_click.email` to the bare address;
  - stop storing or truncate IPs if Lee rules so.
- **Overdue:** 30 days after S0a's release, SO1's open status goes in every relay-close report until
  it lands, owned by the release coordinator. Elapsed time never authorizes deleting records.
- Verification artifact: `research/privacy-verification-<date>.md`, showing legacy and current
  payloads with sentinels and the resulting stored rows.
- **C6 is not marked complete until SO1's artifact exists.** The TRACEABILITY index carries C6 as
  open until then.

**Records already collected** on the analytics endpoint may contain coordinates and IPs. Discovery
searches every field, including `email_click.email` and decoded values, not only top-level URL
fragments; both go into
Lee's disposition decision. Lee owns them;
the endpoint is his `ssc-ops` service. S0 counts how many records carry a fragment or query, and
the disposition (purge those fields, purge the records, or keep) is a decision put to Lee **as soon
as S0a's receiver inventory reports what is actually stored**, and recorded with its date. It cannot
be decided sensibly before the inventory exists. No session deletes analytics data.
- M3b rounds geolocated coordinates written to the hash to 2 decimals (about 1 km).
- Child plans that touch URLs, requests or logs state their coordinate flow.

**C7. Dependencies and budgets.**
- New packages (`@mapbox/vector-tile`, `pbf`, `@types/geojson`; `regl` if X uses it; `libcbm` in
  K) are verified against the registry for typosquats, licence-checked, and pinned in the lockfile
  by the plan that introduces them. Lee runs the installs.
- Overlay and raster builds run detached with recorded peak memory; 12 GB is the known peak and
  needs 4 GB of headroom. **Only one heavy build (8 GB or more) runs on the host at a time**,
  enforced by `~/marvin/state/heavy-build.lock`, which holds PID, host, start time and job.
  - **Liveness, not Netlify, decides staleness:** a lock whose PID is dead (`kill -0`) is stale.
  - At acquire, the build checks for at least 16 GB available memory, and refuses otherwise.
  - Tests cover a killed build (lock recovered) and a live build (lock respected).
- **Spike budget (X):**
  - one Jen spec, two Ted builds, one fix round each, one Jen review, one research agent;
  - time box of 7 days from start to videos in Lee's hands.

## Lanes and waves

Two worktree sessions, spawned from `~/Projects/opencanopy` **on main**.
- **Lane M** (map): `src/components/map/`, `src/hooks/`, `src/app/map/`, `src/lib/layers/`,
  `src/test/`, `playwright*`.
- **Lane S** (story and pages): `src/components/story/`, `src/lib/story/`, `src/data/chapters.ts`,
  `src/data/scrub/`, `scripts/build-year-overlays.py`, `scripts/build-raster-tiles.py`,
  `src/app/(landing)`, `src/app/privacy`, 404.
- **Calculator design** (K.1–K.3) runs in this session alongside Waves 1–2. It writes no code.

The lanes share several surfaces. C2's conflict matrix is the authority, and the graph's release
edges enforce it.

| Wave | Lane M | Lane S | Calculator |
|---|---|---|---|
| 0 | Phase 0 (this session) | — | K.1 research (running) |
| 1 | **M1a** (probe release, then plumbing core), then **M1b** | **S0** copy, privacy and interim pictures, then **S1-lite** honest frames; **X** spike alongside, consuming S1-lite's products | K.2 /grill |
| 2 | **M2** trust + provenance + E1 never-blank | **S1′** build the chosen intro (or the S2 story half on the fallback) + **S2-pages** | K.3 design plan + critic |
| 3 | **M3a** status states + action row + legend, then **M3b** timeline + URL state + polish | (idle, or K) | **K.4** calculator relay(s), after M3a (shared panel slot) |
| 4 | **B′** Phase B rebase + attribution (H) | — | — |
| 5 | **C′** Phase C re-plan (palette E, after M1 re-measure) | — | — |
| 6 | **D′** Phase D (FOM layer), **E′** E2–E5, **T** tiles | — | — |

## Phase 0: foundations (this session, after approval)

0.1 **Primary checkout to main, preserving what is there.** `~/Projects/opencanopy` is on
`dolly/phase2-video` with uncommitted work:
- `AGENTS.md`, the block `next dev` regenerates;
- `e2e/render/dolly.render.spec.ts`, +14 lines;
- two untracked files, `.claude/plans/opencanopy-relay-plan.md` and its critic: a **2026-09-20
  "charter gap closure" relay program**, critic FAIL, never executed, with decisions D1 and D3-D8
  pending for Lee.

Nothing is discarded:
- the two tracked edits become a WIP commit on `dolly/phase2-video` (its own branch, docked);
- the two plan files move into this program's Phase 0 commit as **historical, superseded**, and
  every item in them is mapped in `TRACEABILITY.md`, either absorbed by a relay here or parked
  with its pending decision listed for Lee;
- only then does the primary switch to main and pull.

The original step, kept for reference: `~/Projects/opencanopy` is on `dolly/phase2-video`, and worktrees
fork from it.
- Lee runs `! git -C ~/Projects/opencanopy status`, checks it is clean, then
  `! git -C ~/Projects/opencanopy checkout main && git -C ~/Projects/opencanopy pull`.
- Gate: no lane spawns until `git -C ~/Projects/opencanopy rev-parse HEAD` equals `origin/main`.

0.2 **Record the rulings** through `scripts/update-decisions.mjs`:
- `decisions_add` for A, C, E, F and H;
- `decisions_amend` for B, on "Logged hectares means dated 1950-2025 FTEN cutblocks under the
  2,000 ha cap ...": undated blocks leave the story picture as well as the count;
- `decisions_amend` for C and X1, on "The landing page ends on the province-wide red reveal ...".
  The ending becomes three-tone, and the intro may become an animation. The clause that /map's
  CTA deep-link does the zoom stays, and the dolly-docking entries are untouched;
- `decisions_add` for the calculator ruling: the redesign, and the dollar bar left live by choice;
- `decisions_add` for the deploy cadence: per relay, live-guarded, serialized (C2);
- `decisions_add` for X1-X3: the intro is re-imagined as a quiet-documentary animation that ends
  on the map plus a live comment-period count. X4 (film-like control) and X5 (two prototypes) are
  spike parameters and go in the handoff, not DECISIONS.

**Phase 0 file table.** 23 files in 3 roots (`.claude/`, `research/`, root `ROADMAP.md`): 3 edited
and 20 added (including `TRACEABILITY.md` and the two superseded plan files), docs only, one commit, one batch with no dependencies.

**Waiver** on both the 8-file and the one-root caps: no code. Ten of the files are verbatim copies
of finished reports plus an index, and the records must land together so no relay reads a
half-recorded program.

Added:
- `research/ui-perf-audit-2026-10-02/`:
  - `SYNTHESIS.md`;
  - `map-visual.md`, `pages-visual.md`, `performance.md`, `usability-refactor.md` (the lane
    REPORT.md files);
  - `verify-map-visual.md`, `verify-pages-visual.md`, `verify-performance.md`,
    `verify-usability-refactor.md`;
  - `EVIDENCE.md`;
  - `TRACEABILITY.md`: every P0, P1 and P2 finding in the synthesis, and every item of the
    superseded 2026-09-20 program, mapped to its relay or to a named deferral. Written before
    Wave 1, updated at each relay close, and checked at program close.
- `research/calculator-2026-10/teardown.md` and `research.md`.
- `.claude/plans/2026-10-audit-program.md`, this plan, plus its critic rounds r1, r2, r3 and
  final: 5 files.

Edited:

| File | Change |
|---|---|
| `.claude/DECISIONS.md` | writer: the entries above |
| `ROADMAP.md` | `next`, Parking Lot |
| `.claude/handoff.md` | writer: owed items, log |
| `research/ui-perf-audit-2026-10-02/` | SYNTHESIS.md, the four lane REPORT.md and four verify .md files, plus `EVIDENCE.md`: an index of the raw evidence (38 MB of scripts and data, 1.7 GB with screenshots) at `~/marvin/research/opencanopy-ui-perf-audit-20261001/`, with sha256 of each file so a claim can be checked against an unmodified copy |
| `research/calculator-2026-10/` | teardown.md and research.md (moved from the plan-mode sidecars) |

Each entry gets a reason paragraph and Lee's words with the date. Before writing, the headings are
shown to Lee in the final message, per the rule "propose, never auto-write". G goes to the Parking
Lot, not DECISIONS.

0.3 **Bring the audit into the repo.** One destination: `research/ui-perf-audit-2026-10-02/`, as
in the file table above. Relay plans cite that directory.

0.4 **ROADMAP.**
- `next`: becomes this program.
- Parking Lot gets:
  - G, the tile domain (held 2026-10-02);
  - undated blocks option 2, to revisit after the status-code check;
  - the 08-22 C3 500 ha cap, which conflicts with the 2026-09-02 ruling;
  - the iOS Safari bottom-bar check.
- `handoff.md` (via `update-handoff.mjs`):
  - `owed_add` for each wave;
  - `log_entry`.

0.5 **Commit on this branch, then merge and push.** Lee pushes from his shell, since the classifier
blocks `git push :main` from a session. A docs-only deploy.

0.5b **Release tooling (relay P0b, Simple tier, before the first coordinated release).**
- **Deploy identity ships here, not in M1a:** `<meta name="oc-build" content="<sha>">` from
  Netlify's `COMMIT_REF` at build time.
- **Bootstrap path for P0 and P0b themselves,** which precede the meta tag: identity is verified
  read-only through the Netlify CLI. The published deploy's `commit_ref` must equal the candidate
  SHA and its state must be `ready`. That is equally strong, and it is the same check C2's
  reconciliation uses. From S0a on, guards read the meta tag.
- `scripts/release-ledger.mjs` in the OpenCanopy repo: append, claim and release the lease,
  stale-lease check, reconcile against the Netlify published deploy, and the heavy-build lock.
- Its tests cover:
  - concurrent claims;
  - a duplicate SHA;
  - a stale lease;
  - a killed build;
  - **a malformed or unreadable ledger, which halts all scheduling** until a human repairs it.
- Owner: this session.

0.6 **Write and critique the Wave-1 plans**: P0b, S0a, S0b, M1a, M1b, S1-lite and X. X is a spike, but Lee
asked that everything be critiqued.
- Each goes in `.claude/plans/2026-10-<slug>.md` with its `-critic.md` beside it.
- An Opus Plan agent drafts each one from the synthesis section and the cited code.
- The orchestrator verifies every file:line anchor against main.
- Each then goes to the critic (astra, Fable on fallback).
- Must-fixes are folded in and steelmanned before the relay starts.

## Relay specifications

Every relay plan written from these specs must carry:
- `## Intent (grilled)` (quoting this plan's table);
- a file table;
- a `## Dependency Graph` with batches of at most 8 files and one subsystem root;
- per-batch `### <id>.` headings, for `plan_section`;
- verification with **revert-proven** guards (`scripts/mutation-battery.mjs`; no self-reported
  mutation tables);
- a live production guard where the defect only shows on real loads;
- rollback (Netlify instant rollback to the previous deploy);
- a ROADMAP and handoff update at close.

Evidence citations point into `research/ui-perf-audit-2026-10-02/`, via its `EVIDENCE.md` index.

### S0. Honesty now, as two releases (Lane S)

This section is the **single binding scope** for S0; the X section only refers to it.

**S0a, copy and privacy.** 8 files in three roots (`src/`, `public/`, repo root for `netlify.toml`),
enumerated in C6. The waiver covers three roots because `tracker.js` and its cache header must ship
with the privacy page text and the copy fixes. The `email_click` fix is inside `tracker.js`.
Contents:
- the copy deletions and replacements below;
- the C6 tracker sanitization and its payload test;
- the /privacy text and date;
- the copy guard test.

Negative controls are local: the copy guard and payload test are run against pre-fix main
(`3db5823`) and must fail there.

**S0b, dated-only overlays** (Lane S, after S0a):
- `scripts/build-year-overlays.py` (config `undated_proxy_year: None` for cutblocks);
- the regenerated overlay PNG set as **one generated-artifact group** under a new versioned path
  (C1);
- the path constant;
- `src/data/chapters.ts` (drop `baseline`; `ending` stops on the dated 2025 frame, no binary
  fade-in);
- the coarse-cell caption;
- the truth-check script and its test.

About 6 source files plus the artifact group, in roots `scripts/`, `src/`, `public/`. The waiver: a
generator, its output and its consumer must change together, or a deploy pairs new code with old
frames.

S0b's truth checks are an **explicitly interim subset**. The coarse `all_touched` cells cannot meet
C5's ±15% area accuracy, which belongs to S1-lite's renderer, and S0b never reports that check
green.

**Interim coarse-picture exception:** bounded until S1-lite releases, and disclosed on screen by the
coarse-cell caption. **Sunset, enforced in the shipped reader:** S0b ships a constant, `COARSE_OVERLAYS_SUNSET`, set to
S0b's release date plus 21 days. After that date, the story reader omits the coarse cutblock
overlays unless S1-lite's area-true asset version is present. It then shows the forest base, the
counters and the captions only. No human push is needed. The sunset is a runtime boundary:
- a mounted reader **crossing** the deadline removes the overlays live;
- the date is re-checked on `visibilitychange` and `pageshow`;
- the constant is written once by S0b and never regenerated by later rebuilds or redeploys, which
  a test pins.

**In the fallback:** the year counter and the hectare totals stay, because they come from the
scrub tables, not the pixels. The counter's render-gate binds to the forest base frame instead of
the omitted overlay. Owner: Lane S. The TRACEABILITY index tracks the exposure until S1-lite's frames
are live or the sunset has fired.

S0b checks:
- per-year totals in the story copy unchanged, since they come from the scrub tables, not the
  pixels;
- **geographic samples**, independently selected:
  - dated harvest polygons painted at and after their year, never before;
  - park interiors with no recorded harvest, never painted;
  - undated-only polygons, never painted;
  - fire and harvest overlap samples, both shown.

Their negative control is the current production PNG set, which must fail the undated-only and
pre-year samples. The build waits for the host-wide heavy-build lock (C7).

#### S0 detail (copy and pictures)

The landing sentences contradicted by the record (synthesis top-10 item 3):
- Delete "Much of what you see in red was already gone by 1950." (`chapters.ts:131`).
- Delete "The full picture is worse." (`:190`).
- Replace the 0.3% line (`:189`) with "That's the old forest left on BC's most productive sites,
  where the very biggest trees grow. Less than 0.1% of the province's forest."
  - "Less than 0.1%" is an **upper-bound statement**: true because the source figure, 0.07%, is
    below it. Price, Holt & Daust 2020: 35,000 ha against BC's forest area as that paper defines
    it. S0 records the page, the denominator and the derivation beside the string. A guard pins
    the string to the source figure being under 0.1%.
- Fix the legend note to match (`registry.ts:119`).
- Rewrite the provenance line (`CtaSection.tsx:78-80`) to name the 2,000 ha tenure filter.
- Add a copy guard test banning "by 1950", "full picture is worse" and "0.3%" in public copy.
  It must be mutation-proven.
- **Interim picture fixes** (see X, must-fix 1):
  - drop the `baseline` chapter (undated blocks at 1950);
  - end the `ending` chapter on the dated 2025 cutblock frame, with no binary red fade-in;
  - the truthful coarse-cell caption on the cutblock overlays.
- **Privacy (C6):** `tracker.js` `pageUrl` becomes origin + pathname; the /privacy text matches,
  and its "Last updated" date is corrected.

*(Sizing is stated once, under S0a above.)* Lee approves the replacement copy before merge.

### M1a. Map plumbing core (Lane M)

- **Test harness first:**
  - `src/test/mocks/maplibre.ts` gets a controllable `isSourceLoaded` and a recorded
    `setGlobalStateProperty`;
  - rendered PmtilesLayers tests that **fail on today's main**.
  - (Refresh R1-13 / R4-16.)
- **Map handle and camera (top-10 item 1):**
  - forward the ref with `src/lib/react/merge-refs.ts`;
  - seed `initialViewState` from the hash at construction;
  - delete the poll-and-fly in `useMapState.ts`;
  - subscribe the URL sync once the map exists;
  - replace the hollow `src/test/lib/deeplink-hydration.test.ts:29-47`.
- **Source registration (item 2):** register on `style.load` or a non-null `getStyle()`, then
  `triggerRepaint()`. `DataLayer.tsx:420-427`.
- **visibleRef pattern for PmtilesLayers** `visible` and `classFilters` (refresh R1-05,
  `DataLayer.tsx:290/311/357`, deps `:445`).
- **Timeline year (item 5, refresh R1-02):** `page.tsx:322-327`, `CanopyMap.tsx:84`.
- **Live guards** in `playwright.live.config.ts`, read-only React hook in place of the dev-only
  handle. Each must pass on a fixed build and fail on the current one:
  - after a fresh-context search, the probe's camera is at the target;
  - the CTA link puts the camera at z8 on Vancouver Island;
  - a desktop province link renders features (probe count > 0 plus a pixel check) within 30 s
    with no input;
  - the timeline readout equals the probe's `globalYear`.
  - All per C3, with negative controls.
- The read-only probe (C3) lands here, in batch 0.
- **M1a guard catalogue** (blocking means it gates its release):

  | Guard | Negative control | Oracle | Blocking |
  |---|---|---|---|
  | search moves the camera | red on the batch-0 instrumentation deploy | probe camera within tolerance **and** a pixel diff against a reference capture of the target view taken by direct deep link | yes |
  | CTA lands at the Vancouver Island pocket at z8 | red on batch 0 | probe camera **and** pixel diff vs reference | yes |
  | desktop province link renders data in 30 s | red on batch 0 | probe count > 0 **and** layer-colour pixels above a threshold in a fixed region | yes |
  | timeline readout = map year | red on batch 0 | readout text = probe `globalYear`, **and** pixel witnesses across two year steps: the centroid of a known fire from year Y painted, from Y+1 unpainted, then after stepping to Y+1 painted. The mutation battery proves the guard fails with the fire layer hidden and with rendering frozen while probe and readout still advance | yes |
  | existing `audit:live` (fixed) | n/a (pre-existing) | as today | yes |

  **Reference captures for the pixel oracles** are taken on the batch-0 deploy using the audit's
  proven workaround: dispatch a `popstate` after the canvas mounts, which forces the hash camera
  even with the broken handle. They do not depend on the fix under test.

  These live negative controls apply to **M1a's guards only**. S0's controls are local, against
  pre-fix main, as S0 states.

  The baseline SHA for each negative control is the batch-0 deploy's `oc-build`, recorded in the
  ledger. Budgets are fixed per guard and run on unthrottled desktop. Throttled-profile timings are
  recorded as measurements, never acceptance.
- Fix the two hollow `audit:live` assertions on non-public layers (`live-health.spec.ts:170-266`,
  handoff owed).
- Dev deps `@mapbox/vector-tile pbf @types/geojson`. Lee runs the install; the classifier blocks
  installs from a session.

### M1b. Map plumbing, the rest (Lane M, after M1a merges)

- Raster `beforeId` without the `isStyleLoaded()` guard (item 6, `DataLayer.tsx:1086-1101`).
- Inactive raster sets and satellite get `visibility: none`; old-growth-250 reuses the forest-age
  source; archive `bounds` on every raster source (item 4).
- Terrain on only when pitch > 5°.
- Slow sources are marked "slow", not abandoned (`DataLayer.tsx:408-418`).
- Status cleared on toggle-off (refresh R1-03).
- popstate restores without pushing a history entry (P9).
- Deep-link latitude range check (`useMapState.ts:68`).
- **Exit gate for Phase C:** re-run the like-for-like grid (`map-visual/scripts/grid.mjs`,
  `post.py`) and attach the deltas to the M1b report.

### X. Story-animation spike (Lane S, after S0; replaces S1/S2 as the next step)

**The live story is corrected now, not after the spike.** S0a and S0b (scope in the S0 section,
which alone is binding) correct the live story whatever concept is chosen and however long the
choice takes. Then:
- **S1-lite** is a relay of its own in Lane S, **scheduled immediately after S0b and owned outside
  the spike**. It:
  - settles the area semantics (C5);
  - builds the honest data products (area-true per-year frames, undated blocks excluded, the
    three-tone ending tiles, palette E, per-year totals JSON);
  - swaps them into the existing scroll story;
  - ships.

  X **consumes** these products; it does not produce them. Honesty therefore depends on no
  creative outcome. If the build fails its truth checks, S1-lite stops and reports, and the S0b
  sunset (S0 section) governs what the story shows. That is the only fallback.

**Bounds.**
- **Spike timeout:** 7 days from X's start. At expiry, whatever exists is captured and sent to Lee,
  even one concept or stills. If nothing renderable exists, X is closed as failed and recorded in
  the handoff.
- **Decision timeout:** if Lee has not picked within 14 days of the spike closing (delivered or
  failed), the scroll story stays as corrected by S0 and S1-lite, and S2's story half resumes
  against it.

S1 itself is superseded by S1-lite in every path. Nothing waits on X except the animation.

**What every story path must satisfy.** Once Ruling X1 replaces the scroll story, rebuilding its overlays (S1)
and tuning its scroll (S2) would polish a structure that is being retired. Their **honesty
requirements survive as acceptance criteria** for whatever replaces it:
- area-true pixels;
- undated blocks out;
- the three-tone ending;
- palette E;
- the hero figure and comparison guard (C5);
- the counter render-gated on the data.

The S2 page fixes (sponsor link, /privacy, 404, Explore names, cache headers, Literata) do not
depend on the story, so they ship as **S2-pages**.

**Shape:** a `/spike` in its own worktree (`spike/intro-animation`), throwaway by contract,
nothing merged. Steps:

1. **References and story spine (research, web).**
   - Study how the best data-documentary pieces handle land change and loss. Examples: NYT/Reuters
     graphics, the Pudding, Global Forest Watch time-lapses, Apple keynote data moments.
   - Record what each does, what it costs to build, and which honesty rules each would break here.
   - Draft a beat sheet of 6-8 beats, about 60-90 s, quiet documentary:
     - what BC's forest is;
     - what the inventory dates as old;
     - logging as the record dates it;
     - fire;
     - what is left;
     - two doors: the map, and "N logging plans are open for comment now".
   - Every number in the beat sheet carries its derivation from shipped data, floored, per the
     2026-09-02 ruling. Lee approves the copy; the story is his voice.
2. **Data: consume S1-lite's products** (frames, totals, ending classification). If S1-lite has not
   landed yet, the prototypes use them from its branch and say so on screen. They are never
   rebuilt here.
   - The FOM count follows C4 exactly, including its probe. In the spike the count may be mocked
     from the saved probe response, labelled "sample data" on screen.
3. **Two prototypes on `/intro-lab`** (spike branch only), built on the same data:
   - **A, the province animated:** WebGL (MapLibre custom layer or regl) over the real BC
     outline. The camera is choreographed in code, not pre-rendered, so every frame derives from
     the shipped data.
   - **B, data as form:** abstract and typographic, for example one mark per N hectares, with N
     chosen so the counts are exact integers from the totals. Canvas or WebGL, no map engine,
     very light.
   - Both:
     - autoplay with pause, scrub and skip;
     - `prefers-reduced-motion` gives a still, readable sequence;
     - captions in sync with the frames they describe;
     - phone first (390x844);
     - end on the two doors.
   - Jen (Opus xhigh) writes the visual spec before the build and reviews both builds. Ted
     (Opus medium) builds. Blender stays an option only for a one-off asset, never the runtime,
     because the runtime must be reproducible from data.
4. **Show Lee.**
   - Record each prototype on a phone viewport with Playwright `recordVideo`, plus a desktop
     capture.
   - Send both through SendUserFile, and deploy the spike as a Netlify draft (non-production) URL
     so he can play them on his phone.
   - Lee picks A, B or neither, and says what to change.
5. **Verdict, then S1′.** The chosen concept gets a real relay plan, critiqued, and built on main
   to replace the landing story. It inherits the honesty acceptance criteria above, plus a weight
   budget (the landing under 2 MB before interaction, against 17.6 MB today) and an accessibility
   contract (captions as real text, keyboard controls, reduced motion).
   - If Lee picks neither, or the decision timeout passes, S2's story half resumes against the
     scroll story as corrected by S0 and S1-lite.

Cost: the spike's agents (Jen spec and review, two Ted builds, one research agent) run on Opus
per the model table. They write no production code.

**Amended by Lee, 2026-10-08 (after reviewing the first renders of all three docked ending versions).**
The concept stands; the execution must change. Binding on X and S1′:
- **Shape:** the current hero (photo + text) stays. The first scroll starts the film. The film ends on the map.
- **Control:** beat-paced. Each beat plays on its own; a further scroll, swipe or tap advances to the next beat. Scroll never drives the camera. Pause, scrub and skip stay.
- **Hand-off:** the same map wakes up in place. The film's last frame becomes the live map (controls fade in, no route change); the URL updates to the matching /map deep link.
- **Clock:** render-gated, reusing Phase A's honest-timeline contract (film time advances only after the frame has painted). The hero doubles as the prefetch window for the film's tiles.
- **Early years:** even pacing per year, plus one plain on-screen line about when the dated record begins (about 89% of dated cutblock area is after 2000, from `cutblocks-scrub.json`). No pacing curve.
- **Prototypes:** the map-only film (A) versus the blend (map where place matters, squares where scale is invisible on the map: one square = 10,000 ha, 588 logged vs 3.5 large old growth). Concept B on its own is dropped. Sketch of the squares: https://claude.ai/artifact/VEMwA8EADqLbKQcCzw8A3j
- **Bookends (proposed, not ruled):** open by dissolving the hero photo into the map at its location (needs the photo's provenance); end descending to STORY_END_CAMERA (Clayoquot Sound) with the live FOM comment-period chip opening those plans on the map.
- **Lessons from the renders:** a reader-driven camera outran tile loads (v1); a pre-render pipeline went stale and shipped a blank-reveal bug unnoticed (v2); a map with no captions or scale reads as a slideshow (v3).

### S1. Story honesty (SUPERSEDED by S1-lite; its content is S1-lite's scope)

- **Undated blocks out of the story (B).** Drop or rewrite the "Before the records began" chapter
  with Lee's copy approval. Run a status-code probe (`/probe`) on the undated blocks, recorded for
  a later option-2 revisit.
- **Area-true overlays (item 7).**
  - Rasterize finely without `all_touched`, block-average, alpha proportional to covered fraction
    (`build-year-overlays.py:483-495`).
  - Palette PNGs.
  - Guard: the 2025 frame's area-weighted total within ±15% of the source totals.
- **Three-tone reveal (C).**
  - `build-raster-tiles.py:135-143`; non-forest and 250+ never red.
  - New caption from Lee's option text.
- **Palette E** applied to the story overlays and the reveal tiles.
- Crossfade the forest base into the reveal (pages F-12).
- Relabel "75 years of logging" as what the record dates (pages F-04).
- Render-gate the year counter on its overlay.
- Guard the hero comparison per C5: the hero figure equals the derived total, and "larger than Nova
  Scotia" (5,528,400 ha, StatCan) appears only while that total exceeds it.
- Fix the "older than the Roman Empire" line (pages F-14; verify the source first).
- *(Historical, superseded by S0b and S1-lite:)* **One overlay build**, detached: about 35 min and 12 GB, using the slim ndjson; the raster
  rebuild takes about 27 min. Jen spec and Stage 3 review apply, since the work is visual.
- **Copy:** every new sentence is shown to Lee before merge. The story is his voice, and he docked
  the dolly for "trying too hard" (2026-08-21).

### M2. Trust, provenance, never-blank (Lane M; absorbs Phase E1)

- **Share card and meta** stop advertising "17 data layers", "species at risk", "Fish streams" and
  "real-time" (`src/app/layout.tsx`, `src/app/map/layout.tsx`). A test pins their nouns to
  `PUBLIC_LAYER_IDS`.
- **Discover panel** "1,131 hectares": derive it with a pinned, floored script, or remove it
  (`src/data/hotspots.ts:27,32,66`).
- **Popups (item 9):**
  - one label table shared with the legend;
  - species codes shown as common names;
  - treat "null" as missing;
  - area to one decimal;
  - auto anchor;
  - a bottom sheet below 768 px.
- **Phase E1, as critiqued in August**, with must-fixes 1 and 3 carried over:
  - required `LayerProvenance`, every vintage cited in-repo or stated as honestly unknown;
  - `DEFAULT_PRESET_ID = "overview"` (Ruling F);
  - persist only on divergence from the default.
  - Re-grep every anchor: the August plan predates Batch 1, global-state and the refresh.
- **Provenance chrome:** wordmark, data-vintage line, PMTiles attribution, "Sources & method".
- **Legend:** an old-growth caveat on Old Growth + Parks; layer descriptions visible, not hover-only.

### S2. Landing speed and pages (story half HELD pending X; the pages half ships as S2-pages)

- **Item 8 in full:**
  - remove the hero prefetch;
  - mount the story on a sentinel;
  - prefetch a window of frames instead of all 185;
  - drop the duplicate hillshade;
  - move the URL constants into a module with no dependencies, which takes MapLibre out of the
    hero bundle;
  - make beat 2 visible by default;
  - check the `visibility.ts:48-51` `isStyleLoaded()` trap.
- **Story reading on a phone:**
  - sticky story cards (pages F-11);
  - fit BC to each screen (F-16);
  - reduced motion with shorter scroll (F-22);
  - AA contrast on the chrome over the red (F-23);
  - the closing number set as a headline.
- **Assets:**
  - hero `srcset`;
  - `/raster` and `/images` cache headers (Netlify, unaffected by G);
  - Literata without the optical-size axis, not preloaded on /map.
- **Pages:**
  - remove "Sponsor on GitHub";
  - fix the /privacy date and add the footer;
  - a branded 404;
  - distinct names for the five "Explore" buttons;
  - the P3 copy batch.

### M3a / M3b. Phone chrome and status states (Lane M; 08-22 Batches 3 + 5)

- **M3a:**
  - the status lifecycle in PmtilesLayers, exactly as C4 defines it, with generation-bound async
    results;
  - the badge shown in expanded rows;
  - honest error copy (item 10; `MapLegend.tsx:232-236`, `LoadingBar.tsx`);
  - a fixed action cluster with Share;
  - a preset row with an edge fade that scrolls the active chip into view;
  - the bug-report button moved into the layer sheet;
  - a phone legend that collapses, with 44 px class rows;
  - a single panel slot, which the leaderboard and the calculator both need.
- **M3b:**
  - timeline chrome: 44 px controls and a "province-wide" readout;
  - search bar clear of the zoom buttons;
  - AA contrast on inactive chips;
  - one view-state parser that carries the year and class filters in shared links (R1-08);
  - geolocate capped at z12;
  - phone polish (map-visual F-22).
- Draw-to-select moves to K, because it is the calculator's input.

### K. Calculator redesign (its own phase)

- **K.1 Research (running now):**
  - `~/marvin/research/opencanopy-calculator-20261002/teardown.md`: every number, a verdict on
    each, and the BC WFS attributes actually available;
  - `research.md`: carbon pools, harvest fluxes, harvested wood products, payback, what money
    comparisons survive, existing tools, a per-FOM-proposal estimate.
- **K.1 has returned (2026-10-05).** Both reports were written into plan-mode sidecar files and
  move to the research dir once plan mode ends:
  - `glowing-dazzling-brooks-agent-a1009642cf1a8407b.md` becomes `teardown.md`;
  - `glowing-dazzling-brooks-agent-a0e007735c541208d.md` becomes `research.md`.
- **Load-bearing findings for K.3:**
  - Every constant is frozen from 2026-03-21 and unsourced.
  - The species keys never match VRI codes (FD and PL versus FDC/FDI/PLI), so 67% of the area
    falls to a default.
  - The proxy fetches all 190 VRI attributes and keeps 9, discarding per-polygon stem, branch,
    foliage and bark biomass in t/ha.
  - The proxy converts only two corners of the drawn box, so it **silently drops 4-14% of
    polygons**.
  - Harvest labelling misreads post-harvest regrowth age.
  - The retry design (~93 s) exceeds the edge function's ~36 s limit.
  - No test could fail on a wrong formula.
- **Research direction:**
  - live-tree carbon read straight from VRI biomass (carbon fraction 0.5, IPCC range 0.47-0.55;
    roots per Li et al. 2003), labelled an estimate with its range, per C5;
  - harvest fluxes per BC's 2025 timber-supply carbon guidance;
  - 100-year net emissions and recovery from a pinned libcbm (CBM-CFS3) lookup;
  - no stock-times-price, ever;
  - leakage stated;
  - per-FOM-proposal estimates are feasible.
  - Open: carbon in the FOM alert itself would need a charter amendment. The recommendation keeps
    it on a linked page.
- **The corner-clip bug is a live data loss with a one-line fix.** It goes in K.4's first batch.
  It is not pulled earlier, because Lee ruled the calculator waits for its redesign.
- **K.2 `/grill` with Lee:**
  - who it is for;
  - what question it answers;
  - which outputs survive the "SUPPORTED" table;
  - whether it attaches to FOM proposals (charter phase 6).
- **K.3 Design plan:**
  - architecture, a sourced constants module with citations, uncertainty ranges displayed;
  - Jen visual spec;
  - critic gate.
  - Absorbs:
    - the unknown-age proxy fix (`netlify/edge-functions/wfs-proxy.ts`; makes the 09-02 ruling
      true);
    - PDF fixes (`pdf-generator.ts:287`, refresh R3-04);
    - a feature-count size guard;
    - no caching of 5xx responses;
    - watershed groups as a static layer;
    - `@turf/intersect` lazy-loaded;
    - draw-to-select on touch;
    - two-significant-figure equivalences.
- **K.4 Relay(s)** after M3a lands, because of the shared panel slot.
- The edge function changes go through Razor at high effort as the security surface.
- The dollar bar is removed or replaced only here, per Lee.

### B′. Phase B rebase plus attribution (Wave 4)

- Rebase `relay/phase-b-harvest` onto post-M3 main (handoff 2026-08-27 estimates 2-3 hours, now
  more).
- **Prerequisite (H):** build the company list from tenure data, ranked by area (probe first), with
  an unattributed row.
- Stop the tile build writing the string "null" (`build-tiles.ts:187`).
- Turn class filters into attribute filters (usability R6).
- A delta plan against the August B plan, re-critiqued.

### C′. Phase C re-plan (Wave 5)

- A delta plan over August's `phase-c-color-respine.md`, written only after M1b's re-measure.
- Takes palette E on the /map rasters.
- Drops the 500 ha C3 cap, or proposes an amendment; it contradicts the 2026-09-02 ruling.
- Keeps T1 (the gold lattice), C1, H1, C2, H2, CP1, K1 and S1.
- Re-critiqued.

### D′ / E′ / T (Wave 6)

- **D′:** August's FOM layer plan, delta-planned. Prerequisite: the WFS client race and the
  GeoJSON path (refresh R2-02, usability R7).
- **E′:** E2–E5 from the August plan; E1 already shipped in M2.
- **T (tiles, with G held):**
  - per-layer archives, which is the same rebuild as the z10+ holes;
  - forest-age vectors from z10;
  - non-public layers out;
  - renderer keyed by tile URL;
  - the empty-tile manifest deployed;
  - the E&N mask and the big-tree subset from Batch 4.
- Order follows Lee's C → D → E. T's **build** can run alongside D, but its **release** waits its
  turn under C1 and C2: a versioned data path, the old version retained, and the reader switched
  in a deploy of its own with old-link fixtures.

## Dependency graph (program level)

Two kinds of edge:
- **Build:** the work can start.
- **Release:** the push to main may happen. A release also waits for the previous release's guards
  to be green (C2).

| ID | Build after | Release after (in addition to C2) |
|---|---|---|
| P0 | — | — |
| P0b | P0 | P0 |
| SO1 (`ssc-ops` repo) | S0a | its own repo's release; gates C6 completion, not any OpenCanopy release |
| S0a | P0b | P0b |
| S0b | S0a | S0a |
| M1a (batch 0: probe only) | P0b | S0a |
| M1a (rest) | M1a batch 0 released | M1a batch 0 |
| S1-lite | S0b | S0b |
| X (spike, never released) | S0b (consumes S1-lite products when ready) | — |
| M1b | M1a | M1a |
| S2-pages | S0a | M2 (owns `layout.tsx`) |
| M2 | M1b | M1b, S1-lite |
| S1′ | X verdict | S1-lite |
| S2 story half (fallback) | X declined or decision timeout | S1-lite |
| M3a | M2 | M2 |
| M3b | M3a | M3a |
| K.2 → K.3 | K.1 → K.2 | — |
| K.4 | K.3, M3a released | M3b (independent of B′; the calculator is not an area-contract consumer) |
| **B′** | M3b | M3b **and S1-lite** (Ruling A: story honesty ships before Phase B) |
| C′ | B′, M1b re-measure | B′ |
| D′ | C′ | C′ |
| T (build may overlap D′) | M1b | S2-pages, D′ (C1 versioned path) |
| E′ | D′ | D′, T |

**Release coordinator:** this session, the program orchestrator. It:
- records each release's SHA, deploy id, data version and guard result;
- tells both lanes when a release is green;
- declares the halt when one is red.

Lee performs every push and rollback (C2). A session never rolls back production on its own.

## Pre-mortem: how this program fails, and the guard

1. **A lane forks from stale history again**, as the dolly branch did on 09-01. Guard: the 0.1
   gate checks `rev-parse` against origin/main before any spawn. Each lane rebases on main before
   relay close.
2. **The two lanes collide on main.** Guards: the C2 conflict matrix and its release edges in the
   graph. Whichever lane merges second rebases and re-runs its tests, and releases are
   serialized.
3. **The bugs are live-only, so unit tests pass and production still breaks.** This is exactly how
   08-22 P1 shipped "fixed". Guards:
   - every M-lane relay adds a production Playwright guard, run right after deploy;
   - a guard counts only after it is shown failing on current main;
   - each new test is mutation-verified.
4. **The overlay build runs three times** (undated blocks, reveal, palette). Guard: B, C and E are
   ruled before S1-lite starts. There are exactly two builds: S0b (dated-only, coarse) and S1-lite
   (area-true, final palette and ending).
5. **Phase B's rebase becomes a rewrite.** It waits for M3b; its delta plan names every API that
   moved, and the critic checks it.
6. **August's C/D/E plans are trusted as current.** Guard: each is delta-planned and re-critiqued.
   The Phase E critic's warning, "every line number predates Phase B", now applies to every phase.
7. **A relay quietly runs a non-Opus Ted.** Guard: the worker-tier precondition above.
8. **Deploy volume tires Lee out,** with roughly 22 pushes: P0, P0b, S0a, S0b, M1a batch 0, M1a,
   M1b, S1-lite, M2, S2-pages, S1′, M3a, M3b, K.4, B′, C′ (two), D′, T (data and reader), and E′
   (about three). The standing constraint (2026-07-17)
   stays in force: "Any relay that changes what the map looks like ships with a live-QA item owed
   ... Only Lee can eyeball the live site."
   - The live guards **supplement** Lee's QA; they do not replace it.
   - To keep the load bearable, each visual relay's QA item is a short, specific checklist of
     what to look at, written by the relay.
   - Its premise ("the sandbox cannot render the map") was disproved by the 2026-10 audit, whose
     headless Chromium rendered production. Whether to amend it is **Lee's decision**, put to him
     with this plan. **Amended by Lee, 2026-10-07 (grill):** Lee's phone check covers visual
     relays only (story, film, colours, phone layout, new layers; about 13 of 22); the live guards
     gate the rest; an owed check never blocks a push and the owed list has no cap. See
     `.claude/DECISIONS.md` and `.claude/grills/2026-10-07-remediation-approval-and-phone-qa.md`.
10. **The animation dramatizes.** A film is the format most tempted to outrun its data, and the
    June dolly was docked for "trying too hard". Guards:
    - quiet-documentary register (X3);
    - every frame derives in code from the honest data products, with nothing pre-rendered or
      hand-painted;
    - every number traces to a floored derivation;
    - Jen reviews against CHARTER non-goal (3), "It does not dramatize: a visual may not outrun
      or overstate the data", and non-goal (0) for advocacy;
    - Lee approves the copy and picks the concept;
    - the spike is throwaway and nothing reaches production without S1′'s critiqued plan.
11. **The spike turns into the product.** Its code lives on a spike branch and is never merged.
    S1′ rebuilds on main from a plan, reusing only the data products and the decisions.
9. **The calculator redesign stalls on research.** It runs in parallel and blocks nothing until
   K.4. The dollar bar stays live by Lee's choice, and that cost is recorded, not hidden.

## Assumptions (named, with what breaks if wrong)

- **Netlify deploys on push to main**, and instant rollback is available. If not, the per-relay
  cadence needs a manual deploy step.
- **Playwright Chromium against production is stable enough to run as a post-deploy check.** The
  audit lanes proved it works, with the capture gotchas recorded in `map_visual_audit_2026_08`.
  Flakes get infrastructure retries only (C3). The audit's 75 s first-tile wait was for throttled
  measurement and never applies to acceptance.
- **The 2,000 ha cap and the sourced-numbers rulings stay in force.** Every story number in S1 is
  checked against them.
- **The undated-block status-code probe is cheap.** It is a WFS query. If it is not, it is parked;
  option 3 needs no probe.

## Inversion

What would make this program wrong to run at all? If the audit's P0s were false positives. Each was
reproduced from scratch by an independent skeptic, and I re-read `CanopyMap.tsx:68`,
`DataLayer.tsx:420-427` and `chapters.ts:131-190` myself. The cheapest wrong move is the reverse:
starting Phase B first, which ships a leaderboard through share links that do not land, onto code
about to change.

## Verification (program level)

Per relay:
- the relay's own verification;
- the full vitest suite green;
- `npm run build`;
- Razor PASS;
- Jen PASS on visual relays;
- after deploy, `npm run audit:live` plus the new live guards against opencanopy.ca, green.

At program milestones:
- **After M1b:** re-run the audit's like-for-like grid and the performance phone profile, and
  record the deltas in ROADMAP:
  - first vector tile on Slow 4G, from 37-42 s toward about 20 s;
  - desktop `load` fires with no input;
  - cold deep links land 12/12.
- **After S0 and S1-lite:** the C5 story truth checks pass on the live overlays, and no undated
  block paints at 1950.
- **After S1′, or after S2 on the fallback path:** landing bytes before interaction under 2 MB
  (S1′) or under 5 MB (scroll fallback), against 17.6 MB today. The first data frame is visible
  within 10 s on Slow 4G.
- **Program close:** a re-audit with the same four lanes. Every P0/P1 in the synthesis is either
  fixed with evidence or listed with the ruling that parks it.

## Critical files

- **Program:**
  - `research/ui-perf-audit-2026-10-02/` (new);
  - `.claude/DECISIONS.md` (via the writer);
  - `ROADMAP.md`;
  - `.claude/handoff.md` (via the writer);
  - `.claude/plans/2026-10-*.md` (one per relay, plus critics).
- **Hot code:**
  - `src/components/map/CanopyMap.tsx`, `DataLayer.tsx`, `MapLegend.tsx`, `MapPopup.tsx`;
  - `src/hooks/useMapState.ts`;
  - `src/app/map/page.tsx`;
  - `src/lib/layers/registry.ts`;
  - `src/test/mocks/maplibre.ts`;
  - `src/data/chapters.ts`;
  - `src/components/story/*`, `src/lib/story/*`;
  - `scripts/build-year-overlays.py`, `scripts/build-raster-tiles.py`;
  - `netlify/edge-functions/wfs-proxy.ts`;
  - `src/lib/carbon/*`.
- **Reuse:**
  - `src/lib/react/merge-refs.ts`;
  - the SatelliteLayers `visibleRef` pattern;
  - `scripts/mutation-battery.mjs`;
  - `playwright.live.config.ts`;
  - the audit's `map-visual/scripts/grid.mjs` and `post.py`;
  - the August Phase B, C, D and E plans and their critics.

## Finding traceability

Every child plan opens with a table mapping each synthesis finding it takes (lane id, e.g. F-17,
SPD-03, U-07, pages F-05) to an acceptance criterion. Program close re-runs the four-lane audit
and checks two things:
- every P0, P1 and P2 in the synthesis is either covered by some child plan's table, or named
  with the ruling or Parking Lot line that defers it;
- P3s may be parked in bulk with one Parking Lot line.

## Revision log

**2026-10-05, astra critic r1: FAIL** (`glowing-dazzling-brooks-critic.md`). All five must-fixes
accepted after steelmanning; none rejected.
1. **Honest story now, not after the spike.**
   - S0 now drops the undated 1950 chapter, stops the red reveal, and captions the coarse cells.
   - S1-lite swaps in the area-true frames as soon as they exist, whatever concept is picked.
   - A 14-day bound on Lee's pick; Phase 0, the waves, the graph and the milestones reconciled.
   The critic was right: the plan had made honest imagery wait on a creative experiment.
2. **Release identity, rollback, serialized deploys** (C1, C2). A check confirmed the story
   overlays and `/raster` ship in `public/`, so they are covered by Netlify rollback, while the R2
   PMTiles are not. *(Historical: r3 extended versioning to Netlify assets; C1 is current.)*
3. **Outcome-observing guards with negative controls** (C3), plus the status state machine and an
   expiring FOM count (C4).
4. **Carbon "floor" language removed** (C5), shared story truth checks for every path, and the
   dollar exception's scope made explicit: panel and PDF unchanged until K.4, then removed from
   both.
5. **Phase 0 completeness:**
   - the X1-X3 rulings added and the file table written with its waiver;
   - evidence brought into the repo with a hash index;
   - non-goal references quoted;
   - the privacy contract (C6), which surfaced a real leak: `tracker.js:54` sends the full URL
     hash, including `lat`/`lng`, to analytics; fixed in S0;
   - dependency and budget contracts (C7).

**2026-10-05, astra critic r2: FAIL** (`-critic-r2.md`). All six must-fixes accepted:
1. **Falsifiable verification.**
   - The probe ships alone first (M1a batch 0), so negative controls fail on behaviour, not on
     missing instrumentation.
   - An independent pixel oracle.
   - A build-identity meta tag, with guards waiting for the candidate SHA.
   - Retries never extend budgets.
2. **Location data.**
   - All four URL-bearing tracker fields sanitized.
   - A payload test with sentinel coordinates.
   - The probe's data documented as in-page only.
   - Disposition of existing analytics records put to Lee; no session deletes data.
3. **Graph.**
   - S1-lite is its own relay, owned outside the spike and scheduled right after S0; X consumes its
     products.
   - B′'s release waits on S1-lite (Ruling A).
   - A spike timeout with an outcome; build and release edges separated; a named release
     coordinator.
4. **Civic claims.**
   - The hero guard asserts the derived total, with the comparison conditional on it.
   - Unique-area semantics defined before reconciliation.
   - FOM freshness from server-stamped `fetchedAt`, re-checked on resume, with a completeness
     probe and fixtures; numberless otherwise.
5. **Contracts.**
   - Lee's 2026-07-17 live-QA constraint, as amended 2026-10-07: phone checks on visual relays
     only, live guards gate the rest, owed checks never block.
   - One revisitable status state machine with generation-bound results.
   - URL compatibility fixtures.
   - Content-versioned Netlify assets with an open-page upgrade-and-rollback test.
6. **Ambiguity.**
   - Phase 0's 16 files enumerated, with the waiver.
   - One evidence destination.
   - The "only shared file" claims removed.
   - "Less than 0.1%" described as an upper bound with its derivation.

**2026-10-05, astra critic r3: FAIL** (`-critic-r3.md`). All six must-fixes accepted:
1. **S0 rebuilds the overlays dated-only.** It had wrongly assumed no rebuild was needed. A truth
   check now proves undated-only polygons are unpainted.
2. **Release states.**
   - Instrumentation releases are distinguished from behaviour releases, so expected-red controls
     are not release failures.
   - Known-good target and recovery options (rollback, or one authorized corrective release).
   - A durable release ledger outside the worktrees.
   - A per-guard catalogue: control, oracle, baseline SHA, blocking.
   - The 75 s wait reconciled as measurement only.
3. **Asset retention** of the previous two versions, three tested tab transitions, and graceful
   degradation for the one window that cannot be closed.
4. **`area-contract v1`** extends the existing logged-hectares ruling, with consumers named and
   versioned.
5. **The FOM count expires while visible,** at 15 min or midnight Pacific.
6. **Remaining specification concerns:**
   - DECISIONS amendments for the reveal and logged-hectares entries;
   - the status transition table;
   - privacy claims scoped to tested sinks, other sinks named, and analytics disposition dated with
     this approval;
   - the Phase 0 count corrected;
   - stale text relabelled.

**2026-10-05, astra critic r4: FAIL** (`-critic-r4.md`). All five must-fixes accepted:
1. **Negative controls by relay.** S0's are local, against pre-fix main. M1a's live controls use
   the batch-0 deploy. Pixel references are bootstrapped with the popstate workaround.
2. **Privacy.**
   - `no-cache` on `tracker.js` bounds the old-client window.
   - Ingestion-side sanitization goes in as a cross-repo patch to `ssc-ops`, with Lee's approval.
   - Access scope and retention are reported, and disposition stays with Lee.
3. **Area contract.** Consumer migration table with owners and release edges; the calculator
   frozen as an explicit exception until K.4; twin equivalence through shared fixtures.
4. **S0 split.** S0a (copy and privacy) and S0b (dated-only rebuild as one artifact group), each
   with an honest waiver. Geographic inclusion and exclusion samples.
5. **Release lease and takeover.**
   - An atomic release lease with stale-lease reconciliation against Netlify.
   - Coordinator takeover that never promotes a pending candidate.
   - A heavy-build host lock.

Also:
- the FOM endpoint fixed-upstream boundary;
- a TRACEABILITY index before Wave 1;
- the stale Wave-1 count fixed;
- the primary checkout's uncommitted work **preserved, not discarded**. That includes a prior
  2026-09-20 program plan found untracked there, which this program now supersedes with full
  traceability.

**2026-10-05, astra critic r5: FAIL** (`-critic-r5.md`). All five must-fixes accepted:
1. **Privacy.** The false cache bound is removed. Containment is claimed only after
   ingestion-side sanitization is deployed and verified through storage. The shared receiver's
   tenant scope goes into that repo's plan. S0a's 8 files are enumerated.
2. **Overlay acceptance.** S0b's checks are an explicitly interim subset, and ±15% accuracy stays
   with S1-lite. The coarse-picture exception is named and bounded.
3. **Migration.** The calculator is removed from the area-contract consumers: it uses VRI age
   classes, not FTEN. Every screen migrates in one release, and a mixed-version test proves it. K.4
   is independent of B′. "S0" is resolved to S0a or S0b throughout the graph.
4. **Operational foundations.** P0b release tooling is assigned before the first coordinated
   release; a malformed ledger halts scheduling; build-lock liveness is by PID, with a memory check
   and kill tests.
5. **Precision.** Status precedence and out-of-range fixtures; a supported tab window; the push
   count recounted to about 22.

**2026-10-05, astra critic r6: FAIL** (`-critic-r6.md`). All five must-fixes accepted:
1. **Privacy.**
   - The receiver's stored fields, including receiver-added IP, are inventoried before the privacy
     page changes, and the page states what is stored today.
   - SO1 (the `ssc-ops` patch) is a program node with an owner and a verification artifact, and C6
     stays open until that artifact exists.
   - Existing IP records go into Lee's disposition decision.
2. **Bootstrap.** The `oc-build` identity moves to P0b. P0 and P0b verify identity through the
   Netlify CLI `commit_ref`.
3. **Area.** The contract covers aggregates only, with raw per-block area distinguished from it.
   Every aggregate consumer and the cross-route interval are named. A semantic negative control
   fails a reverted area function under an unchanged label.
4. **Recovery.**
   - Fencing tokens, so a resumed former owner cannot act.
   - Takeover reconciles in-flight Netlify deploys.
   - Unknown state halts scheduling.
5. **Interim honesty.** A 21-day deadline, after which the coarse overlays come off the story. The
   duplicated S0 scope inside section X is removed; the S0 section is the only binding scope.

**2026-10-05, astra critic r7: FAIL** (`-critic-r7.md`). The four gating FAILs are fixed:
1. **One story fallback:** a reader-enforced sunset date, so no human push is needed.
2. **Aggregate-only consumer inventory,** with Discover named and raw popup values excluded by type.
3. **The timeline oracle** has positive and negative fire witnesses across year steps, and the
   mutation battery proves hidden and frozen layers fail.
4. **A push-boundary check** Lee runs before each push, with its cooperative enforcement stated
   plainly.

The r7 CONCERNs carry into the named child plans as acceptance conditions:
- P0b: atomic reclaim, token persistence, PID-reuse fixtures, and split sizing;
- M3a: error-to-recovery status transitions;
- SO1: an overdue state;
- C7: heavy-build classification.

**2026-10-05, astra critic r8: FAIL on X2 only** (`-critic-r8.md`). Every core dimension is PASS or
CONCERN. Fixed:
1. **The `email_click` leak.**
   - Recipient address only, so the crash-report mailto bodies carrying the page URL never reach
     analytics.
   - The real link is clicked in the test, with decoded payload checks and an old-handler negative
     control.
   - SO1 and the historical discovery cover that field.
2. **`check-push`** now requires reconciled ledger state and a green predecessor or a bound
   corrective authorization, with nonzero NO-GO exits.
3. **The sunset is a runtime boundary,** with the deadline never renewed and the counters'
   fallback behaviour defined.
4. **Stale counts and scope** consolidated.

The remaining r8 CONCERNs become acceptance conditions of the named child plans:
- S1-lite: missing-JSON and missing-raster degradation after rollback;
- M3a: error-to-recovery transitions;
- P0b: atomic reclaim, crash-safe tokens, pre-launch heavy-build classification, process-tree
  ownership.

**2026-10-07, APPROVED by Lee (grill, no round 9)** (`.claude/grills/2026-10-07-remediation-approval-and-phone-qa.md`).
- The r8 X2 fix stands as folded; S0a's child critic reviews it in detail.
- The live `email_click` leak ships as a one-line hotfix ahead of the program; S0a keeps the
  decoded-payload tests and the historical-record discovery.
- The 2026-07-17 QA constraint is amended: Lee checks visual relays only, owed checks never block.
- **Child-plan critic contract:** at most three rounds per child plan; round one runs at xhigh
  effort and is briefed to report every finding, not stop at the first blocker;
  a plan still failing after round three goes to Lee in plain words.
  - The effort is a dispatch flag, not a default: `codex-agent.mjs` runs the plan critic at
    astra's own default effort (low) unless told otherwise, and all eight rounds of this plan ran
    that way. Child-plan critics dispatch with `--effort xhigh` (Lee, 2026-10-07: "max actually has
    diminishing returns"). This costs more of the Codex window per run; the cap of three bounds it.
