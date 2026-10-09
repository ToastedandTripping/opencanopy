import numpy as np, math, json, sys, importlib.util
from PIL import Image
D=sys.argv[1]; ds=sys.argv[2]   # cut|fire
REPO='/home/leesalo/.local/share/marvin/worktrees/opencanopy/canopy'
spec=importlib.util.spec_from_file_location('byo',f'{REPO}/scripts/build-year-overlays.py'); byo=importlib.util.module_from_spec(spec); spec.loader.exec_module(byo)
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; R=6371.0088
def eq_row_ha(H,W):
    e=np.linspace(N0,S0,H+1); return R*R*math.radians((E0-W0)/W)*(np.sin(np.radians(e[:-1]))-np.sin(np.radians(e[1:])))*100
def merc(l): return math.log(math.tan(math.pi/4+math.radians(l)/2))
def inv(y): return math.degrees(math.atan(math.sinh(y)))
def merc_row_ha(H,W):
    yn,ys=merc(N0),merc(S0); dl=math.radians((E0-W0)/W)
    return np.array([R*R*dl*(math.sin(math.radians(inv(yn+k/H*(ys-yn))))-math.sin(math.radians(inv(yn+(k+1)/H*(ys-yn)))))*100 for k in range(H)])
def ha(m,rh): return float((m*rh[:,None]).sum())
def to_merc(m):
    H,W=m.shape; rm=byo.build_mercator_row_map(H,S0,N0)
    rgba=np.zeros((4,H,W),np.uint8); rgba[3]=m.astype(np.uint8)*255
    return byo.resample_to_mercator(rgba,rm)[3]>0
rows=np.load(f'{D}/{ds}_rows.npy'); co=np.load(f'{D}/{ds}_coarse.npz'); fc=np.load(f'{D}/{ds}_finecov.npz')
tab=json.load(open(f'{REPO}/src/data/scrub/{"cutblocks" if ds=="cut" else "fire"}-scrub.json'))
grid='c1t' if ds=='cut' else 'c7t'; Wg=1024 if ds=='cut' else 768
rh_eq_g=eq_row_ha(co[grid].shape[1],Wg); rh_m_g=merc_row_ha(co[grid].shape[1],Wg)
rh1=eq_row_ha(501,1024); rh4=eq_row_ha(co['c4t'].shape[1],4096)
fine_px_ha=rh1/256.0  # each fine cell = 1/256 of a 1024-grid cell (rows within a block differ by <0.1%)
out=[]
for Y,ks in ((1990,(1,)),(2010,(1,2)),(2025,(1,2,3))):
    dated=rows[(rows[:,0]>0)&(rows[:,0]<=Y)]
    S_attr=dated[:,1].sum(); S_geom=np.nansum(dated[:,2])
    U=float((fc[f'dated_le{len(ks)}']*fine_px_ha[:,None]).sum())
    cf=np.any(co['c1f'][list(ks)],axis=0); C_f=ha(cf,rh1)
    ct=np.any(co[grid][list(ks)],axis=0); A_t=ha(ct,rh_eq_g)
    M=ha(to_merc(ct),rh_m_g)
    c4=np.any(co['c4t'][list(ks)],axis=0); A4=ha(c4,rh4)
    scrub=tab['total']*tab['cumulativeNorm'][Y-tab['start']]
    line=dict(year=Y,n=len(dated),scrub=scrub,attr_sum=S_attr,geom_sum=S_geom,fine_union=U,center1024=C_f,alltouched=A_t,alltouched_merc=M,alltouched4096=A4)
    if ds=='cut':
        und=rows[rows[:,0]==0]; ut=co['c1t'][0].astype(bool)
        # shipped composite: undated painted where not covered by dated
        comp=to_merc(ut|ct); line['undated_attr']=und[:,1].sum(); line['undated_union_fine']=float((fc['cls'][0]*fine_px_ha[:,None]).sum())
        line['undated_alltouched_merc_only']=ha(to_merc(ut&~ct),rh_m_g); line['composite_merc']=ha(comp,rh_m_g)
        png=np.array(Image.open(f'{REPO}/public/raster/cutblocks-by-year/{Y}.png').convert('RGBA'))[...,3]>0
        line['png_painted']=ha(png,rh_m_g); line['png_px']=int(png.sum()); line['replica_px']=int(comp.sum()); line['replica_mismatch_px']=int((png!=comp).sum())
    else:
        png=np.array(Image.open(f'{REPO}/public/raster/fire-by-year/{Y}.png').convert('RGBA'))[...,3]>0
        line['png_painted']=ha(png,rh_m_g); line['png_px']=int(png.sum()); r=to_merc(ct); line['replica_px']=int(r.sum()); line['replica_mismatch_px']=int((png!=r).sum())
    out.append(line)
    print(json.dumps({k:(round(v/1e6,4) if isinstance(v,float) else v) for k,v in line.items()}))
json.dump(out,open(f'{D}/{ds}_causes.json','w'),indent=1)
# block size distribution
d=rows[rows[:,0]>0]
q=np.nanpercentile(d[:,2],[10,25,50,75,90]); print('polygon area pctiles ha (10,25,50,75,90):',np.round(q,1),' mean',round(np.nanmean(d[:,2]),1))
