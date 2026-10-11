"""Palette study: build the three candidate token sets and run every CVD / contrast check.

Forest-age targets are composites over the measured basemap land (#232323) given in CIE LCh;
loud classes are drawn at 0.85 effective, quiet classes at 0.60, at every zoom. Paint hex =
(target - (1 - a) * land) / a, rounded; every check is recomputed from the rounded paint.
Settings were chosen by tune.py / tune2.py / tune3.py (search logs in ../data/tune*.txt).

Colour science: scripts/colour.py, copied unchanged from the 2026-10 audit (Machado 2009 severity
1.0 on linear RGB, CIEDE2000, sRGB-space alpha compositing as MapLibre blends, WCAG contrast).
Outputs ../data/palettes.json (render input), ../data/checks.json and ../data/checks.csv.
"""
import json, csv, itertools, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from colour import hex2rgb, rgb2hex, composite, de, rgb2lab, contrast
from tune import lch as lch2rgb

OUT = os.path.join(os.path.dirname(__file__), "..", "data")
LAND = hex2rgb("#232323")    # measured, backdrop-dark land (pixels #1b1b1b..#282828)
WATER = hex2rgb("#030303")   # measured
KINDS = [None, "protanopia", "deuteranopia", "tritanopia"]
KN = {None: "normal", "protanopia": "prot", "deuteranopia": "deut", "tritanopia": "trit"}
LOUD, QUIET = 0.85, 0.60


def comp(h, a, base=LAND):
    return composite(hex2rgb(h), a, base)


def lch(rgb):
    L, A, B = rgb2lab(np.asarray(rgb, float))
    return [round(float(L), 1), round(float(np.hypot(A, B)), 1), int(round(float(np.degrees(np.arctan2(B, A)) % 360)))]


def paint_hex(target_rgb, a):
    p = (target_rgb - (1 - a) * LAND) / a
    assert (p > -0.5).all() and (p < 255.5).all(), (target_rgb, a, p)
    return rgb2hex(np.clip(p, 0, 255))


def lift(hx, f):
    c = hex2rgb(hx)
    return rgb2hex(c + f * (255 - c))


WIDTH_EDGE = ["interpolate", ["linear"], ["zoom"], 5, 0.6, 8, 0.9, 10, 1.3, 12, 1.8]

CURRENT = {
    "id": "current", "name": "Current (shipped)",
    "idea": "forest-age-palette.json today: dark-green old growth, bright green mature, orange young, red harvested; cutblock red edge, amber fire.",
    "forestAge": {
        "old-growth": {"hex": "#0d5c2a", "raster": 0.667, "vector": 0.617},
        "mature": {"hex": "#4ade80", "raster": 0.667, "vector": 0.617},
        "young": {"hex": "#f97316", "raster": 0.667, "vector": 0.617},
        "harvested": {"hex": "#ef4444", "raster": 0.667, "vector": 0.617},
        "unknown": {"hex": "#6b7280", "raster": 0.0, "vector": 0.617},
    },
    "cutblocks": {"fill": {"hex": "#dc2626", "opacity": 0.04}, "edge": {"hex": "#dc2626", "opacity": 0.9}},
    "fire": {"fill": {"hex": "#f59e0b", "opacity": 0.55}, "edge": {"hex": "#f59e0b", "opacity": 0.4}},
    "og250": {"hex": "#0d5c2a", "raster": 0.667, "vector": 0.62, "edge": {"hex": "#fbbf24", "opacity": 0.9, "width": 1.5}},
    "parks": {"fill": {"hex": "#34d399", "opacity": 0.26}, "edge": {"hex": "#ffffff", "opacity": 0.4}},
    "tapPriority": {"fill": {"hex": "#eab308", "opacity": 0.45}, "edge": {"hex": "#eab308", "opacity": 0.45}},
    "film": {"ground": "#0a0a0c", "land": {"hex": "#15803d", "opacity": 0.28, "saturation": -0.5},
             "dots": "#f87171", "dotsEnd": 0.30, "fireDots": "#f59e0b", "og": "#0d5c2a", "ogRaster": 0.72,
             "ogEdge": "#4fae72", "redSquare": "#f87171"},
    "accent": "#34d399",
}

