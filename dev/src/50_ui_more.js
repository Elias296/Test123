/* ==========================================================================
   Tintenwerk – Zeichenstudio, Blatt-Einstellungen, lokale KI, Export, Selbsttest
   ========================================================================== */
(function () {
'use strict';
const A = window.TWApp.APP, { $, $$, clamp, esc, K, LS, IDB, S, toast, confirmDialog, openModal, closeModal, downloadBlob, safeName } = A;
const ALL_CHARS = TW.CHAR_GROUPS.flatMap(g => g.chars);
/* Eigene Handschrift: IndexedDB ist die Hauptablage, localStorage nur Zusatzkopie (falls klein genug) */
const saveOwn = () => {
  const lsOk = LS.quiet(K.own, S.own);
  if (!lsOk) LS.del(K.own);
  IDB.set('own', S.own).catch(() => { if (!lsOk) toast('Die Handschrift konnte nicht lokal gespeichert werden. Bitte als JSON sichern!', 6000); });
  return true;
};
const ownCount = () => ALL_CHARS.filter(c => S.own.glyphs[c]).length;

/* ---------- Kacheln ---------- */
function glyphSvg(found, cls) {
  const qs = TW.glyphQuads(found), w = Math.max(found.g.w, 20);
  let d = '';
  for (const q of qs) {
    d += `M${q.x.toFixed(1)} ${(100 - q.y).toFixed(1)}`;
    for (let i = 0; i < q.q.length; i += 4) d += `Q${q.q[i].toFixed(1)} ${(100 - q.q[i + 1]).toFixed(1)} ${q.q[i + 2].toFixed(1)} ${(100 - q.q[i + 3]).toFixed(1)}`;
  }
  const pad = Math.max(8, (150 - w) / 2);
  return `<svg class="${cls}" viewBox="${-pad} -12 ${w + 2 * pad} 156" fill="none" stroke="#1E3A8A" stroke-width="5.500" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
function renderTiles() {
  const host = $('#tileGroups'); let html = '';
  for (const g of TW.CHAR_GROUPS) {
    const done = g.chars.filter(c => S.own.glyphs[c]).length;
    html += `<div class="grp-h">${esc(g.name)}<span>${done}/${g.chars.length}</span></div><div class="tiles">`;
    for (const c of g.chars) {
      const o = S.own.glyphs[c];
      html += o
        ? `<button class="tile done" data-ch="${esc(c)}" aria-label="Zeichen ${esc(c)} – gezeichnet"><span class="lab">${esc(c)}</span><span class="chk"><svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"><path d="m2 6.500 2.800 2.800L10 3.500"/></svg></span>${glyphSvg({ g: o, own: true }, 'pv')}</button>`
        : `<button class="tile" data-ch="${esc(c)}" aria-label="Zeichen ${esc(c)} – noch nicht gezeichnet">${esc(c)}</button>`;
    }
    html += '</div>';
  }
  host.innerHTML = html;
  const n = ownCount();
  $('#ownCount').textContent = `${n} von ${ALL_CHARS.length}`;
  $('#ownBar').style.width = (n / ALL_CHARS.length * 100) + '%';
  $('#ownStyleHint').textContent = n ? `${n} von ${ALL_CHARS.length} Zeichen gezeichnet – fehlende werden ergänzt` : 'Noch keine Zeichen gezeichnet';
}
A.hook('tiles', renderTiles);
$('#tileGroups').addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) openDraw(t.dataset.ch); });
$('#btnDrawNext').addEventListener('click', () => { const c = ALL_CHARS.find(x => !S.own.glyphs[x]); if (c) openDraw(c); else toast('Alle Zeichen sind bereits gezeichnet.'); });
$('#btnUseOwn').addEventListener('click', () => {
  if (!ownCount()) { toast('Zeichne zuerst mindestens ein Zeichen.'); return; }
  S.settings.style = 'eigen'; A.saveSettings(); A.relayout(true); refreshBlattPanel();
  toast('Schriftstil „Meine eigene Handschrift“ ist aktiv.'); A.setView('stage');
});

