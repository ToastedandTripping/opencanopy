import numpy as np, math, io, sys, json
from PIL import Image
from scipy.ndimage import gaussian_filter
D=sys.argv[1]; W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; R=6371.0088
FH,FW=8016,16384
fine=np.unpackbits(np.load(f'{D}/cut_fine_dated2025_packed.npy'))[:FH*FW].reshape(FH,FW)
def rowha(H,W):
    e=np.linspace(N0,S0,H+1); return R*R*math.radians((E0-W0)/W)*(np.sin(np.radians(e[:-1]))-np.sin(np.radians(e[1:])))*100
def png_bytes(arr,mode):
    b=io.BytesIO(); Image.fromarray(arr,mode).save(b,'PNG',optimize=True); return len(b.getvalue())
res={}
for f,W in ((16,1024),(8,2048),(4,4096)):
    H=FH//f; cov=fine.reshape(H,f,W,f).mean(axis=(1,3)); rh=rowha(H,W)[:,None]
    tot=(cov*rh).sum()
    rng=np.random.default_rng(7); wn=rng.random((H,W)); hp=wn-gaussian_filter(wn,1.0,mode='wrap'); bn=(np.argsort(np.argsort(hp.ravel())).reshape(H,W)+0.5)/hp.size
    d=cov>bn; dha=(d*rh).sum()
    a8=np.round(cov*255).astype(np.uint8)
    # fractional-alpha frame as paletted? use L (alpha only) as proxy of a single-channel PNG
    res[W]=dict(px_ha_50N=float(rh[int((N0-50)/(N0-S0)*H),0]),union_Mha=round(tot/1e6,4),dither_err=round(dha/tot-1,4),
               lit_px=int(d.sum()),median_cov=round(float(np.median(cov[cov>0])),3),
               png_frac_alpha_kB=round(png_bytes(a8,'L')/1024),png_dither_1bit_kB=round(png_bytes((d*255).astype(np.uint8),'L')/1024))
    print(W,json.dumps(res[W]),flush=True)
