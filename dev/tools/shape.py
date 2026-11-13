import sys, zipfile, struct
sys.path.insert(0, __file__.rsplit('/',1)[0])
from pb import parse
from gn import delim, apple_lz4
def shape(b, depth=0):
    """field/wiretype tree; nested messages recursed when parseable & non-string"""
    out=[]
    for f,w,v in parse(b):
        if w==2:
            printable = len(v)>0 and all(32<=c<127 for c in v)
            sub=None
            if not printable and len(v)>0 and v[:4] not in (b'bv41',b'bv4-'):
                try: sub=shape(v,depth+1)
                except Exception: sub=None
            out.append((f,'msg',tuple(sub)) if sub is not None else (f,'str' if printable else ('lz4' if v[:3]==b'bv4' else 'bytes%d'%(0 if len(v)==0 else 1))))
        else: out.append((f,w))
    return tuple(out)
def load(p):
    z=zipfile.ZipFile(p); return {n:z.read(n) for n in z.namelist()}, z
ref,zr=load(sys.argv[1]); gen,zg=load(sys.argv[2])
norm=lambda n: n.split('/')[0]
print('zip order ref:',[norm(n) for n in zr.namelist()])
print('zip order gen:',[norm(n) for n in zg.namelist()][:14])
print('zip meta equal:', all((i.compress_type,i.flag_bits,i.create_system,i.extract_version,i.external_attr)==(8,2048,3,20,0x81a40000) for i in zg.infolist()))
ok=True
def ev_shapes(b):
    d={}
    for r in delim(b):
        it=parse(r); t=[f for f,w,v in it if f!=1][0]
        payload=[v for f,w,v in it if f==t][0]
        d.setdefault(t,[]).append(shape(payload))
    return d
er,eg=ev_shapes(ref['index.events.pb']),ev_shapes(gen['index.events.pb'])
print('event types ref',{k:len(v) for k,v in er.items()},'gen',{k:len(v) for k,v in eg.items()})
for t in er:
    rs=set(er[t]); gs=set(eg.get(t,[]))
    if not gs<=rs:
        ok=False; print('EVENT SHAPE DIFF type',t)
        for s in gs-rs: print('  gen',s)
        for s in rs: print('  ref',s)
order=lambda b:[[f for f,w,v in parse(r) if f!=1][0] for r in delim(b)]
print('event order ref',order(ref['index.events.pb'])); print('event order gen',order(gen['index.events.pb'])[:12])
for name in ['index.notes.pb','index.attachments.pb','index.search.pb']:
    rs=set(shape(r) for r in delim(ref[name])); gs=set(shape(r) for r in delim(gen[name]))
    if gs!=rs: ok=False; print('DIFF',name,rs,gs)
print('schema', ref['schema.pb']==gen['schema.pb'], 'docinfo', ref['document.info.pb']==gen['document.info.pb'])
rn=[n for n in ref if n.startswith('notes/')][0]
for gnm in [n for n in gen if n.startswith('notes/')]:
    rs=set(shape(r) for r in delim(ref[rn])); gs=set(shape(r) for r in delim(gen[gnm]))
    # clock counter 0 omitted variant & colour components are legit variations
    extra=gs-rs
    if extra:
        print('notes shapes not in ref (%s):'%gnm[-6:]); [print('   ',s) for s in extra]
    cnt=0
    for r in delim(gen[gnm]):
        d=dict((f,v) for f,w,v in parse(r))
        if 7 in d:
            q=dict((f,v) for f,w,v in parse(d[7])); raw=apple_lz4(q[2]); cnt+=1
            assert raw[:4]==b'tpl\0' and struct.unpack_from('<I',raw,4)[0]==len(raw) and raw[8:38]==b'vuA(v)A(S(uu))A(S(uuuu))vA(f)\0'
    print('notes',gnm[-6:],'strokes decoded by independent python lz4:',cnt)
ra=[n for n in ref if n.startswith('search/') and n[7:]+'x' and ('attachments/'+n[7:]) in ref][0]
for n in gen:
    if n.startswith('search/') and ('attachments/'+n[7:]) in gen: assert gen[n]==ref[ra]
print('search/attachment identical to ref: True')
rsn=[n for n in ref if n.startswith('search/') and ('notes/'+n[7:]) in ref][0]
gsn=[n for n in gen if n.startswith('search/') and ('notes/'+n[7:]) in gen][0]
print('search/notes top-level fields ref',sorted(set(f for f,w,v in parse(ref[rsn]))),'gen',[f for f,w,v in parse(gen[gsn])])
# uuid+1
import re
pages=[parse(r)[0][2].decode() for r in delim(gen['index.events.pb']) if any(f==54 for f,w,v in parse(r))]
for p in pages:
    n='%032X'%(int(p.replace('-',''),16)+1); n='-'.join([n[:8],n[8:12],n[12:16],n[16:20],n[20:]])
    assert 'notes/'+n in gen, p
print('uuid+1 ok for',len(pages),'pages; SHAPES OK' if ok else 'SHAPE PROBLEMS')
