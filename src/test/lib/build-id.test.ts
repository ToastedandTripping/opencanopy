import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBuildId } from "@/lib/build-id";

const SHA = "120cc100aa11bb22cc33dd44ee55ff6677889900";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-mock" });
  return { Literata: font, Public_Sans: font };
});
vi.mock("next/script", () => ({ default: () => null }));

describe("resolveBuildId", () => {
  it("passes a full lowercase SHA through on the buildbot", () => {
    expect(resolveBuildId(SHA, undefined)).toBe(SHA);
  });

  it.each([
    ["undefined", undefined],
    ["empty", ""],
    ["short", SHA.slice(0, 7)],
    ["39 characters", SHA.slice(0, 39)],
    ["41 characters", `${SHA}0`],
    ["uppercase", SHA.toUpperCase()],
    ["a SHA with a trailing newline", `${SHA}\n`],
    ["a SHA embedded in other text", `ref-${SHA}`],
  ])("gives local for a ref that is %s", (_label, ref) => {
    expect(resolveBuildId(ref, undefined)).toBe("local");
  });

  it.each(["true", "", "false"])(
    "gives local for a valid SHA when NETLIFY_LOCAL is set, here to %j",
    (netlifyLocal) => {
      expect(resolveBuildId(SHA, netlifyLocal)).toBe("local");
    },
  );
});

describe("root layout metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadOther() {
    vi.resetModules();
    const { metadata } = await import("@/app/layout");
    return metadata.other;
  }

  it("stamps the SHA a buildbot build was given", async () => {
    vi.stubEnv("COMMIT_REF", SHA);
    vi.stubEnv("NETLIFY_LOCAL", undefined);
    expect(await loadOther()).toEqual({ "oc-build": SHA });
  });

  it("stamps local when no ref is set", async () => {
    vi.stubEnv("COMMIT_REF", undefined);
    vi.stubEnv("NETLIFY_LOCAL", undefined);
    expect(await loadOther()).toEqual({ "oc-build": "local" });
  });

  it("stamps local on a Netlify CLI build, which sets a real ref", async () => {
    vi.stubEnv("COMMIT_REF", SHA);
    vi.stubEnv("NETLIFY_LOCAL", "true");
    expect(await loadOther()).toEqual({ "oc-build": "local" });
  });
});
