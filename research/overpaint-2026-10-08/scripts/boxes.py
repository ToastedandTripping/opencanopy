import json, math
# 50 km boxes, centre lon/lat
C={'A_vi_nimpkish':(-126.6,50.2),'B_fortnelson':(-122.3,58.6),'C_stikine':(-128.5,57.5),'D_cariboo':(-120.5,52.0),'E_burnslake':(-126.0,54.2),'F_kootenay':(-117.0,49.6)}
def box(c):
    lon,lat=c; dl=25000/111195.0; dlo=dl/math.cos(math.radians(lat)); return (lon-dlo,lat-dl,lon+dlo,lat+dl)
B={k:box(v) for k,v in C.items()}
if __name__=='__main__':
    import sys
    outs={k:open(f'{sys.argv[1]}/box_{k}.ndjson','w') for k in B}
    with open('/home/leesalo/Projects/opencanopy/data/checkpoint/preprocessed/tenure-cutblocks.ndjson') as f:
        for line in f:
            # cheap prefilter on first coordinate text is unreliable; parse fully
            try: ft=json.loads(line)
            except: continue
            g=ft.get('geometry')
            if not g: continue
            cs=g['coordinates']; r=cs[0] if g['type']=='Polygon' else cs[0][0]
            x=sum(p[0] for p in r)/len(r); y=sum(p[1] for p in r)/len(r)
            for k,(w,s,e,n) in B.items():
                if w-0.05<=x<=e+0.05 and s-0.05<=y<=n+0.05: outs[k].write(line)
    print('done')
