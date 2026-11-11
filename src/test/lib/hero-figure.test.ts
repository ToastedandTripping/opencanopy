/**
 * The landing page's headline hectares figure must be backed by the shipped
 * data, and must err low (Lee, 2026-09-02: "better to underestimate than to
 * provide a higher number we can't source").
 *
 * The source of truth is src/data/scrub/cutblocks-scrub.json — built by
 * scripts/build-scrub-tables.py from the same preprocessed FTEN checkpoint the
 * story's red overlay is rasterized from, counting only DATED cutblocks in
 * 1950-2025 and applying the same >= CUTBLOCK_AREA_CAP_HA exclusion the /map
 * cutblocks layer applies (the 230 polygons at 2,000-92,000 ha are tenure
 * boundaries, not cutblocks). History: the hero said "8 million" from
 * 2026-06-18 to 2026-09-02 on a count nobody could reproduce; the checkpoint
 * supports 5.89M ha.
 *
 * MEASURE (2026-11, plan 2026-11-measure-fix): the cap is now
 * max(recorded, drawn) >= 2,000 ha (scripts/lib/cutblock_area.py, CAP_HA pinned to
 * CUTBLOCK_AREA_CAP_HA below), the hero must sit within 0.1M of the data, the total
 * may never rise above the shipped 5,888,477.44 ha on this checkpoint, and the Nova
 * Scotia comparison is checked against the figure the reader sees.
 *
 * Mutation-verified 2026-09-02: hero "6.1 million" fails (over the data);
 * hero "4 million" fails (more than 0.2M under); chapter "over 8 million"
 * fails; scrub table without `areaCap` fails.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import cutblocksScrub from "@/data/scrub/cutblocks-scrub.json";
import { CHAPTERS } from "@/data/chapters";
import { CUTBLOCK_AREA_CAP_HA } from "@/lib/layers/registry";

const heroSource = readFileSync(
  resolve(__dirname, "../../components/story/HeroSection.tsx"),
  "utf-8"
);

const totalHa = (cutblocksScrub as { total: number }).total;
const totalMillionHa = totalHa / 1e6;

// The figure shipped before MEASURE (2026-05-06 checkpoint, attribute sum, attribute cap).
const SHIPPED_TOTAL_HA = 5888477.44;

const cutblockAreaPy = readFileSync(resolve(__dirname, "../../../scripts/lib/cutblock_area.py"), "utf-8");

function heroFigure(): number {
  const m = heroSource.match(/(\d+(?:\.\d+)?) million hectares/);
  expect(m, "HeroSection.tsx no longer contains '<n> million hectares'").not.toBeNull();
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

  it("no public number goes up: the scrub total is at or below the shipped figure on this checkpoint", () => {
    expect(totalHa).toBeLessThanOrEqual(SHIPPED_TOTAL_HA);
  });

  it("the scrub total is in the range the checkpoint supports (dated 1950-2025, under the cap)", () => {
    // 5.888M ha on the 2026-05-06 checkpoint. A rebuild from a newer FTEN
    // pull may move this; a jump past 7M means the cap stopped applying.
    expect(totalMillionHa).toBeGreaterThan(5);
    expect(totalMillionHa).toBeLessThan(7);
  });

  it("hero figure: at or below the data, and within 0.1M ha of it", () => {
    const hero = heroFigure();
    expect(hero, `hero says ${hero}M but the scrub table totals ${totalMillionHa.toFixed(3)}M`).toBeLessThanOrEqual(totalMillionHa);
    expect(hero, `hero says ${hero}M, needlessly far under ${totalMillionHa.toFixed(3)}M`).toBeGreaterThan(totalMillionHa - 0.1);
  });

  it("logging chapter copy says 'nearly 6 million' only while the data is between 5.5M and 6M", () => {
    const chapter = CHAPTERS.find((c) => c.id === "logging-timeline");
    expect(chapter).toBeDefined();
    expect(chapter!.body).toMatch(/nearly 6 million hectares/);
    expect(chapter!.body).not.toMatch(/over 8 million|8 million/);
    expect(totalMillionHa).toBeGreaterThanOrEqual(5.5);
    expect(totalMillionHa).toBeLessThan(6);
  });

  it("the size comparison holds: Nova Scotia is ~5.5M ha", () => {
    // 55,284 km² (Statistics Canada land + freshwater area). If the figure the
    // reader sees ever drops below this, the comparison must change with it.
    expect(heroSource).toMatch(/larger than Nova Scotia/);
    expect(heroSource).not.toMatch(/Ireland/);
    expect(heroFigure()).toBeGreaterThan(5.53);
  });
});
