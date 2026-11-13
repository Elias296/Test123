import sys, struct
def rv(b,i):
    r=0;s=0
    while True:
        c=b[i];i+=1
        r|=(c&0x7f)<<s;s+=7
        if not c&0x80: return r,i
def parse(b):
    i=0;out=[]
    while i<len(b):
        k,i=rv(b,i);f=k>>3;w=k&7
        if f==0: raise ValueError
        if w==0: v,i=rv(b,i)
        elif w==1: v=b[i:i+8];i+=8
        elif w==2:
            l,i=rv(b,i)
            if i+l>len(b): raise ValueError
            v=b[i:i+l];i+=l
        elif w==5: v=b[i:i+4];i+=4
        else: raise ValueError
        if i>len(b): raise ValueError
        out.append((f,w,v))
    return out
def dump(b,ind=0,maxd=12):
    try: items=parse(b)
    except Exception: return False
    for f,w,v in items:
        p='  '*ind
        if w==0: print(f'{p}{f}: varint {v}')
        elif w==1: print(f'{p}{f}: f64 {struct.unpack("<d",v)[0]} / i64 {struct.unpack("<q",v)[0]}')
        elif w==5: print(f'{p}{f}: f32 {struct.unpack("<f",v)[0]} / i32 {struct.unpack("<i",v)[0]} hex {v.hex()}')
        else:
            sub=None
            printable = all(32<=c<127 or c in(9,10,13) for c in v) and len(v)>0
            if printable:
                print(f'{p}{f}: str[{len(v)}] {v.decode()!r}')
            else:
                try:
                    parse(v); ok=len(v)>0
                except Exception: ok=False
                if ok and ind<maxd:
                    print(f'{p}{f}: msg[{len(v)}] {{')
                    dump(v,ind+1,maxd)
                    print(f'{p}}}')
                else:
                    print(f'{p}{f}: bytes[{len(v)}] {v[:64].hex()}{"..." if len(v)>64 else ""}')
    return True
if __name__=='__main__':
    b=open(sys.argv[1],'rb').read()
    if len(sys.argv)>2 and sys.argv[2]=='delim':
        i=0;n=0
        while i<len(b):
            l,i=rv(b,i)
            print(f'--- record {n} len {l} @ {i}')
            dump(b[i:i+l],1); i+=l;n+=1
    else:
        if not dump(b): print('not pb'); print(b[:200].hex())
