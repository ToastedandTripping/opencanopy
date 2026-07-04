import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Probe A — real cost of the logging-timeline year scrub (Phase 0,
 * sharded-finding-beacon plan). Gates the Phase-3 WebGL-vs-frames decision.
 *
 * What it measures, per animation frame, while script-scrolling the
 * logging-timeline chapter:
 *   - dt: main-thread frame interval (rAF cadence) — the gate metric
 *   - tex: ms spent inside WebGL texImage2D/texSubImage2D (bundle-independent
 *     prototype patch) — attributes jank to GPU texture uploads, which is the
 *     upload half of MapLibre's updateImage() year-swap path
 *   - yearChanged: whether the `.story-year-counter` DOM overlay ticked this
 *     frame — long frames that coincide with year ticks are updateImage cost;
 *     long frames that don't are something else
 *
 * Pre-committed thresholds (decision memo, written BEFORE this probe ran):
 * WebGL gate leg (a) signals GO only if p95 frame time > 20ms OR dropped
 * frames > 5% during the scripted scrub. This spec PRINTS the verdict; it
 * does not assert on it.
 *
 * Run from a machine with real network (Lee's terminal, not the sandbox):
 *   npm run probe:scrub
 * Results land in probe-results/scrub-timing-<timestamp>.json.
 */

// In-page collector, installed before any app code runs.
const COLLECTOR = `
(() => {
  const probe = { texMs: 0, frames: null, running: false };
  const patch = (proto, name) => {
    const orig = proto && proto[name];
    if (!orig) return;
    proto[name] = function (...args) {
      const t0 = performance.now();
      const r = orig.apply(this, args);
      probe.texMs += performance.now() - t0;
      return r;
    };
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    patch(C.prototype, 'texImage2D');
    patch(C.prototype, 'texSubImage2D');
  }
  window.__scrubProbe = {
    start() {
      probe.frames = [];
      probe.running = true;
      let last = null;
      let lastTex = probe.texMs;
      let lastYear = null;
      const loop = (now) => {
        if (!probe.running) return;
        const el = document.querySelector('.story-year-counter');
        const year = el ? el.textContent : null;
        if (last !== null) {
          probe.frames.push({
            dt: now - last,
            tex: probe.texMs - lastTex,
            yearChanged: year !== null && lastYear !== null && year !== lastYear,
          });
        }
        last = now;
        lastTex = probe.texMs;
        if (year !== null) lastYear = year;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    stop() {
      probe.running = false;
      const out = probe.frames || [];
      probe.frames = null;
      return out;
    },
  };
})();
`;

interface FrameRec {
  dt: number;
  tex: number;
  yearChanged: boolean;
}

function summarize(label: string, frames: FrameRec[]) {
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const q = (p: number) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))];
  // Detect the display's real vsync from the median interval instead of
  // assuming 60Hz — a 120Hz display would otherwise read as 50% "dropped".
  const vsync = Math.min(Math.max(q(0.5), 4), 17);
  const elapsed = frames.reduce((s, f) => s + f.dt, 0);
  const expected = elapsed / vsync;
  const dropped = frames.reduce(
    (s, f) => s + Math.max(0, Math.round(f.dt / vsync) - 1),
    0,
  );
  const yearFrames = frames.filter((f) => f.yearChanged);
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  return {
    label,
    frames: frames.length,
    elapsedMs: Math.round(elapsed),
    vsyncMs: +vsync.toFixed(2),
    p50: +q(0.5).toFixed(2),
    p95: +q(0.95).toFixed(2),
    p99: +q(0.99).toFixed(2),
    max: +dts[dts.length - 1].toFixed(2),
    droppedPct: +((100 * dropped) / expected).toFixed(2),
    yearTicks: yearFrames.length,
    meanDtOnYearTick: +mean(yearFrames.map((f) => f.dt)).toFixed(2),
    meanDtOtherwise: +mean(
      frames.filter((f) => !f.yearChanged).map((f) => f.dt),
    ).toFixed(2),
    texUploadTotalMs: +frames.reduce((s, f) => s + f.tex, 0).toFixed(1),
    meanTexOnYearTick: +mean(yearFrames.map((f) => f.tex)).toFixed(2),
  };
}

