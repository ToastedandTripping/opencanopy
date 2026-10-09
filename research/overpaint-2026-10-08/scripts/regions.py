import json, math, sys, glob, numpy as np
from shapely.geometry import shape, box as sbox
from shapely.ops import unary_union, transform as stf
from pyproj import Transformer
from scipy.ndimage import gaussian_filter
D=sys.argv[1]
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; dx=25.5/1024; dy=12.5/501; R=6371.0088
tr=Transformer.from_crs(4326,3005,always_xy=True).transform
def aea(g): return stf(tr,g).area/1e4
e=np.linspace(N0,S0,502); rowha=R*R*math.radians(dx)*(np.sin(np.radians(e[:-1]))-np.sin(np.radians(e[1:])))*100
e4=np.linspace(N0,S0,2004+1); rowha4=R*R*math.radians(25.5/4096)*(np.sin(np.radians(e4[:-1]))-np.sin(np.radians(e4[1:])))*100
# blue-ish noise threshold map (fixed seed): high-passed white noise, rank-transformed to uniform (0,1)
rng=np.random.default_rng(20261008); wn=rng.random((501,1024)); hp=wn-gaussian_filter(wn,1.0,mode='wrap')
bn=(np.argsort(np.argsort(hp.ravel())).reshape(501,1024)+0.5)/hp.size; np.save(f'{D}/bluenoise.npy',bn)
co=np.load(f'{D}/cut_coarse.npz'); fc=np.load(f'{D}/cut_finecov.npz')
BOX={'A_dense_VI_Nimpkish':(504,532,404,421),'B_sparse_FortNelson':(674,708,68,85)}
res={}
for name,(c0,c1,r0,r1) in BOX.items():
    w=W0+c0*dx; ee=W0+c1*dx; n=N0-r0*dy; s=N0-r1*dy; bx=sbox(w,s,ee,n)
    tag='A_vi_nimpkish' if name.startswith('A') else 'B_fortnelson'
    feats=[json.loads(l) for l in open(f'{D}/box_{tag}.ndjson')]
    def yr(p):
        x=str(p.get('DISTURBANCE_START_DATE') or '')[:4]; return int(x) if x.isdigit() else None
    def ok(p):
        try: a=float(p.get('PLANNED_GROSS_BLOCK_AREA') or 0)
        except: a=0
        return a<2000
    sl=(slice(r0,r1),slice(c0,c1)); sl4=(slice(r0*4,r1*4),slice(c0*4,c1*4))
    out={}
    for Y,k in ((1990,1),(2010,2),(2025,3)):
        gs=[shape(f['geometry']).buffer(0) for f in feats if ok(f['properties']) and (yr(f['properties']) or 0)>=1950 and yr(f['properties'])<=Y]
        truth=aea(unary_union(gs).intersection(bx)) if gs else 0.0
        ks=list(range(1,k+1))
        ship=float((np.any(co['c1t'][ks],axis=0)[sl]*rowha[sl[0],None]).sum())
        cen=float((np.any(co['c1f'][ks],axis=0)[sl]*rowha[sl[0],None]).sum())
        a4=float((np.any(co['c4t'][ks],axis=0)[sl4]*rowha4[sl4[0],None]).sum())
        cov=fc[f'dated_le{k}'][sl]/256.0
        frac=float((cov*rowha[sl[0],None]).sum())
        q=np.round(cov*255)/255; frac8=float((q*rowha[sl[0],None]).sum())
        dith=cov>bn[sl]; dha=float((dith*rowha[sl[0],None]).sum())
        floor15=float((np.where(cov>0,np.maximum(cov,0.15),0)*rowha[sl[0],None]).sum())
        und_ship=float(((co['c1t'][0].astype(bool)&~np.any(co['c1t'][ks],axis=0))[sl]*rowha[sl[0],None]).sum())
        touched=int((cov>0).sum()); med=float(np.median(cov[cov>0])) if touched else 0
        out[Y]=dict(truth_union_ha=truth,shipped_alltouched_ha=ship,shipped_ratio=ship/truth if truth else None,undated_extra_ha=und_ship,
                    center1024_err=cen/truth-1 if truth else None,alltouched4096_ratio=a4/truth if truth else None,
                    frac_err=frac/truth-1 if truth else None,frac8bit_err=frac8/truth-1 if truth else None,
                    dither_err=dha/truth-1 if truth else None,floor15_ratio=floor15/truth if truth else None,
                    touched_px=touched,median_cov_touched=med,box_ha=float((np.ones_like(cov)*rowha[sl[0],None]).sum()))
        print(name,Y,json.dumps({a:(round(b,4) if isinstance(b,float) else b) for a,b in out[Y].items()}),flush=True)
    # vector tiles, 2025 cumulative
    vt={}
    pref='vt_dense' if name.startswith('A') else 'vt_sparse'
    for fz in sorted(glob.glob(f'{D}/{pref}_z*.ndjson'),key=lambda x:int(x.split('_z')[1].split('.')[0])):
        z=int(fz.split('_z')[1].split('.')[0]); gs=[]
        for l in open(fz):
            r=json.loads(l); p=r['p']; y=yr(p)
            if y is None or y<1950 or y>2025: continue
            if 'PLANNED_GROSS_BLOCK_AREA' in p and not ok(p): continue
            try:
                g=shape(r['g']).buffer(0)
                if g.intersects(bx): gs.append(g.intersection(bx))
            except Exception: pass
        a=aea(unary_union(gs)) if gs else 0.0
        vt[z]=dict(features_in_box=len(gs),area_ha=a,err=a/out[2025]['truth_union_ha']-1)
        print(name,'vector z',z,json.dumps({k2:(round(v,4) if isinstance(v,float) else v) for k2,v in vt[z].items()}),flush=True)
    out['vector2025']=vt; res[name]=out
json.dump(res,open(f'{D}/regions.json','w'),indent=1,default=str)
