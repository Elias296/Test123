const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'..','src');
const src=['10_glyphs.js','20_layout.js','30_export.js'].map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const m={exports:{}};new Function('module','require',src)(m,require);const TW=m.exports;
module.exports=TW;
if(require.main===module)(async()=>{
  const text=fs.readFileSync(path.join(__dirname,'sample.txt'),'utf8');
  const out=process.argv[2]||path.join(__dirname,'..','out');fs.mkdirSync(out,{recursive:true});
  for(const [name,st] of [['ref',{}],['multi',{style:'locker',size:'gross',spacing:'5',paper:'kariert',paperColor:'creme',ink:'#1B5E20',margin:16}]]){
    const L=TW.layout({title:'Fotosynthese – Lernzettel',text:name==='multi'?text.repeat(4):text},st);
    const g=await TW.buildGoodnotes(L,'Fotosynthese – Lernzettel',new Uint8Array([0xff,0xd8,0xff,0xd9]));
    fs.writeFileSync(path.join(out,name+'.goodnotes'),g.zip);
    const v=await TW.verifyGoodnotes(g.zip,L);
    console.log(name,L.stats,'zip',g.zip.length,'verify',v.ok,TW.verifyLayout(L),[...L.unmapped.keys()].join(''));
    for(const c of v.checks) console.log('  ',c.ok?'OK ':'FAIL',c.name,'|',c.detail);
    fs.writeFileSync(path.join(out,name+'.pdf'),await TW.buildPdf(L,'Fotosynthese – Lernzettel'));
  }
  // LZ4 fuzz
  for(let t=0;t<300;t++){const n=Math.floor(Math.random()*600);const b=new Uint8Array(n);for(let i=0;i<n;i++)b[i]=Math.random()<.6?(i%7):Math.floor(Math.random()*256);
    const c=TW.lz4Compress(b),d=TW.lz4Decompress(c,n);if(Buffer.compare(Buffer.from(b),Buffer.from(d)))throw new Error('lz4 mismatch');}
  console.log('lz4 fuzz ok');
})();
