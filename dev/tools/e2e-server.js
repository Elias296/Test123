// Browser-Test: Server-Modus von Tizian gegen einen simulierten OpenAI-kompatiblen Server.
// node dev/tools/e2e-server.js   (lokaler Server auf Port 8765)
const { chromium } = require('playwright');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const sse = parts => parts.map(p => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });   // ohne WebGPU – wie ein Gerät, auf dem Tizian lokal nicht läuft
  const reqs = [];
  await ctx.route('https://demo-tizian.hf.space/**', async r => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(req.postData()); reqs.push({ url: req.url(), auth: req.headers()['authorization'], body });
    const u = body.messages[body.messages.length - 1].content;
    const out = /Antworte nur/.test(u) ? ['OK'] : /Zeichne/.test(u) ? ['[Nicht lösbar: Bild fehlt]'] : ['Vom ', 'Server ', 'geglättet: ', u.split('\n').pop().slice(0, 30)];
    r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: sse(out) });
  });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8765/Tintenwerk.html'); await pg.waitForTimeout(500);
  const ev = f => pg.evaluate(f);

  ok(await ev(() => document.querySelector('#btnRewrite').disabled), 'Ohne WebGPU und ohne Server: „Text jetzt glätten“ gesperrt');
  await pg.click('#srvFold summary');
  await pg.click('#srvOn');
  ok(await ev(() => !document.querySelector('#srvOn').checked), 'Einschalten ohne Adresse wird verhindert');
  await pg.fill('#srvUrl', 'demo-tizian.hf.space'); await pg.fill('#srvKey', 'geheim-123'); await pg.locator('#srvKey').blur();
  await pg.click('#srvTest'); await pg.waitForFunction(() => /Verbunden/.test(document.querySelector('#srvStatus').textContent), null, { timeout: 10000 });
  ok(reqs[0] && reqs[0].url === 'https://demo-tizian.hf.space/v1/chat/completions' && reqs[0].auth === 'Bearer geheim-123' && reqs[0].body.stream === true, 'Verbindungstest: richtige Adresse, Schlüssel, Streaming');
  ok(await ev(() => TWApp.AI.state !== 'ready'), 'Test allein schaltet den Server-Modus nicht ein');

  await pg.click('#srvOn'); await pg.waitForSelector('#confirmModal:not([hidden])');
  ok(/demo-tizian\.hf\.space/.test(await pg.textContent('#confirmText')) && /verlassen also dein iPad/.test(await pg.textContent('#confirmText')), 'Datenschutz-Abfrage nennt den Server');
  await pg.click('#confirmNo'); ok(await ev(() => !document.querySelector('#srvOn').checked && TWApp.AI.state !== 'ready'), 'Ablehnen lässt den Modus aus');
  await pg.click('#srvOn'); await pg.click('#confirmYes'); await pg.waitForTimeout(100);
  ok(await ev(() => TWApp.AI.state === 'ready' && TWApp.AI.loaded === 'server' && !document.querySelector('#btnRewrite').disabled), 'Server-Modus an: Tizian bereit');
  ok(await ev(() => /Server/.test(document.querySelector('#gpuBadge').textContent) && !document.querySelector('#srvBadge').hidden && /hf\.space/.test(document.querySelector('#aiOne').textContent) && document.querySelector('#localOpts').hidden), 'Oberfläche zeigt Server-Modus deutlich an');

  await pg.fill('#editor', 'Fotosynthese\n\nDie Fotosynthese wandelt Licht in chemische Energie um. Dabei entsteht Glucose.'); await pg.locator('#editor').blur();
  await pg.click('#btnRewrite'); await pg.waitForFunction(() => document.querySelector('#cmpProgress').textContent === 'fertig', null, { timeout: 10000 });
  ok(/Vom Server geglättet/.test(await pg.inputValue('#cmpAi')), 'Glätten läuft über den Server (gestreamt)');
  await pg.click('#cmpDiscard');

  await pg.fill('#editor', '1. Berechne: 12 + 30 =\n2. Nenne zwei Laubbäume.\n3. Zeichne ein Dreieck.'); await pg.locator('#editor').blur();
  await pg.click('#btnSolveEditor'); await pg.waitForFunction(() => /fertig/.test(document.querySelector('#solveProgress').textContent), null, { timeout: 10000 });
  const sol = await pg.inputValue('#solveOut');
  ok(/12 \+ 30 = 42/.test(sol) && /Vom Server/.test(sol) && /Nicht lösbar/.test(sol), 'Aufgaben lösen über den Server, Rechner bleibt lokal');
  await pg.click('#solveDiscard');

  await pg.reload(); await pg.waitForTimeout(500);
  ok(await ev(() => TWApp.AI.state === 'ready' && TWApp.AI.loaded === 'server'), 'Server-Modus bleibt nach Neuladen erhalten');
  await pg.click('#btnSettings'); await pg.waitForTimeout(150);
  ok(await ev(() => !document.querySelector('#privServer').hidden && /demo-tizian/.test(document.querySelector('#privServer').textContent)), 'Datenschutz-Fenster weist auf den Server hin');
  await pg.click('#settingsModal [data-close]');

  await pg.click('#srvFold summary'); await pg.click('#srvOn'); await pg.waitForTimeout(100);
  ok(await ev(() => TWApp.AI.state !== 'ready' && document.querySelector('#btnRewrite').disabled && !/Server/.test(document.querySelector('#gpuBadge').textContent)), 'Ausschalten: zurück zu lokal (hier ohne WebGPU gesperrt)');
  ok(!errs.length, 'Keine Seitenfehler ' + JSON.stringify(errs));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
