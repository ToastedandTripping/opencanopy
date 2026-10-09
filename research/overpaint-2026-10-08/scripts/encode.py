"""Encode a first-year supersampled array into candidate delivery formats; report bytes.
usage: encode.py <name> <npy> <y0> <nyears> [levels]
coverage per 1024x501 px = fraction of SSxSS subpixels whose first year <= Y (union)."""
import sys, io, os, json, numpy as np, brotli
from PIL import Image
name, npy, y0, ny = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
fy = np.load(npy); SS = 8; H, W = fy.shape[0] // SS, fy.shape[1] // SS
blk = fy.reshape(H, SS, W, SS).transpose(0, 2, 1, 3).reshape(H, W, SS * SS)
# histogram of first-year per output pixel -> counts[H,W,ny]
cnt = np.zeros((H, W, ny), np.uint16)
for i in range(ny): cnt[..., i] = (blk == i).sum(-1)
del blk
cum = np.cumsum(cnt, -1)                       # 0..64 subpixels
def q(c, L):  # quantize 0..64 -> 0..255 code (L levels incl 0)
    return np.rint(c / 64 * (L - 1)).astype(np.uint8) * (255 // (L - 1))
out = {}
def enc(img, fmt, **kw):
    b = io.BytesIO(); img.save(b, fmt, **kw); return b.getvalue()
def png(a): return enc(Image.fromarray(a, 'L'), 'PNG', optimize=True)
def webp(a): return enc(Image.fromarray(a, 'L'), 'WEBP', lossless=True, quality=100, method=6)
def check_webp(a):
    r = np.array(Image.open(io.BytesIO(webp(a))).convert('L')); return bool((r == a).all())
res = {}
for L in (65, 17):
    C = np.stack([q(cum[..., i], L) for i in range(ny)])          # cumulative frames
    D = np.diff(np.concatenate([np.zeros((1, H, W), np.uint8), C]), axis=0)  # deltas (codes, non-neg)
    assert (C[1:] >= C[:-1]).all()
    r = {}
    r['cum_png_files'] = sum(len(png(C[i])) for i in range(ny))
    r['cum_webp_files'] = sum(len(webp(C[i])) for i in range(ny))
    r['delta_png_files'] = sum(len(png(D[i])) for i in range(ny))
    r['delta_webp_files'] = sum(len(webp(D[i])) for i in range(ny))
    # atlas: 8 columns
    cols = 8 if ny > 8 else ny; rows = -(-ny // cols)
    A = np.zeros((rows * H, cols * W), np.uint8)
    for i in range(ny): A[(i // cols) * H:(i // cols + 1) * H, (i % cols) * W:(i % cols + 1) * W] = D[i]
    r['delta_atlas_png'] = len(png(A)); r['delta_atlas_webp'] = len(webp(A))
    r['delta_atlas_webp_roundtrip_exact'] = check_webp(A)
    try:
        av = enc(Image.fromarray(A, 'L').convert('RGB'), 'AVIF', lossless=True)
        rr = np.array(Image.open(io.BytesIO(av)).convert('RGB'))[..., 0]
        r['delta_atlas_avif_lossless'] = len(av); r['avif_roundtrip_exact'] = bool((rr == A).all())
    except Exception as e: r['avif_err'] = str(e)
    # sparse event stream: per year, varint gap-coded pixel indices + code byte; brotli q11
    buf = bytearray()
    def varint(n):
        while True:
            b = n & 0x7f; n >>= 7
            buf.append(b | (0x80 if n else 0))
            if not n: break
    events = 0
    for i in range(ny):
        idx = np.flatnonzero(D[i].ravel()); events += len(idx)
        varint(len(idx)); prev = -1
        for k in idx: varint(int(k) - prev - 1); prev = int(k)
        buf.extend(D[i].ravel()[idx].tobytes())
    r['events'] = events; r['sparse_raw'] = len(buf); r['sparse_brotli'] = len(brotli.compress(bytes(buf), quality=11))
    # 2-channel approximation: first year + final coverage (step)
    nz = cum[..., -1] > 0
    first = np.where(nz, np.argmax(cum > 0, -1), 255).astype(np.uint8)
    two = np.dstack([first, q(cum[..., -1], L), np.zeros_like(first)])
    r['firstyear_final_webp'] = len(enc(Image.fromarray(two, 'RGB'), 'WEBP', lossless=True, quality=100, method=6))
    # area error of step approx: sum over years of |approx - true| / sum true
    tru = cum.astype(np.float64); apx = np.where(np.arange(ny)[None, None, :] >= first[..., None], cum[..., -1:], 0)
    r['step_approx_area_overstate_pct_mean_over_years'] = round(float((apx.sum((0, 1)) / np.maximum(tru.sum((0, 1)), 1) - 1).mean() * 100), 1)
    # 512 ladder rung (2x2 mean of coverage) for the delta atlas
    A2 = A.reshape(A.shape[0] // 1, A.shape[1])  # placeholder
    res[f'L{L}'] = r
    print(name, f'L{L}', json.dumps(r), flush=True)
# painted area check: coverage-weighted px sum per year vs binary any-touch px
res['px_coverage_2025'] = float(cum[..., -1].sum() / 64); res['px_anytouch_2025'] = int((cum[..., -1] > 0).sum())
json.dump(res, open(f'proto/{name}-encode.json', 'w'), indent=1)
print(name, 'coverage-px', res['px_coverage_2025'], 'anytouch-px', res['px_anytouch_2025'])
