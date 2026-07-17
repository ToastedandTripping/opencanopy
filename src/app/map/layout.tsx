import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "OpenCanopy | Map",
  description:
    "Interactive conservation map for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats using real-time BC government data.",
};

// E (P2 a11y relay, WCAG 1.4.4/1.4.10): the root layout's viewport export
// no longer sets maximumScale (it was blocking pinch-zoom on the text
// landing + privacy pages). Re-specified here, scoped to the map segment
// only -- maximumScale: 1 is still intentional for the full-screen map
// (prevents iOS auto-zoom from disrupting pan/gesture handling). The full
// object is re-specified rather than a partial override, since Next's
// nesting/merge semantics for `viewport` between a root and nested layout
// aren't documented anywhere in this build's bundled docs (see the relay
// report) -- a full re-spec is correct under either replace or merge
// semantics, and is verified empirically via a build-output grep, not a
// unit test (see the plan).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function MapLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
