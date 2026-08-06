/**
 * Tests for the shared DataFetchError taxonomy (fetch-errors.ts).
 * Verifies construction, kind discrimination, and instanceof behavior.
 */

import { describe, it, expect } from "vitest";
import { DataFetchError } from "@/lib/data/fetch-errors";
import type { FetchErrorKind } from "@/lib/data/fetch-errors";

describe("DataFetchError", () => {
  it("sets name to 'DataFetchError'", () => {
    const err = new DataFetchError("http", "HTTP 500");
    expect(err.name).toBe("DataFetchError");
  });

  it("is an instanceof Error", () => {
    const err = new DataFetchError("network", "Network error");
    expect(err).toBeInstanceOf(Error);
  });

  it("exposes the kind discriminant", () => {
    const kinds: FetchErrorKind[] = ["network", "http", "rate-limit", "timeout", "abort"];
    for (const kind of kinds) {
      expect(new DataFetchError(kind, `test ${kind}`).kind).toBe(kind);
    }
  });

  it("carries retryAfterSeconds when provided", () => {
    const err = new DataFetchError("rate-limit", "Rate limited", 30);
    expect(err.retryAfterSeconds).toBe(30);
  });

  it("retryAfterSeconds is undefined when omitted", () => {
    const err = new DataFetchError("http", "HTTP 502");
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it("message is set correctly", () => {
    const err = new DataFetchError("timeout", "Request timed out");
    expect(err.message).toBe("Request timed out");
  });

  it("can be caught and discriminated by kind in a switch", () => {
    const err = new DataFetchError("rate-limit", "Rate limited", 15);
    let handled = false;
    try {
      throw err;
    } catch (e) {
      if (e instanceof DataFetchError) {
        switch (e.kind) {
          case "rate-limit":
            handled = true;
            expect(e.retryAfterSeconds).toBe(15);
            break;
          default:
            throw new Error("Wrong kind");
        }
      }
    }
    expect(handled).toBe(true);
  });
});
