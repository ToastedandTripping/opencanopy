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
 * The comparison rules (two baseline runs, two candidate runs) live in the plan; this only measures.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [mode, baseUrl, outPath, layerArg] = process.argv.slice(2);
if (!mode || !baseUrl || !outPath) {
  console.error("usage: live-checks.mjs <console|attach|visibility|year> <baseUrl> <out.json> [layerId]");
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
const result = { mode, baseUrl: base, startedAt: new Date().toISOString() };

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
    // Wheel-zoom and drag the map like a visitor; count uncaught page errors and record whether
    // the URL hash follows the camera. Pass = no pageerror and the hash changed after the moves.
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(normalise(e.message)));
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".maplibregl-canvas", { timeout: 30_000 });
    await page.waitForTimeout(8_000);
    const hashBefore = await page.evaluate(() => location.hash);
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(300); }
    await page.waitForTimeout(1_500);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 150, cy + 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(3_000);
    const after = await page.evaluate(() => {
      const map = window.__ocMap?.();
      return { hash: location.hash, zoom: map?.getZoom() ?? null, center: map ? map.getCenter().toArray() : null };
    });
    result.hashBefore = hashBefore;
    result.after = after;
    result.pageErrors = pageErrors;
    result.pageErrorCount = pageErrors.length;
    result.hashFollowed = after.hash !== hashBefore && after.hash.includes("z=");
    result.pass = pageErrors.length === 0 && result.hashFollowed;
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
