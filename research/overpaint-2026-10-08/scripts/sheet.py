import numpy as np, sys
from PIL import Image, ImageDraw
D=sys.argv[1]; REPO='/home/leesalo/.local/share/marvin/worktrees/opencanopy/canopy'
def over(p,bg=(18,18,22)):
    a=np.array(Image.open(p).convert('RGBA')).astype(float); al=a[...,3:]/255*0.85
    return (a[...,:3]*al+np.array(bg)*(1-al)).astype(np.uint8)
imgs=[('shipped 2025 (all_touched + undated)',over(f'{REPO}/public/raster/cutblocks-by-year/2025.png')),
      ('(a) fractional alpha 2025',over(f'{D}/proto_frac_2025.png')),
      ('(e) blue-noise dither 2025',over(f'{D}/proto_dither_2025.png'))]
W=1024; H=501
sheet=Image.new('RGB',(W,H*3+60),(0,0,0)); dr=ImageDraw.Draw(sheet)
for i,(t,a) in enumerate(imgs):
    sheet.paste(Image.fromarray(a),(0,i*(H+20)+20)); dr.text((6,i*(H+20)+4),t,fill=(230,230,230))
sheet.save(f'{D}/sheet_province.png')
# zoom crop: southern coast / VI, 3x nearest (approx z6 look). cols 440-640, rows 330-460 (frames differ by Mercator row spacing; approximate)
crops=[Image.fromarray(a[330:460,440:640]).resize((600,390),Image.NEAREST) for _,a in imgs]
s2=Image.new('RGB',(600*3+20,410),(0,0,0)); d2=ImageDraw.Draw(s2)
for i,c in enumerate(crops): s2.paste(c,(i*610,20)); d2.text((i*610+4,4),imgs[i][0],fill=(230,230,230))
s2.save(f'{D}/sheet_crop.png')
