/**
 * Guard: react-map-gl must not read `map.transform`.
 *
 * Why it exists: MapLibre GL 6 removed the public `map.transform` (the camera
 * now lives at `map._camera.transform`). @vis.gl/react-maplibre 8.1.0 read
 * `map.transform` in its camera-event handler and its resize path, so on
 * MapLibre 6.15 every wheel, drag, zoom, pitch and resize threw
 * "Cannot read properties of undefined (reading 'center')" inside MapLibre's
 * `fire()`, and every programmatic `flyTo` threw before the camera moved.
 * 8.1.3 replaces each read with `getTransformLike(map)`, built from public
 * getters. This test fails if a reinstall, a lockfile regeneration or a
 * downgrade brings the old code back.
 *
 * The suite mocks react-map-gl, so no component test can reach this code;
 * this guard reads the INSTALLED compiled dist and the lockfile instead.
 * It reads the dist by file path because the package's `exports` map hides
 * its package.json and internals from `require.resolve`.
 *
 * Delete it when react-map-gl is replaced, or when MapLibre is no longer 6.x.
 *
 * The two env overrides exist only for its revert proofs (pointing it at a
 * saved 8.1.0 dist or an edited lockfile copy); unset, it reads the real files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const DIST_PATH =
  process.env.RMGL_GUARD_DIST ??
  path.join(ROOT, "node_modules/@vis.gl/react-maplibre/dist/maplibre/maplibre.js");
const LOCK_PATH =
  process.env.RMGL_GUARD_LOCK ?? path.join(ROOT, "package-lock.json");

const MIN_VERSION = "8.1.3";

/** Numeric x.y.z compare; a prerelease suffix sorts below its release. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split("-", 2);
    const nums = core.split(".").map((n) => Number.parseInt(n, 10));
    if (nums.length !== 3 || nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`unparseable version: ${v}`);
    }
    return { nums, pre: pre ?? null };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

describe("react-map-gl guard: no map.transform reads on MapLibre 6", () => {
  it("compareVersions orders patch releases and prereleases", () => {
    expect(compareVersions("8.1.3", "8.1.3")).toBe(0);
    expect(compareVersions("8.1.0", "8.1.3")).toBeLessThan(0);
    expect(compareVersions("8.2.0", "8.1.3")).toBeGreaterThan(0);
    expect(compareVersions("8.1.10", "8.1.3")).toBeGreaterThan(0);
    expect(compareVersions("8.1.3-beta.1", "8.1.3")).toBeLessThan(0);
  });

  it("the installed react-maplibre dist is the camera-event module with the 8.1.3 replacement", () => {
    // Positive sibling of the negative below, so it cannot pass vacuously
    // on an empty or wrong file.
    const src = readFileSync(DIST_PATH, "utf8");
    expect(src).toContain("_onCameraEvent");
    expect(src).toContain("getTransformLike");
  });

  it("the installed react-maplibre dist has no `.transform` read", () => {
    const src = readFileSync(DIST_PATH, "utf8");
    const hits = src
      .split("\n")
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      .filter(({ text }) => /\.transform\b/.test(text));
    expect(hits).toEqual([]);
  });

  it.each(["node_modules/react-map-gl", "node_modules/@vis.gl/react-maplibre"])(
    "package-lock.json resolves %s to 8.1.3 or later",
    (key) => {
      const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as {
        packages: Record<string, { version?: string }>;
      };
      const version = lock.packages[key]?.version;
      expect(version, `${key} missing from lockfile`).toBeTypeOf("string");
      expect(
        compareVersions(version as string, MIN_VERSION),
        `${key} is ${version}, needs >= ${MIN_VERSION}`,
      ).toBeGreaterThanOrEqual(0);
    },
  );
});
