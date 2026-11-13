const {chromium}=require('playwright');const path=require('path'),fs=require('fs');
const out=path.join(__dirname,'..','out'),pk=path.join(__dirname,'..','pk');
const T=pk+'/x_tesseract.js-7.0.0.tgz/package/dist/',C=pk+'/x_tesseract.js-core-7.0.0.tgz/package/';
const FAKE_TF=`export const env={};
export class InterruptableStoppingCriteria{constructor(){this.interrupted=false}interrupt(){this.interrupted=true}}
export class TextStreamer{constructor(tok,o){this.cb=o.callback_function}}
export async function pipeline(task,model,opts){opts.progress_callback({status:'initiate',file:'MODEL='+model+' DTYPE='+opts.dtype+' CACHE='+env.useBrowserCache});opts.progress_callback({status:'progress',file:'a.onnx',loaded:1e8,total:1e8});
 await new Promise(r=>setTimeout(r,2500));
 const gen=async(msgs,o)=>{const u=msgs[1].content;let res=/Zeichne/.test(u)?'[Nicht lösbar: Bild fehlt]':'**Antwort** zu: '+u.split('\\n').slice(-1)[0].slice(0,25)+' (sys:'+/Tizian/.test(msgs[0].content)+')';
  for(const w of res.split(/(?<=\\s)/)){if(o.stopping_criteria.interrupted)break;o.streamer.cb(w);await new Promise(r=>setTimeout(r,2));}return [{generated_text:[...msgs,{role:'assistant',content:res}]}]};
 gen.tokenizer={};return gen;}`;