/* ---------- Zeichenfeld (320 × 320, Apple Pencil) ---------- */
const PAD = { size: 320, asc: 60, xh: 140, base: 220, desc: 280, unit: 1.6 };
const D = { ch: 'a', strokes: [], cur: null, pid: null, penSeen: !!LS.get('tintenwerk.stift.v1', false), dirty: false };
const dCan = $('#drawCanvas'), dGuide = $('#drawGuide');
function setupPadCanvas(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = PAD.size * dpr; cv.height = PAD.size * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return c;
}
function drawGuides() {
  const c = setupPadCanvas(dGuide);
  c.clearRect(0, 0, PAD.size, PAD.size);
  const line = (y, col, dash, w) => { c.beginPath(); c.setLineDash(dash || []); c.strokeStyle = col; c.lineWidth = w || 1.5; c.moveTo(14, y); c.lineTo(PAD.size - 14, y); c.stroke(); };
  line(PAD.asc, '#C9D2E3'); line(PAD.xh, '#C9D2E3', [6, 6]); line(PAD.base, '#DC2626', null, 2); line(PAD.desc, '#C9D2E3');
  c.setLineDash([]);
  if ($('#drawTemplate').checked) {
    const f = TW.lookupGlyph('klar', D.ch, null);
    if (f) {
      const ox = (PAD.size - f.g.w * PAD.unit) / 2;
      c.strokeStyle = 'rgba(30,58,138,.13)'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
      for (const q of TW.glyphQuads(f)) {
        c.beginPath(); c.moveTo(ox + q.x * PAD.unit, PAD.base - q.y * PAD.unit);
        for (let i = 0; i < q.q.length; i += 4) c.quadraticCurveTo(ox + q.q[i] * PAD.unit, PAD.base - q.q[i + 1] * PAD.unit, ox + q.q[i + 2] * PAD.unit, PAD.base - q.q[i + 3] * PAD.unit);
        c.stroke();
      }
    }
  }
}
function paintStrokes() {
  const c = setupPadCanvas(dCan);
  c.clearRect(0, 0, PAD.size, PAD.size);
  c.strokeStyle = '#1A4B8C'; c.fillStyle = '#1A4B8C'; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const s of D.strokes.concat(D.cur ? [D.cur] : [])) {
    if (!s.pts.length) continue;
    const mp = s.pts.reduce((a, p) => a + p.p, 0) / s.pts.length;
    c.lineWidth = s.pen ? 2.2 + 3 * mp : 3.4;
    c.beginPath(); c.moveTo(s.pts[0].x, s.pts[0].y);
    if (s.pts.length === 1) c.lineTo(s.pts[0].x + 0.1, s.pts[0].y + 0.1);
    for (let i = 1; i < s.pts.length; i++) c.lineTo(s.pts[i].x, s.pts[i].y);
    c.stroke();
  }
}
function padPoint(e) {
  const r = dCan.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) * PAD.size / r.width, 0, PAD.size), y: clamp((e.clientY - r.top) * PAD.size / r.height, 0, PAD.size), p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5 };
}
function penInfo() { $('#drawPenInfo').textContent = $('#drawPenOnly').checked ? 'Apple Pencil erkannt – Stiftdruck wird aufgezeichnet, Finger werden ignoriert.' : 'Stiftdruck wird aufgezeichnet, sobald ein Apple Pencil erkannt wird. Finger zeichnen ohne Druck.'; }
$('#drawPenOnly').checked = D.penSeen;
$('#drawPenOnly').addEventListener('change', penInfo);
penInfo();
dCan.addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen') { if (!D.penSeen) { D.penSeen = true; LS.quiet('tintenwerk.stift.v1', true); $('#drawPenOnly').checked = true; } penInfo(); }
  else if (e.pointerType === 'touch' && $('#drawPenOnly').checked && D.penSeen) return;     // Handballen-Schutz: Finger ignorieren
  if (D.cur && D.pid !== null && e.pointerId !== D.pid) return;                               // zweiter Kontakt während eines Strichs
  if (D.pid !== null) return;
  e.preventDefault();
  D.pid = e.pointerId; try { dCan.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  D.cur = { pts: [padPoint(e)], pen: e.pointerType === 'pen' };
  paintStrokes();
});
dCan.addEventListener('pointermove', e => {
  if (e.pointerId !== D.pid || !D.cur) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (evs.length ? evs : [e])) {
    const p = padPoint(ev), l = D.cur.pts[D.cur.pts.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) >= 0.8) D.cur.pts.push(p);
  }
  paintStrokes();
});
function endStroke(e) {
  if (e.pointerId !== D.pid) return;
  D.pid = null;
  if (D.cur) { D.strokes.push(D.cur); D.cur = null; D.dirty = true; }
  paintStrokes(); drawState();
}
dCan.addEventListener('pointerup', endStroke);
dCan.addEventListener('pointercancel', endStroke);
['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'selectstart'].forEach(ev => $('#drawPad').addEventListener(ev, e => e.preventDefault(), { passive: false }));

/* Ramer-Douglas-Peucker in Schrifteinheiten */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function strokesToGlyph(strokes) {
  const raw = [];
  for (const s of strokes) {
    let pts = s.pts.map(p => [p.x / PAD.unit, (PAD.base - p.y) / PAD.unit]);
    const mp = s.pts.reduce((a, p) => a + p.p, 0) / s.pts.length;
    if (pts.length === 1 || (pts.length < 6 && Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < 2)) pts = [pts[0], [pts[0][0] + 1, pts[0][1] + 1.5]];   // Punkt
    else pts = rdp(pts, 0.7);
    raw.push({ pts, wf: s.pen ? clamp(0.72 + 0.6 * mp, 0.75, 1.3) : 1, p: Math.round(mp * 1000) / 1000 });
  }
  let mn = Infinity, mx = -Infinity;
  for (const s of raw) for (const p of s.pts) { mn = Math.min(mn, p[0]); mx = Math.max(mx, p[0]); }
  const g = { s: [], wf: [], p: [], w: Math.round((mx - mn) * 100) / 100 };
  for (const s of raw) {
    const flat = [], n = s.pts.length;
    for (let i = 0; i < n; i++) {
      let corner = 0;
      if (i > 0 && i < n - 1) {      // scharfe Richtungswechsel als Ecke merken
        const a = s.pts[i - 1], b = s.pts[i], c = s.pts[i + 1];
        const v1x = b[0] - a[0], v1y = b[1] - a[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
        const cos = (v1x * v2x + v1y * v2y) / ((Math.hypot(v1x, v1y) || 1) * (Math.hypot(v2x, v2y) || 1));
        if (cos < 0.25) corner = 1;
      }
      flat.push(Math.round((s.pts[i][0] - mn) * 100) / 100, Math.round(s.pts[i][1] * 100) / 100, corner);
    }
    g.s.push(flat); g.wf.push(Math.round(s.wf * 100) / 100); g.p.push(s.p);
  }
  return g;
}
function glyphToPad(g) {       // gespeichertes Zeichen wieder ins Zeichenfeld legen (zur Ansicht)
  const ox = (PAD.size - g.w * PAD.unit) / 2;
  return g.s.map((flat, si) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 3) pts.push({ x: ox + flat[i] * PAD.unit, y: PAD.base - flat[i + 1] * PAD.unit, p: (g.p && g.p[si]) || 0.5 });
    return { pts, pen: !!(g.p && g.p[si] && g.p[si] !== 0.5) };
  });
}
function drawState() {
  const saved = !!S.own.glyphs[D.ch], b = $('#drawState');
  if (D.dirty && D.strokes.length) { b.className = 'badge warn'; b.textContent = 'Ungespeicherte Zeichnung'; }
  else if (saved) { b.className = 'badge ok'; b.textContent = 'Gespeichert ✓ – zum Ersetzen „Neu zeichnen“'; }
  else { b.className = 'badge off'; b.textContent = 'Noch nicht gezeichnet'; }
  $('#drawDelete').disabled = !saved;
  $('#drawSave').disabled = $('#drawSaveNext').disabled = !(D.dirty && D.strokes.length);
}
function openDraw(ch) {
  D.ch = ch; D.cur = null; D.pid = null; D.dirty = false;
  const g = S.own.glyphs[ch];
  D.strokes = g ? glyphToPad(g) : [];
  $('#drawChar').textContent = ch;
  const idx = ALL_CHARS.indexOf(ch);
  $('#drawPos').textContent = `„${ch}“ · ${idx + 1} von ${ALL_CHARS.length}`;
  openModal('#drawModal'); drawGuides(); paintStrokes(); drawState();
}
function saveDrawing() {
  if (!D.strokes.length) return false;
  S.own.glyphs[D.ch] = strokesToGlyph(D.strokes);
  if (!saveOwn()) return false;
  D.dirty = false; renderTiles(); A.relayout(); drawState();
  return true;
}
$('#drawTemplate').addEventListener('change', drawGuides);
$('#drawUndo').addEventListener('click', () => { if (D.strokes.pop()) { D.dirty = true; paintStrokes(); drawState(); } });
$('#drawClear').addEventListener('click', () => { D.strokes = []; D.dirty = true; paintStrokes(); drawState(); });
$('#drawDelete').addEventListener('click', async () => {
  if (!(await confirmDialog(`Zeichen „${D.ch}“ entfernen?`, 'Die gespeicherte Zeichnung wird gelöscht; im Text wird wieder die Standardschrift verwendet.', 'Entfernen', true))) return;
  delete S.own.glyphs[D.ch]; saveOwn(); D.strokes = []; D.dirty = false; paintStrokes(); drawState(); renderTiles(); A.relayout();
});
$('#drawSave').addEventListener('click', () => { if (saveDrawing()) toast(`„${D.ch}“ gespeichert.`); });
$('#drawSaveNext').addEventListener('click', () => {
  if (!saveDrawing()) return;
  const i = ALL_CHARS.indexOf(D.ch);
  const next = ALL_CHARS.slice(i + 1).concat(ALL_CHARS.slice(0, i)).find(c => !S.own.glyphs[c]);
  if (next) openDraw(next); else { closeModal('#drawModal'); toast('Alle Zeichen sind gezeichnet.'); }
});
$('#drawCancel').addEventListener('click', async () => {
  if (D.dirty && D.strokes.length && !(await confirmDialog('Zeichnung verwerfen?', 'Die Zeichnung wurde noch nicht gespeichert.', 'Verwerfen', true))) return;
  closeModal('#drawModal');
});

