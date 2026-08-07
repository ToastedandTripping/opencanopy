/**
 * DollyVideo fallback state machine — the highest-value test for Phase 2,
 * since real video playback cannot be exercised in this environment (no
 * MapTiler key, R2 serves no CORS to localhost, and the encoded video does
 * not exist yet — rendering is Lee's terminal step).
 *
 * Drives the component's DOM directly (mocked HTMLMediaElement.play, real
 * `ended`/`error` events dispatched on the rendered <video>) to prove the
 * degradation ladder holds:
 *
 *   video -> final-frame still (poster) -> hidden (live map shows through)
 *
 * and that the invariants hold:
 *   - reduced-motion: video.play is NEVER called
 *   - play() rejection AND mid-playback error/stalled BOTH demote to "still"
 *   - onended holds the still (no loop-back to frame 0)
 *   - plays at most once per page load -- re-entry after a play attempt
 *     shows the still directly, without a second play() call
 *   - if even the still poster fails to load, the overlay hides entirely
 *     (no crash, no blank box -- falls through to whatever is behind it)
 *   - no ImageBitmap leak when the poster-decode fetch resolves after unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DollyVideo } from "@/components/story/DollyVideo";

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** A fresh, resolved-by-default mock ImageBitmap with a spyable close(). */
function makeBitmap() {
  return { close: vi.fn() };
}

describe("DollyVideo — fallback state machine", () => {
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeSpy = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      })
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async () => ({ close: closeSpy }))
    );
    // happy-dom's HTMLMediaElement.play() always resolves by default; each
    // test overrides this spy as needed.
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reduced-motion: shows the final-frame still immediately, no <video> is ever created, play() is never called", async () => {
    mockMatchMedia(true);
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, "play");

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });

    expect(container.querySelector("video")).toBeNull();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("desktop-end.webp");
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("play() resolves: mounts a <video> with both WebM and MP4 sources and the start poster", async () => {
    mockMatchMedia(false);

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });

    const video = container.querySelector("video") as HTMLVideoElement;
    // happy-dom does not implement the `poster` IDL property on
    // HTMLVideoElement -- read the attribute directly (what React actually
    // wrote to the DOM regardless of IDL support).
    expect(video.getAttribute("poster")).toContain("desktop-start.webp");
    const sources = Array.from(video.querySelectorAll("source"));
    expect(sources.some((s) => s.getAttribute("type") === "video/webm")).toBe(true);
    expect(sources.some((s) => s.getAttribute("type") === "video/mp4")).toBe(true);
  });

  it("play() rejection (e.g. iOS Low Power Mode) demotes to the final-frame still", async () => {
    mockMatchMedia(false);
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockRejectedValue(
      new DOMException("NotAllowedError")
    );

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });

    expect(container.querySelector("video")).toBeNull();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("desktop-end.webp");
  });

  it("a mid-playback `error` event demotes to the still (not just play() rejection)", async () => {
    mockMatchMedia(false);

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });

    const video = container.querySelector("video") as HTMLVideoElement;
    video.dispatchEvent(new Event("error"));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeNull();
    });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("a mid-playback `stalled` event (network drop) also demotes to the still", async () => {
    mockMatchMedia(false);

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });

    const video = container.querySelector("video") as HTMLVideoElement;
    video.dispatchEvent(new Event("stalled"));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeNull();
    });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("`ended` holds the still (last frame) -- no loop back to the video", async () => {
    mockMatchMedia(false);

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });

    const video = container.querySelector("video") as HTMLVideoElement;
    video.dispatchEvent(new Event("ended"));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeNull();
    });
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("desktop-end.webp");
  });

  it("plays at most once per page load: re-entry after ended shows the still directly, without a second play() call", async () => {
    mockMatchMedia(false);
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const { container, rerender } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    expect(playSpy).toHaveBeenCalledTimes(1);

    const video = container.querySelector("video") as HTMLVideoElement;
    video.dispatchEvent(new Event("ended"));

    await waitFor(() => {
      expect(container.querySelector("video")).toBeNull();
    });

    // Scroll away, then back -- simulates re-entering the `remains` chapter.
    rerender(<DollyVideo tier="desktop" active={false} />);
    rerender(<DollyVideo tier="desktop" active={true} />);

    // Re-entry shows the still immediately -- no video element reappears, and
    // play() is not called a second time.
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("scrolling away mid-playback pauses the video and counts as a consumed attempt (no restart-from-0 on return)", async () => {
    mockMatchMedia(false);
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, "pause");

    const { container, rerender } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });

    // Leave before the clip finishes.
    rerender(<DollyVideo tier="desktop" active={false} />);

    expect(pauseSpy).toHaveBeenCalled();

    // Return -- should show the still, not restart playback.
    rerender(<DollyVideo tier="desktop" active={true} />);
    expect(container.querySelector("video")).toBeNull();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("degradation ladder rung 3: if the still poster ALSO fails to load, the overlay hides entirely", async () => {
    mockMatchMedia(true); // reduced-motion is the simplest deterministic path to "still"

    const { container } = render(<DollyVideo tier="desktop" active={true} />);

    await waitFor(() => {
      expect(container.querySelector("img")).not.toBeNull();
    });

    const img = container.querySelector("img") as HTMLImageElement;
    img.dispatchEvent(new Event("error"));

    await waitFor(() => {
      expect(container.querySelector("img")).toBeNull();
    });
    // No video either -- the overlay contributes nothing visible; whatever
    // sits behind it (the live map) is what the user sees.
    expect(container.querySelector("video")).toBeNull();
  });

  it("no ImageBitmap leak: the decoded poster bitmap is closed even if the fetch resolves after unmount", async () => {
    mockMatchMedia(false);
    let resolveFetch!: (v: { ok: boolean; blob: () => Promise<Blob> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const bitmap = makeBitmap();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const { unmount } = render(<DollyVideo tier="desktop" active={true} />);

    // Unmount BEFORE the poster fetch settles.
    unmount();

    // Now let the fetch resolve -- the component is already gone. fetchBitmap
    // chains fetch -> resp.blob() -> createImageBitmap() -> the effect's
    // .then() -- several microtask hops, so poll rather than guess a count.
    resolveFetch({ ok: true, blob: () => Promise.resolve(new Blob()) });
    await waitFor(() => {
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    });
  });
});
