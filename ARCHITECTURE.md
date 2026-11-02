# OpenCanopy — Architecture

BC forest map: faithful government data rendered as PMTiles and live WFS,
served as a public conservation reference. This document is the written
design — the oracle future audits reconcile the code against. If code and
this doc disagree, one of them is wrong on purpose: figure out which, then
fix that one.

## Scope rule (the load-bearing one)

The base tileset is **government-truthful only**. Synthesis layers (risk
proxies, fire-age reconciliation, disturbance models) are separate layers,
clearly labelled, and are not part of the open-source base. (Known tension:
`logging-risk` is a derived risk proxy living in the main registry — an open
decision, tracked in ROADMAP, not an endorsement.)

## The layer registry pattern

**A layer is one config object** (`src/lib/layers/registry.ts`, ~18 entries:
17 data layers + satellite). A `LayerDefinition` declares everything the
renderer needs:

- `source` — WFS endpoint (proxied), raster URL, with attribution
- `tileSource?` — PMTiles archive + source-layer (`opencanopy-v10.pmtiles`,
  max zoom 12, on R2) and optional `minZoom` crash-gate
- `rasterOverview?` / `rasterOverviewClassUrl?` — pre-rendered PNG tiles
  (z4–z9) for layers too dense for vector rendering at province scale
- `style` — MapLibre paint, `zoomRange`, legend items, interactivity

Components never special-case a layer id; they interpret the config.
Only 7 of 18 registry entries are publicly available at runtime
(`PUBLIC_LAYER_IDS` → `LAYER_REGISTRY_AVAILABLE`); the remaining 11 are
gated — they exist in the full registry for audit coverage and can be
re-enabled by adding their id to the public set.

The proxy keeps a mirrored per-layer config (`LAYER_CONFIG` in
`netlify/edge-functions/wfs-proxy.ts`); `proxy-consistency-audit` guards the
mirror against drift. Three proxy entries have no registry counterpart
(`watershed-boundaries` for watershed selection, `operating-territories` and
`planned-cutblocks` for future layers) — the audit documents these as
informational orphans.

URL single source of truth: `src/lib/r2-config.ts` (R2 origin, raster URL
template). Never inline an R2 URL elsewhere.

## Rendering: one layer, up to three sources by zoom

`DataLayer` (`src/components/map/DataLayer.tsx`) renders any registry layer
with a zoom handoff:

```
z4 ──────── z9 │ z10 ───────── z12 │ overzoom ──→ z18
raster overview │ PMTiles vector    │ PMTiles overzoom
(PNG, no parse) │ (GPU filters)     │
                │        WFS GeoJSON (WFS-only layers, viewport fetches)
```

- **Raster overviews** avoid province-scale WebGL crashes (forest-age is
  ~6.2M polygons). Default 4-class set plus per-class isolation sets
  (`/raster/{class}/`), swapped by legend class filters.
- **PMTiles** render imperatively (`PmtilesLayers`) because declarative
  react-map-gl `<Layer>` fails for async-loading remote PMTiles sources.
  Inserted below the first basemap symbol layer.
- **WFS GeoJSON** renders imperatively (`WfsLayers`) for WFS-only layers;
  data arrives via the proxy on `moveend`, filtered client-side for the
  timeline. For tile-backed (dual-source) layers, PMTiles+overzoom are the
  user-visible source at all zooms — WFS adds nothing visible there.
- **Satellite (raster source)** renders imperatively (`SatelliteLayers`),
  anchored below the earlier of (first `layer-*` overlay, first symbol layer)
  via `findSatelliteAnchor` — deterministic regardless of toggle order.
- **Layer z-order** must be deterministic, never mount-order dependent:
  basemap → satellite → raster overviews → fills → lines/points → symbols.

Invariants (enforced by `src/test/audit/*`):
1. Any fill layer on the shared forest-age PMTiles source carries a
   `tileSource.minZoom` crash-gate unless it has a raster overview
   (`registry-audit` check 5).
