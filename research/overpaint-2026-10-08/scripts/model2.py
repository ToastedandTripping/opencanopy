"""(competing load modelled as 60 tile-sized flows.) Adds processor-sharing (all requests in flight at once, equal share: what prefetch.ts's
batch-of-10-every-30ms + HTTP/2 multiplexing approximates) and finds the competing-bytes
break-even (largest basemap/terrain load in beats 1-2 with zero stalls)."""
import sys, json
sys.path.insert(0, '.')
from model import B, RTT, schedule, today, chunks
def arrivals_fifo(assets, compete, t_req=0.0, decode=0.0):
    ar = {}; cum = compete
    for b, keys in assets:
        cum += b
        for k in keys: ar[k] = t_req + RTT + cum / B + decode
    return ar
def arrivals_ps(assets, compete, t_req=0.0, decode=0.0):
    # competing bytes as one more flow; equal-share processor sharing
    flows = [[compete / 60, None] for _ in range(60)] + [[b, keys] for b, keys in assets]  # basemap = 60 tile requests
    t = t_req + RTT; ar = {}
    rem = [f[0] for f in flows]; alive = [i for i in range(len(flows)) if rem[i] > 0]
    for i in range(len(flows)):
        if rem[i] <= 0 and flows[i][1]:
            for k in flows[i][1]: ar[k] = t + decode
    while alive:
        n = len(alive); m = min(rem[i] for i in alive); t += m * n / B
        for i in alive: rem[i] -= m
        done = [i for i in alive if rem[i] <= 1e-9]
        for i in done:
            if flows[i][1]:
                for k in flows[i][1]: ar[k] = t + decode
        alive = [i for i in alive if rem[i] > 1e-9]
    return ar
def play(ar):
    lag = 0; st = 0; first = None
    for y, kind, t in schedule():
        s = t + lag; a = ar[(kind, y)]
        if a > s: st += 1; lag += a - s; s = a
        if first is None: first = s
    return round(first, 1), st, round(lag, 1)
def breakeven(assets, fn, decode=0.0):
    lo, hi = 0.0, 50e6
    if play(fn(assets, 0, decode=decode))[2] > 0: return 0.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if play(fn(assets, mid, decode=decode))[2] > 0: hi = mid
        else: lo = mid
    return lo
def report(name, assets, decode=0.0):
    tot = sum(b for b, _ in assets)
    for mode, fn in (('need-order', arrivals_fifo), ('all-at-once', arrivals_ps)):
        row = dict(name=name, mode=mode, bytes=tot, requests=len(assets), breakeven_compete_MB=round(breakeven(assets, fn, decode) / 1e6, 2))
        for c in (1e6, 3e6, 6e6):
            f, st, lag = play(fn(assets, c, decode=decode)); row[f'compete{int(c/1e6)}MB'] = f'first@{f}s stalls={st} lag={lag}s'
        print(json.dumps(row))
if __name__ == '__main__':
    report('today spike (cumulative RGBA)', today())
    if len(sys.argv) > 1:
        cfg = json.loads(sys.argv[1])
        report(cfg['name'], chunks([(c[0], c[1], range(c[2], c[3] + 1)) for c in cfg['chunks']]), cfg.get('decode', 0))