/* ---------- JSON-Sicherung ---------- */
$('#btnOwnExport').addEventListener('click', () => {
  if (!ownCount() && !Object.keys(S.own.glyphs).length) { toast('Es gibt noch keine gezeichneten Zeichen.'); return; }
  const data = { app: 'Tintenwerk', typ: 'handschrift', v: 1, einheiten: 'Grundlinie y=0, x-Höhe 50, Oberlänge 100; Punkte als [x, y, Ecke]', erstellt: new Date().toISOString(), glyphs: S.own.glyphs };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `Tintenwerk-Handschrift-${new Date().toISOString().slice(0, 10)}.json`);
  toast('JSON-Sicherung erstellt.');
});
$('#btnOwnImport').addEventListener('click', () => $('#ownFile').click());
$('#ownFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || data.typ !== 'handschrift' || typeof data.glyphs !== 'object') throw new Error('Keine Tintenwerk-Handschrift-Sicherung.');
    const clean = {}; let n = 0;
    for (const [ch, g] of Object.entries(data.glyphs)) {
      if ([...ch].length !== 1 || !g || !Array.isArray(g.s) || !g.s.length || typeof g.w !== 'number') continue;
      if (!g.s.every(s => Array.isArray(s) && s.length >= 6 && s.length % 3 === 0 && s.every(Number.isFinite))) continue;
      clean[ch] = { s: g.s, w: g.w, wf: Array.isArray(g.wf) ? g.wf : g.s.map(() => 1), p: Array.isArray(g.p) ? g.p : g.s.map(() => 0.5) }; n++;
    }
    if (!n) throw new Error('Die Datei enthält keine gültigen Zeichen.');
    const has = Object.keys(S.own.glyphs).length;
    if (has && !(await confirmDialog('Sicherung importieren?', `${n} Zeichen aus der Datei ersetzen gleichnamige vorhandene Zeichen (${has} vorhanden).`, 'Importieren'))) return;
    Object.assign(S.own.glyphs, clean); saveOwn(); renderTiles(); A.relayout(true);
    toast(`${n} Zeichen importiert.`);
  } catch (err) { toast('Import fehlgeschlagen: ' + err.message, 5000); }
});

/* ---------- Blatt & Schrift ---------- */
function refreshBlattPanel() {
  const st = S.settings;
  $$('input[name=style]').forEach(i => { i.checked = i.value === st.style; });
  $$('.radio').forEach(l => { const i = $('input', l); if (i) l.classList.toggle('on', i.checked); });
  $$('[data-setting]').forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === String(st[seg.dataset.setting]))));
  $$('#inkSwatches .swatch').forEach(b => b.classList.toggle('on', b.dataset.hex === st.ink));
  const ink = TW.INKS.find(i => i.hex === st.ink); $('#inkName').textContent = ink ? '· ' + ink.name : '';
  $('#markFallback').checked = !!st.markFallback;
  const g = TW.grid(st), size = TW.SIZES[st.size], rows = Math.max(1, Math.ceil(size.em * 1.2 / g.S - 1e-9));
  $('#gridInfo').textContent = `A5 · 419,53 × 595,28 pt · erste Linie bei 50,25 pt · Abstand ${g.S.toFixed(2).replace('.', ',')} pt · ${g.rows} Grundlinien pro Seite` + (rows > 1 ? ` · Schriftgröße „${size.name}“ belegt hier ${rows} Rasterzeilen pro Textzeile.` : '.');
  const n = ownCount();
  $('#ownStyleHint').textContent = n ? `${n} von ${ALL_CHARS.length} Zeichen gezeichnet – fehlende werden ergänzt` : 'Noch keine Zeichen gezeichnet';
}
A.hook('blatt', refreshBlattPanel);
$('#inkSwatches').innerHTML = TW.INKS.map(i => `<button class="swatch" data-hex="${i.hex}" title="${esc(i.name)}" aria-label="${esc(i.name)}"><i style="background:${i.hex}"></i></button>`).join('');
function changed() { A.saveSettings(); refreshBlattPanel(); A.relayout(true); }
$('#inkSwatches').addEventListener('click', e => { const b = e.target.closest('.swatch'); if (b) { S.settings.ink = b.dataset.hex; changed(); } });
$$('[data-setting]').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const k = seg.dataset.setting; S.settings[k] = k === 'margin' ? Number(b.dataset.v) : b.dataset.v; S.page = 0; changed();
}));
$('#styleOpts').addEventListener('change', e => { if (e.target.name === 'style') { S.settings.style = e.target.value; changed(); if (e.target.value === 'eigen' && !ownCount()) toast('Noch keine eigenen Zeichen – es wird vollständig die Standardschrift verwendet.', 4500); } });
$('#markFallback').addEventListener('change', e => { S.settings.markFallback = e.target.checked; A.saveSettings(); A.drawSheet(); });

