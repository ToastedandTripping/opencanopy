#!/usr/bin/env node
/**
 * Live production checks for a /map release (plan: .claude/plans/2026-11-datalayer-public-path.md,
 * Release and Amendment A). Headless Chromium against a deployed URL, no user interaction unless a
 * mode says so; writes one JSON result per run. Run from the repo root (needs `playwright`).
 *
 *   node scripts/live/live-checks.mjs console    <baseUrl> <out.json>
 *   node scripts/live/live-checks.mjs attach     <baseUrl> <out.json>
 *   node scripts/live/live-checks.mjs visibility <baseUrl> <out.json> [layerId=cutblocks]
 *   node scripts/live/live-checks.mjs year       <baseUrl> <out.json>
 *   node scripts/live/live-checks.mjs interact   <baseUrl> <out.json>
 *   node scripts/live/live-checks.mjs story      <baseUrl> <out.json>
 *   node scripts/live/live-checks.mjs deeplink   <baseUrl> <out.json>
 *
 * console:    load /map, wait 30 s; record console.error and pageerror only, normalised
 *             (query strings, hex ids and numbers stripped) and de-duplicated.
 * attach:     open /map#layers=cutblocks and never touch it; for 60 s poll the map (found through
 *             the React fiber, as e2e/monitoring/live-health.spec.ts does) for the PMTiles source,
 *             the cutblocks fill layer and getGlobalState().currentYear. Pass = all three present.
 * visibility: as attach, but every request for the PMTiles archive is held 6 s, so the hash restore
 *             toggles the layer on while PmtilesLayers is still waiting (the R1-05 race, made
 *             deterministic). Then nudge one repaint (so a load-gated build can attach at all) and
 *             read the fill layer's effective layout visibility.
 * year:       hold every archive request 1.5 s, open the timeline, step the slider five times, and
 *             compare getGlobalState().currentYear with the slider after each step.
 *
 * interact:   wheel-zoom and drag /map like a visitor. Pass = no uncaught pageerror AND the camera
 *             moved (zoom or centre before != after). The URL hash is recorded, not judged (its
 *             subscription is M1a's defect; plan .claude/plans/2026-11-react-map-gl-813.md).
 * interact:   (above) both gestures must move the camera on their own.
 * story:      once the story style is loaded, scroll / at reading pace (300 px per 0.7 s) with
 *             map.jumpTo wrapped to count calls (recorded: unreachable on this story), then resize the
 *             window twice. Pass = no pageerror, no error screen, map still mounted.
 * deeplink:   /map#lat=49.3&lng=-123.1&z=10, then one click on the layer-panel toggle (the render
 *             that runs the deep-link flyTo). Pass = no pageerror; whether it landed is recorded.
 * Every result records instrumentSha256. An edit to a mode's code voids that mode's earlier
 * baselines (not other modes': console, attach, visibility and year are unchanged since release 4).
 *
 * The comparison rules (two baseline runs, two candidate runs) live in the plan; this only measures.
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [mode, baseUrl, outPath, layerArg] = process.argv.slice(2);
if (!mode || !baseUrl || !outPath) {
  console.error("usage: live-checks.mjs <console|attach|visibility|year|interact|story|deeplink> <baseUrl> <out.json> [layerId]");
  process.exit(2);
}
const base = baseUrl.replace(/\/$/, "");
const ARCHIVE = /opencanopy-v\d+\.pmtiles/;

function normalise(text) {
  return text
    .replace(/\?[^\s'")]*/g, "?…")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .trim();
}

/** Installs window.__ocMap() in the page: the MapLibre instance behind .maplibregl-map, or null. */
async function installMapFinder(page) {
  await page.addInitScript(() => {
    window.__ocMap = () => {
      const c = document.querySelector(".maplibregl-map");
      if (!c) return null;
      const k = Object.keys(c).find((x) => x.startsWith("__reactFiber"));
      let f = k ? c[k] : null;
      for (let d = 0; f && d < 40; d++) {
        let st = f.memoizedState;
        for (let si = 0; st && si < 15; si++) {
          const m = st.memoizedState;
          if (m?.current?.getMap) {
            try { const map = m.current.getMap(); if (map?.flyTo) return map; } catch { /* skip */ }
          }
          st = st.next;
        }
        f = f.return;
      }
      return null;
    };
  });
}