(async()=>{
  const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1180,height:820},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'gpu',{configurable:true,get(){return {requestAdapter:async()=>({features:new Set(['shader-f16'])})}}});});
  await ctx.route('https://cdn.jsdelivr.net/**',route=>{const u=route.request().url();let f=null;
    if(u.includes('/tesseract.js@7.0.0/dist/')||u.includes('/tesseract.js@v7.0.0/dist/'))f=T+u.split('/dist/')[1];
    else if(u.includes('/tesseract.js-core@'))f=C+u.split('/').pop();
    else if(u.includes('@tesseract.js-data/')){const m=/@tesseract\.js-data\/(\w+)\/(.*)$/.exec(u);f=`${pk}/x_tesseract.js-data-${m[1]}-1.0.0.tgz/package/${m[2]}`;}
    else if(u.includes('@huggingface/transformers'))return route.fulfill({contentType:'text/javascript',body:FAKE_TF});
    if(f&&fs.existsSync(f))return route.fulfill({path:f,contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.wasm')?'application/wasm':'application/octet-stream'});route.abort();});
  const pg=await ctx.newPage();const errs=[];pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});pg.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await pg.goto('http://127.0.0.1:8765/Tintenwerk.html');await pg.waitForTimeout(400);
  console.log('solve buttons disabled before model (now: tap loads):',await pg.evaluate(()=>[...document.querySelectorAll('#btnSolvePages,#btnSolveEditor')].map(b=>b.disabled)),'| name:',await pg.inputValue('#stuName'));
  await pg.click('#aiHelp summary');await pg.selectOption('#aiModel','besser');console.log('load btn:',await pg.textContent('#btnLoadModel'));
  // 1) Laden starten, nach Download-Ende ist die Seite bedienbar und Abbrechen geht
  await pg.check('#aiNoCache');
  await pg.click('#btnLoadModel');await pg.click('#confirmYes');
  await pg.waitForFunction(()=>/Download fertig/.test(document.querySelector('#modelMsg').textContent),null,{timeout:20000});
  console.log('stage msg:',(await pg.textContent('#modelMsg')).slice(0,90));
  await pg.click('#modeSeg [data-mode=blatt]');console.log('UI alive during GPU prep: mode ->',await pg.evaluate(()=>TWApp.S.mode));await pg.click('#modeSeg [data-mode=import]');
  await pg.click('#btnCancelModel');await pg.waitForTimeout(200);
  console.log('after cancel: load btn visible',await pg.evaluate(()=>!document.querySelector('#btnLoadModel').hidden&&!document.querySelector('#btnLoadModel').disabled),'| cancel hidden',await pg.evaluate(()=>document.querySelector('#btnCancelModel').hidden),'| select enabled',await pg.evaluate(()=>!document.querySelector('#aiModel').disabled));
  // 2) erneut laden, diesmal bis zum Ende
  await pg.click('#btnLoadModel');await pg.click('#confirmYes');await pg.waitForFunction(()=>TWApp.AI.state==='ready',null,{timeout:30000});
  console.log('log:\n'+await pg.textContent('#aiLogText'));
  console.log('hint:',await pg.textContent('#solveHint'));
  // Buchseite
  const png=await pg.evaluate(()=>{const c=document.createElement('canvas');c.width=1500;c.height=1100;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,1500,1100);x.fillStyle='#111';x.font='bold 46px sans-serif';x.fillText('Seite 42 – Übungen',80,90);x.font='40px sans-serif';
    ['1. Berechne:','345 + 678 =','2. Nenne drei Laubbäume.','3. Zeichne ein Dreieck mit a = 5 cm.','4. Erkläre, warum der Himmel blau ist.'].forEach((t,i)=>x.fillText(t,80,200+i*90));return c.toDataURL('image/png').split(',')[1]});
  fs.writeFileSync(path.join(out,'fake_buch.png'),Buffer.from(png,'base64'));
  const draft0=await pg.evaluate(()=>TWApp.S.draft.text);
  await pg.setInputFiles('#solveFile',path.join(out,'fake_buch.png'));
  await pg.waitForSelector('#cropModal:not([hidden])');await pg.waitForTimeout(200);await pg.click('#cropFull');await pg.click('#cropOk');
  await pg.waitForSelector('#solveModal:not([hidden])',{timeout:120000});
  await pg.waitForFunction(()=>/fertig/.test(document.querySelector('#solveProgress').textContent),null,{timeout:60000});
  console.log('TASKS:\n'+await pg.inputValue('#solveTasks'));console.log('SOLUTIONS:\n'+await pg.inputValue('#solveOut'));
  console.log('by:',await pg.textContent('#solveBy'),'\nwarn:',(await pg.textContent('#solveWarn')).slice(0,200));
  console.log('sys has name:',/sys:true/.test(await pg.inputValue('#solveOut')),'| draft unchanged:',await pg.evaluate(t=>TWApp.S.draft.text===t,draft0),'| append disabled (sample):',await pg.evaluate(()=>document.querySelector('#solveAppend').disabled));
  await pg.screenshot({path:path.join(out,'e2e_solve.png')});
  await pg.click('#solveTake');await pg.waitForTimeout(400);
  const d=await pg.evaluate(()=>({t:TWApp.S.draft.title,txt:TWApp.S.draft.text,undo:!!TWApp.S.undo,unm:[...TWApp.S.layout.unmapped.keys()].join('')}));console.log('after take:',JSON.stringify(d));
  await pg.screenshot({path:path.join(out,'e2e_solve_sheet.png')});
  await pg.evaluate(()=>{const e=document.querySelector('#editor');e.value='Fotosynthese\n\nDie Fotosynthese wandelt Licht um. Dabei entstehen aus 6 CO2 und 6 H2O genau 1 Molekül Glucose sowie 6 O2.';e.dispatchEvent(new Event('input'))});
  await pg.click('#btnRewrite');await pg.waitForFunction(()=>document.querySelector('#cmpProgress').textContent==='fertig',null,{timeout:20000});
  console.log('rewrite via worker:',JSON.stringify((await pg.inputValue('#cmpAi')).slice(0,90)),'| take enabled',await pg.evaluate(()=>!document.querySelector('#cmpTake').disabled));await pg.click('#cmpDiscard');
  await pg.selectOption('#aiModel','schnell');await pg.waitForTimeout(100);console.log('after model switch: state',await pg.evaluate(()=>TWApp.AI.state),'| solve enabled',await pg.evaluate(()=>!document.querySelector('#btnSolvePages').disabled),'| load btn',await pg.textContent('#btnLoadModel'));
  console.log('errors',errs);await b.close();})().catch(e=>{console.error('E2E FAIL',e);process.exit(1)});