2. Paint objects passed to MapLibre never contain `undefined` values — build
   them with `pickDefinedPaint` (a single undefined key silently kills the
   whole paint spec).
3. Class colors match across legend, vector paint, and raster tiles
   (`color-audit`); story map constants match the interactive registry
   (`story-consistency-audit`).
4. Effective layer opacity stays ≥0.15 within its zoomRange (`opacity-audit`).

## Status model

`LoadingContext` tracks per-layer status: `loading → ok | empty | zoom |
error`, surfaced by `StatusToast`. **Dual-source rule:** tile-backed layers
report status only from the PMTiles path; WFS fetch results set status only
for WFS-only layers (a WFS hiccup must not claim "data unavailable" while
tiles render fine). `DataLayer` instances are always mounted (CanopyMap
mounts every registry layer once; the P1a memo redesign), so the unmount
cleanup that clears status never runs in practice; a status must therefore
also be cleared when its layer is toggled off.

## The WFS proxy

`netlify/edge-functions/wfs-proxy.ts` (`/api/wfs`) is the only client path to
BC's WFS — origin-locked CORS (`opencanopy.ca` only), per-IP rate-limited,
response-shaping:

- Converts WGS84 viewport bboxes to BC Albers (EPSG:3005) for the upstream.
- GeoServer constraint: `bbox` and `CQL_FILTER` are mutually exclusive — a
  layer with a CQL filter must embed the bbox as
  `CQL_FILTER=BBOX(GEOMETRY,…) AND (filter)`.
- Property whitelisting (40–60% payload cut on VRI), company-id resolution
  for tenure layers, zoom-scaled feature counts.
- Separate point-query path (`INTERSECTS`) for watershed lookups.

Client side, `src/lib/data/wfs-client.ts` adds debounce, in-flight dedupe,
abort-on-supersede, and a 50-entry LRU cache.

## State

Hooks own UI state; URL is the shareable source of truth. On `/map`:

- `useLayerState` — enabled layers; hydrates URL → localStorage → defaults.
  Renamed layer ids (2026-08-26: `tap-deferrals → old-growth-250`,
  `conservation-priority → tap-priority`) keep aliases on every input path
  (URL hash, localStorage, popstate).
- `useMapState` — viewport ↔ URL, history push only on genuine user changes
- `useTimeline` — the year. Since 2026-08-27 the year is a MapLibre
  global-state uniform: the registry's filter/opacity expressions read
  `["global-state", "currentYear"]` on the GPU and each tick is one
  `map.setGlobalStateProperty("currentYear", …)` call from `map/page.tsx`
  (`setFilter` remains only for legend class filters and WFS layers). The
  playhead is render-gated: it advances only after `map.once("idle")` (Phase
  A "honest timeline"), via a `waitForRender` injected into the hook.
- `useWatershedSelection` — watershed click/selection lifecycle
- `useDialogA11y` — dialog focus management (focus-in, restore, Tab trap)

On `/` (the landing story):

- `useScrollytelling` / story — the scrollytelling map (`src/lib/story/`) is a
  deliberately separate, deterministic layer setup; it shares constants with
  the registry via audits, not imports. Do not merge the two paths (decided
  2026-06-02). The one deliberate shared *data* dependency is
  `src/data/scrub/*.json` (cumulative-area pacing tables built by
  `scripts/build-scrub-tables.py`): the story scrubs by them and the `/map`
  timeline's scented track reads the fire table's per-year shares.
- `useDeviceCapability` — device performance detection (SSR-safe lazy init);
  its only consumer is `ScrollytellingContainer`.

Presets (`src/lib/layers/presets.ts`) are named layer combinations the map
shell activates.

## Pipeline (data → tiles)

