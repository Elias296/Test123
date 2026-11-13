// Browser-Test der Oberfläche (Chromium/Playwright): node dev/tools/e2e-ui.js [ausgabeordner]
// Erwartet einen lokalen Server auf Port 8765, der das Repository ausliefert.
const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const out = process.argv[2] || path.join(__dirname, '..', 'out'); fs.mkdirSync(out, { recursive: true });
const FAKE_TF = `export const env={};
export class InterruptableStoppingCriteria{constructor(){this.interrupted=false}interrupt(){this.interrupted=true}}
export class TextStreamer{constructor(tok,o){this.cb=o.callback_function}}
export async function pipeline(task,model,opts){opts.progress_callback({status:'progress',file:'a.onnx',loaded:1e8,total:1e8});await new Promise(r=>setTimeout(r,300));
 const gen=async(msgs,o)=>{const res='Geglättet: '+msgs[1].content.slice(0,40);for(const w of res.split(' ')){o.streamer.cb(w+' ');await new Promise(r=>setTimeout(r,2));}return [{generated_text:[...msgs,{role:'assistant',content:res}]}]};
 gen.tokenizer={};return gen;}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get() { return { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) }; } }); });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.request().url().includes('@huggingface/transformers') ? r.fulfill({ contentType: 'text/javascript', body: FAKE_TF }) : r.abort());
  const pg = await ctx.newPage(); const errs = [];
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await pg.goto('http://127.0.0.1:8765/Tintenwerk.html'); await pg.waitForTimeout(500);
  const shot = n => pg.screenshot({ path: path.join(out, n + '.png') });
  const ev = f => pg.evaluate(f);

  // --- Layout
  const pw = await ev(() => document.querySelector('#panel').getBoundingClientRect().width);
  ok(pw >= 420 && pw / 1180 >= 0.38 && pw / 1180 <= 0.42, `Sidebar ${Math.round(pw)} px = ${(pw / 11.8).toFixed(1)} % der Breite`);
  ok(await ev(() => !document.querySelector('#zoomSeg') && !!document.querySelector('.pill #zoomLabel') && !!document.querySelector('.pill #pgLabel')), 'Zoom und Seiten in der Bottom-Pill, keine Leiste über dem Blatt');
  ok(await ev(() => [...document.querySelectorAll('#modeSeg .t-long')].map(e => e.textContent).join('|')) === 'Text & KI|Handschrift|Papier & Export', 'Tab-Namen');
  ok(await ev(() => [...document.querySelectorAll('.topbar .actions > *')].map(e => e.id).join(',')) === 'btnUndo,btnSettings,btnExport', 'Topbar rechts: Undo, Einstellungen, Exportieren');
  await shot('ui_1_text');
  const small = async () => ev(() => [...document.querySelectorAll('button,a.btn,.radio,.switch,summary,select,.field')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.trim().slice(0, 16), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44));
  for (const m of ['import', 'schrift', 'blatt']) { await pg.click(`#modeSeg [data-mode=${m}]`); await pg.waitForTimeout(80); const s = await small(); ok(!s.length, `Touch-Targets >= 44 px in „${m}“ ${s.length ? JSON.stringify(s) : ''}`); }

  // --- Zoom-Pill
  await pg.click('#zoomIn'); const z1 = await pg.textContent('#zoomLabel'); await pg.click('#zoomLabel'); const z2 = await pg.textContent('#zoomLabel');
  ok(/%/.test(z1) && z2 === 'Anpassen', `Zoom-Pill: ${z1} → ${z2}`);

  // --- Popover
  await pg.click('#modeSeg [data-mode=blatt]'); await pg.click('.info[data-info=paper]');
  ok(await ev(() => !document.querySelector('#pop').hidden && /419,53/.test(document.querySelector('#pop').textContent)), 'Info-Popover zeigt Details (Blattvorlage)');
  await shot('ui_3_papier_popover');
  await pg.click('#stage'); ok(await ev(() => document.querySelector('#pop').hidden), 'Popover schließt bei Tipp außerhalb');

  // --- Handschrift-Tab: Stil oben, Studio nur bei eigener Schrift
  await pg.click('#modeSeg [data-mode=schrift]');
  ok(await ev(() => document.querySelector('#studioCard').hidden && !!document.querySelector('[data-panel=schrift] input[name=style]')), 'Schriftstil in Tab 2, Zeichenstudio bei Systemschrift ausgeblendet');
  await shot('ui_2_schrift_system');
  await pg.click('input[name=style][value=eigen]', { force: true }); await pg.waitForTimeout(150);
  ok(await ev(() => !document.querySelector('#studioCard').hidden && document.querySelectorAll('.tile').length === 85), 'Eigene Handschrift: Zeichenstudio erscheint mit 85 Kacheln');
  ok(await ev(() => getComputedStyle(document.querySelector('.tiles')).gridTemplateColumns.split(' ').length) === 6, '6er-Raster');
  // alle Zeichen als gezeichnet simulieren
  await ev(() => { const g = { s: [[0, 0, 0, 20, 40, 0, 40, 0, 0]], w: 40, wf: [1], p: [0.5] }; for (const grp of TW.CHAR_GROUPS) for (const c of grp.chars) TWApp.S.own.glyphs[c] = g; });
  await pg.click('#modeSeg [data-mode=import]'); await pg.click('#modeSeg [data-mode=schrift]'); await pg.waitForTimeout(100);
  ok(await ev(() => document.querySelector('#ownCount').textContent === 'Alle 85 Zeichen bereit' && document.querySelector('#btnDrawNext').hidden && !document.querySelector('.tile .chk')), 'Bei 100 %: Badge „Alle 85 Zeichen bereit“, Knopf ausgeblendet, keine Häkchen-Icons');
  await shot('ui_2_schrift_eigen');
  await ev(() => { TWApp.S.own.glyphs = {}; }); await pg.click('input[name=style][value=klar]', { force: true });

  // --- Hochzahlen und spitze Klammern
  await pg.click('#modeSeg [data-mode=import]');
  await pg.fill('#editor', 'Der Graph y=x2 heißt Normalparabel. Es gilt a < b > c und x^3.'); await pg.locator('#editor').blur(); await pg.waitForTimeout(250);
  ok(/y=x² /.test(await pg.inputValue('#editor')) && /x³/.test(await pg.inputValue('#editor')), 'Editor: x2 und x^3 werden zu x² und x³');
  ok(await ev(() => TWApp.S.layout.unmapped.size === 0 && TWApp.S.layout.pages[0].glyphs.some(g => g.ch === '<')), 'Blatt: < und > werden gezeichnet');
  await pg.fill('#noteTitle', '<b>Titel</b> & <i>x</i>'); await pg.click('#btnExport'); await pg.waitForSelector('#exportResult:not([hidden])', { timeout: 30000 });
  ok(await ev(() => !document.querySelector('#exportSummary b b') && /<b>Titel<\/b>/.test(document.querySelector('#exportSummary').textContent)), 'HTML: spitze Klammern im Titel werden escaped angezeigt');
  await pg.click('#exportModal [data-close]');

  // --- KI: ein Knopf lädt und glättet
  ok(await pg.textContent('#btnRewrite') === 'Text jetzt glätten' && !(await ev(() => document.querySelector('#btnRewrite').disabled)), 'Knopf „Text jetzt glätten“ aktiv');
  await pg.click('#btnRewrite'); await pg.click('#confirmYes');
  await pg.waitForFunction(() => document.querySelector('#cmpProgress').textContent === 'fertig', null, { timeout: 20000 });
  ok(/Geglättet/.test(await pg.inputValue('#cmpAi')), 'Ein Tipp: Tizian lädt und glättet danach automatisch'); await pg.click('#cmpDiscard');
  await shot('ui_1_text_ki');

  // --- Hochformat
  await pg.setViewportSize({ width: 820, height: 1180 }); await pg.waitForTimeout(250); await shot('ui_hoch_panel');
  await pg.click('#viewSeg [data-view=stage]'); await pg.waitForTimeout(250); await shot('ui_hoch_blatt');
  ok(!errs.length, 'Keine Konsolenfehler ' + (errs.length ? JSON.stringify(errs) : ''));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