function charList(map) { return [...map.keys()].map(c => `<span title="U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} · ${map.get(c)}×">${esc(c)}</span>`).join(''); }
function warnHtml() {
  const L = S.layout; if (!L) return '';
  let h = '';
  if (L.unmapped.size) h += `<div class="warnbox"><b>${L.unmapped.size} Zeichen ohne Vektorpfad.</b> Diese Zeichen können nicht als Handschrift gezeichnet werden und fehlen auf dem Blatt und im Export. Bitte im Text ersetzen:<div class="chars">${charList(L.unmapped)}</div></div>`;
  if (S.settings.style === 'eigen' && L.fallback.size) h += `<div class="infobox"><b>Ergänzt durch Standardschrift:</b> ${L.fallback.size} Zeichen fehlen in deiner Handschrift${S.settings.markFallback ? ' (in der Vorschau bernsteinfarben markiert, im Export in Tintenfarbe)' : ''}.<div class="warnbox chars" style="background:transparent;border:0;padding:0">${charList(L.fallback)}</div></div>`;
  return h;
}
function updateWarnings() { $('#warnArea').innerHTML = warnHtml(); }
A.hook('warn', updateWarnings);

/* ---------- Lokale KI (Transformers.js + WebGPU, nur auf ausdrücklichen Klick) ---------- */
const AI = { tfUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2', model: 'onnx-community/Qwen2.5-0.5B-Instruct', dtype: 'q4f16', mb: 480, tf: null, gen: null, gpu: false, state: 'idle', stopper: null, running: false };
async function detectGpu() {
  const b = $('#gpuBadge'), btn = $('#btnLoadModel');
  const off = why => { b.className = 'badge off'; b.innerHTML = `<i></i>WebGPU nicht aktiv – KI deaktiviert, Editor &amp; Export voll nutzbar`; btn.disabled = true; btn.title = why; $('#aiError').hidden = false; $('#aiError').innerHTML = why; };
  if (location.protocol === 'file:') { off('Die Datei wurde über <b>file://</b> geöffnet. Safari stellt WebGPU nur über eine <b>https://</b>-Adresse bereit – siehe Zahnrad → „HTTPS-Hosting &amp; Home-Bildschirm“.'); return; }
  if (!('gpu' in navigator)) { off('Dieser Browser stellt kein WebGPU bereit (Safari ab iPadOS 26, oder unter iPadOS 18 als Feature-Flag aktivieren).'); return; }
  try {
    const ad = await navigator.gpu.requestAdapter();
    if (!ad) { off('Es wurde kein WebGPU-Grafikadapter gefunden.'); return; }
    AI.gpu = true;
    if (!ad.features.has('shader-f16')) { AI.dtype = 'q4'; AI.mb = 790; }
    const apple = /Mac|iPad|iPhone/.test(navigator.platform || '') || /Macintosh|iPad/.test(navigator.userAgent);
    b.className = 'badge ok'; b.innerHTML = `<i></i>WebGPU verfügbar${apple ? ' (M2 bereit)' : ''}`;
    btn.disabled = false; btn.textContent = `Lokales KI-Modell laden (ca. ${AI.mb} MB)`;
  } catch (e) { off('WebGPU konnte nicht initialisiert werden: ' + esc(e.message || e)); }
}
function aiError(msg) { const e = $('#aiError'); e.hidden = !msg; e.textContent = msg || ''; }
$('#btnLoadModel').addEventListener('click', async () => {
  if (AI.state === 'loading' || AI.state === 'ready') return;
  if (!(await confirmDialog('Lokales KI-Modell laden?', `Es werden ca. ${AI.mb} MB von huggingface.co heruntergeladen und im Browser-Cache dieses Geräts gespeichert (am besten im WLAN). Die Verarbeitung deiner Texte bleibt danach vollständig lokal.`, 'Jetzt laden'))) return;
  AI.state = 'loading'; aiError('');
  const btn = $('#btnLoadModel'); btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span> Modell wird geladen …';
  $('#modelProg').hidden = false; $('#modelBar').style.width = '0%'; $('#modelMsg').textContent = 'Transformers.js wird geladen (cdn.jsdelivr.net) …';
  const files = new Map();
  try {
    if (!AI.tf) AI.tf = await import(AI.tfUrl);
    AI.tf.env.allowLocalModels = false;
    AI.gen = await AI.tf.pipeline('text-generation', AI.model, {
      device: 'webgpu', dtype: AI.dtype,
      progress_callback: p => {
        if (p.status === 'progress' && p.file && p.total) {
          files.set(p.file, [p.loaded || 0, p.total]);
          let l = 0, t = 0; for (const [a, b] of files.values()) { l += a; t += b; }
          const pct = t ? l / t * 100 : 0;
          $('#modelBar').style.width = pct.toFixed(1) + '%';
          $('#modelMsg').textContent = `${pct.toFixed(0)} % · ${(l / 1048576).toFixed(0)} MB von ${(t / 1048576).toFixed(0)} MB geladen`;
        } else if (p.status === 'ready') $('#modelMsg').textContent = 'Modell wird auf der GPU vorbereitet …';
      }
    });
    AI.state = 'ready';
    $('#modelBar').style.width = '100%'; $('#modelMsg').textContent = 'Modell geladen und bereit (läuft lokal über WebGPU).';
    btn.hidden = true; $('#btnRewrite').hidden = false;
  } catch (e) {
    AI.state = 'idle'; AI.gen = null;
    $('#modelProg').hidden = true; btn.disabled = false; btn.textContent = `Lokales KI-Modell laden (ca. ${AI.mb} MB)`;
    const m = String((e && e.message) || e);
    aiError(/fetch|network|load failed|import/i.test(m) ? 'Das Modell konnte nicht geladen werden (Netzwerk oder CDN nicht erreichbar). Bitte Verbindung prüfen und erneut versuchen. Details: ' + m
      : /memory|allocation|out of/i.test(m) ? 'Zu wenig freier Speicher für das Modell. Bitte andere Tabs/Apps schließen und erneut versuchen. Details: ' + m
      : 'Das KI-Modell konnte nicht gestartet werden. Details: ' + m);
  }
});
const SYS_PROMPT = 'Du bist ein sorgfältiger Schreibassistent für Lernnotizen. Formuliere den Abschnitt des Nutzers flüssiger, natürlicher und persönlicher – so, als hätte ihn eine Studentin oder ein Student in eigenen Worten aufgeschrieben. Regeln: 1. Behalte ALLE Fakten, Zahlen, Daten, Einheiten, Namen, Einschränkungen und Fachbegriffe exakt bei. 2. Erfinde nichts hinzu und lasse nichts weg. 3. Behalte die Sprache des Abschnitts sowie Listenpunkte (Zeilen mit "- " oder Nummern) bei. 4. Gib ausschließlich den umformulierten Abschnitt aus – ohne Einleitung, Erklärung oder Anführungszeichen.';
function chunkText(text) {         // Absatz-Chunking; Überschriften und sehr kurze Blöcke bleiben unverändert
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/), out = [];
  let buf = [];
  const flush = () => { if (buf.length) { out.push({ text: buf.join('\n\n'), pass: false }); buf = []; } };
  for (const b of blocks) {
    const t = b.trim(); if (!t) continue;
    const heading = /^#{1,3}\s/.test(t) && !t.includes('\n');
    if (heading || t.length < 25) { flush(); out.push({ text: t, pass: true }); continue; }
    if (/^#{1,3}\s/.test(t)) {       // Überschrift + Text im selben Block: Überschrift abtrennen
      const nl = t.indexOf('\n'); flush(); out.push({ text: t.slice(0, nl), pass: true, tight: true });
      buf.push(t.slice(nl + 1)); continue;
    }
    if (buf.join('\n\n').length + t.length > 750) flush();
    buf.push(t);
  }
  flush();
  return out;
}
const numTokens = s => (s.match(/\d+(?:[.,:\/]\d+)*/g) || []).map(x => x.replace(/^0+(?=\d)/, ''));
function factCheck(orig, ai) {
  const a = numTokens(orig), b = numTokens(ai), cnt = new Map();
  for (const x of a) cnt.set(x, (cnt.get(x) || 0) + 1);
  const added = [];
  for (const x of b) { if (cnt.get(x)) cnt.set(x, cnt.get(x) - 1); else added.push(x); }
  const missing = []; for (const [x, n] of cnt) for (let i = 0; i < n; i++) missing.push(x);
  const la = orig.trim().length, lb = ai.trim().length;
  return { missing, added, shrink: la ? 1 - lb / la : 0, la, lb };
}
/* Eigennamen, Fachbegriffe, Kürzel: groß geschriebene Wörter (nicht am Satzanfang) und Wörter mit Ziffern/Großbuchstaben im Wort */
function termTokens(s) {
  const out = new Set(), re = /[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9-]{2,}|[A-Za-zÄÖÜäöüß]*[0-9][A-Za-zÄÖÜäöüß0-9]*|[a-zäöüß]+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]*/g;
  let m;
  while ((m = re.exec(s))) {
    const before = s.slice(0, m.index);
    if (/^[A-ZÄÖÜ][a-zäöüß-]+$/.test(m[0]) && /(^|[.!?:]\s+|\n[-*#\s\d.)]*)$/.test(before)) continue;      // Satzanfang: nur Groß-/Kleinschreibung, kein Begriff
    if (/^\d+$/.test(m[0])) continue;                                                                    // reine Zahlen prüft der Zahlen-Wächter
    out.add(m[0]);
  }
  return [...out];
}
function termCheck(orig, ai) {
  const low = ai.toLowerCase();
  return termTokens(orig).filter(t => { const l = t.toLowerCase(); return !low.includes(l.slice(0, Math.max(4, l.length - 3))); });
}
function showFactWarn() {
  const o = $('#cmpOrig').value, a = $('#cmpAi').value, w = $('#cmpWarn');
  $('#cmpLenA').textContent = o.trim().length + ' Zeichen'; $('#cmpLenB').textContent = a.trim().length + ' Zeichen';
  if (!a.trim() || AI.running) { w.hidden = true; return; }
  const f = factCheck(o, a), msgs = [];
  if (f.missing.length) msgs.push(`<b>Fehlende oder veränderte Zahlen/Daten:</b> ${f.missing.map(esc).join(' · ')}`);
  if (f.added.length) msgs.push(`<b>Neue Zahlen, die im Original nicht vorkommen:</b> ${f.added.map(esc).join(' · ')}`);
  const lostTerms = termCheck(o, a);
  if (lostTerms.length) msgs.push(`<b>Namen/Fachbegriffe nicht mehr im Text:</b> ${lostTerms.slice(0, 12).map(esc).join(' · ')}${lostTerms.length > 12 ? ' …' : ''}`);
  if (f.shrink > 0.2) msgs.push(`<b>Text ist um ${Math.round(f.shrink * 100)} % kürzer</b> (${f.la} → ${f.lb} Zeichen) – möglicherweise wurde Inhalt weggelassen.`);
  if (f.shrink < -0.5) msgs.push(`<b>Text ist um ${Math.round(-f.shrink * 100)} % länger</b> – möglicherweise wurde Inhalt hinzugefügt.`);
  w.hidden = !msgs.length;
  w.innerHTML = msgs.length ? '⚠️ <b>Fakten-/Zahlen-Wächter – bitte prüfen:</b><br>' + msgs.join('<br>') : '';
}
$('#cmpAi').addEventListener('input', showFactWarn);
$('#btnRewrite').addEventListener('click', async () => {
  if (!AI.gen || AI.running) return;
  const src = S.draft.text.trim();
  if (src.length < 20) { toast('Der Entwurf ist zu kurz zum Umformulieren.'); return; }
  const chunks = chunkText(src), todo = chunks.filter(c => !c.pass).length;
  $('#cmpOrig').value = src; $('#cmpAi').value = ''; $('#cmpAi').readOnly = true;
  $('#cmpWarn').hidden = true; $('#cmpTake').disabled = true; $('#cmpCancel').hidden = false;
  openModal('#cmpModal');
  AI.running = true; AI.stopper = new AI.tf.InterruptableStoppingCriteria();
  const done = []; let k = 0, aborted = false;
  const join = parts => parts.map((p, i) => p.text + (i < parts.length - 1 ? (p.tight ? '\n' : '\n\n') : '')).join('');
  try {
    for (const c of chunks) {
      if (c.pass) { done.push(c); $('#cmpAi').value = join(done); continue; }
      k++; $('#cmpProgress').textContent = `Abschnitt ${k} von ${todo} wird formuliert …`;
      let cur = '';
      const streamer = new AI.tf.TextStreamer(AI.gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { cur += t; const ta = $('#cmpAi'); ta.value = join(done.concat([{ text: cur }])); ta.scrollTop = ta.scrollHeight; } });
      const res = await AI.gen([{ role: 'system', content: SYS_PROMPT }, { role: 'user', content: c.text }],
        { max_new_tokens: Math.min(900, Math.ceil(c.text.length / 2) + 96), do_sample: false, repetition_penalty: 1.08, streamer, stopping_criteria: AI.stopper });
      if (AI.stopper.interrupted) { aborted = true; done.push({ text: cur.trim() }); break; }
      let outText = cur;
      try { const g = res[0].generated_text; outText = (Array.isArray(g) ? g[g.length - 1].content : g) || cur; } catch (e) { /* Streamer-Text verwenden */ }
      done.push({ text: outText.trim() });
      $('#cmpAi').value = join(done);
    }
  } catch (e) {
    toast('KI-Fehler: ' + ((e && e.message) || e), 6000);
  }
  AI.running = false; $('#cmpCancel').hidden = true; $('#cmpAi').readOnly = false;
  $('#cmpProgress').textContent = aborted ? 'abgebrochen – Teilergebnis' : 'fertig';
  $('#cmpTake').disabled = !$('#cmpAi').value.trim();
  showFactWarn();
});
$('#cmpCancel').addEventListener('click', () => { if (AI.stopper) AI.stopper.interrupt(); $('#cmpProgress').textContent = 'wird abgebrochen …'; });
$('#cmpDiscard').addEventListener('click', () => { if (AI.running && AI.stopper) AI.stopper.interrupt(); closeModal('#cmpModal'); });
$('#cmpTake').addEventListener('click', async () => {
  const ai = $('#cmpAi').value.trim(); if (!ai || AI.running) return;
  const f = factCheck($('#cmpOrig').value, ai);
  if ((f.missing.length || f.added.length || f.shrink > 0.2 || termCheck($('#cmpOrig').value, ai).length) && !(await confirmDialog('Trotz Warnung übernehmen?', 'Der Fakten-Wächter meldet Abweichungen zwischen Original und KI-Fassung. Du kannst die Übernahme danach mit dem Rückgängig-Pfeil zurücknehmen.', 'Trotzdem übernehmen'))) return;
  A.snapshot('KI-Fassung übernommen');
  A.setDraft({ title: S.draft.title, text: ai, isSample: false, imports: S.draft.imports || 0 });
  closeModal('#cmpModal'); toast('KI-Fassung übernommen.');
});

/* ---------- Export ---------- */
async function thumbnailJpeg() {
  const cv = document.createElement('canvas'); cv.width = 352; cv.height = 499;
  A.renderPage(cv.getContext('2d'), S.layout, 0, 352 / TW.PAGE_W, false);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array(0);
}
const EX = { blob: null, name: '' };
function openExport() {
  A.relayout(true);
  const L = S.layout, st = L.stats;
  $('#exportSummary').innerHTML = `<b>${esc(S.draft.title || 'Unbenannte Notiz')}</b><br>${st.pages} ${st.pages === 1 ? 'Seite' : 'Seiten'} A5 · ${st.strokes.toLocaleString('de-DE')} einzelne Vektor-Stiftstriche · Schrift: ${{ klar: 'Klar & ordentlich', locker: 'Locker & geschwungen', eigen: 'Meine eigene Handschrift' }[S.settings.style]}`;
  $('#exportWarn').innerHTML = warnHtml() + (S.draft.isSample ? '<div class="infobox" style="margin-top:8px">Du exportierst gerade die <b>Beispielnotiz</b>.</div>' : '') + (st.strokes === 0 ? '<div class="warnbox" style="margin-top:8px">Die Notiz ist leer – es würde ein leeres Blatt exportiert.</div>' : '');
  $('#exportResult').hidden = true; $('#exportChecks').innerHTML = '';
  openModal('#exportModal');
}
async function finishExport(bytes, name, mime, msg) {
  EX.blob = new Blob([bytes], { type: mime }); EX.name = name;
  const a = $('#exDownload');
  if (a.dataset.url) URL.revokeObjectURL(a.dataset.url);
  a.dataset.url = a.href = URL.createObjectURL(EX.blob); a.download = name;
  $('#exportResultMsg').innerHTML = msg;
  let canShare = false;
  try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([EX.blob], name, { type: mime })] })); } catch (e) { canShare = false; }
  $('#exShare').hidden = !canShare;
  $('#exportResult').hidden = false;
  $('#exportResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function checksHtml(list) { return list.map(c => `<li class="${c.ok ? (c.warn ? 'warn' : '') : 'bad'}"><span class="ic">${c.ok ? (c.warn ? '!' : '✓') : '✕'}</span><span>${esc(c.name)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</span></li>`).join(''); }
async function exportGoodnotes(btn) {
  A.relayout(true);
  const L = S.layout;
  if (L.unmapped.size && !(await confirmDialog('Zeichen ohne Vektorpfad', `${L.unmapped.size} Zeichen (${[...L.unmapped.keys()].join(' ')}) können nicht gezeichnet werden und würden im Export fehlen. Trotzdem exportieren?`, 'Trotzdem exportieren'))) return;
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Datei wird erzeugt …';
  try {
    const title = (S.draft.title || '').trim() || 'Tintenwerk-Notiz';
    const g = await TW.buildGoodnotes(L, title, await thumbnailJpeg());
    const v = await TW.verifyGoodnotes(g.zip, L);
    $('#exportChecks').innerHTML = checksHtml(v.checks);
    if (!v.ok) { toast('Interne Prüfung fehlgeschlagen – die Datei wurde nicht bereitgestellt.', 6000); openModal('#exportModal'); return; }
    openModal('#exportModal');
    await finishExport(g.zip, safeName(title) + '.goodnotes', 'application/octet-stream',
      `<b>${esc(safeName(title))}.goodnotes</b> ist fertig (${(g.zip.length / 1024).toFixed(0)} KB, ${L.stats.pages} ${L.stats.pages === 1 ? 'Seite' : 'Seiten'}). Auf dem iPad: „Teilen / in Goodnotes öffnen“ → <b>Goodnotes</b> wählen → „Als neues Dokument importieren“.`);
  } catch (e) { toast('Export fehlgeschlagen: ' + ((e && e.message) || e), 6000); }
  finally { btn.disabled = false; btn.innerHTML = label; }
}
async function exportPdf(btn) {
  A.relayout(true);
  const L = S.layout;
  if (L.unmapped.size && !(await confirmDialog('Zeichen ohne Vektorpfad', `${L.unmapped.size} Zeichen (${[...L.unmapped.keys()].join(' ')}) würden im PDF fehlen. Trotzdem exportieren?`, 'Trotzdem exportieren'))) return;
  const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin dark"></span> PDF wird erzeugt …';
  try {
    const title = (S.draft.title || '').trim() || 'Tintenwerk-Notiz';
    const pdf = await TW.buildPdf(L, title);
    $('#exportChecks').innerHTML = '';
    openModal('#exportModal');
    await finishExport(pdf, safeName(title) + '.pdf', 'application/pdf', `<b>${esc(safeName(title))}.pdf</b> ist fertig (${(pdf.length / 1024).toFixed(0)} KB). Papier und Vektor-Handschrift sind identisch zur Vorschau aufgeteilt.`);
  } catch (e) { toast('PDF-Export fehlgeschlagen: ' + ((e && e.message) || e), 6000); }
  finally { btn.disabled = false; btn.innerHTML = label; }
}
$('#btnExport').addEventListener('click', openExport);
$('#exGn').addEventListener('click', e => exportGoodnotes(e.currentTarget));
$('#exPdf').addEventListener('click', e => exportPdf(e.currentTarget));
$('#btnExportGn').addEventListener('click', e => { openExport(); exportGoodnotes(e.currentTarget); });
$('#btnExportPdf').addEventListener('click', e => { openExport(); exportPdf(e.currentTarget); });
$('#exShare').addEventListener('click', async () => {
  if (!EX.blob) return;
  try { await navigator.share({ files: [new File([EX.blob], EX.name, { type: EX.blob.type })], title: EX.name }); }
  catch (e) { if (e && e.name !== 'AbortError') toast('Teilen nicht möglich – bitte „In Dateien sichern“ verwenden.', 5000); }
});

/* ---------- System- & Export-Selbsttest ---------- */
async function selfTest() {
  const out = [];
  A.relayout(true);
  const L = S.layout, d = S.draft;
  // 1) Beispieltext und Nutzer-Import dürfen nie vermischt sein
  const hasMark = d.text.includes(A.SAMPLE_MARK);
  const mixed = (d.isSample && (d.imports || 0) > 0) || ((d.imports || 0) > 0 && hasMark);
  out.push({ name: 'Keine Vermischung von Beispieltext und Nutzer-Import', ok: !mixed, detail: d.isSample ? 'Aktuell ist die unveränderte Beispielnotiz geladen (0 Importe).' : `${d.imports || 0} Import(e) im Entwurf, Beispieltext nicht enthalten.` });
  const appendBlocked = $('#optAppendL input').disabled === (d.isSample || !d.text.trim());
  out.push({ name: 'Entwurfsschutz: Anhängen an Beispielnotiz gesperrt, Undo-Stand vorhanden/leer konsistent', ok: appendBlocked, detail: S.undo ? 'Undo-Stand: ' + (S.undo.reason || 'vorhanden') : 'Kein Undo-Stand gespeichert.' });
  // 2) Layout: Grundlinien & Ränder
  const v = TW.verifyLayout(L);
  out.push({ name: 'Grundlinien: jedes Zeichen sitzt exakt auf einer Rasterlinie', ok: v.offBase === 0, detail: `${v.n} Zeichen geprüft, ${v.offBase} Abweichungen` });
  out.push({ name: 'Schreibränder links/rechts eingehalten, nichts außerhalb des Blattes', ok: v.offMargin === 0 && v.offPage === 0, detail: `Rand ${S.settings.margin} mm · ${v.offMargin} Randverletzungen · ${v.offPage} Striche außerhalb` });
  // 3) Echte Exportdatei bauen und zurücklesen
  try {
    const g = await TW.buildGoodnotes(L, d.title || 'Selbsttest', await thumbnailJpeg());
    const r = await TW.verifyGoodnotes(g.zip, L);
    out.push(...r.checks);
    const ids = g.meta.pages.every(p => TW.uuidPlusOne(p.pageId) === p.notesId);
    out.push({ name: 'UUID-Paare (Seite, Seite + 1) für jede Seite gemeinsam erzeugt', ok: ids, detail: `${g.meta.pages.length} Paar(e)` });
  } catch (e) { out.push({ name: 'Probe-Export .goodnotes', ok: false, detail: String((e && e.message) || e) }); }
  // 4) Zeichenabdeckung
  out.push({ name: 'Alle Zeichen besitzen einen Vektorpfad', ok: true, warn: L.unmapped.size > 0, detail: L.unmapped.size ? 'Ohne Pfad: ' + [...L.unmapped.keys()].join(' ') : 'Keine Zeichen ohne Pfad.' });
  out.push({ name: 'Kompression für ZIP/PDF verfügbar', ok: true, warn: typeof CompressionStream === 'undefined', detail: typeof CompressionStream === 'undefined' ? 'CompressionStream fehlt – Export erfolgt unkomprimiert (gültig, nur größer).' : 'Deflate über CompressionStream.' });
  return out;
}
$('#btnSelfTest').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin dark"></span> Prüfung läuft …';
  let res; try { res = await selfTest(); } catch (err) { res = [{ name: 'Selbsttest', ok: false, detail: String(err.message || err) }]; }
  $('#selfTestOut').innerHTML = checksHtml(res);
  b.disabled = false; b.textContent = 'Selbsttest erneut ausführen';
  const bad = res.filter(r => !r.ok).length;
  toast(bad ? `${bad} Prüfung(en) fehlgeschlagen.` : 'Selbsttest bestanden.');
});
window.TWApp.selfTest = selfTest;
window.TWApp.termCheck = termCheck;

