import numpy as np, math, json
from PIL import Image
REPO='/home/leesalo/.local/share/marvin/worktrees/opencanopy/canopy'
W0,S0,E0,N0=-139.5,48.0,-114.0,60.5; R=6371.0088
def merc(l): return math.log(math.tan(math.pi/4+math.radians(l)/2))
def inv(y): return math.degrees(math.atan(math.sinh(y)))
def merc_row_ha(H,W):
    yn,ys=merc(N0),merc(S0); dl=math.radians((E0-W0)/W)
    return np.array([R*R*dl*(math.sin(math.radians(inv(yn+k/H*(ys-yn))))-math.sin(math.radians(inv(yn+(k+1)/H*(ys-yn)))))*100 for k in range(H)])
cs=json.load(open(f'{REPO}/src/data/scrub/cutblocks-scrub.json')); fs=json.load(open(f'{REPO}/src/data/scrub/fire-scrub.json'))
def scrub(t,y): return t['total']*t['cumulativeNorm'][y-t['start']]
for ds,tab,years in (('cutblocks',cs,(1950,1990,2010,2025)),('fire',fs,(1950,1990,2010,2025))):
    for y in years:
        a=np.array(Image.open(f'{REPO}/public/raster/{ds}-by-year/{y}.png').convert('RGBA')); H,W=a.shape[:2]; rh=merc_row_ha(H,W)[:,None]
        al=a[...,3]; m=al>0
        und=(a[...,0]==127)&(a[...,1]==29)&(a[...,2]==29)&(al==120)
        painted=(m*rh).sum(); dated=((m&~und)*rh).sum(); undha=(und*rh).sum()
        aw=((al/255.0)*rh).sum()
        st=scrub(tab,y)
        print(f"{ds} {y}: px {m.sum():6d}  painted {painted/1e6:6.2f}M ha (dated-colour {dated/1e6:6.2f}M, undated-colour {undha/1e6:5.2f}M)  alpha-weighted {aw/1e6:5.2f}M  scrub-stated {st/1e6:5.3f}M  ratio painted-dated/scrub {dated/max(st,1):6.1f}x  ratio all/scrub {painted/max(st,1):6.1f}x")
