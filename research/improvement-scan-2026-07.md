# OpenCanopy — Improvement Scan (July 2026)

Scanned 2026-07-18 against `main` @ `d647d70` (live on opencanopy.ca). Inputs: repo
ROADMAP/ARCHITECTURE, the 2026-07-15 five-lens map audit, the 2026-07-10 production
audit trail, the civic impact strategy, cross-project patterns, and current state.
This scan deliberately does not re-derive the existing Phase A–E `/map` program
(`~/marvin/research/opencanopy-map-layering-comms-20260717/`) — it ranks around it
and surfaces what that program doesn't cover.

---

## 1. Current state assessment

**Strong.** The engineering culture here is the project's moat: an 18-layer registry
where components interpret config and never special-case ids; 803 tests plus a
7-audit data-fidelity suite; invariants enforced by tests (paint, color SSOT,
opacity floors, proxy mirror drift); CI lint/audit gates now blocking. The last six
weeks fixed the two worst credibility risks — the false "0 tonnes CO₂" calculator
(now WFS-fetch + turf-clip, status-driven, never a confident zero) and the lying
timeline scrubber (render-gated playhead). Accessibility went from grade-D FAIL to
a genuinely strong posture across three shipped relays. The honest-states pattern
(never claim data where there is none, never claim zero where there is no signal)
is now a house style — and it is exactly the right style for a tool whose strategic
position is "neutral evidence layer."

**Weak.** Five things, in order of how much they cost:

1. **The live-QA bottleneck.** Every relay since June ends "AWAITING Lee live QA"
   because the sandbox is keyless (no MapTiler key in worktrees, R2 serves no CORS
   to localhost). Three deployed relays are still owed browser QA
   (`state/opencanopy-a11y-p2-live-qa-2026-07-17.md`). This is the single largest
   drag on velocity and it is infrastructure, not code.
2. **Data vintage is invisible and unmanaged.** The base tileset builds from
   `VEG_COMP_LYR_R1_POLY_2024.gdb` (`scripts/pipeline/download.sh:20`). VRI is
   republished annually (verify the 2025 comp layer is out before acting). No UI
   surface states the vintage; there is no refresh cadence or runbook-triggered
   rebuild. A "neutral evidence layer" whose evidence is silently two vintages old
   loses to iMapBC in any contested submission.
3. **Embedding is blocked by policy.** `netlify.toml` ships
   `frame-ancestors 'none'` + `X-Frame-Options: DENY` on `/*` — no site can embed
   any OpenCanopy view. The civic strategy names embeds as what journalists need;
   the June research called it a top-5 item. Deep links work; embeds are
   structurally impossible today.
4. **Known data-integrity defects sit on the flagship civic layers.**
   `tap-deferrals` (the old-growth deferral layer — the strategy's #1 "10x" item
   already exists in the registry) silently drops old-growth polygons at z10+ to
   `--drop-densest`; protanopia collapses the entire red/green encoding; one red
   carries three meanings. All documented in the 07-15 audit; the palette fixes are
   Phase C, the tile rebuild is Phase 5 — neither scheduled.
5. **Ops floor is thin.** R2 tiles ship no cache headers (`max-age=0` observed
   live — every visit refetches); `audit:live` exists but nothing schedules it; no
   uptime monitoring; CSP still report-only with no `report-to` endpoint; ~70
   console 404s per load await the already-wired tile manifest.

---

## 2. Technical improvements (ranked by impact ÷ effort)

1. **Break the live-QA bottleneck** — provision a domain-locked MapTiler key for CI
   plus a CI-origin CORS rule on the R2 bucket, then point the existing Playwright
   screenshot/e2e suites at real renders in CI. Impact: removes the "awaiting Lee"
   tail from every future relay and retires a whole class of skipped Stage-2.8
   behavioral evals. Effort: ~1–2 days, mostly account config. Highest-leverage
   item in this document.
2. **R2 cache headers** — set `Cache-Control` metadata on tile objects (rclone
   supports a metadata sweep) or front the bucket with a custom domain that adds
   headers. Tiles are immutable within a versioned dir; `max-age=604800` is safe.
   Every repeat visitor currently re-downloads the province. Hours, not days.
3. **Tile manifest generation** — the `ocbin://` fail-open suppressor shipped in
   story Phase 1; it just needs `rclone lsf → scripts/generate-tile-manifest.py`
   run and deployed (Lee-terminal). Kills the 70-error console noise that makes
   every live forensics pass harder. Minutes.