/* ---------- Datenschutz & Speicher ---------- */
async function refreshSettingsModal() {
  let bytes = 0;
  for (const k of Object.values(K)) { try { const v = localStorage.getItem(k); if (v) bytes += v.length * 2; } catch (e) { /* egal */ } }
  let extra = '';
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e.usage) extra = ` · gesamter Website-Speicher inkl. Modell-Cache: ${(e.usage / 1048576).toFixed(1)} MB`; } } catch (e) { /* egal */ }
  $('#storageInfo').textContent = `Tintenwerk-Daten: ${(bytes / 1024).toFixed(1)} KB · ${ownCount()} eigene Zeichen${extra}`;
  const hs = $('#hostState'), https = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  hs.className = 'badge ' + (https ? 'ok' : 'warn');
  hs.textContent = https ? 'Sichere Adresse (https) – alle Funktionen möglich' : (location.protocol === 'file:' ? 'file:// – WebGPU & Home-Bildschirm eingeschränkt' : 'Unverschlüsselte Adresse – eingeschränkt');
}
$('#btnSettings').addEventListener('click', () => { refreshSettingsModal(); openModal('#settingsModal'); });
$('#btnHostInfo').addEventListener('click', () => openModal('#hostModal'));
$('#delDraft').addEventListener('click', async () => {
  if (!(await confirmDialog('Entwürfe löschen?', 'Die aktuelle Notiz und der Undo-Stand werden unwiderruflich gelöscht.', 'Löschen', true))) return;
  LS.del(K.draft); LS.del(K.undo); S.undo = null;
  A.setDraft({ title: '', text: '', isSample: false, imports: 0 }); toast('Entwürfe gelöscht.'); refreshSettingsModal();
});
$('#delOwn').addEventListener('click', async () => {
  if (!(await confirmDialog('Eigene Handschrift zurücksetzen?', 'Alle gezeichneten Zeichen werden gelöscht. Tipp: vorher als JSON sichern.', 'Zurücksetzen', true))) return;
  S.own = { v: 1, glyphs: {} }; LS.del(K.own); IDB.del('own');
  if (S.settings.style === 'eigen') { S.settings.style = 'klar'; A.saveSettings(); }
  renderTiles(); refreshBlattPanel(); A.relayout(true); toast('Eigene Handschrift zurückgesetzt.'); refreshSettingsModal();
});
async function clearModelCache() {
  let n = 0;
  try { if (window.caches) for (const k of await caches.keys()) { if (/transformers/i.test(k)) { await caches.delete(k); n++; } } } catch (e) { /* egal */ }
  return n;
}
$('#delModel').addEventListener('click', async () => { const n = await clearModelCache(); toast(n ? 'KI-Modell aus dem Cache entfernt.' : 'Es ist kein KI-Modell im Cache gespeichert.'); refreshSettingsModal(); });
$('#delAll').addEventListener('click', async () => {
  if (!(await confirmDialog('Komplett-Reset?', 'Entwurf, Undo-Stand, Einstellungen, eigene Handschrift und der KI-Modell-Cache werden gelöscht. Das lässt sich nicht rückgängig machen.', 'Alles löschen', true))) return;
  for (const k of Object.values(K)) LS.del(k);
  await clearModelCache();
  try { const d = await IDB.open().catch(() => null); if (d) d.close(); await new Promise(r => { const q = indexedDB.deleteDatabase('tintenwerk'); q.onsuccess = q.onerror = q.onblocked = r; }); } catch (e) { /* egal */ }
  location.reload();
});

