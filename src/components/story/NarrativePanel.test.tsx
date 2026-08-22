/**
 * NarrativePanel a11y regression test (Audit P0).
 *
 * Root cause: the outer wrapper carried `aria-hidden={!active}`, so every
 * INACTIVE chapter panel — i.e. every chapter except whichever one is
 * currently scrolled into view — was pulled out of the accessibility tree.
 * A screen-reader user tabbing/reading through the scroll-story could only
 * ever reach the single active chapter's heading; the rest of the narrative
 * (all 5 chapters in src/data/chapters.ts) was invisible to AT. The
 * opacity/transform visual animation (`cardStyle`) already handles the
 * inactive → invisible-on-screen transition; aria-hidden was redundant and
 * wrong (it hides an inactive-but-about-to-be-active panel from AT even
 * though it's about to become the active, on-screen content).
 *
 * This test is mutation-proof: re-adding `aria-hidden={!active}` to the
 * wrapper makes the inactive panel's heading unreachable via getByRole
 * (Testing Library's role queries are accessibility-tree-aware and exclude
 * anything under an aria-hidden="true" ancestor), so the test fails.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NarrativePanel } from "./NarrativePanel";
import { CHAPTERS } from "@/data/chapters";

afterEach(cleanup);

describe("NarrativePanel a11y", () => {
  it("an INACTIVE panel is not aria-hidden and its heading is queryable via getByRole", () => {
    const { getByRole, container } = render(
      <NarrativePanel
        heading="Before the records began."
        active={false}
        position="left"
      />
    );

    // Direct check: the outer wrapper must not carry aria-hidden at all.
    const wrapper = container.firstElementChild;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.hasAttribute("aria-hidden")).toBe(false);

    // Accessibility-tree check: the heading must be reachable via role query.
    // getByRole throws if the element (or an ancestor) is aria-hidden, so this
    // is the mutation-proof assertion — re-adding aria-hidden={!active} fails it.
    const heading = getByRole("heading", { name: "Before the records began." });
    expect(heading).toBeTruthy();
  });

  it("an ACTIVE panel is also not aria-hidden (sanity — both states unhidden)", () => {
    const { getByRole, container } = render(
      <NarrativePanel heading="See what's left." active={true} position="left" />
    );

    const wrapper = container.firstElementChild;
    expect(wrapper!.hasAttribute("aria-hidden")).toBe(false);
    expect(getByRole("heading", { name: "See what's left." })).toBeTruthy();
  });

  it("all 5 story chapters have a non-empty heading (completeness guard for the panel a11y fix)", () => {
    // 5 since the ending dolly (`remains`) was docked 2026-08-21 — tag dock/dolly-live-scrub.
    expect(CHAPTERS.length).toBe(5);
    for (const chapter of CHAPTERS) {
      expect(chapter.heading.length).toBeGreaterThan(0);
    }
  });

  it("the decorative gradient veil (ScrollytellingContainer) is untouched — separate concern", () => {
    // Documented boundary: ScrollytellingContainer.tsx's top-edge veil div is a
    // decorative, non-narrative element and correctly stays aria-hidden. This
    // test only asserts scope: NarrativePanel itself owns no decorative divs
    // that should remain aria-hidden, so there is nothing to preserve here.
    const { container } = render(
      <NarrativePanel heading="Test" active={false} position="center" />
    );
    expect(container.querySelectorAll("[aria-hidden]").length).toBe(0);
  });
});
