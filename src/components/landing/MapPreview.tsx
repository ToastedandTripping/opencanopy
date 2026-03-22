/**
 * Map preview for the landing page.
 *
 * Uses a real screenshot of the Eldred Valley terrain.
 * TODO: Replace map-preview.webp with a screenshot showing forest age polygons
 * once the PMTiles layer rendering bug is fixed in production.
 */
export function MapPreview() {
  return (
    <section className="px-6 py-12 md:py-20">
      <div className="max-w-5xl mx-auto">
        <div className="relative aspect-video rounded-xl border border-white/5 overflow-hidden bg-[#0a0a0c]">
          <img
            src="/images/map-preview.webp"
            alt="Forest age classes in BC's Eldred Valley, showing old-growth cedar in dark green surrounded by mature and young forest"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          {/* Subtle overlay gradient for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
        <p className="mt-4 text-sm text-zinc-500 text-center">
          Forest age classes in the Eldred Valley. Green: old growth. Red:
          logged.
        </p>
      </div>
    </section>
  );
}