SPECS = [
    dict(id="c1", name="Canopy",
         idea="A natural forest map. Old growth is the only vivid green and the brightest data on the map; mature and young are one sage-grey hue at two lightness steps; logging is scarlet. Fire is pale ash, so no third colour competes.",
         og=(74, 50, 146), harv=(50, 80, 38), mat=(30, 5, 140), yng=(46, 5, 140),
         fire=dict(paint=(88, 4, 85), fill=0.55, edge_lift=0.5, edge_opacity=0.85),
         dotsEnd=0.50, accent="og"),
    dict(id="c2", name="Slate",
         idea="Green means old growth and nothing else. Old growth is a cool emerald-teal, the brightest data; mature and young recede into blue-slate greys; logging is vermilion. Fire is pale gold. Built for colour-blind readers first: every loud pair also splits on the blue-yellow axis that red-green colour blindness keeps.",
         og=(68, 46, 166), harv=(52, 75, 42), mat=(30, 5, 262), yng=(46, 5, 262),
         fire=dict(paint=(92, 18, 88), fill=0.60, edge_lift=0.5, edge_opacity=0.85),
         dotsEnd=0.40, accent="og"),
    dict(id="c3", name="Deep",
         idea="Palette E's pair made loud and the rest made quiet: a deep, saturated old-growth green that sits darker than a coral-rose logging red, so the eye lands on what is gone. Mature and young are warm stone greys below both. Fire is drawn mostly as its perimeter, because coral already holds the light end. Closest to the film as it stands.",
         og=(42, 52, 145), harv=(64, 38, 14), mat=(28, 3, 80), yng=(41, 3, 80),
         fire=dict(paint=(92, 6, 88), fill=0.12, edge_lift=0.6, edge_opacity=0.95),
         dotsEnd=0.40, accent="#34d399"),
]