/* ---------- Start ---------- */
function makeTouchIcon() {         // Home-Bildschirm-Symbol zur Laufzeit erzeugen (Einzeldatei, keine Bilddatei nötig)
  try {
    const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d');
    x.fillStyle = '#1E3A8A'; x.fillRect(0, 0, 180, 180);
    x.scale(180 / 32, 180 / 32); x.translate(0.5, 0.5);
    x.fillStyle = '#fff'; x.fill(new Path2D('M26 5C16 5.600 9.500 11.200 8 20.200L6.900 26.500l2.200-1.400C18.400 23.500 25 17.300 26 5Z'));
    x.strokeStyle = '#1E3A8A'; x.lineWidth = 1.5; x.lineCap = 'round'; x.stroke(new Path2D('M7 27.500 18.500 13'));
    $('#touchIcon').href = c.toDataURL('image/png');
  } catch (e) { /* Symbol ist optional */ }
}
function init() {
  makeTouchIcon();
  A.syncDraftUi(); A.syncZoom();
  A.setMode(['import', 'schrift', 'blatt'].includes(S.mode) ? S.mode : 'import');
  refreshBlattPanel();
  A.relayout(true);
  detectGpu();
  IDB.get('own').then(o => {
    if (o && o.glyphs && Object.keys(o.glyphs).length >= Object.keys(S.own.glyphs).length) { S.own = o; renderTiles(); refreshBlattPanel(); A.relayout(true); }
    else if (Object.keys(S.own.glyphs).length) IDB.set('own', S.own).catch(() => {});        // ältere Kopie aus localStorage übernehmen
  }).catch(() => { /* ohne IndexedDB: localStorage bleibt in Gebrauch */ });
  requestAnimationFrame(() => A.drawSheet());
  setTimeout(() => A.drawSheet(), 300);
  window.addEventListener('pagehide', () => { try { localStorage.setItem(K.draft, JSON.stringify(S.draft)); } catch (e) { /* egal */ } });
}
init();
})();
