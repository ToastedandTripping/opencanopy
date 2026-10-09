# Prototype build: per-year cumulative fractional coverage on the 1024x501 grid (16x16 supersample),
# dated 1950-2025 FTEN under the 2,000 ha cap, undated EXCLUDED (S1-lite). Then:
#  (a) fractional-alpha frames, (e) blue-noise ordered dither encoded as ONE year-of-first-paint PNG.
import json, math, sys, time, numpy as np
from collections import defaultdict
from rasterio.features import rasterize
from rasterio.transform import from_bounds
OUT=sys.argv[1]
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; FW,FH=16384,501*16; TF=from_bounds(W0,S0,E0,N0,FW,FH)
by=defaultdict(list)
with open('/home/leesalo/Projects/opencanopy/data/checkpoint/preprocessed/tenure-cutblocks.ndjson') as f:
    for line in f:
        try: ft=json.loads(line)
        except: continue
        g=ft.get('geometry'); p=ft.get('properties') or {}
        if not g: continue
        try: a=float(p.get('PLANNED_GROSS_BLOCK_AREA') or 0)
        except: a=0
        if a>=2000: continue
        s=str(p.get('DISTURBANCE_START_DATE') or '')[:4]
        if not s.isdigit(): continue
        y=int(s)
        if 1950<=y<=2025: by[y].append(json.dumps(g))   # keep as text to bound RSS
print('loaded',sum(len(v) for v in by.values()),flush=True)
acc=np.zeros((FH,FW),np.uint8); cov=np.zeros((76,501,1024),np.uint16); t=time.time()
for i,y in enumerate(range(1950,2026)):
    gs=[(json.loads(s),1) for s in by.get(y,[])]
    if gs:
        for j in range(0,len(gs),30000):
            np.maximum(acc,rasterize(gs[j:j+30000],out_shape=(FH,FW),transform=TF,fill=0,dtype=np.uint8,all_touched=False),out=acc)
    cov[i]=acc.reshape(501,16,1024,16).sum(axis=(1,3))
    by.pop(y,None)
    if y%10==0: print(y,round(time.time()-t),flush=True)
np.savez_compressed(f'{OUT}/peryear_cov.npz',cov=cov)
print('done')