def build(s):
    t = {"old-growth": lch2rgb(*s["og"]), "mature": lch2rgb(*s["mat"]), "young": lch2rgb(*s["yng"]), "harvested": lch2rgb(*s["harv"])}
    alpha = {"old-growth": LOUD, "harvested": LOUD, "mature": QUIET, "young": QUIET}
    fa = {}
    for k, v in t.items():
        p = paint_hex(v, alpha[k])
        fa[k] = {"hex": p, "raster": alpha[k], "vector": alpha[k], "seen": rgb2hex(comp(p, alpha[k])), "targetLCh": list(s[{"old-growth": "og", "mature": "mat", "young": "yng", "harvested": "harv"}[k]])}
    fa["unknown"] = {"hex": "#000000", "raster": 0.0, "vector": 0.0, "note": "unaged stands: no fill at any zoom, matching the raster overview (today the vector draws them #6b7280 from z10)"}
    h, og = fa["harvested"]["hex"], fa["old-growth"]["hex"]
    fp = rgb2hex(lch2rgb(*s["fire"]["paint"]))
    fe = lift(fp, s["fire"]["edge_lift"])
    pal = {
        "id": s["id"], "name": s["name"], "idea": s["idea"], "forestAge": fa,
        "cutblocks": {
            "fill": {"hex": h, "opacity": 0.06},
            "edge": {"hex": h, "opacity": 0.9, "widthNote": "unchanged from today (1 at z5, 1.6 at z8.5, 2.2 at z12) in these renders"},
            "recency": {"field": "DISTURBANCE_START_DATE", "fillOpacity": [[1950, 0.06], [2000, 0.16], [2025, 0.40]],
                        "note": "proposed static default (2026-08 audit C1), same hue, brightness = recency; not rendered (flat 0.06 here)"},
        },
        "fire": {"fill": {"hex": fp, "opacity": s["fire"]["fill"]}, "edge": {"hex": fe, "opacity": s["fire"]["edge_opacity"], "width": WIDTH_EDGE},
                 "seenOverLand": rgb2hex(comp(fp, s["fire"]["fill"]))},
        "og250": {"hex": og, "raster": LOUD, "vector": LOUD,
                  "edge": {"hex": lift(og, 0.45), "opacity": 0.7, "width": ["interpolate", ["linear"], ["zoom"], 8, 0, 10, 0.6, 13, 1.2]}},
        "parks": {"fill": {"hex": "#e5e7eb", "opacity": 0.05}, "edge": {"hex": "#e5e7eb", "opacity": 0.85, "width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 10, 1.4, 13, 2.0]}},
        "tapPriority": {"fill": {"hex": "#a78bfa", "opacity": 0.14}, "edge": {"hex": "#c4b5fd", "opacity": 0.8}},
        "film": {"ground": "#0a0a0c",
                 "land": {"hex": fa["mature"]["hex"], "opacity": QUIET, "saturation": 0,
                          "note": "forest-base.png recoloured to the mature token, so the film's land is /map's mature class and the resolve only adds young and the loud classes"},
                 "dots": h, "dotsEnd": s["dotsEnd"], "fireDots": fp, "og": og, "ogRaster": LOUD, "ogEdge": lift(og, 0.45), "redSquare": h},
        "accent": fa["old-growth"]["seen"] if s["accent"] == "og" else s["accent"],
    }
    def rgbs(hx):
        r = hex2rgb(hx).astype(int); return f"rgb({r[0]},{r[1]},{r[2]})"
    swap = {rgbs(c): rgbs(fa[k]["seen"]) for k, c in [("old-growth", "#0d5c2a"), ("mature", "#4ade80"), ("young", "#f97316"), ("harvested", "#ef4444")]}
    swap[rgbs("#dc2626")] = rgbs(rgb2hex(comp(h, 0.9)))
    swap[rgbs("#f59e0b")] = rgbs(fe)
    pal["swatchSwap"] = swap
    return pal


def checks(pal):
    pid = pal["id"]
    fa = pal["forestAge"]
    cls = ["old-growth", "mature", "young", "harvested"]
    cc = {k: comp(fa[k]["hex"], fa[k]["raster"]) for k in cls}
    rows = []

    def add(group, a_name, a_rgb, b_name, b_rgb, need=15, note=""):
        r = {"palette": pid, "group": group, "a": a_name, "b": b_name, "a_seen": rgb2hex(a_rgb), "b_seen": rgb2hex(b_rgb),
             "L_a": lch(a_rgb)[0], "L_b": lch(b_rgb)[0], "C_a": lch(a_rgb)[1], "C_b": lch(b_rgb)[1],
             "contrast": round(contrast(a_rgb, b_rgb), 2), "need": need, "note": note}
        for k in KINDS:
            r["dE_" + KN[k]] = round(de(a_rgb, b_rgb, k), 1)
        r["dE_min"] = min(r["dE_" + KN[k]] for k in KINDS)
        r["worst_vision"] = min(KN.values(), key=lambda k: r["dE_" + k])
        r["flag"] = "" if need is None else ("FAIL" if r["dE_min"] < 10 else ("MARGINAL" if r["dE_min"] < need else "pass"))
        rows.append(r)

    for a, b in itertools.combinations(cls, 2):
        add("forest-age pair", a, cc[a], b, cc[b], need=(10 if {a, b} == {"mature", "young"} else 15),
            note="quiet pair: a pure lightness step on large adjacent stands" if {a, b} == {"mature", "young"} else "")
    for k in cls:
        add("on the basemap", k, cc[k], "land", LAND, need=10)
    for k in cls:
        add("on the basemap", k + " on water", comp(fa[k]["hex"], fa[k]["raster"], WATER), "water", WATER, need=None, note="coast pixels only")
    e = pal["cutblocks"]["edge"]
    for k in cls:
        add("cutblock edge", "cutblock edge", composite(hex2rgb(e["hex"]), e["opacity"], cc[k]), "over " + k, cc[k],
            need=(None if k == "harvested" else 12), note=("a cutblock on harvested ground is the same fact twice; not required to separate" if k == "harvested" else "edge drawn over this class"))
    add("cutblock edge", "cutblock edge", composite(hex2rgb(e["hex"]), e["opacity"], LAND), "over land", LAND, need=12)
    f = pal["fire"]
    fe = f["edge"]
    for k in cls:
        over = composite(hex2rgb(f["fill"]["hex"]), f["fill"]["opacity"], cc[k])
        add("fire vs logging", f"fire fill over {k}", over, "harvested", cc["harvested"], need=(None if k == "harvested" else 15),
            note=("fire on logged ground is read by its edge (see 'fire reads on')" if k == "harvested" else "fire must stay distinct from logging"))
    add("fire vs logging", "fire fill over land", composite(hex2rgb(f["fill"]["hex"]), f["fill"]["opacity"], LAND), "harvested", cc["harvested"], need=15)
    add("fire vs logging", "fire edge over mature", composite(hex2rgb(fe["hex"]), fe["opacity"], cc["mature"]),
        "cutblock edge over mature", composite(hex2rgb(e["hex"]), e["opacity"], cc["mature"]), need=15)
    for k in cls:
        over = composite(hex2rgb(f["fill"]["hex"]), f["fill"]["opacity"], cc[k])
        add("fire reads on", f"fire fill over {k}", over, k, cc[k], need=None, note="tint only; the edge carries the perimeter")
        add("fire reads on", f"fire edge over {k}", composite(hex2rgb(fe["hex"]), fe["opacity"], over), k, cc[k], need=15)
    o = pal["og250"]
    ogc = comp(o["hex"], o["raster"])
    add("old-growth-250", "og250 fill", ogc, "land", LAND, need=15)
    add("old-growth-250", "og250 edge", composite(hex2rgb(o["edge"]["hex"]), o["edge"]["opacity"], ogc), "og250 fill", ogc, need=None)
    p = pal["parks"]
    add("parks", "parks edge", composite(hex2rgb(p["edge"]["hex"]), p["edge"]["opacity"], LAND), "land", LAND, need=15)
    add("parks", "parks edge", composite(hex2rgb(p["edge"]["hex"]), p["edge"]["opacity"], cc["old-growth"]), "over old-growth", cc["old-growth"], need=12)
    tp = pal["tapPriority"]
    tpe = composite(hex2rgb(tp["edge"]["hex"]), tp["edge"]["opacity"], LAND)
    add("tap-priority", "priority edge", tpe, "fire edge over land", composite(hex2rgb(fe["hex"]), fe["opacity"], LAND), need=15,
        note="both are perimeters; no preset shows them together today")
    add("tap-priority", "priority edge", tpe, "old-growth", cc["old-growth"], need=12)
    fl = pal["film"]
    if pid == "current":
        land = composite(hex2rgb(fl["land"]["hex"]) + 0.5 * (hex2rgb(fl["land"]["hex"]).mean() - hex2rgb(fl["land"]["hex"])), fl["land"]["opacity"], LAND)
    else:
        land = composite(hex2rgb(fl["land"]["hex"]), fl["land"]["opacity"], LAND)
    dend = composite(hex2rgb(fl["dots"]), fl["dotsEnd"], land)
    d62 = composite(hex2rgb(fl["dots"]), 0.62, land)
    ogf = composite(hex2rgb(fl["og"]), fl["ogRaster"], land)
    d25 = composite(hex2rgb(fl["dots"]), 0.25, land)
    fired = composite(hex2rgb(fl["fireDots"]), 0.85, d25)
    add("film", "film land", land, "basemap land", LAND, need=10)
    add("film", "dots .62 (beat 4)", d62, "film land", land, need=15)
    add("film", f"dots {fl['dotsEnd']:.2f} (beats 6-7)", dend, "film land", land, need=12)
    add("film", "old growth (beat 6)", ogf, f"dots {fl['dotsEnd']:.2f}", dend, need=15, note="what's left vs what's gone")
    add("film", "old growth (beat 6)", ogf, "film land", land, need=15)
    add("film", "fire dots .85 (beat 5)", fired, "dots .25", d25, need=15)
    sq_r = composite(hex2rgb(fl["redSquare"]), 0.88, hex2rgb("#0a0a0c") * 0.28 + 0.72 * hex2rgb("#0a0a0c"))
    add("film", "red square", sq_r, "green square", hex2rgb(fl["og"]), need=15, note="beat 6B grid")
    add("ui accent", "accent " + pal["accent"], hex2rgb(pal["accent"]), "old-growth", cc["old-growth"], need=None,
        note="0 = the same green on purpose; 5-15 = a near-miss to avoid")
    return rows, cc


pals = {"current": CURRENT}
for s in SPECS:
    pals[s["id"]] = build(s)
rows, summary = [], {}
for pid, pal in pals.items():
    r, cc = checks(pal)
    rows += r
    summary[pid] = {"name": pal["name"],
                    "seen": {k: {"hex": rgb2hex(v), "LCh": lch(v)} for k, v in cc.items()},
                    "FAIL": [f'{x["a"]} / {x["b"]}: {x["dE_min"]} ({x["worst_vision"]})' for x in r if x["flag"] == "FAIL"],
                    "MARGINAL": [f'{x["a"]} / {x["b"]}: {x["dE_min"]} ({x["worst_vision"]}, need {x["need"]})' for x in r if x["flag"] == "MARGINAL"]}
json.dump(pals, open(os.path.join(OUT, "palettes.json"), "w"), indent=1)
json.dump({"summary": summary, "rows": rows}, open(os.path.join(OUT, "checks.json"), "w"), indent=1)
with open(os.path.join(OUT, "checks.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
for pid, s in summary.items():
    print(f"\n== {pid} {s['name']}")
    for k, v in s["seen"].items():
        print(f"   {k:11s} paint {pals[pid]['forestAge'][k]['hex']} @ {pals[pid]['forestAge'][k]['raster']}  seen {v['hex']}  LCh {v['LCh']}")
    print("   FAIL:", s["FAIL"]); print("   MARGINAL:", s["MARGINAL"])
if "-v" in sys.argv:
    for r in rows:
        print(f'{r["palette"]:7s} {r["group"]:15s} {r["a"][:24]:24s} {r["b"][:24]:24s} L {r["L_a"]:5.1f}/{r["L_b"]:5.1f} n {r["dE_normal"]:5.1f} p {r["dE_prot"]:5.1f} d {r["dE_deut"]:5.1f} t {r["dE_trit"]:5.1f} cr {r["contrast"]:5.2f} {r["flag"]}')
