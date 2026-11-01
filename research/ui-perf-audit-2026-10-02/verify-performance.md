# Skeptic verification: performance findings SPD-01..SPD-07

Date: 2026-10-01. Target: https://opencanopy.ca (production), repo worktree session-f8d7c3 (branch refresh/2026-09-01, head 3db5823).
Method: own Playwright Chromium scripts (chrome-devtools MCP failed to connect this session), curl, source reading.
Default verdict when not reproduced: could-not-reproduce.

Evidence dir: verify/performance-evidence/

## Verdicts (appended as reached)

### SPD-01 -- deep-link / CTA camera waits for an unrelated re-render
**Verdict: CONFIRMED (stronger than claimed on phone). Severity: P1, not P0.**

Method (own, `scripts/cam-probe.mjs`): bundled Playwright Chromium 1208 (not the auditor's /usr/bin/google-chrome), fresh context per run, direct goto of the landing CTA URL `/map#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age`, NO popstate, NO input; 1 s samples of the ScaleControl text and the MapReadout `zN.N` text, plus the zoom level of every MapTiler/R2 tile request. Then one click on "Toggle layer panel" (changes Home state, not the camera). The "vialanding" runs load `/` first and wait 10 s in the same context (warm HTTP cache, maplibre chunk cached) before navigating, which is what the plain `<a href>` CTA does.

| runs | camera before input (30-40 s) | 2.5 s after the panel click |
|---|---|---|
| desktop 1440x900 cold, direct: 6/6 | "100 km", readout z5.0, only z4-z6 tiles requested | "10 km", z8.0, z8-z9 tiles start |
| desktop via landing: 3/3 | same | same |
| phone 390x844@3 cold, direct: 4/4 | same | same |
| phone via landing: 2/2 | same | same |
| one extra desktop run (`yank-probe.mjs`) | landed at VI by 10 s (`cam/yank-after-user-zoom.png`, Herbert Inlet) | - |

So 15 of 16 runs never landed without input; it is a race, but one that loses almost every time on this machine, phone included (the auditor saw phone land at 2.6 s; I did not in 6 phone runs). Screenshots: `cam/desk-1-before-input.png` (province, Juneau to Calgary) and `cam/desk-1-after-input.png` (VI at z8).

Mechanism checked in source, not taken on trust: `CanopyMap.tsx:68` `useImperativeHandle(ref, () => mapRef.current!)` re-runs only when CanopyMap renders; `@vis.gl/react-maplibre` 8.1.0 `map.js` creates the instance after `import('maplibre-gl')` resolves and exposes it through its own `useImperativeHandle(ref, ..., [mapInstance])` on a re-render of the inner Map only. `useMapState.ts:166-183` polls `mapRef.current` for 120 s. `MapReadout.tsx` header shows the 2026-08 P1a perf fix deliberately stopped zoom/mouse events from re-rendering CanopyMap, which plausibly removed the incidental re-render that used to set the ref. `src/test/lib/deeplink-hydration.test.ts` exercises the poll against a mocked ref, so it cannot see this.

Prior status: `research/map-visual-audit-2026-08-22.md` row P1 is marked "shipped (Batch 0)", and ROADMAP Known issues still describes the old 2 s-poll bug. Neither records that the shipped fix is ineffective, so this is new information, not a duplicate. Ruling: DECISIONS 2026-08-21 ("the CTA's 'Explore the Map' carries the reader to STORY_END_CAMERA on /map") is currently false in practice.

Severity: P1, not P0. The page works, the requested layer is on, and the reader can navigate; the defect is the wrong camera on every share link and on the ruled story-to-map hand-off. The 08-22 audit graded this same symptom Major, not Blocker, and nothing here is data loss, security or outage. Second-order harm from the same code: while the poll is pending, any later Home-level state change fires `flyTo(duration 0)`, so a reader who has already panned can be teleported back (mechanism read in source; my yank run happened to land early, so the teleport itself was not observed). The auditor's fix (initialViewState from the hash, `mergeRefs` already exists at `src/lib/react/merge-refs.ts`) is sound.

### SPD-06 -- one 3.83 GB archive, 12 layers, most of each z<=9 tile never drawn
**Verdict: CONFIRMED on facts; already scheduled (ROADMAP `next:` Batch 4 "TILE BUILD (P3 per-layer archives / byte caps, z10+ holes ...)" and Known issues P3). Severity P1 stands on impact, but it is not a new action item.**

Method (own, `scripts/pmtiles-check.mjs`): the `pmtiles` lib with a wrapped FetchSource that records the stored byte length of each tile read, plus my own protobuf walk of the decoded MVT (Tile field 3 = layer, Layer field 1 = name) to size each source-layer. Did not open the auditor's `pmtiles-analysis.json`. Output `pmtiles/check.json`.
- Header: z4-z12, 44,397 tile entries, gzip, bounds -139.13, 48.22, -113.99, 60.50. All 12 `vector_layers` minzoom 4. Generator `tile-join v2.49.0` over per-layer tippecanoe chunks with `-M 5000000 --drop-densest-as-needed` (the cap is per chunk, before the join).
- 7/19/43 (CTA area): stored 4,588,521 B, decoded 10,956,407 B: forest-age 54.9%, forestry-roads 15.6%, conservation-priority 13.7%, tenure-cutblocks 12.5%, parks 0.1%. 7/20/41: stored 6.71 MB, forest-age 63.6%. 5/4/10: stored 9.53 MB. 9/78/172: stored 0.70 MB, forest-age 70%. Matches the auditor's numbers to the KB.
- Drawn or not: forest-age and old-growth-250 vectors get `minzoom = rasterOverview.maxZoom + 1 = 10` (`DataLayer.tsx:1365`, `:265`); cutblocks has no tileSource minZoom so it is drawn from z0, which is why a Logging view at z7 pulls the whole joined tile. forestry-roads is not in `PUBLIC_LAYER_IDS` (`registry.ts:893`). So for Logging at z7 roughly 12.5% of the decoded tile is drawn; the auditor's 86-99.85% waste range holds.
- Not re-measured: the phone filmstrip timings (59-116 s for cutblocks at z7) and the 0.8 MB estimate after a split. The estimate is arithmetic from shares, labelled as such by the auditor.

### SPD-05 -- tiles from r2.dev: HTTP/1.1, no Cache-Control, 27 KB HTML 404s, dev-only endpoint
**Verdict: CONFIRMED. Severity P1 stands. Previously raised (research/improvement-scan-2026-07.md item 2, "R2 cache headers ... hours"), never done and not in the ROADMAP Parking Lot (the P3 ops "cache headers for /raster and /images" item is the Netlify-served story assets, not the R2 bucket).**

Method (own): curl from this machine 2026-10-01 23:30 PDT (`r2/*.txt`), then `scripts/warm-probe.mjs`: persistent Chromium profile in a fresh temp dir, phone 390x844@3, `/map#lat=49.38&lng=-125.86&z=7.0&layers=forest-age,cutblocks`, camera landed by opening and closing the layer panel (popstate did NOT land the camera in my runs, see SPD-01), 50 s, close, reopen the same profile, same view. Cache hits from CDP `fromDiskCache` / `requestServedFromCache`.
- `curl -v --http2 .../raster/v3/forest-age/7/20/41.png`: "ALPN: curl offers h2,http/1.1 / server accepted http/1.1". Headers: ETag, Last-Modified, `Server: cloudflare`, no Cache-Control, no alt-svc. PMTiles `Range: bytes=0-16383` -> 206, `Content-Range: bytes 0-16383/3831441244`, no Cache-Control. A miss (`/raster/v2/old-growth/5/2/9.png`) -> 404 `text/html`, 27,150 B. CORS is origin-locked to https://opencanopy.ca (good).
- Repeat visit (`warm/logging-z7-phone.json`): Next chunks 15/15 cached, DEM 30/30, R2 PNGs 161/198 cached; but PMTiles 15.16 MB re-downloaded on visit 2 (the six z7 ranges 4.59 + 4.42 + 2.80 + 2.33 + 0.94 + 0.06 MB, none from cache; the header re-fetched too) and all 37 R2 404s re-fetched (1.01 MB). Identical to the auditor's 15.14 MB / 37 / 1.01 MB.
- Same run, a side observation that belongs to SPD-01: visit 1 first issued six z5 province ranges (offsets 19-55 MB in the archive) that were aborted when the camera flew, because the map is constructed at INITIAL_VIEW_STATE.
- `node_modules/pmtiles` 4.4.0 FetchSource: `n=UA has "Windows"`, `s=/Chrome|Chromium|Edg|OPR|Brave/`, `chromeWindowsNoCache` -> `cache:"no-store"`. Confirmed.
- Cloudflare docs (WebFetch of https://developers.cloudflare.com/r2/buckets/public-buckets/ today): "Public access through r2.dev subdomains is rate-limited and should only be used for development purposes." and "To use features like WAF custom rules, caching, access controls, or Bot Management, you must configure your bucket behind a custom domain." Quotes confirmed verbatim.

Severity reasoning: every tile byte of the product rides an endpoint its vendor says is rate-limited and for development, at a moment when the 2026-09-11 advocacy ruling is meant to send public traffic to the site; plus a 15 MB repeat-visit tax on phones. P1 is fair. Caveats: the "header moves toward 14-15 s" gain is the auditor's estimate, not a measurement; and the Worker is not the only route: a custom domain attached straight to the bucket already gets HTTP/2+ and the Cloudflare cache, with a Cache Rule, and no Worker bill. Whether the 206 ranges then cache in Chrome was not tested; the z/x/y Worker route sidesteps that question, which is its real argument. Outward-facing infra, so Lee's call, as the auditor says.

### SPD-03 -- /map fetches tiles for layers that are off, and the requested layer waits behind them
**Verdict: CONFIRMED, with a sharper mechanism than the auditor gives. Severity P1 stands. Already tracked as 08-22 P2 and scheduled in ROADMAP `next:` Batch 3 ("P2 prefetch order"); the opacity-0 explanation, the satellite and the duplicated old-growth source are the new parts.**

Method (own, `scripts/map-req-probe.mjs`): fresh context, CDP request accounting; counterfactual via CDP `Network.setBlockedURLs` (`*r2.dev/raster/v2/*`, `*satellite*`), a different mechanism from the auditor's Playwright route patching, terrain left ON (so this isolates SPD-03 from SPD-04).
- Plain `/map`, no hash, no layer on (screenshot `mapreq/plain-desktop.png`: bare basemap, no badge), 30 s unthrottled. Desktop: 284 R2 raster requests, 6.28 MB (forest-age v3 47, old-growth v2 94 = two sources on identical URLs, mature 47, young 47, harvested 49), 160 of them 404s. Phone: 96 R2 raster requests + 15 MapTiler satellite tiles = 2.33 MB. The auditor's 6.27 MB / 160 404s / 2.34 MB reproduce; their phone count (112) differs from mine (96), bytes agree. All R2 responses `http/1.1`.
- Code: `DataLayer.tsx` pre-mounts all five raster sets with `raster-opacity: 0` (the comment "MapLibre lazy-loads inactive raster tiles" is false); `SatelliteLayers` hides with opacity; `registry.ts:378-382` old-growth-250 overview = the old-growth class URL. MapLibre 5.21 `isHidden()` checks zoom range and `visibility === 'none'` only (`maplibre-gl-dev.js:23648`), and the `used` loop at 60195-60205 marks the source used. Confirmed.
- Phone, Slow 4G (562.5 ms, 1,474.56 kbps) + 4x CPU, `layers=forest-age,cutblocks` at z7 (= the Logging preset), 90 s, 2 runs per arm:

| arm | PMTiles header requested | first z7 range done (56 KB) | 944 KB range | 2.3 / 2.8 MB ranges | PMTiles MB by 90 s | hidden MB | 404s |
|---|---|---|---|---|---|---|---|
| production | 30.1 / 30.4 s | 36.4 / 36.9 s | 61.4 / 61.6 s | not done by 90 s | 1.02 / 1.02 | 2.17 | 31 |
| hidden rasters + satellite blocked | 19.4 / 19.7 s | 24.3 / 24.7 s | 48.2 s | 78.9 / 85.7 s | 6.16 / 6.16 | 0 | 5 |

So the hidden sets alone cost about 11-12 s on the header and first tile, about a third of the auditor's combined SPD-03+04 figure of -19 s, and in production the bulk of the Logging cutblocks had not arrived 90 s in.

Sharper mechanism (not in the report): the header request is not merely queued on the six HTTP/1.1 sockets; it is not created at all until 30 s. `PmtilesLayers` registers the shared vector source only on the map's `load` event when the style is not yet loaded (`DataLayer.tsx` ~420-430), and MapLibre fires `load` only when every used tile manager, including the opacity-0 rasters and the terrain DEM, has finished (`Map.loaded()` -> `Style.loaded()` -> `TileManager.loaded()`, `maplibre-gl-dev.js:73545, 60071, 51076`). In both production runs all 108 hidden/visible raster requests finished just before 30 s and the header followed at 30.1 s. A one-line companion fix follows: register the PMTiles source on `style.load` instead of `load`. Visibility-'none' fixes from the report remain correct.

### SPD-04 -- 3D terrain on every /map load although the map opens flat
**Verdict: PARTIALLY CONFIRMED. The CPU/frame-rate half reproduces (larger than claimed in fps terms); the DEM-bytes half is overstated 2-4x. Severity P1 holds on the frame-rate evidence alone.**

Method (own, `scripts/terrain-ab.mjs`; different from the auditor's chunk-string patch): an init script finds the live maplibre instance through the React fiber of `.maplibregl-map` (`_map` on react-map-gl's wrapper) before the map's `load` event (verified `capturedBeforeLoad: true` in every run), and in the `noterrain` arm replaces that instance's `setTerrain` with a no-op for non-null calls. The base arm runs the identical hook without the patch. Verified per run: `setTerrainCalls` shows the intercepted `{source:"terrain-rgb", exaggeration:1.2}`, `getTerrain()` is null at the end only in `noterrain`. Phone 390x844@3, production assets untouched.

Interaction window (4x CPU, network unthrottled; land camera, wait 25 s, then tap Logging, Fire + Logging, Overview 7 s apart, then a scripted 4 s `easeTo` pan+zoom while counting rAF frames; 3 runs per arm, alternating):

| arm | main-thread script s (CDP ScriptDuration delta) | task s | fps during 4 s easeTo | Event Timing median / max ms |
|---|---|---|---|---|
| base | 7.12 / 6.68 / 6.14 (mean 6.65) | 16.4 / 16.0 / 13.8 | 8.1 / 8.5 / 14.3 | 216/360, 112/184, 128/168 |
| noterrain | 4.69 / 4.40 / 4.73 (mean 4.61) | 12.7 / 13.4 / 13.4 | 39.4 / 37.3 / 38.2 | 104/264, 88/152, 88/168 |

Script time -31% (the auditor's -33% MapLibre self-time reproduces by a different meter); camera-motion frame rate roughly 10 -> 38 fps. Interaction latency improves modestly (median about 150 -> 93 ms), consistent with the auditor's own caveat that worst cases are noise-dominated.

DEM bytes (cpu 1x, unthrottled, URLs bucketed by zoom; `terrain/demonly-*.json`):
- Plain /map: base 1.96 MB (3 runs, identical) vs noterrain 1.43 MB. Terrain adds 0.54 MB (two z4 tiles). Auditor: 3.38 -> 1.43 MB.
- CTA view: base 2.42 / 2.96 MB vs noterrain 2.02 MB. Terrain adds 0.41-0.94 MB (z7 and sometimes z4 tiles). Its z5 and z8 requests duplicate the basemap Hillshade's URLs (same `terrain-rgb-v2` tileset, confirmed from the live `backdrop-dark` style.json: source `terrain_rgb` + layer `Hillshade`) and came back from cache at 0 bytes. Auditor: 3.23 -> 0.60 MB.
- My noterrain numbers equal the auditor's (1.43 MB plain; my 0.60 MB z8 bucket equals their CTA noterrain total); only their base arm is larger. The likely confound is that their two arms differed in whether the province (z5) phase happened before the camera landed, which is the SPD-01 race, or that duplicate URLs were fetched concurrently and missed cache. Either way, about 0.4-0.9 MB per phone view is the terrain-attributable figure I can reproduce, not 2-2.6 MB.
- No ruling found on /map terrain in DECISIONS, ROADMAP or CHARTER. Tests: `setTerrain` appears only in `CanopyMap.tsx` and the maplibre mock, so the "no test references it" claim holds.

### SPD-02 -- landing pulls 16-19 MB before the first scroll; on Slow 4G the story map is bare for the first ~25-35 s of reading
**Verdict: PARTIALLY CONFIRMED. Bytes and the bare-map-under-advancing-counter reproduce; the "hero photo finishes at 38 s" sub-claim does not (9.3 s in my runs). Severity P1 stands. Previously parked as ROADMAP Parking Lot "P3 ops backlog: ... prefetch gating (~8MB)"; measured today it is more than twice that, so the parked size is stale.**

Method (own, `scripts/landing-probe.mjs`): Playwright Chromium, phone 390x844@3, fresh context, CDP accounting; throttled runs use CDP `Network.emulateNetworkConditions` (562.5 ms, 1,474.56 kbps down) + `Emulation.setCPUThrottlingRate(4)`, not Lighthouse.
- No scroll, unthrottled, 45 s (`landing/bytes-1`, `bytes-2`): 17.61 / 17.68 MB, 320 requests. Cutblock year overlays 78 req 4.91 MB starting at 0.5 s (hydration; `HeroSection.tsx:43-45`); MapTiler DEM 23 req 5.41 MB; fire overlays 110 req 5.23 MB (from 1.5-1.8 s); binary tiles 66 req 0.49-0.55 MB; hero + images 0.63 MB. The duplicate hillshade is real: the live `backdrop-dark` style carries its own `terrain_rgb` raster-dem + `Hillshade` layer, and `setup-layers.ts:134-158` adds a second `terrain-rgb` source at tileSize 256 + `story-hillshade` on the same tileset.
- Reading pace on Slow 4G + 4x (`landing/read-1/strip.png`, n=1): hero read for 12 s, then 60 px per ~330 ms. 25 s: "See what's left." over a bare dark map; 30 s: "Before the records began." over bare basemap; 35 / 40 / 45 s: year counter 1983 / 1991 / 1999 over a map with no forest base and no cutblock overlay (basemap hillshade still patchy); 50 s: red cutblocks finally drawn at 2006. Cutblock overlay requests ran 6.2-49.6 s. Matches the auditor's "bare at 28 and 38 s, overlays by 48 s".
- Not reproduced: hero `old-growth-canopy.webp` finished at 9.25 / 9.31 / 9.34 s in three throttled runs, not 38.1 s. Its request starts from the HTML at 0.7 s, and the cutblock prefetch only starts after hydration (about 6.1 s here), so it competes for the last few seconds only. The 38 s came from one Lighthouse run; treat the "hero 38 -> 8 s" gain as unproven.
- Severity: the front door shows an advancing year counter over an empty map for about 25 s of reading on a slow phone, and costs about 17.6 MB per landing view whether or not the reader scrolls. P1 is defensible on that alone. Cross-lane note: "See what's left." over a blank map can read as "nothing is left", which is a CHARTER non-goal 3 risk (a visual outrunning the data), not just slowness.

### SPD-07 -- MapLibre is a static dependency of the landing entry; hero beat 2 stays blank until it downloads
**Verdict: CONFIRMED. Severity overstated: P2, not P1.**

Method (own): `curl` of production `/` (`bundle/landing.html`) and every `<script>` chunk, fingerprinted by content rather than by the auditor's local-build manifest; then `landing-probe.mjs hydr` x2 (Slow 4G + 4x, scroll one screen at 2.5 s, poll `.hero-beat-2` every 250 ms).
- `/_next/static/chunks/2k3w5-vgnrnua.js` is in the landing HTML as `<script async>`: 1,026,025 B raw, 259,399 B br, contains `"5.21.0"`, "Failed to initialize WebGL", 138 `maplibre` mentions. Chunk `31wd45xdfao1f.js` holds both the hero (`old-growth-canopy`) and the story setup (`ocbin`, `story-hillshade`, `addProtocol`). The auditor's page-chunk hash (1j0idxr3vk1rx) differs from production's (31wd45xdfao1f) because that chunk embeds the MapTiler key; the maplibre hash matches. Import chain read in source: `page.tsx:4` -> `HeroSection.tsx:4` -> `prefetch.ts:9-14` -> `setup-layers.ts:12` -> `tile-manifest.ts:26 import { addProtocol } from "maplibre-gl"`. Confirmed.
- Effect: maplibre chunk finished 5.87 / 5.94 s; `.hero-beat-2` at opacity 0 from 2.0 s until `hero-visible` lands at 6.36 / 6.41 s, fully visible 6.86 / 6.92 s (`landing/hydr-1/strip.png`: black at 3.6 and 5.4 s, "5.8 million hectares" at 7.9 s). Reproduces the auditor's 6.06 / 6.6-7.7 s.
- Why P2: only a reader who scrolls within the first ~6 s on a slow connection sees it; unthrottled the chunk finishes by 0.4-0.6 s (`bytes-1/2`). The story mounts ScrollytellingContainer at hydration and needs MapLibre seconds later anyway, so removing it from the entry moves about 259 KB br and its eval out of the hydration path (the auditor's own gain is an estimate, about 1.4 s) but does not remove it from the page. The root cause of the blank is that beat 2 is hidden by CSS until JS hydrates; gating the opacity-0 state on a JS-applied class would show the headline before hydration whatever the bundle, and is a cheaper fix the report does not mention.

## Summary

| id | claimed | verdict | corrected | already tracked? |
|---|---|---|---|---|
| SPD-01 | P0 | confirmed (15/16 runs never land without input, phone included) | P1 | 08-22 P1 marked "shipped"; the shipped fix is ineffective, which is new |
| SPD-02 | P1 | partially confirmed (17.6 MB and bare map reproduce; hero 38 s does not) | P1 | Parking Lot "prefetch gating (~8MB)", size now stale |
| SPD-03 | P1 | confirmed, plus the `load`-event gate as the real queueing mechanism | P1 | 08-22 P2, ROADMAP Batch 3 |
| SPD-04 | P1 | partially confirmed (script -31%, fps 10 -> 38; DEM saving 0.4-0.9 MB, not 2-2.6 MB) | P1 | no |
| SPD-05 | P1 | confirmed (incl. 15.16 MB PMTiles re-download on repeat visit) | P1 | improvement-scan-2026-07 item 2, not on ROADMAP |
| SPD-06 | P1 | confirmed to the KB | P1 | 08-22 P3, ROADMAP Batch 4 |
| SPD-07 | P1 | confirmed | P2 | no |

No finding was a bounding-box-style false positive. Every script, JSON and screenshot cited above is under `verify/performance-evidence/` (scripts/, cam/, landing/, mapreq/, terrain/, warm/, r2/, bundle/, pmtiles/). Repo untouched.
