/**
 * The crash-report link (MapErrorBoundary) is a mailto whose body carries the
 * full page URL, map view included. Until 2026-10-07 the tracker forwarded the
 * whole href as `email_click.email`, so clicking "report this issue" sent that
 * URL to analytics before the reader decided whether to send the email.
 *
 * This runs the shipped public/tracker.js, clicks a real mailto with a body,
 * and decodes what the beacon carried.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const trackerSrc = readFileSync(resolve(__dirname, "../../../public/tracker.js"), "utf-8");

const SENTINEL_URL = "https://opencanopy.ca/map#lat=49.12345&lng=-123.98765&z=11";

function crashReportHref(): string {
  const subject = encodeURIComponent("OpenCanopy map error");
  const body = encodeURIComponent(`Error: boom\nURL: ${SENTINEL_URL}`);
  return `mailto:opencanopymap@gmail.com?subject=${subject}&body=${body}`;
}

describe("tracker email_click", () => {
  let sent: string[];
  let originalBeacon: typeof navigator.sendBeacon | undefined;

  beforeEach(async () => {
    sent = [];
    originalBeacon = navigator.sendBeacon;
    const beacon = vi.fn((_url: string, data: Blob) => {
      sent.push(data as unknown as string);
      return true;
    });
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    new Function(trackerSrc)();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "sendBeacon", { value: originalBeacon, configurable: true });
    document.body.innerHTML = "";
  });

  it("sends the recipient address only, never the subject or body of a crash report", async () => {
    const a = document.createElement("a");
    a.href = crashReportHref();
    a.textContent = "Report this issue";
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const payloads = await Promise.all(sent.map((b) => (b as unknown as Blob).text()));
    const clicks = payloads.map((p) => JSON.parse(p)).filter((p) => p.eventType === "email_click");
    expect(clicks, "no email_click event was sent").toHaveLength(1);
    expect(clicks[0].eventData).toEqual({ email: "opencanopymap@gmail.com" });

    // Decoded, not literal: an encoded body would slip past a plain substring check.
    for (const p of payloads) {
      const decoded = decodeURIComponent(p);
      expect(decoded).not.toContain("lat=49.12345");
      expect(decoded).not.toContain("body=");
      expect(decoded).not.toContain("subject=");
    }
  });
});
