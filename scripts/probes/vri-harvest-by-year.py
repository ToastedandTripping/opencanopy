"""Harvested area by year from the VRI checkpoint (HARVEST_DATE), BC Albers areas.

usage: python3 -I vri_harvest_by_year.py <vri-raw.ndjson> <out.json>
Streams the file; parses only lines whose HARVEST_DATE is non-null. Writes a
checkpoint of the running tallies every 500k lines so a killed run loses little.
"""
import json, re, sys, time
from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Transformer

src, out = sys.argv[1], sys.argv[2]
to_albers = Transformer.from_crs("EPSG:4326", "EPSG:3005", always_xy=True).transform
NULL_HD = '"HARVEST_DATE": null'
by_year, count_year = {}, {}
unparsed = {"count": 0, "ha": 0.0, "samples": []}
lines = harvested = 0
t0 = time.time()

def year_of(v):
    if isinstance(v, (int, float)):  # epoch ms
        return time.gmtime(v / 1000).tm_year
    m = re.match(r"\s*(\d{4})", str(v))
    return int(m.group(1)) if m else None

def dump(final=False):
    json.dump({"source": src, "lines": lines, "harvested_polygons": harvested,
               "ha_by_year": {str(k): round(v, 1) for k, v in sorted(by_year.items())},
               "polygons_by_year": {str(k): v for k, v in sorted(count_year.items())},
               "unparsed": unparsed, "final": final, "seconds": round(time.time() - t0)},
              open(out, "w"), indent=1)

with open(src, "r", encoding="utf-8") as fh:
    for line in fh:
        lines += 1
        if NULL_HD in line or "HARVEST_DATE" not in line:
            if lines % 500000 == 0: dump()
            continue
        try:
            f = json.loads(line.rstrip().rstrip(","))
        except ValueError:
            continue
        hd = f.get("properties", {}).get("HARVEST_DATE")
        if hd in (None, "", "null"):
            continue
        harvested += 1
        try:
            ha = transform(to_albers, shape(f["geometry"])).area / 10000.0
        except Exception:
            continue
        y = year_of(hd)
        if y is None:
            unparsed["count"] += 1; unparsed["ha"] += ha
            if len(unparsed["samples"]) < 5: unparsed["samples"].append(str(hd))
            continue
        by_year[y] = by_year.get(y, 0.0) + ha
        count_year[y] = count_year.get(y, 0) + 1
        if lines % 500000 == 0: dump()
dump(final=True)
print("done", lines, harvested, round(time.time() - t0), "s")
