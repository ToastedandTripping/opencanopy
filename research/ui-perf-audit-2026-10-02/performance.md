# OpenCanopy speed audit -- 2026-10-01

Lane: speed (performance lane of the 4-auditor UI/perf audit). Target: production opencanopy.ca at origin/main.
Status: IN PROGRESS -- findings appended as discovered. Executive summary written last.

## Executive summary

(pending)

## Findings (appended as found; re-ranked at the end)


### [draft] PF-A. Every tile byte rides r2.dev: HTTP/1.1 only, no Cache-Control, no CDN cache (NEW)
Evidence (curl, 2026-10-01 21:35 PDT, `data/` notes):
- `curl -v https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/raster/v3/forest-age/7/20/41.png` -> `ALPN: curl offers h2,http/1.1` / `server accepted http/1.1`; no `alt-svc`, so no HTTP/2 or HTTP/3 either. A browser therefore opens at most 6 connections to this host and every raster PNG, the PMTiles header and every PMTiles range read queue on those 6 sockets.
- Response headers carry `ETag` + `Last-Modified` but NO `Cache-Control` and no `cf-cache-status` (raster PNGs and the 206 PMTiles range alike). Browsers fall back to heuristic freshness (10% of age since Last-Modified); nothing is cached at the Cloudflare edge.
- PMTiles archive `opencanopy-v10.pmtiles` is 3,831,441,244 bytes (`Content-Range: bytes 0-16383/3831441244`).
- Netlify side for comparison: `/_next/static/*` is `public,max-age=31536000,immutable` (good); `/images/story/*.webp` and `/tracker.js` are `public,max-age=0,must-revalidate` (`data/chunks-initial.tsv`).


### [draft] PF-B. Landing page pulls ~19 MB before the reader scrolls one pixel (NEW)
Evidence: Lighthouse 13.5.0 mobile, `data/lh/swiftshader-landing-mobile-sim-cold-1.json` (network-requests audit; per-group sums by `scripts/lhdetail.py`): 333 requests, 18,897,673 bytes total.
- `/raster/fire-by-year/*.png` 110 req, 5.23 MB -- `prefetchFireOverlays()` (src/lib/story/prefetch.ts:163-191) fires 300 ms after story-map load.
- `/raster/cutblocks-by-year/*.png` 78 req, 4.91 MB -- `prefetchYearOverlays()` (prefetch.ts:126-150) called from `HeroSection` mount (src/components/story/HeroSection.tsx:43-45), i.e. at hydration, competing with the hero.
- MapTiler `terrain-rgb-v2` DEM tiles 23 req, 5.41 MB -- TWO hillshades on the same DEM: the basemap style's own `Hillshade` layer on source `terrain_rgb` (backdrop-dark style.json, saved `data/backdrop-dark-style.json`) AND the story's `story-hillshade` on a second raster-dem source `terrain-rgb` at tileSize 256 (src/lib/story/setup-layers.ts:134-158), which requests a different zoom level of the same tileset.
- R2 `raster/v3/binary` 66 req, 0.87 MB -- `prefetchBinaryTiles()` (prefetch.ts:72-112) for the last chapter.
- Hero `old-growth-canopy.webp` 583,686 B (1200x1594, one size for every device, `max-age=0`).
- Code comments understate: "~3MB total" for the cutblock prefetch (prefetch.ts:122) measured 4.91 MB.


### [draft] PF-C. /map fetches tiles for layers that are OFF: 5 forest-age rasters + old-growth raster + satellite (P2 mechanism, now explained)
Code: `DataLayer.tsx` pre-mounts all five forest-age raster `<Source>/<Layer>` pairs (default + 4 classes, lines ~1300-1350) and hides them with `raster-opacity: 0`; `old-growth-250` mounts a sixth raster on the SAME `raster/v2/old-growth` URLs (registry.ts:378-382); `SatelliteLayers` hides with `raster-opacity` 0 too (DataLayer.tsx:151-153, 194-206). MapLibre 5.21 decides whether a source loads tiles from `layer.isHidden(zoom)`, which checks only minzoom/maxzoom and `visibility === 'none'` (node_modules/maplibre-gl/dist/maplibre-gl-dev.js:23648-23655 and the `tileManagers[...].used` loop at 60195-60205). Opacity 0 is not hidden. The in-code comment "MapLibre lazy-loads inactive raster tiles" (DataLayer.tsx ~1290) is false.
Measured:
- `/map` with no hash (fresh profile, no layer chips), LH mobile run `data/lh/map-mobile-sim-cold-2.json`: 112 R2 raster tiles (forest-age v3 16, young 16, mature 16, harvested 16, old-growth 32 = two sources on identical URLs) + 15 `satellite-v2` tiles = ~2.3 MB for an empty map; 6.1 MB total.
- CTA deep link `/map#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age`, desktop unthrottled (`data/smoke/results.jsonl`): 325 requests, 9.42 MB; the visible layer (forest-age v3) is 47 req / 1.41 MB, the four hidden class rasters + duplicated old-growth are 237 req / 4.86 MB; 160 responses are 404 (empty/ocean tiles, no bounds or manifest); every R2 request was `http/1.1`.
- z10 with only `cutblocks` on (`scripts/worker-probe.mjs`): 24 `satellite-v2` tiles fetched with satellite off.