test('probe: logging-timeline scrub frame timing', async ({ page }) => {
  await page.addInitScript(COLLECTOR);
  await page.goto('/', { waitUntil: 'load' });

  // Map is ssr:false — wait for the GL canvas, then give the hero-mount
  // prefetch a window to warm the HTTP cache, matching what a real reader
  // gets while sitting on the hero.
  await page.waitForSelector('.maplibregl-canvas', { timeout: 60_000 });
  await page.waitForTimeout(8_000);

  // Locate the logging-timeline step (chapter index 2: overview, baseline,
  // logging-timeline). scrollama activates at the 50%-viewport line.
  const span = await page.evaluate(() => {
    const steps = Array.from(document.querySelectorAll<HTMLElement>('.story-step'));
    if (steps.length < 3) return null;
    const el = steps[2];
    const top = el.getBoundingClientRect().top + window.scrollY;
    const vh = window.innerHeight;
    return {
      stepCount: steps.length,
      from: Math.max(0, top - vh * 0.5 - 200),
      to: top + el.offsetHeight - vh * 0.5 + 200,
    };
  });
  expect(span, 'expected the .story-step panels to be present').not.toBeNull();

  const scroll = (from: number, to: number, ms: number) =>
    page.evaluate(
      ({ from, to, ms }) =>
        new Promise<void>((resolve) => {
          const t0 = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - t0) / ms);
            window.scrollTo(0, from + (to - from) * t);
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        }),
      { from, to, ms },
    );

  const runPass = async (label: string, ms: number) => {
    await scroll(span!.from, span!.from, 100); // position at chapter start
    await page.waitForTimeout(2_000); // settle
    await page.evaluate(() => (window as any).__scrubProbe.start());
    await scroll(span!.from, span!.to, ms);
    const frames = (await page.evaluate(() =>
      (window as any).__scrubProbe.stop(),
    )) as FrameRec[];
    return summarize(label, frames);
  };

  const passes = [
    await runPass('slow-sweep-30s', 30_000),
    await runPass('fast-sweep-8s', 8_000),
  ];

  // Idle baseline: hold still mid-chapter so scrub cost has a contrast figure.
  await scroll(span!.from, (span!.from + span!.to) / 2, 500);
  await page.waitForTimeout(1_000);
  await page.evaluate(() => (window as any).__scrubProbe.start());
  await page.waitForTimeout(5_000);
  const idleFrames = (await page.evaluate(() =>
    (window as any).__scrubProbe.stop(),
  )) as FrameRec[];
  passes.push(summarize('idle-hold-5s', idleFrames));

  // Sanity: the scrub actually ran (year counter ticked) and we sampled real frames.
  expect(passes[0].frames).toBeGreaterThan(100);
  expect(
    passes[0].yearTicks + passes[1].yearTicks,
    'no year ticks observed — wrong step index or counter class changed?',
  ).toBeGreaterThan(10);

  // Pre-committed gate thresholds (decision memo): p95 > 20ms OR dropped > 5%.
  const worst = passes
    .filter((p) => p.label !== 'idle-hold-5s')
    .reduce((a, b) => (b.p95 > a.p95 ? b : a));
  const go = worst.p95 > 20 || worst.droppedPct > 5;

  const report = {
    probedAt: new Date().toISOString(),
    baseURL: test.info().project.use.baseURL,
    userAgentNote:
      'Chromium via Playwright; absolute numbers are machine-specific — compare passes, not machines.',
    thresholds: { p95Ms: 20, droppedPct: 5 },
    gateLegA: go ? 'GO (scrub cost is material)' : 'NO-GO (scrub reads cheap)',
    passes,
  };

  const outDir = path.join(process.cwd(), 'probe-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `scrub-timing-${report.probedAt.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('\n=== Probe A: scrub frame timing ===');
  for (const p of passes) {
    console.log(
      `${p.label.padEnd(16)} p50 ${p.p50}ms  p95 ${p.p95}ms  p99 ${p.p99}ms  ` +
        `dropped ${p.droppedPct}%  yearTicks ${p.yearTicks}  ` +
        `dt@tick ${p.meanDtOnYearTick}ms vs ${p.meanDtOtherwise}ms  ` +
        `tex@tick ${p.meanTexOnYearTick}ms`,
    );
  }
  console.log(`Gate leg (a): ${report.gateLegA}`);
  console.log(`Full report: ${outFile}\n`);
});
