import sys, struct, zipfile, zlib
sys.path.insert(0, __file__.rsplit('/',1)[0])
from pb import parse, rv
def lz4_block(src, usize):
    out=bytearray(); i=0
    while i<len(src):
        t=src[i]; i+=1
        ll=t>>4
        if ll==15:
            while True:
                c=src[i]; i+=1; ll+=c
                if c!=255: break
        out+=src[i:i+ll]; i+=ll
        if i>=len(src): break
        off=src[i]|(src[i+1]<<8); i+=2
        ml=t&15
        if ml==15:
            while True:
                c=src[i]; i+=1; ml+=c
                if c!=255: break
        ml+=4
        assert 0<off<=len(out), (off,len(out))
        for _ in range(ml): out.append(out[-off])
    assert len(out)==usize,(len(out),usize)
    return bytes(out)
def apple_lz4(b):
    i=0; out=b''
    while i<len(b):
        m=b[i:i+4]; i+=4
        if m==b'bv41':
            us,cs=struct.unpack('<II',b[i:i+8]); i+=8
            out+=lz4_block(b[i:i+cs],us); i+=cs
        elif m==b'bv4-':
            us,=struct.unpack('<I',b[i:i+4]); i+=4
            out+=b[i:i+us]; i+=us
        elif m==b'bv4$':
            assert i==len(b), 'trailing after bv4$'
            return out
        else: raise ValueError('bad magic %r'%m)
    raise ValueError('no end marker')
def delim(b):
    i=0; out=[]
    while i<len(b):
        l,i=rv(b,i); out.append(b[i:i+l]); i+=l
    assert i==len(b)
    return out
if __name__=='__main__':
    b=open(sys.argv[1],'rb').read()
    recs=delim(b)
    for n,r in enumerate(recs):
        d=dict((f,v) for f,w,v in parse(r))
        if 7 in d:
            dd=dict((f,v) for f,w,v in parse(d[7]))
            raw=apple_lz4(dd[2])
            print(n, dd[1].decode(), 'lz4',len(dd[2]),'->',len(raw))
            print('   ', raw.hex(' '))
