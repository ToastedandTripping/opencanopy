/**
 * CTA continuity hash builder.
 *
 * Shared between CtaSection.tsx (href) and the CTA-href round-trip test.
 * Format matches useMapState.ts buildHash exactly so the /map page flies
 * to the story's ending camera on arrival.
 *
 * Format: lat=<4dp>&lng=<4dp>&z=<1dp>&layers=forest-age
 * (pitch and bearing are omitted when 0, matching buildHash's behaviour)
 */

import type { ChapterCamera } from "@/data/chapters";

/**
 * Build the /map URL hash fragment from a story camera.
 *
 * The returned string does NOT include the leading '#'; the caller appends it.
 * Matches useMapState.parseHash() round-trip exactly (verified by cta-hash test).
 */
export function buildMapHash(camera: ChapterCamera): string {
  const [lng, lat] = camera.center;
  return (
    `lat=${lat.toFixed(4)}` +
    `&lng=${lng.toFixed(4)}` +
    `&z=${camera.zoom.toFixed(1)}` +
    `&layers=forest-age`
  );
}
