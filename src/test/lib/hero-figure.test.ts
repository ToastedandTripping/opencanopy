/**
 * The landing page's headline hectares figure must be backed by the shipped
 * data, and must err low (Lee, 2026-09-02: "better to underestimate than to
 * provide a higher number we can't source").
 *
 * The source of truth is src/data/scrub/cutblocks-scrub.json, built by
 * scripts/build-scrub-tables.py from the preprocessed FTEN checkpoint. Since
 * MEASURE (2026-11, plan 2026-11-measure-fix) "logged hectares" means: cutblocks
 * dated 1950-2025 by DISTURBANCE_START_DATE (undated, pre-1950 and post-2025 out);
 * tenure boundaries out when max(recorded, drawn) >= 2,000 ha (the shared rule in
 * scripts/lib/cutblock_area.py, drawn area on the repaired geometry in EPSG:3005,
 * CAP_HA pinned to CUTBLOCK_AREA_CAP_HA below); area is the dissolved union of drawn
 * area, so overlapping and re-harvested blocks count once. The evidence file is
 * research/measure-2026-11/crosscheck.json: both methods, the accounting and the
 * checkpoint identity. On the 2026-05-06 checkpoint that is 5,731,775.10 ha, down
 * from the 5,888,477.44 ha attribute sum shipped before.
 *
 * Pinned here: the scrub table declares its measure, cap rule, cap and checkpoint;
 * its total equals the evidence file's; it never rises above the shipped figure on a
 * known checkpoint; the hero is at or below it and within 0.1M of it; the chapter
 * carries the hero's figure; the Nova Scotia comparison holds for the hero figure.
 * History: the hero said "8 million" from 2026-06-18 to 2026-09-02 on a count nobody
 * could reproduce, then "5.8 million" on the attribute sum until MEASURE.
 *
 * Mutation-verified 2026-09-02, and again for MEASURE 2026-11-11 (Razor B2):
 * hero above the data fails; hero more than 0.1M under it fails; chapter and
 * hero disagreeing fails; "nearly" or "8 million" in the chapter fails; the
 * pre-MEASURE scrub JSON fails; a crosscheck total off by 0.01 ha fails.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import cutblocksScrub from "@/data/scrub/cutblocks-scrub.json";
import crosscheck from "../../../research/measure-2026-11/crosscheck.json";
import { CHAPTERS } from "@/data/chapters";
import { CUTBLOCK_AREA_CAP_HA } from "@/lib/layers/registry";

const heroSource = readFileSync(
  resolve(__dirname, "../../components/story/HeroSection.tsx"),
  "utf-8"
);

const totalHa = (cutblocksScrub as { total: number }).total;
const totalMillionHa = totalHa / 1e6;

type Checkpoint = { manifestTimestamp: string; bytes: number; sha256: string };
const scrub = cutblocksScrub as {
  total: number;
  areaCap?: number;
  areaMeasure?: string;
  areaCapRule?: string;
  checkpoint?: Checkpoint;
};

// The highest figure ever shipped from each checkpoint: no rebuild from that checkpoint
// may exceed it. 2026-05-06: the attribute sum under the attribute cap, shipped until MEASURE.
const SHIPPED_CEILING_HA: Record<string, number> = {
  "2026-05-06T15:26:00.354Z|1863260083|141f37636c4b921d0dc9a64374f1f7f719ab8e9dbe139d96de0e558b2b50a595": 5888477.44,
};
const checkpointKey = (c?: Checkpoint) => (c ? `${c.manifestTimestamp}|${c.bytes}|${c.sha256}` : "none");

const cutblockAreaPy = readFileSync(resolve(__dirname, "../../../scripts/lib/cutblock_area.py"), "utf-8");

function heroFigure(): number {
  const m = heroSource.match(/(\d+(?:\.\d+)?) million hectares/);
  expect(m, "HeroSection.tsx no longer contains '<n> million hectares'").not.toBeNull();
  return parseFloat(m![1]);
}

function chapterFigure(): number {
  const chapter = CHAPTERS.find((c) => c.id === "logging-timeline");
  expect(chapter, "no logging-timeline chapter").toBeDefined();
  const body = chapter!.body ?? "";
  const m = body.match(/(\d+(?:\.\d+)?) million hectares/);
  expect(m, `logging-timeline body carries no '<n> million hectares': ${body}`).not.toBeNull();
  return parseFloat(m![1]);
}

describe("hero hectares figure is sourced from the shipped scrub table", () => {
  it("the scrub table declares the cutblock area cap the map uses", () => {
    expect(
      (cutblocksScrub as { areaCap?: number }).areaCap,
      "cutblocks-scrub.json has no areaCap: rebuild it with scripts/build-scrub-tables.py (the cap must match CUTBLOCK_AREA_CAP_HA)"
    ).toBe(CUTBLOCK_AREA_CAP_HA);
  });

  it("the builders' cap (scripts/lib/cutblock_area.py CAP_HA) is the map's cap", () => {
    const m = cutblockAreaPy.match(/^CAP_HA = (\d+)$/m);
    expect(m, "cutblock_area.py no longer defines 'CAP_HA = <n>' at top level").not.toBeNull();
    expect(Number(m![1])).toBe(CUTBLOCK_AREA_CAP_HA);
  });

  it("the scrub table declares its measure, cap rule, cap and checkpoint", () => {
    expect(scrub.areaMeasure).toBe("dissolved-union-drawn-ha");
    expect(scrub.areaCapRule).toBe("max(recorded, drawn) >= 2000");
    expect(scrub.areaCap).toBe(2000);
    expect(scrub.checkpoint?.manifestTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(scrub.checkpoint?.bytes).toBeGreaterThan(0);
    expect(scrub.checkpoint?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the scrub total equals the evidence file's, from the same checkpoint", () => {
    expect(scrub.total).toBe(crosscheck.methods.rankUnion.totalHa);
    expect(Math.abs(crosscheck.methods.tileUnion.totalHa - scrub.total)).toBeLessThanOrEqual(1);
    expect(crosscheck.checkpoint).toEqual(scrub.checkpoint);
  });

  it("no public number goes up: the total is at or below the figure shipped from this checkpoint", () => {
    const key = checkpointKey(scrub.checkpoint);
    const ceiling = SHIPPED_CEILING_HA[key];
    expect(ceiling, `no shipped ceiling recorded for checkpoint ${key}: add the figure last shipped from it`).toBeDefined();
    expect(totalHa).toBeLessThanOrEqual(ceiling);
  });

  it("the scrub total is in the range the checkpoint supports (dated 1950-2025, under the cap)", () => {
    // 5.732M ha on the 2026-05-06 checkpoint (MEASURE, dissolved union; it was
    // 5.888M as an attribute sum). A newer FTEN pull may move it; a jump past 7M
    // means the cap stopped applying.
    expect(totalMillionHa).toBeGreaterThan(5);
    expect(totalMillionHa).toBeLessThan(7);
  });

  it("hero figure: at or below the data, and within 0.1M ha of it", () => {
    const hero = heroFigure();
    expect(hero, `hero says ${hero}M but the scrub table totals ${totalMillionHa.toFixed(3)}M`).toBeLessThanOrEqual(totalMillionHa);
    expect(hero, `hero says ${hero}M, needlessly far under ${totalMillionHa.toFixed(3)}M`).toBeGreaterThan(totalMillionHa - 0.1);
  });

  it("the logging chapter carries the hero's figure, and never the old 8 million", () => {
    expect(chapterFigure(), "chapter and hero disagree").toBe(heroFigure());
    const chapter = CHAPTERS.find((c) => c.id === "logging-timeline")!;
    expect(chapter.body).toMatch(/million hectares/);
    expect(chapter.body).not.toMatch(/over 8 million|8 million|nearly/);
  });

  it("the size comparison holds: Nova Scotia is ~5.5M ha", () => {
    // 55,284 km² (Statistics Canada land + freshwater area). If the figure the
    // reader sees ever drops below this, the comparison must change with it.
    expect(heroSource).toMatch(/larger than Nova Scotia/);
    expect(heroSource).not.toMatch(/Ireland/);
    expect(heroFigure()).toBeGreaterThan(5.53);
  });
});
