# Stream source polygons once; rasterize per class at several grids; save masks + per-feature table.
import json, math, sys, time, numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_bounds
OUT=sys.argv[2]; DS=sys.argv[1]
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5
def grid(w):
    h=int(w*(N0-S0)/(E0-W0)); return h, from_bounds(W0,S0,E0,N0,w,h)
H1,T1=grid(1024)            # shipped cutblock grid (fire uses 768)
H7,T7=grid(768)
H4,T4=grid(4096)
FW=16384; FH=501*16; TF=from_bounds(W0,S0,E0,N0,FW,FH)   # 16x16 supersample of the 1024x501 grid exactly
if DS=='cut':
    path='/home/leesalo/Projects/opencanopy/data/checkpoint/preprocessed/tenure-cutblocks.ndjson'
    def cls(p):
        try: a=float(p.get('PLANNED_GROSS_BLOCK_AREA') or 0)
        except: a=0.0
        if a>=2000: return None,a
        raw=p.get('DISTURBANCE_START_DATE'); s=str(raw)[:4] if raw is not None else ''
        y=int(s) if s.isdigit() else None
        if y is None or y<1950: return 0,a   # undated / pre-1950 bucket (as the shipped overlay)
        if y>2025: return None,a
        return y,a
else:
    path='/home/leesalo/Projects/opencanopy/data/checkpoint/preprocessed/fire-history.ndjson'
    def cls(p):
        try: a=float(p.get('FIRE_SIZE_HECTARES') or 0)
        except: a=0.0
        s=str(p.get('FIRE_YEAR') or '').strip()
        y=int(s) if s.isdigit() else None
        if y is None or y<1917 or y>2025: return None,a
        return y,a
def k_of(y):  # class index
    if y==0: return 0
    if y<=1990: return 1
    if y<=2010: return 2
    return 3
R=6371008.8
def ring_area(c):
    c=np.asarray(c,dtype=float)
    if len(c)<4: return 0.0
    lon=np.radians(c[:,0]); lat=np.radians(c[:,1])
    # spherical excess approx (equal-area on sphere): sum (lon2-lon1)*(sin lat1 + sin lat2)/2
    return abs(np.sum((lon[1:]-lon[:-1])*(np.sin(lat[1:])+np.sin(lat[:-1]))/2))*R*R
def geom_area(g):
    t=g['type']; cs=g['coordinates']
    polys=[cs] if t=='Polygon' else cs if t=='MultiPolygon' else []
    a=0.0
    for p in polys:
        if not p: continue
        a+=ring_area(p[0])-sum(ring_area(r) for r in p[1:])
    return a/1e4
def centroid(g):
    t=g['type']; cs=g['coordinates']
    r=cs[0] if t=='Polygon' else cs[0][0]
    c=np.asarray(r,dtype=float); return c[:,0].mean(), c[:,1].mean()
K=4
fine=[np.zeros((FH,FW),np.uint8) for _ in range(K)]
c1t=[np.zeros((H1,1024),np.uint8) for _ in range(K)]
c1f=[np.zeros((H1,1024),np.uint8) for _ in range(K)]
c7t=[np.zeros((H7,768),np.uint8) for _ in range(K)]
c4t=[np.zeros((H4,4096),np.uint8) for _ in range(K)]
bufs=[[] for _ in range(K)]
rows=[]
def flush(k):
    b=bufs[k]
    if not b: return
    sh=[(g,1) for g in b]
    np.maximum(fine[k],rasterize(sh,out_shape=(FH,FW),transform=TF,fill=0,dtype=np.uint8,all_touched=False),out=fine[k])
    np.maximum(c1t[k],rasterize(sh,out_shape=(H1,1024),transform=T1,fill=0,dtype=np.uint8,all_touched=True),out=c1t[k])
    np.maximum(c1f[k],rasterize(sh,out_shape=(H1,1024),transform=T1,fill=0,dtype=np.uint8,all_touched=False),out=c1f[k])
    np.maximum(c7t[k],rasterize(sh,out_shape=(H7,768),transform=T7,fill=0,dtype=np.uint8,all_touched=True),out=c7t[k])
    np.maximum(c4t[k],rasterize(sh,out_shape=(H4,4096),transform=T4,fill=0,dtype=np.uint8,all_touched=True),out=c4t[k])
    b.clear()
t=time.time(); n=0
with open(path) as f:
    for line in f:
        try: ft=json.loads(line)
        except Exception: continue
        g=ft.get('geometry'); p=ft.get('properties') or {}
        if not g or g.get('type') not in ('Polygon','MultiPolygon'): continue
        y,a=cls(p)
        if y is None: continue
        k=k_of(y)
        try:
            ga=geom_area(g); cx,cy=centroid(g)
        except Exception: ga=float('nan'); cx=cy=float('nan')
        rows.append((y,a,ga,cx,cy))
        bufs[k].append(g); n+=1
        if len(bufs[k])>=30000: flush(k)
        if n%100000==0: print(n,round(time.time()-t),flush=True)
for k in range(K): flush(k)
np.save(f'{OUT}/{DS}_rows.npy',np.array(rows,dtype=np.float64))
np.savez_compressed(f'{OUT}/{DS}_coarse.npz',c1t=np.array(c1t),c1f=np.array(c1f),c7t=np.array(c7t),c4t=np.array(c4t))
# fine: store 16x16 block coverage counts per class AND cumulative-union coverage (classes overlap spatially)
def blocksum(m): return m.reshape(501,16,1024,16).sum(axis=(1,3)).astype(np.uint16)
cov=np.array([blocksum(fine[k]) for k in range(K)])
cum={}
acc=np.zeros((FH,FW),np.uint8)
for k in (1,2,3):
    np.maximum(acc,fine[k],out=acc); cum[f'dated_le{k}']=blocksum(acc)
np.maximum(acc,fine[0],out=acc); cum['all']=blocksum(acc)
np.savez_compressed(f'{OUT}/{DS}_finecov.npz',cls=cov,**cum)
# keep the full-res cumulative 2025 dated mask for regional prototypes (packed)
acc2=np.maximum(np.maximum(fine[1],fine[2]),fine[3])
np.save(f'{OUT}/{DS}_fine_dated2025_packed.npy',np.packbits(acc2))
print('done',n,round(time.time()-t))
