/**
 * The privacy page makes claims a reader can check. Pin the ones that are
 * checkable from the repo, so the page cannot drift from the code again
 * (until 2026-09-02 it said the tracker's source was in this repository
 * while the script was loaded from another site).
 *
 * Mutation-verified 2026-09-02: pointing layout.tsx at a remote tracker
 * fails; deleting public/tracker.js fails; adding `document.cookie` to the
 * tracker fails.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../../..");
const layout = readFileSync(resolve(root, "src/app/layout.tsx"), "utf-8");
const privacy = readFileSync(resolve(root, "src/app/privacy/page.tsx"), "utf-8");
const trackerPath = resolve(root, "public/tracker.js");

describe("privacy page claims are true of the code", () => {
  it("the analytics tracker is served from this site and its source is in the repo", () => {
    expect(existsSync(trackerPath), "public/tracker.js is missing").toBe(true);
    const src = layout.match(/<Script\s+src="([^"]+)"/);
    expect(src, "layout.tsx has no <Script src=…>").not.toBeNull();
    expect(src![1], "the tracker must be same-origin for the 'source is in this repository' claim").toBe("/tracker.js");
  });

  it("the tracker sets no cookies and uses sessionStorage only, as the page says", () => {
    const tracker = readFileSync(trackerPath, "utf-8");
    expect(tracker).not.toMatch(/document\.cookie/);
    expect(tracker).not.toMatch(/localStorage/);
    expect(tracker).toMatch(/sessionStorage/);
    expect(privacy).toMatch(/sessionStorage/);
    expect(privacy).toMatch(/No cookies are set/);
  });

  it("everything the tracker sends is named on the page", () => {
    const tracker = readFileSync(trackerPath, "utf-8");
    // Fields the tracker actually collects (getScreenInfo + trackPageView).
    for (const [field, disclosure] of [
      ["screenWidth", /screen (and viewport )?size/i],
      ["referrer", /referr/i],
      ["pageUrl", /page (URL|address|views)/i],
    ] as const) {
      expect(tracker, `tracker no longer sends ${field}; update this test and the page`).toMatch(new RegExp(field));
      expect(privacy, `the page does not disclose ${field}`).toMatch(disclosure);
    }
  });

  it("the page names where events are received", () => {
    const endpoint = layout.match(/data-endpoint="([^"]+)"/);
    expect(endpoint).not.toBeNull();
    const host = new URL(endpoint![1]).host;
    expect(privacy, `the page must name the receiving host ${host}`).toContain(host);
  });
});
