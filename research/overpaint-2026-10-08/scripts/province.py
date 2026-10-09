import numpy as np, math, json, sys
D=sys.argv[1]; W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; R=6371.0088
def rowha(H,W):
    e=np.linspace(N0,S0,H+1); return R*R*math.radians((E0-W0)/W)*(np.sin(np.radians(e[:-1]))-np.sin(np.radians(e[1:])))*100
rh=rowha(501,1024)[:,None]; bn=np.load(f'{D}/bluenoise.npy')
for ds in ('cut','fire'):
    fc=np.load(f'{D}/{ds}_finecov.npz')
    for k,Y in ((1,1990),(2,2010),(3,2025)):
        cov=fc[f'dated_le{k}']/256.0; tot=(cov*rh).sum(); t=cov>0
        ar=cov*rh
        shares={th:float(ar[(cov>0)&(cov<th)].sum()/tot) for th in (0.05,0.10,0.25)}
        hi=float(ar[cov>=0.5].sum()/tot)
        dith=float(((cov>bn)*rh).sum()); 
        fl={f:float((np.where(t,np.maximum(cov,f),0)*rh).sum()/tot) for f in (0.1,0.15,0.25)}
        # coarser aggregation 4x4 (7-11 km cells): median coverage
        c4=cov[:500].reshape(125,4,256,4).mean(axis=(1,3)); 
        print(ds,Y,json.dumps(dict(union_Mha=round(tot/1e6,4),touched_px=int(t.sum()),median_cov=round(float(np.median(cov[t])),4),
          area_share_in_px_cov_lt=dict((str(a),round(b,3)) for a,b in shares.items()),area_share_cov_ge50=round(hi,3),
          dither_err=round(dith/tot-1,4),floor_ratio={str(a):round(b,3) for a,b in fl.items()},
          median_cov_4x4_touched=round(float(np.median(c4[c4>0])),4))))
