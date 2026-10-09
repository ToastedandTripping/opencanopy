import numpy as np, math, io, json, sys
from PIL import Image
D=sys.argv[1]; REPO='/home/leesalo/.local/share/marvin/worktrees/opencanopy/canopy'
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; R=6371.0088
e=np.linspace(N0,S0,502); rh=(R*R*math.radians(25.5/1024)*(np.sin(np.radians(e[:-1]))-np.sin(np.radians(e[1:])))*100)[:,None]
cov=np.load(f'{D}/peryear_cov.npz')['cov']/256.0; bn=np.load(f'{D}/bluenoise.npy')
tab=json.load(open(f'{REPO}/src/data/scrub/cutblocks-scrub.json'))
lit=cov>bn[None]                       # (76,H,W), monotone in year because cov is cumulative
assert not (lit[:-1]&~lit[1:]).any(), 'non-monotone'
first=np.where(lit.any(0),lit.argmax(0)+50,0).astype(np.uint8)   # byte = year-1900; 0 = never
b=io.BytesIO(); Image.fromarray(first,'L').save(b,'PNG',optimize=True); print('year-encoded dither PNG bytes',len(b.getvalue()))
Image.fromarray(first,'L').save(f'{D}/proto_year_first_1024.png')
rows=[]
for i,y in enumerate(range(1950,2026)):
    U=(cov[i]*rh).sum(); Dh=(lit[i]*rh).sum(); S=tab['total']*tab['cumulativeNorm'][i]
    rows.append((y,S,U,Dh))
r=np.array(rows)
m=r[:,1]>50000
print('years with scrub>=50k ha:',int(m.sum()))
print('union vs scrub   : min %+.2f%% max %+.2f%%'%(100*(r[m,2]/r[m,1]-1).min(),100*(r[m,2]/r[m,1]-1).max()))
print('dither vs union  : min %+.2f%% max %+.2f%%'%(100*(r[m,3]/r[m,2]-1).min(),100*(r[m,3]/r[m,2]-1).max()))
print('dither vs scrub  : min %+.2f%% max %+.2f%%'%(100*(r[m,3]/r[m,1]-1).min(),100*(r[m,3]/r[m,1]-1).max()))
for y in (1960,1970,1980,1990,2000,2010,2020,2025):
    i=y-1950; print(y,'scrub %.0f union %.0f dither %.0f'%(r[i,1],r[i,2],r[i,3]))
np.save(f'{D}/peryear_table.npy',r)
# decoded demo frames (CPU decode = what a canvas pre-pass would do)
def decode(Y,age_stops=((0,(239,68,68)),(25,(185,28,28)),(50,(127,29,29)))):
    yb=first.astype(int); on=(yb>0)&(yb<=Y-1900); age=np.clip(Y-1900-yb,0,50)
    t1=np.clip(age/25,0,1); t2=np.clip((age-25)/25,0,1)
    c0,c1,c2=[np.array(c[1]) for c in age_stops]
    col=np.where((age<=25)[...,None],c0+(c1-c0)*t1[...,None],c1+(c2-c1)*t2[...,None])
    out=np.zeros(first.shape+(4,),np.uint8); out[...,:3]=col.astype(np.uint8); out[...,3]=on*220; return out
for Y in (1990,2025): Image.fromarray(decode(Y),'RGBA').save(f'{D}/proto_dither_{Y}.png')
for i,Y in ((40,1990),(75,2025)):
    a=np.zeros(first.shape+(4,),np.uint8); a[...,0]=239;a[...,1]=68;a[...,2]=68; a[...,3]=np.round(cov[i]*220).astype(np.uint8)
    Image.fromarray(a,'RGBA').save(f'{D}/proto_frac_{Y}.png')
