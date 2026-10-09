"""From shipped cumulative RGBA frames (binary coverage), derive first-appearance year and
measure delta / atlas / first-year encodings. usage: binframes.py <dir> <y0> <y1>"""
import sys, io, numpy as np
from PIL import Image
d, y0, y1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
A = np.stack([np.array(Image.open(f'{d}/{y}.png'))[..., 3] > 0 for y in range(y0, y1 + 1)])
ny, H, W = A.shape
nonmono = int((A[:-1] & ~A[1:]).sum())
first = np.where(A.any(0), A.argmax(0), 255).astype(np.uint8)
def webp(a, mode='L'):
    b = io.BytesIO(); Image.fromarray(a, mode).save(b, 'WEBP', lossless=True, quality=100, method=6); return len(b.getvalue())
def png(a):
    b = io.BytesIO(); Image.fromarray(a, 'L').save(b, 'PNG', optimize=True); return len(b.getvalue())
D = np.diff(np.concatenate([np.zeros((1, H, W), bool), A]), axis=0).astype(np.uint8) * 255
D = np.maximum(D, 0)
cols = 8; rows = -(-ny // cols)
At = np.zeros((rows * H, cols * W), np.uint8)
for i in range(ny): At[(i // cols) * H:(i // cols + 1) * H, (i % cols) * W:(i % cols + 1) * W] = (A[i] & ~(A[i-1] if i else np.zeros_like(A[i]))) * 255
print(d.split('/')[-1], y0, y1, 'frames', ny, 'nonmonotone px', nonmono,
      '| first-year 1 img webp', webp(first), 'png', png(first),
      '| delta atlas webp', webp(At), '| cum binary L webp files', sum(webp(A[i].astype(np.uint8) * 255) for i in range(ny)),
      '| painted px final', int(A[-1].sum()))
