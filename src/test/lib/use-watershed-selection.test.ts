/**
 * D3 (honest failure states) -- useWatershedSelection must surface a real
 * server/network failure distinctly from a genuine no-watershed click (e.g.
 * an ocean click). Before this fix both collapsed to the same silent
 * mode="selecting" with no signal at all -- a 502 looked exactly like
 * clicking the ocean.
 *
 * Mocks fetch (this environment has no working /api/wfs -- see
 * watershed-client.test.ts for the lower-level client tests).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWatershedSelection } from "@/hooks/useWatershedSelection";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ type: "FeatureCollection", features: [] }),
    ...response,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function watershedFeature() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { WATERSHED_GROUP_NAME: "Fraser River", AREA_HA: 500 },
        geometry: { type: "Polygon", coordinates: [] },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWatershedSelection: error vs empty-result distinction (D3)", () => {
  it("a genuine no-watershed click (ocean) stays in 'selecting' with NO error set", async () => {
    mockFetchOnce({ json: async () => ({ type: "FeatureCollection", features: [] }) });
    const { result } = renderHook(() => useWatershedSelection());

    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-130, 50); // open ocean
    });

    expect(result.current.mode).toBe("selecting");
    expect(result.current.watershed).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("a server failure (502) also stays in 'selecting' but SETS an error message", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    const { result } = renderHook(() => useWatershedSelection());

    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });

    expect(result.current.mode).toBe("selecting");
    expect(result.current.watershed).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("a network failure also sets the error field, distinctly from the ocean-click case", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWatershedSelection());

    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });

    expect(result.current.error).toBeTruthy();
  });

  it("a successful selection clears any prior error", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    const { result } = renderHook(() => useWatershedSelection());
    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });
    expect(result.current.error).toBeTruthy();

    mockFetchOnce({ json: async () => watershedFeature() });
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.mode).toBe("selected");
  });

  it("clear() resets the error field", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    const { result } = renderHook(() => useWatershedSelection());
    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });
    expect(result.current.error).toBeTruthy();

    act(() => result.current.clear());
    expect(result.current.error).toBeNull();
    expect(result.current.mode).toBe("off");
  });

  it("disableMode() resets the error field", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    const { result } = renderHook(() => useWatershedSelection());
    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });
    expect(result.current.error).toBeTruthy();

    act(() => result.current.disableMode());
    expect(result.current.error).toBeNull();
  });

  it("re-enabling mode (enableMode) clears a stale error from a previous attempt", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    const { result } = renderHook(() => useWatershedSelection());
    act(() => result.current.enableMode());
    await act(async () => {
      await result.current.selectAtPoint(-121.5, 49.3);
    });
    expect(result.current.error).toBeTruthy();

    act(() => result.current.enableMode());
    expect(result.current.error).toBeNull();
  });
});
