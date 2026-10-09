"""Stall model on the perf audit's Slow 4G profile (landing-probe.mjs:26-27):
188,744 B/s down, 562.5 ms per-request latency, HTTP/2 multiplexed FIFO.
Assets requested at t_req (s after first scroll), served in need-order after `compete` bytes
(basemap/terrain for beats 1-2). Film clock (beat sheet): beat 3 starts 14 s, 1900-1959 as 12
frames at 0.42 s; beat 4 1960-2025 at 0.41 s/yr; beat 5 fire 2017-2025 at 0.7 s/yr.
A frame plays at max(scheduled, arrival + decode); delays carry forward (clock waits)."""
import os, sys, json
B, RTT = 188744.0, 0.5625
R = '/home/leesalo/.local/share/marvin/worktrees/opencanopy/intro-spike/public/raster'
def sz(d, y): return os.path.getsize(f'{R}/{d}/{y}.png')
def schedule():
    ev = []; t = 14.0
    for y in range(1904, 1960, 5): ev.append((y, 'cut', t)); t += 0.42
    for y in range(1960, 2026): ev.append((y, 'cut', t)); t += 0.41
    t += 0.8
    for y in range(2017, 2026): ev.append((y, 'fire', t)); t += 0.7
    return ev
def run(name, assets, compete, t_req=0.0, decode=0.0):
    """assets: list of (bytes, [frame keys it unlocks]) in fetch order."""
    arrive = {}; cum = compete
    for b, keys in assets:
        cum += b; a = t_req + RTT + cum / B + decode
        for k in keys: arrive[k] = a
    lag = 0.0; first = None; stalls = 0; worst = 0
    for y, kind, t in schedule():
        k = (kind, y); s = t + lag; a = arrive[k]
        if a > s: stalls += 1; worst = max(worst, a - s); lag += a - s; s = a
        if first is None: first = s
    tot = sum(b for b, _ in assets)
    return dict(name=name, bytes=tot, requests=len(assets), compete_MB=compete / 1e6, first_frame_s=round(first, 1),
                stall_events=stalls, total_stall_s=round(lag, 1), worst_stall_s=round(worst, 1))
def today():
    a = [(sz('cutblocks-by-year', 'forest-base'), [])]
    for y in range(1904, 1960, 5): a.append((sz('vri-harvest-by-year', y), [('cut', y)]))
    for y in range(1960, 2000): a.append((sz('vri-harvest-by-year', y), [('cut', y)]))
    for y in range(2000, 2026): a.append((sz('cutblocks-dated-by-year', y), [('cut', y)]))
    for y in range(2017, 2026): a.append((sz('fire-since-2017-by-year', y), [('fire', y)]))
    return a
def chunks(spec):
    """spec: list of (bytes, kind, years)"""
    return [(b, [(k, y) for y in ys]) for b, k, ys in spec]
if __name__ == '__main__':
    cfg = json.loads(sys.argv[1]) if len(sys.argv) > 1 else None
    out = []
    for comp in (0, 1.0e6, 2.0e6):
        out.append(run('today: spike frames, cumulative RGBA PNG, fetched from first scroll', today(), comp))
    if cfg:
        for comp in (0, 1.0e6, 2.0e6):
            out.append(run(cfg['name'], chunks([(c[0], c[1], range(c[2], c[3] + 1)) for c in cfg['chunks']]), comp, decode=cfg.get('decode', 0)))
    for o in out: print(json.dumps(o))
