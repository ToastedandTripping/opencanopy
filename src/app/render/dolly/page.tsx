"use client";

/**
 * Dev-only render route for the dolly frame capture.
 *
 * Renders the real StoryMap frozen to the `remains` chapter state. After the
 * map loads, the Playwright spec (e2e/render/dolly.render.spec.ts) discovers
 * the map instance via ensureMapInstance (React fiber walk) and wires up the
 * imperative camera setter:
 *   window.__setDollyCamera = (cam) => window.__opencanopy_map.jumpTo(cam)
 *
 * Then it loops through frame indices, calling __setDollyCamera, waiting for
 * map idle, and capturing WebP screenshots into a scratch dir. Those frames
 * are later encoded into the WebM/MP4 clip + posters (scripts/encode-dolly.sh)
 * — nothing on this route ships to production.
 *
 * PRODUCTION GUARD: `output:"export"` means this route is rendered at build
 * time with NODE_ENV==="production", so it returns null → inert empty HTML.
 * The render only runs under `next dev` (NODE_ENV==="development").
 *
 * Run: `npm run dev` (one terminal) + `npm run render:dolly` (another).
 */

import { useState } from "react";
import { StoryMap } from "@/components/story/StoryMap";
import { FLAT_BC_CAMERA, type ChapterLayer } from "@/data/chapters";

const REMAINS_LAYERS: ChapterLayer[] = [{ id: "forest-age", opacity: 0.25 }];

export default function RenderDollyPage() {
  // Static export guard: next build SSG runs with NODE_ENV=production
  if (process.env.NODE_ENV === "production") return null;

  // `?tier=desktop|mobile` selects which sequence to render.
  // Parsed client-side via the RenderDollyClient component below.
  return <RenderDollyClient />;
}

// CSS to hide the MapLibre attribution during frame capture.
// StoryMap renders <AttributionControl> which would bake attribution text into
// every captured WebP. DollyVideo renders its own static attribution overlay at
// runtime, so the live control must be absent from frames to avoid doubled text.
const HIDE_ATTRIBUTION_CSS = `.maplibregl-ctrl-attrib { display: none !important; }`;

// Client component — reads the query string and mounts the map.
// Tier is read via a lazy useState initializer with a window guard so the
// SSR pass (window=undefined) defaults to "desktop" without crashing; the
// client pass reads the real ?tier= param. This is a dev-only route with no
// SEO / a11y concerns, so a one-frame hydration mismatch is acceptable.
function RenderDollyClient() {
  const [tier] = useState<"desktop" | "mobile">(() => {
    if (typeof window === "undefined") return "desktop";
    const t = new URLSearchParams(window.location.search).get("tier");
    return t === "mobile" ? "mobile" : "desktop";
  });

  // For dolly rendering the binary tiles are flat, so 3D adds no fidelity.
  const supports3D = false;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: "#0a0a0c",
        overflow: "hidden",
      }}
      data-dolly-tier={tier}
    >
      {/* Hide the live MapLibre attribution so it is not baked into frames.
          DollyVideo renders its own attribution overlay during playback. */}
      <style>{HIDE_ATTRIBUTION_CSS}</style>
      <StoryMap
        camera={FLAT_BC_CAMERA}
        layers={REMAINS_LAYERS}
        yearFilter={null}
        overlays={[]}
        supports3D={supports3D}
        revealBinary={true}
        binaryRevealOpacity={0.85}
      />
    </div>
  );
}

// TypeScript: extend Window for the render helpers exposed by the Playwright spec.
declare global {
  interface Window {
    __opencanopy_map?: import("maplibre-gl").Map;
    __setDollyCamera?: (cam: import("@/data/chapters").ChapterCamera) => void;
  }
}
