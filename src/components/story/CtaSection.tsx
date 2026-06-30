"use client";

import { STORY_END_CAMERA } from "@/data/chapters";
import { buildMapHash } from "@/lib/story/map-hash";
import { Footer } from "@/components/landing/Footer";

export function CtaSection() {
  // Build the continuity hash: opens /map at the old-growth pocket with forest-age on.
  // STORY_END_CAMERA is the eyeball-gated destination; buildMapHash matches useMapState.parseHash format.
  const mapHref = `/map#${buildMapHash(STORY_END_CAMERA)}`;

  return (
    <>
      <section className="relative z-10 bg-[var(--color-surface-0)] py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6 text-center">
          {/* Lead-in (moved here from hero Beat 3): the "we mapped everything"
              claim now sits beside the ACTUAL explorable map as the segue into the
              CTA. Previously it preceded the non-interactive scroll story and
              implied that scripted map was the thing to explore. */}
          <p
            className="text-base md:text-lg text-zinc-400"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="font-semibold text-white">We mapped it.</span> Every cutblock, every old-growth stand, every fire.
          </p>
          <h2
            className="mt-5 text-3xl md:text-4xl font-semibold text-white tracking-normal"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Now find your own corner of it.
          </h2>
          <p
            className="mt-4 text-lg text-[var(--color-text-muted)]"
          >
            Your watershed, your valley, the old growth you&apos;ve driven past. It&apos;s all in here.
          </p>

          {/* Primary CTA: "Explore the Map" — label locked per plan (B6 / Lee).
              GitHub link removed from button row; it appears inline in the provenance paragraph. */}
          <div className="mt-10 flex items-center justify-center">
            <a
              href={mapHref}
              className="inline-flex items-center justify-center px-8 py-3 md:px-10 md:py-3.5 rounded-xl md:rounded-[14px] bg-[#34d399] text-black font-semibold text-sm md:text-[15px] hover:bg-[#6ee7b7] active:translate-y-0 md:hover:-translate-y-px transition-[background-color] md:transition-[background-color,transform] duration-150 ease-in-out"
            >
              Explore the Map
            </a>
          </div>

          {/* Divider: 1px rule between CTA group and provenance block.
              Color: var(--color-surface-2) = #1a1a1f. Jen gates at Stage 3 whether
              the rule is needed or the 48px gap alone reads as sufficient separation. */}
          <hr
            className="mt-12 w-full border-0 border-t"
            style={{ borderColor: "var(--color-surface-2)" }}
          />

          <div className="mt-16 max-w-xl mx-auto text-left">
            <h3
              className="text-sm font-semibold text-zinc-300 tracking-wide uppercase"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}
            >
              Where the data comes from
            </h3>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Every layer on this map is built from BC government open data, published through{" "}
              <a href="https://catalogue.data.gov.bc.ca/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-white underline underline-offset-2 transition-colors">DataBC</a>.
              Forest age and old growth come from the{" "}
              <span className="text-zinc-300">Vegetation Resources Inventory (VRI)</span>,
              the province&apos;s official forest survey. Cutblock boundaries come from{" "}
              <span className="text-zinc-300">Forest Tenure (FTEN)</span> records.
              Fire history is from the{" "}
              <span className="text-zinc-300">BC Wildfire Service</span>.
              Parks, conservancy areas, and conservation priority zones are from{" "}
              <span className="text-zinc-300">TANTALIS</span> and the{" "}
              <span className="text-zinc-300">Old Growth Strategic Review</span>.
            </p>
            <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
              Nothing is modelled, estimated, or editorially filtered. If the government
              says a stand is 250 years old, that&apos;s what the map shows. If it says
              it was harvested, same. The{" "}
              <a href="https://github.com/ToastedandTripping/opencanopy" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-300 underline underline-offset-2 transition-colors">full pipeline</a>{" "}
              is open source.
            </p>
          </div>

          <div className="mt-16 flex flex-col items-center gap-3">
            <p className="text-xs text-zinc-500">Support OpenCanopy</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://github.com/sponsors/ToastedandTripping"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 text-zinc-400 text-xs font-medium hover:text-zinc-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
                Sponsor on GitHub
              </a>
              <a
                href="https://ko-fi.com/opencanopy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 text-zinc-400 text-xs font-medium hover:text-zinc-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
                </svg>
                Keep it running
              </a>
            </div>
          </div>

          <p className="mt-10 text-xs text-zinc-500">
            Not affiliated with or endorsed by the Province of British Columbia.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
