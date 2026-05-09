import { describe, it, expect } from "vitest";
import { validateTileFlags } from "../../../scripts/lib/validate-tile-flags";

const VALID_CMD = [
  "tippecanoe -o out.pmtiles -P",
  "-Z 4 -z 12",
  "--no-feature-limit",
  "--drop-densest-as-needed",
  "-M 5000000",
  "--low-detail=11",
  "--minimum-detail=10",
  "--full-detail=12",
  "--buffer=64",
  "--attribute-type=FIRE_YEAR:string",
  "--attribute-type=class:string",
  "--attribute-type=age:int",
  "--attribute-type=species:string",
  "--attribute-type=DISTURBANCE_START_DATE:string",
  "--attribute-type=company_id:string",
  "--attribute-type=PLANNED_GROSS_BLOCK_AREA:float",
].join(" ");

describe("validate-tile-flags", () => {
  it("accepts a valid production configuration", () => {
    const result = validateTileFlags(VALID_CMD);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  describe("tile size cap", () => {
    it("rejects -M below 1MB", () => {
      const cmd = VALID_CMD.replace("-M 5000000", "-M 500000");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("below 1MB");
    });

    it("rejects -M above 10MB", () => {
      const cmd = VALID_CMD.replace("-M 5000000", "-M 15000000");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds 10MB");
    });
  });

  describe("zoom sanity", () => {
    it("rejects minzoom >= maxzoom", () => {
      const cmd = VALID_CMD.replace("-Z 4 -z 12", "-Z 12 -z 4");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Zoom range invalid");
    });
  });

  describe("mutual exclusion", () => {
    it("rejects both coalesce and drop flags", () => {
      const cmd = VALID_CMD + " --coalesce-smallest-as-needed";
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("mutually exclusive");
    });

    it("warns when neither strategy is present", () => {
      const cmd = VALID_CMD.replace("--drop-densest-as-needed", "");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("No tile-size reduction"))).toBe(true);
    });
  });

  describe("buffer minimum", () => {
    it("warns when buffer is below 32", () => {
      const cmd = VALID_CMD.replace("--buffer=64", "--buffer=10");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("below 32"))).toBe(true);
    });
  });

  describe("attribute-type coverage", () => {
    it("warns on missing attribute type", () => {
      const cmd = VALID_CMD.replace("--attribute-type=class:string", "");
      const result = validateTileFlags(cmd);
      expect(result.warnings.some((w) => w.includes('"class"'))).toBe(true);
    });
  });

  describe("detail grid sanity", () => {
    it("rejects low-detail < minimum-detail", () => {
      const cmd = VALID_CMD
        .replace("--low-detail=11", "--low-detail=8")
        .replace("--minimum-detail=10", "--minimum-detail=10");
      const result = validateTileFlags(cmd);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("floor exceeds target");
    });
  });
});