4. **MapLibre `global-state` timeline batch** — already designed (handoff item 1):
   year as a paint expression instead of per-year `setFilter`. Cheap, native,
   perfects Phase A. Do it next as planned.
5. **Scheduled `audit:live` + monitoring** — a GitHub Actions cron running
   `e2e/monitoring/live-health.spec.ts` daily, failure → notify. Marvin's monitor
   production loop is the registration point (cross-project pattern #4). Half a day.
6. **CSP enforce flip** — the 07-15 forensics found zero missing origins. Add a
   `report-to` endpoint (or do the planned cold-cache/incognito+mobile console
   sweep), then flip. Small, closes a long-open deferral.
7. **z10+ `--drop-densest` rebuild (Phase 5)** — reclassify this from "visual
   artifact backlog" to **data integrity**: it under-shows old growth on
   `tap-deferrals`, the layer FN referrals staff would trust most. Days (tippecanoe
   rebuild + verification), but it should be scheduled, not deferred indefinitely.
8. **Doc drift guard** — one vitest that diffs the ARCHITECTURE.md layer table
   against `registry.ts` (cross-project pattern #6, Monitor's method). The proxy
   mirror already has this; the doc doesn't. Small.

**Explicitly fine as-is:** the 1 MB maplibre chunk is the WebGL floor and is
deduped/dynamically imported correctly (June research confirmed); MLT stays a
watch-list item for the next tile rebuild, not a migration; the GFW decode-shader
endgame correctly stays behind the Phase-3 gate.

---

## 3. Feature opportunities (ranked by user value)

1. **Area report card** — *the infrastructure is now ready.* This is the finding
   the question deserves a direct answer on: the CO₂ redesign built the exact spine
   the report card needs — DrawTool polygon → `/api/wfs` VRI fetch →
   `@turf/intersect` clip → per-feature class/age aggregation (`src/lib/carbon/`),
   with honest states, a 500 km² cap, and a 20 s timeout, plus a working
   `pdf-generator.ts`. What remains: (a) surface the class/age breakdown as
   % old growth / hectares-by-class (already computed for carbon, just not
   displayed); (b) add a second clipped fetch against FTEN cutblocks for "% logged
   since year X"; (c) a printable one-pager template with vintage + citation.
   Roughly one relay. Constraint to state honestly: the 500 km² cap means
   referral-scale areas, not whole watersheds — the Option C class-raster follow-up
   is the later path to watershed scale. This converts viewer → evidence generator
   for the strategy's audiences 1, 2, and 5.
2. **Phase D — FOM proposed-logging layer** (probe done, verdict GO, ~0.5–1 day,
   no tile build). Daily-fresh, 47k blocks, portal deep-links. No competitor shows
   *proposed* logging with context — Seeing Red and AFA show the past; this shows
   the decision still open to influence. Highest strategic value per day of work
   on the feature list.
3. **"Investigate this" bridge to opencave.ca** — popup → pre-filled concern via
   URL params. One-day relay per side, zero coupling, and it's the artifact that
   makes the outreach emails land (civic strategy Part 4.3).
4. **Embed mode** — an `/embed` route (chromeless, params locked) with a scoped
   `netlify.toml` header block relaxing `frame-ancestors` for that path only; the
   rest of the site keeps DENY. The share-URL state machinery is the whole
   integration; this is a thin shell over it. ~1–2 days including QA.
5. **Deferral-layer prominence + integrity** — `tap-deferrals` exists but is one
   toggle among 18. Give the live policy fight a preset chip ("Deferrals vs
   logging") and fix its z10+ dropout (item 2.7). Mostly config; the rebuild is
   the real cost.
6. **Data vintage + citation surface** — "Data: VRI 2024 · FTEN live · retrieved
   {date}" badge plus a "Copy citation" action (URL + layers + vintage + access
   date). Cheap, and it is *the* feature for council submissions and journalism —
   nobody cites a map they can't date.
7. **Per-layer opacity control** — the one real UX gap vs Global Forest Watch
   (June research, GFW parity). Medium effort; pairs with the deferred
   preset-overrides batch and must respect the DataLayer memo's
   reference-stability note (Razor NOTE, 07-11).
8. **Mobile field use** — honest read: it's already decent. GeolocateControl
   ships, the mobile sheet is keyboard/SR-clean post-P2, pinch-zoom is fixed on
   text pages. The real field gap is offline tiles, which is a PWA/service-worker
   program (none exists today) — defer it; cell coverage in contested valleys is a
   real constraint but the audiences in the strategy work from offices and council
   chambers first.

---

## 4. Strategic recommendations

**The positioning is won by honesty features, not layer count.** Seeing Red and
AFA's maps are advocacy artifacts frozen at their 2024 updates; iMapBC is
authoritative but expert-only; GFW is global and blind to BC tenure/deferral
politics. OpenCanopy's claim — "the government's own inventory, current,
linkable, readable by a band office" — is supported by exactly four things:
visible data vintage (3.6), the report card (3.1), the deferral/FOM layers
(3.2, 3.5), and the Phase C honesty/CVD re-spine. Fund those before anything
decorative.

**Treat data freshness as a strategic commitment.** Adopt an annual VRI refresh
cadence (verify the 2025 comp layer's availability first), write the rebuild
runbook (the STRtree work already cut the raster build to ~27 min; the tippecanoe
pipeline is scripted), and display the vintage. The neutral-evidence position is
rented, not owned — it expires with the data. WFS layers (cutblocks, fire, FOM)
are already live-fetch and stay fresh for free.

**Sequence for adoption** (aligning with the civic strategy's month plan): report
card → FOM layer → "Investigate this" bridge → *then* the Narwhal email and the
Tla'amin/Eldred usage story. Each artifact makes the next conversation concrete.
Embeds can follow the first journalist conversation rather than precede it.

**Don't build:** org accounts, self-hosted instances, offline PWA, MLT migration,
or any second map framework. The strategy's no-support-desk constraint is
load-bearing; deep links remain the integration API.

**One process note:** the recurring "AWAITING Lee live QA" pattern is the pipeline
telling you its verification environment is under-provisioned (item 2.1). Fixing
it is worth more than any single feature on this list because it compounds across
every future relay.

---

## 5. Quick wins (< 1 day each)

| Win | Effort | Ref |
|---|---|---|
| Generate + deploy the binary tile manifest (`rclone lsf` → script) — kills ~70 console 404s | minutes (Lee-terminal) | ROADMAP known-issue 2 |
| R2 `Cache-Control` metadata sweep on versioned tile dirs | hours | 07-15 forensics |
| "Data as of" badge + Copy-citation button | hours | this scan §3.6 |
| `global-state` timeline paint-expression batch | ~1 batch | 07-18 handoff §NEXT.1 |
| Scheduled `audit:live` cron + monitor registration | half day | prod-audit P3 |
| CSP `report-to` endpoint (or console sweep) → enforce flip | half day | 07-15 forensics |
| ARCHITECTURE.md ↔ registry drift-guard test | hours | cross-project pattern #6 |
| Deep-link lat validation before `flyTo` (uncaught throw, adversarial F6) | hours | 07-15 audit T3 |

---

## Sources

**Repo (read 2026-07-18):**
- `/home/leesalo/Projects/opencanopy/ROADMAP.md`, `ARCHITECTURE.md`, `package.json`, `netlify.toml`
- `/home/leesalo/Projects/opencanopy/scripts/pipeline/download.sh` (VRI 2024 pin, line 20)
- `/home/leesalo/Projects/opencanopy/src/lib/layers/registry.ts` (18 layers incl. `tap-deferrals`), `src/lib/carbon/`, `src/lib/export/pdf-generator.ts`, `src/components/map/CanopyMap.tsx` (GeolocateControl), `.github/workflows/ci.yml` (no cron)
- `/home/leesalo/Projects/opencanopy/.refresh/research-2026-06-05.md` (GFW parity, MLT, embeds, OG — OG image since shipped)

**State & audits:**
- `~/marvin/state/opencanopy-handoff-2026-07-18.md` (Phase A shipped; Phase A–E program; deferred list)
- `~/marvin/state/opencanopy-map-audit-2026-07-15/INDEX.md` (protanopia, red-overload, drop-densest, cache headers, CSP readiness, F6)
- `~/marvin/state/current.md` (deploy state, owed QA); `~/marvin/state/opencanopy-a11y-p2-live-qa-2026-07-17.md` (referenced)
- Production audit trail: `~/marvin/state/production-audits/opencanopy-2026-07-10.md` (P3 ops WARNs, per ROADMAP frontmatter)

**Strategy:**
- `~/marvin/content/reference/the-republic/civic-impact-strategy-2026-07.md` (audiences, report card, embeds, bridge, month plan)
- `~/marvin/.../research/meta-audit-2026-07/cross-project-patterns.md` (drift guards #6, monitoring #4)

**Model knowledge, flagged — verify before acting:** VRI annual republication cadence and 2025 comp-layer availability; rclone metadata support for R2 cache headers.