`scripts/pipeline/`: `download.sh` (bulk FGDB) → `transform.ts` →
`preprocess.ts` (water subtraction, classing) → `build-tiles.ts`
(single-pass tippecanoe → PMTiles v10) → `verify.ts`, orchestrated by
`rebuild.sh`. Raster overviews come from `scripts/build-raster-tiles.py`
(rasterio; all themes derive from `src/lib/layers/forest-age-palette.json`,
the single color authority shared with the TS registry — `color-audit`
cross-checks both sides via the script's `--dump-themes` mode). The raster
build reads the slimmed `forest-age-rasterizable.ndjson` produced by
`scripts/pipeline/simplify-for-raster.py` (the full-fidelity file is ~63 GB
as Python objects and exceeds the 32 GB build machine; half-pixel-at-z9
simplify, no features dropped; raster input ONLY — PMTiles keep full
fidelity). Output ships to R2 under versioned dirs (`raster/v2/...`):
upload new dirs, flip the client URL in `r2-config.ts`, keep old dirs one
verified release.

Story overlays come from the same preprocessed checkpoint:
`scripts/build-year-overlays.py` (per-year cutblock and fire PNGs) and
`scripts/build-scrub-tables.py` (pacing curves + absolute totals).
`scripts/generate-tile-manifest.py` emits the optional binary-tile manifest
the story's `ocbin://` protocol consults (fail-open when absent).

Quality net: the audit suite (`scripts/audit-*.ts`) traces source→tile
fidelity, geometry precision, spatial/temporal/cross-source consistency.
`npm run audit:all` runs eight of them; `audit:trend` (archived reports),
`audit:viewport` (needs a prior `next build`) and the Python
`audit:crosssource` (live WFS) run separately. `e2e/` adds screenshot
regression (`audit:visual`, needs a dev server) and the production monitor
(`audit:live`, its own Playwright config so `test:e2e` never hits prod).

## Layout

```
src/app/            routes (map shell at /map, story at /, privacy, OG images)
src/components/     map/ (CanopyMap, DataLayer, legend, popup, draw, timeline)
                    panels/ (layers, calculator, hotspots), story/, landing/, ui/
src/hooks/          state hooks + useDragDismiss
src/contexts/       LoadingContext (per-layer status model)
src/data/           chapters (story), companies (licensee SSOT), hotspots,
                    scrub/ (pacing tables shared by story + timeline)
src/types/          LayerDefinition and friends
src/lib/            layers/ (registry, presets, forest-age-palette.json),
                    taxonomy/ (forest-age class SSOT), data/ (wfs-client,
                    forest-carbon-client, watershed-client, DataFetchError),
                    story/, carbon/ (calculator — must match METHODOLOGY.md
                    exactly), timeline/, export/, debug/, r2-config, mapConfig,
                    a11y/ (reduced-motion), map/ (shared GeoJSON/layer utils,
                    popup-keys), keyboard/ (map shortcuts), math/ (interpolation),
                    react/ (merge-refs)
src/test/           unit + audit suites (vitest), mocks/maplibre
netlify/            edge functions (wfs-proxy)
scripts/            pipeline v2, raster builder, audit suite,
                    release tooling (release-ledger.mjs, lib/, hooks/pre-push)
e2e/                playwright screenshots + live monitoring
```

## Releases

Every push to `main` deploys (`netlify.toml` has no `ignore`), so every push to `main` is a
release, docs included. Releases go one relay at a time, each followed by live production
guards, serialized across the two lanes (DECISIONS, 2026-10-02). The session pushes after Lee's
yes in conversation, with green checks and a named rollback; Lee no longer pushes from his
terminal (DECISIONS, Deploy entry, amended 2026-10-05). **A session never rolls back production
on its own.** This section is the runbook; `release-ledger.mjs --help` points here, and no later
session loads the P0b plan (`.claude/plans/2026-10-p0b-release-tooling.md`), so what a session
needs is written here.

**The tool.** `scripts/release-ledger.mjs` with `scripts/lib/{dir-mutex,release-state,netlify-read}.mjs`
and `scripts/hooks/pre-push`. Sessions never run the copy in their worktree. The one canonical
invocation is the installed copy:

```
node ~/marvin/state/opencanopy-release-tool/release-ledger.mjs <command>
```

so a stale worktree's older code never meets a newer record type and halts on it. State lives
outside every worktree, under `~/marvin/state/`: the ledger `opencanopy-releases.jsonl`
(append-only JSONL), the lease `opencanopy-release.lock/`, the mutex `opencanopy-release.mutex/`
and the installed tool `opencanopy-release-tool/`. Exit codes: 0 ok or GO; 1 NO-GO or a failed
read; 2 refused (bad input, stale token, lost race, duplicate); 3 HALTED; 4 BUSY (mutex held by a
live process past 5 s). Every external read (`netlify`, `git ls-remote`) has a 30 s timeout.

### Bootstrap, once

0. **A marvin session commits the ignore patterns in `~/marvin` first.** `init` and `install`
   both refuse until `git -C ~/marvin check-ignore` passes for all four state paths:
   `state/opencanopy-releases.jsonl`, `state/opencanopy-release.lock`,
   `state/opencanopy-release.mutex`, `state/opencanopy-release-tool` (the pattern
   `state/opencanopy-release*` covers them), with `state/heavy-build.lock*` for relay HEAVY in
   the same commit. An OpenCanopy session cannot make that commit; it asks for it.
1. **The first `install` is Lee's yes of 2026-11-01** ("Full, trimmed, with hook", given in the canopy session).
   That ruling covers the first install only. Rebase the P0b branch, run the checks, then from
   its tip, running the worktree's copy (`node scripts/release-ledger.mjs install …`, the one exception to the rule above, since nothing is installed yet): `install --lee "Lee, 2026-11-01: Full, trimmed, with hook"`. With no tool
   installed yet and origin not yet holding it, this one installs from the objects at `HEAD`.
2. `init --evidence "audit:live: N passed, two named failures by construction at
   live-health.spec.ts:187 and :243; HTTP 200 on /, /map, /privacy"`, with N measured that day.
   Genesis adopts the published deploy as known-good and says honestly what was not green.
3. P0b itself then goes through the normal sequence from `claim`. Its identity guard reads the
   CLI first (`commit_ref` equals the SHA, `state` is `ready`), then the `oc-build` tag on `/`,
   `/map`, `/privacy`, each 200.
4. Once P0b is on origin and its `release` is recorded (sequence step 7; `install` refuses while a lease is held), ask Lee, then `install --lee` again, so the installed bytes are what
   shipped.

### The sequence

1. Rebase the relay branch on `origin/main`. Run `summary --unrecorded` and carry every release it
   lists into this release's first commit (post-release records, below), with the relay's own
   pre-merge ROADMAP and handoff edits.
2. Run the checks **on that tip**: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
3. `claim --lane M|S|session --sha <tip> --kind behaviour` (it reconciles first). If origin
   moves, `release --abandon`, rebase, repeat.
4. Ask Lee, naming the rollback target (`status` shows known-good) and the ~20-minute window he
   should stay for. On yes: `request --token N --sha <tip> --parent <live origin main>
   --approval "<his words>" --checks "<the gate summary lines>"`. A request is good for 60
   minutes; past that, ask again, and a new request with his new words renews it.
5. `check-push --token N --pushed-sha <tip>` immediately before pushing. Only `GO sha=...
   parent=... rollback=...` continues; NO-GO prints every failed predicate.
6. `OC_RELEASE_TOKEN=N git push origin "${TIP}:refs/heads/main"`. Braces and quotes are
   required: in zsh, `$TIP:refs/...` applies the `:r` modifier and mangles the refspec. The
   pre-push hook runs `check-push` again on every `refs/heads/main` line of the push, whatever
   the remote is called; no token is NO-GO, and deleting `main` is always refused. Then
   `record-push --token N --sha <tip>`, which refuses unless live origin main is at the SHA, and
   consumes any corrective authorization.
7. `await-live --token N --sha <tip> --source netlify` (or `meta` once guards read the tag), the
   release's guards, then `guard --token N --sha <tip> --deploy <id> --result green|red|unverified
   --evidence <file>`, then `release --token N`.
8. Fast-forward the primary's `main` only if it is clean and on `main`; otherwise leave it and say
   so. Releases never move local `refs/heads/main` before the push: it is shared by every
   worktree, and "the candidate SHA" means the SHA actually being pushed.
9. If the release touched the tool paths, ask Lee, then `install --lee` after `release`.
   Otherwise every session keeps running the old gate. `install` refuses while a lease is held:
   the tool that authorizes a push does not change under the push.

`check-push` predicates: P1 current token, with an un-pushed request under that token younger
than 60 min; P2 pushed SHA equals the request's, parent is its ancestor; P3 live origin main
(`git ls-remote`, never the cached `origin/main`) equals the request's parent; P4 no production
deploy in flight, none locked; P5 published deploy equals the ledger's current; P6 predecessor
green, or an unconsumed corrective authorization bound to this SHA with a corrective holder on
it, and live origin main's own build did not fail; P7 no open halt, except that a bound
corrective passes while only red, unverified or build-failed halts are open; P8 the repo's
`core.hooksPath` is the installed hooks directory and the hook is executable. `reconcile` prints
`GATE OFF` when P8 fails, and otherwise the SHA the gate runs from.

**Post-release records** (`shipped`, guard results, deploy id) ride in the next release's first
commit, since pushing them alone is itself a release. The ledger is the durable record meanwhile.
`summary --sha <S>` prints only SHA, deploy id, data version and guard results, never Lee's
words, because it feeds a public file.

**Docs and rulings.** A docs commit is a release. `decisions-check.sh` reads origin's default
branch, so a ruling held on one lane's branch is invisible to the other. A ruling the other lane
must see goes as a docs-only `behaviour` release through the normal sequence, its blocking guard
HTTP 200 on `/`, `/map`, `/privacy` plus identity. Everything else rides the next release.

### Verdicts

`guard` is the release's single aggregate verdict; results per guard live in the evidence file.
It refuses unless `--sha` and `--deploy` match the current deploy and the evidence file is
non-empty, newer than the deploy record, and names the deploy id or SHA. It is the only door to
known-good. Verdicts are keyed on the commit as well as the deploy, so a rebuild inherits its
SHA's red.

| Verdict on one commit | Allowed |
|---|---|
| none to green, red or unverified | Yes (a rebuild of a red SHA is not "none") |
| unverified to green or red | Yes: the check had not finished |
| **red to green** | **Only with `--lee`** (a genuine flake, Lee's call) |
| green to red | Yes. Known-good moves back to the previous green, and it halts. With no previous green it is null, and the text says there is no rollback target |
| same verdict again | No-op, unless it closes a halt |
| negative-control | `instrumentation` releases only; no halt |
| anything else (red or green to unverified) | Exit 2, nothing written |

**Re-running a guard until it passes is not a recovery.** A session cannot lift a red without
stating in writing that Lee said so.

### Halts and their doors

Any red, unverified, failed build or unclassifiable Netlify state halts **both lanes**. Every
halt has a door, and no door needs a hand edit of the ledger:

| Open halt | Closed by | With no lease held |
|---|---|---|
| Red on a commit | Green with `--lee` on that commit (any rebuild included); or green on a deploy `record-rollback` made current; or green on a corrective release | `record-rollback` or `authorize-corrective` take no token, then `claim --deploy` or `claim --kind corrective` give the token the guard needs. A dead holder: `takeover` first |
| Unverified on a commit | Green on that commit; or as red | As red |
| Build failed | Green on a corrective release | `authorize-corrective` |
| Unclassifiable, published deploy | `ack-deploy`, which makes it current, then green | `ack-deploy` needs no token |
| Unclassifiable, deploy later settled or stranded | `ack-deploy` on it alone | Same |

An observed rollback (reconcile saw production go back to known-good) has no words and closes
nothing until `record-rollback --lee` adds them. Once a worded rollback has made a deploy
current, `ack-deploy` on it is refused: the rollback already answers its halt, and an ack would
drop Lee's words. A malformed ledger is not a halt in this set; its door is repair.

**Who surfaces a halt.** Only the command that appended a halt prints `NEW HALT`. That session,
or the coordinator if it was the one, tells Lee in plain words what stopped and what the choices
are, and sends `/notify`. Any other exit 3 is reported, not re-notified. The owner is whichever
session holds the coordinator role, and failing that, the next session to touch the tool. **No
daemon watches for halts**; a halt nobody reads waits until someone runs the tool.

**Red release.** The failed candidate stays live until Lee acts. He chooses:
- *Rollback.* Lee rolls back in the Netlify console (the session never does). Then
  `record-rollback --deploy <restored> --lee "<his words>"`, a green `guard` on the restored
  deploy, `release`. A holder still on the lease uses its own token; with no lease held,
  `record-rollback` takes none and `claim --deploy <restored>` gives the guard one. **Origin main still contains the failed commit, so
  the next release must revert it, and `check-push` will not notice.**
- *One corrective.* `authorize-corrective --sha <fix> --lee "<his words>"` (with `--token N` while the holder still has the lease); the holder
  `release`s; `claim --kind corrective --sha <fix>` for that bound SHA only. It is the only push
  allowed while halted, and `record-push` consumes the authorization.

**A flake after release has only an indirect door.** When a released, known-good deploy later
goes red and Lee says it was a flake: `guard --lee` with no token exits 2, `claim --sha` of the
same SHA exits 3 (halted), and rollback and ack both refuse the current deploy (if the current deploy came from a worded rollback, `record-rollback` exits 0 "already recorded" and opens nothing; the door below still works). The door is a
corrective on a placeholder SHA that will never be pushed:

```
authorize-corrective --sha <placeholder 40-hex, no such commit> --lee "<his words>"
claim --lane session --sha <placeholder> --kind corrective
guard --token N --sha <red sha> --deploy <red deploy> --result green --evidence <file> --lee "<his words>"
release --token N --abandon
```

`guard` does not bind to the holder's SHA, so the green lands on the red deploy and closes it;
known-good returns to it. The placeholder's authorization stays unconsumed in the ledger for
good, but alone it passes nothing: P6 and P7 also need a corrective holder on that SHA. Walked
end to end against the tool on 2026-11-01 (P0b-4).

**Failed build.** `await-live` exits fast on `state: error` for the candidate's commit, appends
`build-failed` and halts with "production is unchanged; the known-good deploy is still live".
Rollback is meaningless; origin main holds the commit, so the only way on is a corrective.
**Only `await-live` writes `build-failed`.** A session that leaves the lease another way
(`release --abandon`, a plain `release`, dying before `await-live`) leaves no record: `status`
and `reconcile` show no halt and nobody prints `NEW HALT`. The next session to reach `check-push`
gets NO-GO at P6, which reads live origin main's failed build itself, but `check-push` writes
nothing, so Lee hears of it late, possibly a whole lane's work later. **Abandoning a pushed
candidate whose build failed: tell Lee now.**

**Bypass or stranded deploy.** `--no-verify`, a GitHub web merge, a push from another machine or
an unset `core.hooksPath` all get past the hook. Reconcile then finds a published deploy the
ledger never recorded and halts. `ack-deploy --deploy D --lee "<his words>"` makes it current and
pending; then `claim --sha <its commit_ref>`, or `claim --deploy D` for a deploy with no ref (as
CLI deploys can have), the guards, a green `guard`, `release`. `ack-deploy` on a deploy that is
not published marks it stranded and excludes it from in-flight from then on. This is also how a
`--no-verify` push, which needs Lee's yes, is recorded afterwards.

**Locked site.** If a rollback left the deploy locked, P4 says so. The repair is `netlify api
unlockDeploy`, on Lee's word. Whether a console rollback locks is unprobed; P4 fails closed
either way.

### `await-live` polling

`await-live` polls Netlify every 15 s until its deadline (`--timeout-min`, default 10, fractional
allowed, on a real monotonic clock). A failed read during polling is not an error: it keeps
polling. Past the deadline it appends `guard unverified` and halts, with the text "timed out",
whatever the reason the reads learned nothing. **So an expired Netlify token or a dead network
looks exactly like a slow deploy, and halts both lanes.** Before calling `await-live`, run one
`netlify api getSite --data '{"site_id":"6b007878-a00d-4ada-86d4-5cf84e9acc2a"}'` and see it
answer; after a timeout, run it again before telling Lee the release is unverified, and say which
it was. If the deploy publishes after the timeout, `reconcile` records it and a green guard lifts
the halt. Re-running `await-live` after a timeout adds no second `unverified` record; the halt
stays until a guard or a door closes it, so a retry loop around it only burns time.

### Lee's words

Every `--lee`, `--approval` and `guard --result green` is an attestation by the session, not
proof: the tool runs no guard and cannot verify that Lee said anything.
- **Verbatim** from his own message, never a paraphrase. A peer session's relay is recorded as
  relayed, and by whom (for example "Lee, 2026-11-02: … (relayed by session-d09d2c)"). Empty or
  whitespace is refused.
- A notice goes to Lee on each relaxing record (red to green, `ack-deploy`, `record-rollback`,
  `authorize-corrective`, `install`) through `~/marvin/skills/notify/send.mjs`, with the door and
  his verbatim words. Best effort, never blocking. Not on `request`: he has just said yes.
- **The remaining limit is stated, not closed.** A session willing to write words Lee did not say
  can pass. Its only detector is Lee reading the notice. Accepted because the threat is a hurried
  session, not a hostile one.

**`install` needs Lee's yes every time, and records his words.** It sets a repo-wide git hook and
replaces the code that authorizes pushes, so it is never a session's call. It fetches, then
installs from the objects at live origin main's exact SHA, never the working tree, so a stale
worktree or a dirty file cannot become the gate (the first install, from `HEAD`, is the one
exception). It refuses while a lease is held, printing the manual route. Each file goes in by
temp name and rename, the hook last; `core.hooksPath` is set to the installed `hooks/`, absolute,
only after the hook exists. A crash leaves a present, executable hook once one has been
installed, and a re-run completes it.

### Repair and host stalls

**Malformed, unreadable or missing ledger halts everything:** every ledger-reading command exits
3 with `SCHEDULING HALTED` and writes nothing. A missing ledger says `not initialized` and is
never silently recreated. The human repair keeps the ledger absent throughout, so everything
stays halted, and cannot reuse a token:
1. `mv` the ledger to an aside file.
2. Produce a corrected copy.
3. `repair-note --aside A --fixed F --reason TEXT`: validates F, burns past the highest token in A
   and in any lease, renames F into place, and removes the lease dir (a repair fences its holder).

**A dead mutex holder is never auto-broken.** A tool killed inside the mutex leaves it held; the
next caller exits 3 and prints the exact `rm -r <path>`. Tell Lee, run exactly that, and recovery
is automatic from there.

**Host-level fsync stall.** Under a heavy build on this host, a one-line append plus `fsync` has
been measured going from p99 8 ms to about 6 s (filesystem journal waits; strong attribution,
not proven). Tests can time out and `check-push` or any mutex caller can exit 4. That fails safe:
exit 4 writes nothing and authorizes nothing. Wait for the build, then re-run; never read an
exit 4 as a halt, and never as GO.

**Enforcement is cooperative.** The hook stops `/save` and terminal pushes to `main` on this repo
(Lee, 2026-11-01: "hook on"), so **`/save` is not a release path for OpenCanopy**: it stops at
the hook, loudly. The bypasses above are detected afterwards by reconcile, not prevented.
Rollback of the tooling itself, on Lee's word: `git revert`, then `git config --unset
core.hooksPath`, which takes the gate off every worktree at once; move the ledger aside, never
delete it; `rm -r` the lease and mutex; remove the installed tool.