### [draft] PF-D. MapLibre (1.03 MB raw / 259 KB br) is a STATIC dependency of the landing page, through HeroSection's prefetch import (NEW; contradicts the 07-18 scan's "dynamically imported correctly")
Evidence:
- Local `npm run build` (chunk hashes identical to production for every env-independent chunk) -> `.next/server/app/page_client-reference-manifest.js`: entry `[project]/src/app/page.tsx` = `1z6x88ihszho0.js, 1_yen2lonqt45.js, 2k3w5-vgnrnua.js (maplibre), 1j0idxr3vk1rx.js`. Production `/` HTML carries `<script src="/_next/static/chunks/2k3w5-vgnrnua.js" async>` (`data/landing.html`).
- Import chain: `src/app/page.tsx:4` HeroSection (static) -> `HeroSection.tsx:4` `@/lib/story/prefetch` -> `prefetch.ts:9-14` `@/lib/story/setup-layers` -> `setup-layers.ts:12` `@/lib/story/tile-manifest` -> `tile-manifest.ts:26` `import { addProtocol } from "maplibre-gl"`; and `setup-layers.ts:11` pipeline-logger -> `pipeline-logger.ts:18` the full layer registry. String fingerprints confirm the static page chunk `1j0idxr3vk1rx.js` holds both the hero (`old-growth-canopy`, `hero-visible`) and the story map setup (`ocbin`, `story-hillshade`, `terrain-rgb-v2`, `tenure-cutblocks`), while ScrollytellingContainer itself is correctly split into the dynamic chunk `2mc-wuoh0f7b5.js`.
- The `dynamic(..., { ssr: false })` in `src/app/page.tsx:6-12` therefore splits the container but not the engine: Next 16's ssr:false path (`node_modules/next/dist/shared/lib/lazy-dynamic/loadable.js:54-63`) emits no preload, yet maplibre still ships in the entry because HeroSection imports it transitively.
- Phone consequence (`scripts/hydration-probe2.mjs` -> `data/hydration2/summary.txt`, `shots/phone-hero-beat2-before-after-hydration.png`): APPLIED Slow 4G + 4x CPU, reader scrolls one screen at 2.5 s. The second beat ("5.8 million hectares", `.hero-beat-2`, opacity 0 until HeroSection's IntersectionObserver adds `hero-visible`) is a blank black screen at 3.5 s and 5.6 s; the MapLibre chunk finishes at 6.06 s, the beat starts fading in at 6.6 s and is fully visible at 7.7 s. The hero's headline number waits on the map engine.
- Lighthouse applied bootup for the MapLibre chunk on the landing: 5.57 s total / 4.71 s script at 4x (`data/lh/landing-mobile-applied-cold-1.json`).


### [draft] PF-E. The PMTiles archive: who pays for what (quantifies prior P3)
Evidence: `scripts/pmtiles-analyze.mjs` -> `data/pmtiles-analysis.json` (range reads of the live `opencanopy-v10.pmtiles` header, all 44,397 directory entries, and six decoded sample tiles split by top-level MVT layer message).
- Archive 3.83 GB, z4-z12, 12 source-layers, ALL with minzoom 4 (tile-join of 12 per-layer tippecanoe runs, each `-M 5000000 --drop-densest-as-needed`; the 5 MB cap applies per layer BEFORE the join, so joined tiles exceed it).
- Stored (gzip) tile size per zoom: z5 p50 2.1 MB / max 11.5 MB; z7 p50 1.4 MB / p90 6.1 MB / max 6.7 MB; z9 p50 0.50 MB / max 2.0 MB; z10 p50 198 KB; z12 p50 49 KB.
- Decoded z7 tile at the CTA area (VI west, 7/19/43, 10.96 MB uncompressed): forest-age 6,014 KB (55%), forestry-roads 1,709 KB (16%, NOT a public layer), conservation-priority 1,497 KB (14%), tenure-cutblocks 1,374 KB (13%), fire-history 87 KB, parks 16 KB (0.15%). Interior z7 (20/41): forest-age 9,826 of 15,441 KB (64%).
- forest-age vectors are never drawn below z10: `PmtilesLayers` gets `tileMinZoom = rasterMaxZoom + 1 = 10` when a raster overview exists (DataLayer.tsx ~1366-1372). So at z<=9 the majority of every tile is downloaded, gunzipped, parsed in the worker and thrown away; the seven non-public source-layers (forestry-roads, mining-claims, ogma, ungulate-winter-range, wildlife-habitat-areas, community-watersheds, conservancies) add another 12-18% that no public view can render.
- Useful share of a z7 tile by preset (uncompressed bytes as proxy): Overview (raster forest-age + parks) 0.15%; Logging (raster + tenure-cutblocks) 12.5%; Old Growth + Parks (raster + parks + conservation-priority) 13.8%; Fire + Logging 13.3%.


### [draft] PF-F. Prior P1 is NOT fixed: the deep-link camera waits for an unrelated re-render (desktop: never lands without input) -- status REGRESSED/never effective
Evidence: `scripts/deeplink-probe.mjs`, production, real GPU, no throttling, no popstate injection. URL = the landing CTA `/map#lat=49.3800&lng=-125.8600&z=8.0&layers=forest-age`.
- Desktop 1440x900 (`data/deeplink-desktop.txt`): scale bar reads "100 km" (province view) at every 2 s sample from 2.6 s to 30.7 s; one click on an unrelated control ("Toggle layer panel") at 31.6 s and the scale reads "10 km" (z8) 1 s later. Screenshots `shots/deeplink-desktop-before.png` (province, Juneau to Calgary) / `-after.png`.
- Phone 390x844 (`data/deeplink-phone.txt`): landed by 2.6 s in this run. Whether it lands is a race on whether anything happens to re-render the page after MapLibre is created.
- Cause (code): `CanopyMap.tsx:68` `useImperativeHandle(ref, () => mapRef.current!)` has no deps and runs only when CanopyMap renders; react-map-gl fills its own ref after an internal `setMapInstance` (`@vis.gl/react-maplibre/dist/components/map.js:39,74`) that re-renders react-map-gl's `Map`, not CanopyMap. So the page's `mapRef.current` stays null until some page-level state change, and the 120 s poll in `useMapState.ts:166-183` waits for it. The 08-22 capture gotcha ("dispatch popstate to force the hash camera") was this bug, worked around in the harness instead of fixed.
- Speed cost even when it lands: `CanopyMap.tsx:185-187` always constructs at `INITIAL_VIEW_STATE` (BC z5), so every deep link first downloads the province view (CTA desktop run: 12 DEM tiles 2.25 MB + 237 raster requests at z4-z6, 160 of them 404s) and then flies.


### [draft] PF-G. /map interactions on a phone: INP proxy 624 ms; the cost is MapLibre's frame, and 3D terrain is its top function (NEW)
Evidence: `scripts/inp-probe.mjs` -> `data/inp/map-cta-4x-slow4g.txt` (+ `.cpuprofile`). Production CTA deep link, 390x844 @3x, real GPU, APPLIED Slow 4G + 4x CPU (machine shared with three other audit agents: treat absolute ms as upper-bound, ratios as solid).
- Event Timing per interaction (duration = input delay + processing + presentation): tap Logging 336 (57+1+278), tap Old Growth + Parks 360 (33+5+322), tap Fire + Logging 624 (42+14+568), pan 272, open layer panel 248, Esc 48, tap Overview 176. Worst = 624 ms ("poor" is > 500). React's click handling is small (#document.onclick 77-132 ms at 4x); the presentation delay is MapLibre's next frame.
- Long Animation Frames >= 200 ms: 22 in 78 s, the long scripts almost all `FrameRequestCallback 2k3w5-vgnrnua.js:476458` (MapLibre `_render`), 150-540 ms each at 4x.
- Interaction-window CPU profile, top named self-time: `texImage2D` 816 ms, `getTerrainData` 757 ms (MapLibre terrain), `uniformMatrix4fv` 364 ms, `getShaderParameter` 249 ms.
- Cause: `CanopyMap.tsx:71-79` adds a second raster-dem source and calls `map.setTerrain({ source: "terrain-rgb", exaggeration: 1.2 })` on every /map load. Terrain mode renders every layer per tile against the DEM and pulls 256 px DEM tiles (map-plain desktop: 13 tiles, 2.25 MB) even though the map opens flat (pitch 0) and the displacement is invisible top-down.


**PF-G counterfactual (measured on production assets, route-patched in-flight; repo untouched).** `scripts/inp-probe.mjs` with `PATCH=noterrain` serves the /map app chunk with `e.setTerrain({source:"terrain-rgb",exaggeration:1.2})` replaced by `void 0`; the baseline arm (`PATCH=passthrough`) goes through the identical routing. CPU 4x, no network throttle, 2 runs per arm (`data/inp/ab-*.txt|.cpuprofile`):
- MapLibre JS self time over the same 78 s script: base 10.49 s / 10.44 s -> no-terrain 7.45 s / 6.51 s (-33% mean); `getTerrainData` 0.90 / 0.74 s -> 0; total busy main thread 46.5 / 48.7 s -> 44.3 / 40.1 s (-11%).
- Interaction durations, median of 7 per run: base 312 / 416 ms -> no-terrain 272 / 184 ms. Worst-case (INP proxy) is noise-dominated in both arms (592-688 ms) because the worst taps are the ones that pull a new layer's tiles.
- DEM bytes per view, phone, unthrottled, 30 s (`scripts/dem-ab.mjs` -> `data/dem-ab.txt`): CTA 18 tiles 3.23 MB -> 5 tiles 0.60 MB; plain /map 16 tiles 3.38 MB -> 8 tiles 1.43 MB; z10 Logging 15 tiles 3.22 MB -> 6 tiles 1.04 MB. The remainder is the basemap style's own hillshade.


**React is not the bottleneck (checked, so nobody refactors DataLayer for speed).** Interaction-window profiles (`data/inp/ab-base-{1,2}.cpuprofile`, 4x CPU, ~70 s each): react-dom self time 603 / 609 ms, the whole /map app chunk 229 / 224 ms, MapLibre 10.5 s. Timeline playback (`scripts/timeline-probe.mjs` -> `data/inp/timeline-play.txt`, fire-history + cutblocks at z9, 25 s of play at 4x): MapLibre 15.8 s self, react-dom 0.50 s, main thread idle only 0.51 s of 25 s, 212 long animation frames (>= 50 ms; 11 >= 200 ms), i.e. roughly 5-8 frames per second. Of MapLibre's 15.8 s, terrain bookkeeping alone is ~4.1 s (`getTerrainData` 2,020 ms, `_getTerrainCoordsForRegularTile` 1,205, `getSourceTile` 384, `prepareForRender` 264, `getMinMaxElevation` 252) before counting the render-to-texture draws it forces. The DataLayer memo comparator (DataLayer.tsx:1056-1063) does its job; the cost lives in the engine configuration (terrain) and the data volume.


**PF-A, warm-cache evidence.** Persistent profile (real disk cache), phone viewport, Logging preset at z7, unthrottled, second visit (`scripts/warm-persistent.mjs` -> `data/warm-persistent-logging-z7.txt`): Next chunks 15/15 cached; R2 raster PNGs 156/161 cached (heuristic freshness off `Last-Modified`); MapTiler mostly cached (its tiles carry `max-age=14400/28800`); but PMTiles tile ranges 1/7 cached = **15.14 MB re-downloaded on the repeat visit**, the PMTiles header re-fetched, and every R2 404 re-fetched (37 req, 1.01 MB of 27 KB HTML "Not Found" pages). Incognito-context warm runs (`data/mapload/results.jsonl`, `*__warm`) agree: Logging z7 phone warm still pulled 6.16 MB of PMTiles. Byte-range reads of a 3.8 GB object with no `Cache-Control` are not reused by Chrome; and `pmtiles` 4.4.0 forces `cache: "no-store"` for every Chrome-on-Windows visitor (`node_modules/pmtiles/dist/esm/index.js`, FetchSource `chromeWindowsNoCache`).
Source on r2.dev: Cloudflare, "Public buckets": "Public access through r2.dev subdomains is rate-limited and should only be used for development purposes." and "To use features like WAF custom rules, caching, access controls, or Bot Management, you must configure your bucket behind a custom domain." https://developers.cloudflare.com/r2/buckets/public-buckets/
Source on the tile Worker: Protomaps, "Cloudflare": Z/X/Y endpoints from PMTiles in R2 with `Cache-Control` default `public, max-age=86400`; "For the cache to work, the worker must be assigned a zone on your own domain, not workers.dev."; Workers $5/month with 10M requests. https://docs.protomaps.com/deploy/cloudflare

**404 HTML weight.** Every R2 miss returns a 27,150-byte `text/html` page (`curl .../raster/v2/old-growth/5/2/9.png`), uncached. Plain /map desktop cold: 160 of 349 requests are 404s = 4.38 MB (40% of the 10.88 MB); warm: 4.54 MB transferred, of which the 404s are 4.38 MB (96%). By tile bounds: 90 of the 160 lie entirely outside the archive's own bounds (-139.13, 48.22, -113.99, 60.50) and would never be requested if the raster `<Source>`s declared `bounds`; 70 are inside the bbox (ocean, US, Alberta corners).


**PF-B counterfactual: what the hero-only reader would get if the story waited for the story.** Lighthouse 13.5.0, APPLIED Slow 4G + 4x CPU, hardware GPU, `--blocked-url-patterns` (`scripts/lh-landing-ab.sh`, JSON in `data/lh/landing-mobile-applied-*.json`). MapLibre JS still downloads and executes in every arm, so this understates the full deferral.

| arm | score | FCP | LCP | TBT | Speed Index | TTI | bytes | main-thread "Other" |
|---|---|---|---|---|---|---|---|---|
| production (run 1 / run 2) | 0.60 / 0.62 | 2.34 / 2.36 s | 2.36 / 2.38 s | 4.76 / 3.66 s | 5.96 / 4.67 s | 82.5 / 83.2 s | 16.2 / 16.3 MB | 39.8 / 35.8 s |
| no eager prefetch (year + fire overlays, binary tiles blocked) | 0.61 | 2.23 s | 2.30 s | 4.01 s | 5.90 s | 48.3 s | 7.88 MB | 12.9 s |
| + no MapTiler (style, vector tiles, both DEM hillshades blocked) | 0.70 | 2.08 s | 2.10 s | 1.07 s | 5.61 s | 11.0 s | 1.30 MB | 2.6 s |

Hero image finish time in production run 2: 38.1 s (it queues behind the 76 cutblock overlays fired at hydration); with the prefetch blocked: 8.1 s. The hero still renders correctly with the story network blocked (`shots/lh-landing-mobile-applied-noprefetch-nomaptiler-final.jpg`).


### [draft] PF-H. Edge function: off the hot path for every public view, but the CO2 calculator's own data path times out on coastal selections well inside its 500 km2 promise (NEW, point-in-time)
- No `/api/wfs` request in any measured /map view (all reqlogs under `data/mapload/` and `data/smoke/`): public layers are tile-backed, the proxy is reached only by the calculator ("Select area" / "Visible area") and the watershed report.
- Calculator path (`forest-carbon-client.ts`: `layer=forest-age`, `zoom=12`, client timeout 20 s, guard 500 km2), production, 2026-10-01 22:20-22:30 PDT (`scripts/wfs-latency.sh` -> `data/wfs-latency.txt`): VI west 4 km2 3.6 s; 16 km2 2.3 s; 50 km2 3.9 s (and one earlier attempt at zoom=13: edge timeout); 100 km2 11.6 s / 3.07 MB raw; 200 km2 36.2 s -> HTTP 500 "the edge function timed out", repeat 35.4 s / 5.45 MB. Interior 200 km2: 5.6 s. Upstream GeoServer direct (50 features, 50 km2): 1.5 s.
- So a coastal selection somewhere between ~100 and 200 km2 now exceeds the client's 20 s budget and lands on the error state; the July calibration (`forest-carbon-client.ts:39-66`, 500 km2 at 6.08 s in the Kootenays) does not hold for dense coastal VRI today. n=1-2 per size, same caveat the calibration itself carries.
- Watershed report point query: VI west point -> 2,302,487 bytes raw in 22.5 s (first call) and 8.3 s (second); other points 0.46-3.3 s. Responses are brotli on the wire (16 km2: 640 KB raw -> 119 KB), so transfer is not the problem; upstream time is.
- The timed-out 500 carries `cache-control: public, max-age=604800` (same header as success). Chrome does not store 5xx, but any shared cache that honours it would pin the failure for a week.

### [draft] PF-I. Story overlays are 10 MB of RGBA PNG for images with at most 52 colours (NEW)
`public/raster/cutblocks-by-year/*.png` (76, 1024x501 RGBA) 4.78 MB and `fire-by-year/*.png` (109, 768x376 RGBA) 5.21 MB. Distinct colours per image: 2-52. Lossless re-encode (`PIL`, same pixels): palette PNG (quantize to the image's own colour count, `optimize`) 1.77 + 1.60 MB; WebP lossless 1.62 + 1.56 MB. -66% to -70% with zero visual change; served `max-age=0, must-revalidate` from Netlify.


### [draft] PF-J. Time to first vector feature on /map, per preset (prior P2 + P3, re-measured)
Harness: `scripts/mapload.mjs` (results `data/mapload/results.jsonl`, per-run request logs and screenshots under `data/mapload/shots/`). Production, real GPU, fresh incognito context per job (cold) then a second navigation in the same context (warm). Phone = 390x844 @3x, APPLIED Slow 4G (562.5 ms latency, 1,474.56 kbps down) + 4x CPU via CDP (verified to throttle worker fetches too, `scripts/worker-throttle-probe.mjs`). Desktop = 1440x900, unthrottled fibre. View = VI west (49.38, -125.86) at z7/z10, layers as each preset. `popstate` dispatched 1.5 s after the canvas mounts so every run measures its intended view (PF-F). Times are from navigation start; "1st vector tile" is the first PMTiles range read > 20 KB to finish. The desktop `map-plain` and the first pair of `cta__desktop` rows ran without the popstate (camera never left the province view).

| run | canvas | PMTiles hdr sent / done | 1st vector tile | last vector tile | PMTiles MB | total MB | req | 404 | hidden-layer MB | DEM MB | R2 raster req before PMTiles hdr |
|---|---|---|---|---|---|---|---|---|---|---|---|
| map-plain__desktop__cold | 1.8 s | - / - | - | - | 0.0 | 10.9 | 349 | 160 | 6.27 | 2.25 | - |
| map-plain__desktop__warm | 1.2 s | - / - | - | - | 0.0 | 4.5 | 350 | 160 | 4.38 | 0.00 | - |
| cta__desktop__cold | 1.5 s | 4.0 s / 4.1 s | - | - | 0.0 | 7.9 | 272 | 50 | 3.14 | 2.33 | 175 |
| cta__desktop__warm | 0.9 s | 4.6 s / 4.8 s | - | - | 0.0 | 1.6 | 273 | 50 | 1.15 | 0.00 | 175 |
| cta__desktop__cold | 1.1 s | 4.5 s / 4.6 s | - | - | 0.0 | 7.9 | 272 | 50 | 3.14 | 2.33 | 175 |
| cta__desktop__warm | 0.7 s | 5.6 s / 5.6 s | - | - | 0.0 | 6.8 | 374 | 81 | 1.69 | 2.05 | 239 |
| overview-z7__desktop__cold | 1.6 s | 8.7 s / 9.0 s | 10.1 s | 12.4 s | 26.5 | 42.4 | 492 | 133 | 5.70 | 3.95 | 331 |
| logging-z7__desktop__cold | 0.9 s | 16.1 s / 17.0 s | 18.1 s | 20.3 s | 26.5 | 43.9 | 505 | 135 | 5.75 | 5.34 | 332 |
| protection-z7__desktop__cold | 1.0 s | 5.0 s / 5.4 s | 7.3 s | 19.5 s | 26.5 | 39.5 | 412 | 115 | 5.56 | 3.95 | 276 |
| firelog-z7__desktop__cold | 1.1 s | 6.1 s / 6.3 s | 7.1 s | 9.3 s | 26.5 | 39.5 | 412 | 115 | 5.47 | 3.95 | 276 |
| overview-z10__desktop__cold | 1.9 s | 3.1 s / 3.4 s | 4.0 s | 4.7 s | 3.0 | 8.0 | 101 | 0 | 0.92 | 3.04 | 0 |
| logging-z10__desktop__cold | 1.4 s | 3.8 s / 4.1 s | 4.7 s | 5.4 s | 3.0 | 8.0 | 101 | 0 | 0.92 | 3.04 | 0 |
| protection-z10__desktop__cold | 1.7 s | 4.6 s / 4.9 s | 5.5 s | 6.0 s | 3.0 | 10.9 | 176 | 19 | 2.08 | 3.04 | 50 |
| firelog-z10__desktop__cold | 1.0 s | 1.9 s / 2.1 s | 2.6 s | 3.1 s | 3.0 | 8.0 | 101 | 0 | 0.92 | 3.04 | 0 |
| map-plain__phone__cold | 5.7 s | 33.7 s / 34.4 s | - | - | 0.0 | 6.1 | 168 | 6 | 2.34 | 1.96 | 96 |
| map-plain__phone__warm | 4.0 s | 14.3 s / 15.8 s | - | - | 0.0 | 0.3 | 169 | 6 | 0.16 | 0.00 | 96 |
| cta__phone__cold | 6.7 s | 20.0 s / 20.6 s | - | - | 0.0 | 3.6 | 110 | 8 | 0.99 | 1.21 | 55 |
| cta__phone__warm | 4.6 s | 10.4 s / 10.6 s | - | - | 0.0 | 0.4 | 111 | 8 | 0.19 | 0.00 | 55 |
| overview-z7__phone__cold | 7.5 s | 33.1 s / 34.0 s | 39.8 s | 120.7 s | 15.1 | 20.9 | 189 | 31 | 2.17 | 1.53 | 108 |
| logging-z7__phone__cold | 6.7 s | 31.3 s / 32.0 s | 37.5 s | 99.9 s | 6.1 | 11.9 | 189 | 31 | 2.17 | 1.53 | 108 |
| logging-z7__phone__warm | 3.0 s | 11.7 s / 13.3 s | 20.9 s | 79.6 s | 6.1 | 7.1 | 190 | 31 | 0.71 | 0.00 | 108 |
| protection-z7__phone__cold | 6.0 s | 30.4 s / 31.3 s | 37.0 s | 99.2 s | 6.1 | 11.9 | 189 | 31 | 2.35 | 1.53 | 108 |
| firelog-z7__phone__cold | 6.0 s | 30.5 s / 31.2 s | 36.8 s | 99.1 s | 6.1 | 11.9 | 189 | 31 | 2.17 | 1.53 | 108 |
| overview-z10__phone__cold | 5.9 s | 14.1 s / 14.9 s | 29.4 s | 32.4 s | 1.8 | 5.2 | 64 | 0 | 0.32 | 2.18 | 0 |
| logging-z10__phone__cold | 6.1 s | 14.4 s / 15.1 s | 29.7 s | 32.7 s | 1.8 | 5.2 | 64 | 0 | 0.32 | 2.18 | 0 |
| protection-z10__phone__cold | 6.5 s | 14.6 s / 15.3 s | 29.9 s | 32.9 s | 1.8 | 5.2 | 64 | 0 | 0.32 | 2.18 | 0 |
| protection-z10__phone__warm | 2.6 s | 4.1 s / 5.2 s | 10.6 s | 16.7 s | 1.8 | 1.9 | 65 | 0 | 0.00 | 0.00 | 0 |
| firelog-z10__phone__cold | 6.4 s | 14.9 s / 15.8 s | 30.8 s | 33.6 s | 1.8 | 5.2 | 64 | 0 | 0.32 | 2.18 | 0 |

Visual progress (screenshots every 2-3 s vs the run's final frame, `scripts/visual-progress.py`; includes the basemap, so it measures "screen settled", not "requested layer visible"):

| run | 50% visual | 90% visual | frames |
|---|---|---|---|
| cta__desktop__cold | 3.5 s | 3.5 s | 60 |
| cta__desktop__warm | 2.9 s | 4.9 s | 60 |
| cta__phone__cold | 14.2 s | 20.2 s | 12 |
| cta__phone__warm | 9.7 s | 12.7 s | 9 |
| firelog-z10__desktop__cold | 6.6 s | 6.6 s | 15 |
| firelog-z10__phone__cold | 35.0 s | 38.0 s | 15 |
| firelog-z7__desktop__cold | 4.7 s | 8.7 s | 15 |
| firelog-z7__phone__cold | 13.5 s | 31.5 s | 37 |
| logging-z10__desktop__cold | 9.0 s | 11.0 s | 15 |
| logging-z10__phone__cold | 34.7 s | 34.7 s | 15 |
| logging-z7__desktop__cold | 4.4 s | 24.5 s | 18 |
| logging-z7__phone__cold | 14.3 s | 32.3 s | 37 |
| logging-z7__phone__warm | 8.1 s | 17.1 s | 31 |
| map-plain__desktop__cold | 3.8 s | 3.8 s | 45 |
| map-plain__desktop__warm | 3.2 s | 5.2 s | 45 |
| map-plain__phone__cold | 17.7 s | 35.7 s | 18 |
| map-plain__phone__warm | 7.0 s | 16.4 s | 11 |
| overview-z10__desktop__cold | 7.5 s | 7.5 s | 15 |
| overview-z10__phone__cold | 34.4 s | 34.4 s | 15 |
| overview-z7__desktop__cold | 5.2 s | 7.2 s | 58 |
| overview-z7__phone__cold | 15.1 s | 33.1 s | 44 |
| protection-z10__desktop__cold | 9.4 s | 9.4 s | 15 |
| protection-z10__phone__cold | 35.1 s | 35.1 s | 15 |
| protection-z10__phone__warm | 19.2 s | 19.2 s | 11 |
| protection-z7__desktop__cold | 4.6 s | 22.6 s | 17 |
| protection-z7__phone__cold | 16.5 s | 31.5 s | 37 |

Filmstrip, Logging preset z7, phone, cold (`shots/phone-logging-z7-strip.png`): basemap only at 8 s; forest-age raster by 20 s; the cutblock outlines the lit "Logging" chip promises are still absent at 59 s and present at 116 s.


**PF-J counterfactual, round 1 (terrain removed + raster `bounds` + satellite tiles not requested).** `scripts/run-map-ab.sh`: production as-is (`PATCH=passthrough`, same chunk routing) vs `PATCH=noterrain,bounds` + satellite aborted, phone, applied Slow 4G + 4x CPU, 2 runs per arm (`data/mapab/base/`, `data/mapab/fix-terrain-bounds-sat/`). (Round 1 meant to also drop the hidden class rasters; a Playwright route-precedence bug let them through, so this arm isolates terrain + bounds + satellite. Round 2 below adds them.)
- Logging z7: PMTiles header requested 32.9 / 30.5 s -> 26.9 / 26.9 s; first vector tile 41.5 / 39.1 s -> 30.7 / 30.8 s (-9.5 s, -24%); last vector tile 107 / 123 s -> 91 / 91 s; bytes 14.4 / 23.4 MB -> 11.9 / 11.9 MB; 404s 31 -> 13; DEM 2.56 -> 1.03 MB.
- CTA (z8, raster only): bytes 5.7 / 5.7 MB -> 4.2 / 4.2 MB (-26%); DEM 1.81 -> 0.60 MB.


**PF-J counterfactual, round 2 (round 1 + the five hidden raster sets not requested).** `scripts/run-map-ab2.sh` -> `data/mapab/fix2/`, same profile, 2 runs (request counts include the aborted requests, bytes do not):
- Logging z7: PMTiles header requested 18.6 / 16.6 s (production 32.9 / 30.5 s); **first vector tile 22.6 / 20.5 s (production 41.5 / 39.1 s): -19 s, -47%**; last vector tile 83 / 81 s (production 107 / 123 s); 10.4 MB (production 14.4 / 23.4 MB); 404s 2 (production 31).
- CTA: PMTiles header 11.5 / 11.8 s (production 17.3 / 19.0 s); 3.3 MB (production 5.7 MB); 404s 1 (production 8).
- What is left after round 2 is the archive itself: 6.1 MB of PMTiles for four z7 tiles at ~188 KB/s, i.e. the last tile still lands at ~82 s (PF-E is the fix for that).


### [draft] PF-K. On Slow 4G the story scrolls smoothly over an empty map: the eager prefetch queue starves the chapter that is on screen (NEW)
Evidence: `scripts/scroll-probe.mjs`, production `/`, phone 390x844 @3x, real GPU, APPLIED Slow 4G + 4x CPU; the reader reads the hero for 12 s, then scrolls.
- Fast skim (120 px / 150 ms, `data/scroll/landing-4x-slow4g/summary.txt`): 55.2 fps, frame p50 17 ms / p99 50 ms, 9 long animation frames totalling 613 ms in 25 s. Scrolling itself is fine.
- But the map under the chapters (`shots/phone-landing-scroll-slow4g-strip.png`, frames at 17 / 23 / 28 / 33 s) is the bare basemap: no forest base, no cutblock overlay, no reveal, while the year counter reads "1998" at 23 s. At that moment the network is still working through the 185-image prefetch queue (production LH applied run: cutblock overlays 7.1-81.8 s, fire overlays 48.6-82.5 s, basemap style requested only at 15.9 s, DEM until 89 s).
- Reading pace (60 px / 300 ms, ~200 px/s, `data/scroll/landing-4x-slow4g-reading/summary.txt`, `shots/phone-landing-scroll-reading-strip.png`): 57.7 fps, p99 frame 33 ms; the map is still bare at 28 s and 38 s (counter "1986" at 38 s over an empty map) and the first overlays appear by 48 s. A phone reader on Slow 4G reads roughly the first 25 seconds of the story (the "See what's left" and early cutblock beats) over nothing.
- Cross-lane note: a year counter advancing over a map that has not drawn that year is the story-side twin of the render-gated playhead rule (CHARTER non-goal 3); flagged here for the visual lane, measured here for cause.

## Measurement log

## Prior findings: status

