/**
 * Popup field-label casing consistency — mobile/legibility audit fix.
 *
 * Bug: MapPopup's `formatPropertyName()` maps known property keys to
 * friendly, capitalized labels (e.g. "Classification"), but falls back to
 * `key.replace(/_/g, " ").toLowerCase()` for anything unmapped. Four keys
 * that regularly surface in production popups were unmapped and are
 * themselves already lowercase, so the fallback was a no-op that left them
 * visibly inconsistent with every other (capitalized) label:
 *
 *   - forest-age PMTiles (scripts/pipeline/transform.ts):     class, age, species
 *   - parks/conservancies PMTiles (scripts/lib/extractors.ts): name, designation
 *
 * `class` already had a label ("Classification"). This test locks in labels
 * for the remaining four, and guards the intentional fallback behavior for
 * genuinely-unmapped keys (so a future unmapped key doesn't silently regress
 * to "looks fine" when it isn't).
 */

import { describe, it, expect } from "vitest";
import { formatPropertyName } from "@/components/map/MapPopup";

describe("formatPropertyName — casing consistency", () => {
  it("labels forest-age's simplified-schema keys (class/age/species)", () => {
    expect(formatPropertyName("class")).toBe("Classification");
    expect(formatPropertyName("age")).toBe("Age");
    expect(formatPropertyName("species")).toBe("Species");
  });

  it("labels parks/conservancies' simplified-schema keys (name/designation)", () => {
    expect(formatPropertyName("name")).toBe("Name");
    expect(formatPropertyName("designation")).toBe("Designation");
  });

  it("still labels the existing ALL_CAPS VRI/WFS keys unchanged", () => {
    expect(formatPropertyName("company_id")).toBe("Company");
    expect(formatPropertyName("PROJ_AGE_1")).toBe("Stand Age");
    expect(formatPropertyName("PROTECTED_LANDS_NAME")).toBe("Park Name");
  });

  it("falls back to a title-less lowercase-with-spaces for genuinely unmapped keys", () => {
    // Documents the pre-existing (intentional) fallback for keys with no
    // explicit label -- not a regression target, just a guard so this
    // behavior doesn't silently change.
    expect(formatPropertyName("SOME_UNMAPPED_FIELD")).toBe("some unmapped field");
  });
});
