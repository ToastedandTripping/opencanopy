"""Sparse event stream (per year: uint32 count, LEB128 pixel gaps, coverage bytes), then
gzip -9 / brotli 11 / deflate-raw. Decodable in-browser with DecompressionStream('gzip')
(no canvas, no premultiply/colour-management risk). usage: sparse.py name npy ny"""
import sys, gzip, zlib, numpy as np, brotli
name, npy, ny = sys.argv[1], sys.argv[2], int(sys.argv[3])
fy = np.load(npy); H, W = fy.shape[0] // 8, fy.shape[1] // 8
blk = fy.reshape(H, 8, W, 8).transpose(0, 2, 1, 3).reshape(H, W, 64)
parts = []; ev = 0
for i in range(ny):
    c = (blk == i).sum(-1).ravel().astype(np.uint8)   # subpixels added this year, 0..64
    idx = np.flatnonzero(c); ev += len(idx)
    g = np.diff(np.concatenate([[-1], idx])) - 1
    b0 = (g & 0x7f) | np.where(g > 0x7f, 0x80, 0); b1 = ((g >> 7) & 0x7f) | np.where(g > 0x3fff, 0x80, 0); b2 = (g >> 14) & 0x7f
    n = 1 + (g > 0x7f) + (g > 0x3fff)
    out = np.zeros((len(g), 3), np.uint8); out[:, 0] = b0; out[:, 1] = b1; out[:, 2] = b2
    mask = np.arange(3)[None, :] < n[:, None]
    parts += [np.uint32(len(idx)).tobytes(), out[mask].tobytes(), c[idx].tobytes()]
raw = b''.join(parts)
co = zlib.compressobj(9, zlib.DEFLATED, -15); dr = co.compress(raw) + co.flush()
open(f'proto/{name}.events.gz', 'wb').write(gzip.compress(raw, 9))
print(name, 'events', ev, 'raw', len(raw), 'gzip9', len(gzip.compress(raw, 9)), 'deflate-raw', len(dr), 'brotli11', len(brotli.compress(raw, quality=11)))
