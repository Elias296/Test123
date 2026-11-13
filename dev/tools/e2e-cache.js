// Browser-Test: Modell-Download wird direkt im Cache gesichert, Absturz wird erkannt.
// node dev/tools/e2e-cache.js   (lokaler Server auf Port 8765)
const { chromium } = require('playwright');
const FAKE_TF = `export const env={remoteHost:'https://huggingface.co/',remotePathTemplate:'{model}/resolve/{revision}/',cacheKey:'transformers-cache',backends:{onnx:{wasm:{}}}};
export class InterruptableStoppingCriteria{constructor(){this.interrupted=false}interrupt(){this.interrupted=true}}
export class TextStreamer{constructor(tok,o){this.cb=o.callback_function}}
export async function pipeline(task,model,opts){self.postMessage({t:'log',m:'PIPELINE cb='+(!!opts.progress_callback)+' threads='+env.backends.onnx.wasm.numThreads});
 await new Promise(r=>setTimeout(r,400));const gen=async()=>[{generated_text:'x'}];gen.tokenizer={};return gen;}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get() { return { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) }; } }); });
  let hfHits = 0;
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_TF }));
  await ctx.route('https://huggingface.co/**', r => { hfHits++; r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: Buffer.alloc(400000, 7) }); });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const open = async () => { await pg.goto('http://127.0.0.1:8765/Tintenwerk.html'); await pg.waitForTimeout(400); };
  const load = async () => { await pg.click('#aiHelp summary'); await pg.click('#btnLoadModel'); await pg.click('#confirmYes'); await pg.waitForFunction(() => TWApp.AI.state === 'ready', null, { timeout: 20000 }); return pg.textContent('#aiLogText'); };
  const KEY = 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/onnx/model_q4f16.onnx';

  await open();
  let log = await load();
  ok(/Download gesichert/.test(log), 'Erster Ladevorgang: Download direkt im Cache gesichert');
  ok(/PIPELINE cb=false threads=1/.test(log), 'Modellstart ohne Fortschritts-Callback (ein Stück), ein Thread');
  ok(await pg.evaluate(async k => { const c = await caches.open('transformers-cache'); const r = await c.match(k); return !!r && (await r.arrayBuffer()).byteLength === 400000; }, KEY), 'Cache-Eintrag unter dem Schlüssel der Bibliothek, vollständig');
  ok(await pg.evaluate(() => localStorage.getItem('tintenwerk.ki.lauf.v1') === null), 'Absturz-Merker nach erfolgreichem Start entfernt');

  // Absturz beim Start simulieren: Merker steht noch, Seite lädt neu
  await pg.evaluate(() => localStorage.setItem('tintenwerk.ki.lauf.v1', JSON.stringify({ phase: 'start', n: 0 })));
  const before = hfHits; await open();
  ok(await pg.evaluate(() => !document.querySelector('#aiCrash').hidden && /neu geladen/.test(document.querySelector('#aiCrash').textContent) && /nicht wiederholt/.test(document.querySelector('#aiCrash').textContent)), 'Nach Neustart: Hinweis auf Absturz, Download bleibt gesichert');
  log = await load();
  ok(/bereits gesichert im Cache/.test(log) && hfHits === before, 'Zweiter Versuch: kein erneuter Download');
  ok(await pg.evaluate(() => document.querySelector('#aiCrash').hidden), 'Hinweis verschwindet nach erfolgreichem Start');

  // zwei Abstürze hintereinander
  await pg.evaluate(() => localStorage.setItem('tintenwerk.ki.lauf.v1', JSON.stringify({ phase: 'start', n: 1 }))); await open();
  ok(await pg.evaluate(() => /Nach 2 Versuchen/.test(document.querySelector('#aiCrash').textContent)), 'Nach 2 Abstürzen: Hinweis, dass das Modell vermutlich nicht passt');
  ok(!errs.length, 'Keine Seitenfehler ' + JSON.stringify(errs));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