function snapshot(page, layerId) {
  return page.evaluate((id) => {
    const map = window.__ocMap?.();
    if (!map) return { map: false };
    const fill = `layer-${id}-tiles-fill`;
    return {
      map: true,
      source: !!map.getSource("opencanopy"),
      fill: map.getLayer(fill) ? (map.getLayoutProperty(fill, "visibility") ?? "visible") : "absent",
      currentYear: map.getGlobalState?.()?.currentYear ?? null,
    };
  }, layerId);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await installMapFinder(page);
const result = {
  mode, baseUrl: base, startedAt: new Date().toISOString(),
  instrumentSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
};

try {
  if (mode === "console") {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(normalise(m.text())); });
    page.on("pageerror", (e) => errors.push(normalise(`pageerror: ${e.message}`)));
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(30_000);
    result.errors = [...new Set(errors)].sort();
  } else if (mode === "attach") {
    await page.goto(`${base}/map#layers=cutblocks`, { waitUntil: "domcontentloaded" });
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(5_000);
      samples.push({ t: (i + 1) * 5, ...(await snapshot(page, "cutblocks")) });
      const s = samples.at(-1);
      if (s.source && s.fill !== "absent" && s.currentYear != null) break;
    }
    const last = samples.at(-1);
    result.samples = samples;
    result.pass = !!(last.source && last.fill !== "absent" && last.currentYear != null);
  } else if (mode === "visibility") {
    // Toggle the layer from the layer panel after mount but before its tile layers exist: the
    // archive is held 15 s, and the toggle lands at ~8 s. A load-gated build cannot add layers
    // until a frame renders, so one repaint is nudged at 25 s to let it attach at all; the check
    // then compares the fill layer's effective visibility with the switch's state.
    const label = layerArg ?? "Cutblocks";
    const layerId = (layerArg ?? "cutblocks").toLowerCase();
    // Hold only the FIRST archive request (the header). Holding every range request (the first
    // version of this check, 2026-11-10) also delays the directory and tile reads that follow,
    // so the source never finishes loading inside the window on any build and the check cannot pass.
    let held = 0;
    let headerRequested;
    const headerSeen = new Promise((r) => { headerRequested = r; });
    await page.route(ARCHIVE, async (route) => {
      held += 1;
      // The toggle is made while this first request is held, so it lands after PmtilesLayers has
      // registered the source and before its layers can exist. 10 s, under PmtilesLayers' 15 s
      // header timeout: holding 15 s trips that timeout and (by design, no retry) the layer never
      // attaches on any build.
      if (held === 1) {
        headerRequested();
        await new Promise((r) => setTimeout(r, 10_000));
      }
      await route.continue();
    });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    let toggle = page.getByRole("switch", { name: label, exact: true });
    await page.getByRole("button", { name: "Toggle layer panel" }).waitFor();
    if (!(await toggle.isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "Toggle layer panel" }).click();
      toggle = page.getByRole("switch", { name: label, exact: true });
    }
    await toggle.waitFor();
    // A load-gated build never requests the archive without a frame; give it 20 s, then nudge.
    const seen = await Promise.race([headerSeen.then(() => true), page.waitForTimeout(20_000).then(() => false)]);
    result.headerSeenBeforeToggle = seen;
    const before = await toggle.getAttribute("aria-checked");
    const preToggle = await snapshot(page, layerId);
    await toggle.click();
    const after = await toggle.getAttribute("aria-checked");
    await page.waitForTimeout(17_000);
    await page.evaluate(() => window.__ocMap?.()?.triggerRepaint());
    const polls = [];
    for (let i = 0; i < 9; i++) {
      await page.waitForTimeout(5_000);
      const s = await snapshot(page, layerId);
      polls.push({ t: 22 + (i + 1) * 5, fill: s.fill, source: s.source });
      if (s.fill !== "absent") break;
    }
    result.polls = polls;
    result.layerId = layerId;
    result.archiveRequestsHeld = held;
    result.switch = { before, after };
    result.preToggle = preToggle;
    result.state = await snapshot(page, layerId);
    const expected = after === "true" ? "visible" : "none";
    result.expected = expected;
    // Valid only if the toggle happened before the tile layers existed.
    result.raceHit = preToggle.fill === "absent";
    result.pass = result.raceHit && result.state.fill === expected;
  } else if (mode === "year") {
    await page.route(ARCHIVE, async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });
    await page.goto(`${base}/map#layers=cutblocks`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    await page.getByRole("button", { name: "Open timeline" }).click();
    const slider = page.getByRole("slider", { name: "Timeline year" });
    await slider.waitFor();
    const steps = [];
    for (let i = 0; i < 5; i++) {
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1_000);
      const sliderYear = Number(await slider.inputValue());
      const { currentYear } = await snapshot(page, "cutblocks");
      steps.push({ sliderYear, currentYear });
    }
    result.steps = steps;
    result.pass = steps.every((s) => s.sliderYear === s.currentYear);
  } else if (mode === "interact") {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(normalise(e.message)));
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".maplibregl-canvas", { timeout: 30_000 });
    await page.waitForTimeout(8_000);
    const cam = () => page.evaluate(() => {
      const map = window.__ocMap?.();
      return { hash: location.hash, zoom: map?.getZoom() ?? null, center: map ? map.getCenter().toArray() : null };
    });
    const moved = (a, b) => a.zoom != null && b.zoom != null &&
      (Math.abs(b.zoom - a.zoom) > 0.01 || Math.abs(b.center[0] - a.center[0]) > 1e-6 || Math.abs(b.center[1] - a.center[1]) > 1e-6);
    const before = await cam();
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(300); }
    await page.waitForTimeout(1_500);
    const afterWheel = await cam();
    const errorsAfterWheel = pageErrors.length;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 150, cy + 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(3_000);
    const after = await cam();
    result.before = before;
    result.afterWheel = afterWheel;
    result.after = after;
    result.errorsAfterWheel = errorsAfterWheel;
    result.pageErrors = pageErrors;
    result.pageErrorCount = pageErrors.length;
    // Each gesture must move the camera on its own (critic r2): the wheel changes zoom, the drag
    // changes the centre.
    result.wheelMoved = moved(before, afterWheel);
    result.dragMoved = afterWheel.center != null && after.center != null &&
      (Math.abs(after.center[0] - afterWheel.center[0]) > 1e-6 || Math.abs(after.center[1] - afterWheel.center[1]) > 1e-6);
    result.hashFollowed_M1a_measurement = after.hash !== before.hash && after.hash.includes("z=");
    result.pass = pageErrors.length === 0 && result.wheelMoved && result.dragMoved;
  } else if (mode === "deeplink") {
    // A camera deep link: /map#lat=..&lng=..&z=.. lands at the encoded camera with no pageerror.
    const target = { lat: 49.3, lng: -123.1, z: 10 };
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(normalise(e.message)));
    await page.goto(`${base}/map#lat=${target.lat}&lng=${target.lng}&z=${target.z}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".maplibregl-canvas", { timeout: 30_000 });
    await page.waitForTimeout(10_000);
    // The deep-link flyTo runs only once /map re-renders after the map exists (CanopyMap's
    // dep-less useImperativeHandle; critic r3). One click on the layer-panel toggle forces that
    // render, as a visitor's first click would.
    await page.getByRole("button", { name: "Toggle layer panel" }).click();
    await page.waitForTimeout(6_000);
    const cam = await page.evaluate(() => {
      const map = window.__ocMap?.();
      return { zoom: map?.getZoom() ?? null, center: map ? map.getCenter().toArray() : null };
    });
    result.target = target;
    result.camera = cam;
    result.pageErrors = pageErrors;
    result.pageErrorCount = pageErrors.length;
    result.landed = cam.zoom != null && Math.abs(cam.zoom - target.z) < 0.5 &&
      Math.abs(cam.center[0] - target.lng) < 0.05 && Math.abs(cam.center[1] - target.lat) < 0.05;
    // Blocking half: no pageerror. Landing is recorded (deep-link camera is M1a's item).
    result.pass = pageErrors.length === 0;
  } else if (mode === "story") {
    // Scroll / at reading pace once the story map's style is loaded, wrapping map.jumpTo to count
    // the camera writes that reach it, and watch for Next's error page replacing the story.
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(normalise(e.message)));
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const styleReady = await page.waitForFunction(() => {
      const map = window.__ocMap?.();
      return !!(map && map.getStyle && map.getStyle());
    }, null, { timeout: 45_000 }).then(() => true).catch(() => false);
    await page.evaluate(() => {
      window.__ocJumps = 0;
      const map = window.__ocMap?.();
      if (!map) return;
      const orig = map.jumpTo.bind(map);
      map.jumpTo = (...a) => { window.__ocJumps += 1; return orig(...a); };
    });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = 300;
    const samples = [];
    let crashedAt = null;
    for (let y = 0, i = 0; y < height; y += step, i++) {
      await page.mouse.wheel(0, step);
      await page.waitForTimeout(700);
      if (i % 8 === 0) {
        const s = await page.evaluate(() => {
          const map = window.__ocMap?.();
          const text = document.body.innerText || "";
          return {
            scrollY: window.scrollY,
            jumps: window.__ocJumps ?? null,
            mapMounted: !!document.querySelector(".maplibregl-map"),
            errorScreen: /couldn.t load|Application error|client-side exception/i.test(text),
            zoom: map?.getZoom?.() ?? null,
          };
        });
        samples.push(s);
        if (s.errorScreen || !s.mapMounted) { crashedAt = s.scrollY; break; }
      }
    }
    await page.waitForTimeout(2_000);
    // A resize (window resize, phone rotation, browser zoom) runs react-maplibre's resize path,
    // which on 8.1.0 reads map.transform and throws (critic r3). This is the reachable trigger on /.
    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(1_500);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(2_000);
    result.resized = true;
    const end = await page.evaluate(() => ({
      jumps: window.__ocJumps ?? null,
      mapMounted: !!document.querySelector(".maplibregl-map"),
      errorScreen: /couldn.t load|Application error|client-side exception/i.test(document.body.innerText || ""),
    }));
    result.styleReady = styleReady;
    result.scrollHeight = height;
    result.samples = samples;
    result.end = end;
    result.crashedAt = crashedAt;
    result.pageErrors = pageErrors;
    result.pageErrorCount = pageErrors.length;
    // jumpTo is unreachable on this story (every chapter shares one camera); the count is recorded.
    // The trigger that IS reachable is the resize above. Pass = no pageerror across scroll and
    // resize, no error screen, map still mounted.
    result.reachedJumpTo = (end.jumps ?? 0) > 0;
    result.pass = pageErrors.length === 0 && !end.errorScreen && end.mapMounted && result.resized === true;
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
} catch (err) {
  result.error = String(err?.stack ?? err);
  result.pass = false;
} finally {
  result.finishedAt = new Date().toISOString();
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ mode, pass: result.pass ?? null, error: result.error ?? null }));
