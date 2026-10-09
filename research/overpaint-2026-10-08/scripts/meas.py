import sys,os,glob
from PIL import Image
for d in sys.argv[1:]:
  fs=sorted(glob.glob(d+'/*.png'))
  sz=[os.path.getsize(f) for f in fs]
  print('==',d,len(fs),'files tot',sum(sz),'min',min(sz),'max',max(sz),'mean',sum(sz)//len(sz))
  for f in fs:
    im=Image.open(f)
    print(f"{os.path.basename(f)}:{os.path.getsize(f)}:{im.mode}:{im.size[0]}x{im.size[1]}", end=' ')
  print()
