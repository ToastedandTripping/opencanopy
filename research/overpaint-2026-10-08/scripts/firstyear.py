"""Speed prototype: per-subpixel FIRST year (union semantics) at SSx supersample on the
build-year-overlays.py grid (BC_BOUNDS, width 1024 -> 501 rows, Mercator row remap).
Writes proto/<name>-firstyear-ss.npy (uint8 year index, 255 = never) for the encoders.
Not area-exact (centre-sampling at 1/SS px) but gives a realistic fractional-coverage signal."""
import json, sys, math, time
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_bounds
from scipy.ndimage import map_coordinates
name, path, yfield, kind, y0, y1, cap = sys.argv[1:8]
y0, y1, cap = int(y0), int(y1), float(cap)
SS = int(sys.argv[8]) if len(sys.argv) > 8 else 8
W, (west, south, east, north) = 1024, (-139.5, 48.0, -114.0, 60.5)
H = int(W * (north - south) / (east - west))
w, h = W * SS, H * SS
lines = {}
n = 0
with open(path) as f:
    for line in f:
        try:
            p = json.loads(line).get("properties", {})
        except Exception:
            continue
        raw = p.get(yfield)
        if raw is None: continue
        s = str(raw); t = s[:4] if kind == "date" else s.strip()
        if not t.isdigit(): continue
        y = int(t)
        if y < y0 or y > y1: continue
        if cap > 0:
            try: a = float(p.get("PLANNED_GROSS_BLOCK_AREA") or 0)
            except Exception: a = 0
            if a >= cap: continue
        lines.setdefault(y, []).append(line); n += 1
print(name, "features", n, flush=True)
tr = from_bounds(west, south, east, north, w, h)
fy = np.full((h, w), 255, np.uint8)
t0 = time.time()
for y in sorted(lines):
    geoms = [(json.loads(l)["geometry"], 1) for l in lines[y]]
    geoms = [g for g in geoms if g[0]]
    m = rasterize(geoms, out_shape=(h, w), transform=tr, fill=0, dtype=np.uint8, all_touched=False)
    fy[(m == 1) & (fy == 255)] = y - y0
    lines[y] = None
    print(y, len(geoms), round(time.time() - t0, 1), flush=True)
# Mercator row remap at supersampled height (nearest), as build-year-overlays.py does at 1x
def my(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
mn, ms = my(north), my(south)
rows = np.array([(north - math.degrees(2 * math.atan(math.exp(mn + k / (h - 1) * (ms - mn))) - math.pi / 2)) / (north - south) * (h - 1) for k in range(h)])
fy = fy[np.clip(np.rint(rows).astype(int), 0, h - 1)]
np.save(f"proto/{name}-firstyear-ss{SS}.npy", fy)
print("done", fy.shape, int((fy != 255).sum()), "subpx")
