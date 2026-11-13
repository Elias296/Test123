/* ==========================================================================
   Tintenwerk – Oberfläche: Zustand, Speicher, Vorschau, Import/OCR, Entwurfsschutz
   ========================================================================== */
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const K = { draft: 'tintenwerk.entwurf.v1', undo: 'tintenwerk.undo.v1', settings: 'tintenwerk.einstellungen.v1', own: 'tintenwerk.handschrift.v1', ui: 'tintenwerk.ui.v1' };

const SAMPLE_MARK = 'Dies ist eine Beispielnotiz von Tintenwerk.';
const SAMPLE = {
  title: 'Willkommen im Tintenwerk',
  text: 'Willkommen im Tintenwerk\n\n' + SAMPLE_MARK + ' Sie zeigt, wie dein Text als echte Vektor-Handschrift auf einem Goodnotes-Blatt aussieht.\n\n' +
    '# So funktioniert es\n- Screenshots importieren und Text lokal erkennen lassen\n- Text prüfen, korrigieren und auf Wunsch natürlicher formulieren\n- Schriftstil, Papier und Tinte wählen\n- Als native .goodnotes-Datei oder PDF exportieren\n\n' +
    '## Gut zu wissen\n1. Jede Zeile sitzt exakt auf der Grundlinie.\n2. Die Schrift lässt sich in Goodnotes mit Lasso und Radierer bearbeiten.\n3. Alles bleibt auf deinem iPad – 100 % lokal.\n\n' +
    'Tippe auf „Neue Notiz“ oder importiere deinen ersten Screenshot.'
};

/* ---------- Speicher ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Lokales Speichern nicht möglich (Speicher voll oder gesperrt).'); return false; } },
  quiet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } }
};
/* IndexedDB: großzügigerer Speicher für die eigene Handschrift (localStorage ist auf ca. 5 MB begrenzt) */
const IDB = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB nicht verfügbar')); return; }
      const r = indexedDB.open('tintenwerk', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }); },
  async del(k) { try { const d = await this.open(); await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = t.onerror = t.onabort = res; }); } catch (e) { /* egal */ } }
};
const S = {
  mode: 'import', page: 0, zoom: 'fit', layout: null,
  draft: LS.get(K.draft, null) || { title: SAMPLE.title, text: SAMPLE.text, isSample: true, imports: 0 },
  undo: LS.get(K.undo, null),
  settings: Object.assign({}, TW.DEFAULT_SETTINGS, LS.get(K.settings, {})),
  own: LS.get(K.own, null) || { v: 1, glyphs: {} }
};
const ui0 = LS.get(K.ui, {});
if (ui0.mode) S.mode = ui0.mode;
if (ui0.zoom) S.zoom = ui0.zoom;
window.TWApp = { S, TW };

let saveT = 0;
function saveDraft() { clearTimeout(saveT); saveT = setTimeout(() => LS.set(K.draft, S.draft), 250); }
function saveDraftNow() { clearTimeout(saveT); LS.set(K.draft, S.draft); }
function saveSettings() { LS.set(K.settings, S.settings); }
function saveUi() { LS.set(K.ui, { mode: S.mode, zoom: S.zoom }); }

/* ---------- Kleinteile: Toast, Dialoge, Download ---------- */
let toastT = 0;
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 3200); }
function confirmDialog(title, text, okLabel, danger) {
  return new Promise(res => {
    const m = $('#confirmModal'), y = $('#confirmYes'), n = $('#confirmNo');
    $('#confirmTitle').textContent = title; $('#confirmText').textContent = text || '';
    y.textContent = okLabel || 'OK'; y.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    m.hidden = false;
    const done = v => { m.hidden = true; y.onclick = n.onclick = null; res(v); };
    y.onclick = () => done(true); n.onclick = () => done(false);
  });
}
function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }
$$('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('.modal').hidden = true; }));
function downloadBlob(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const safeName = s => (s || 'Notiz').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Notiz';

/* ---------- Modus & Ansicht ---------- */
function setMode(mode) {
  S.mode = mode; saveUi();
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $$('#panel > section').forEach(s => { s.hidden = s.dataset.panel !== mode; });
  $('#panel').scrollTop = 0;
  closePop();
  if (mode === 'schrift') renderTiles();
  if (mode !== 'import') refreshBlattPanel();
  setView('panel');
}
function setView(v) {
  $('#main').dataset.view = v;
  $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v === 'stage') requestAnimationFrame(drawSheet);
}
$('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('#viewSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });

/* ---------- Vorschau (gleiche Layout-Daten wie PDF & .goodnotes) ---------- */
function renderPage(ctx, layout, pi, scale, mark) {
  const P = TW.paper(layout.settings), page = layout.pages[pi];
  ctx.save(); ctx.scale(scale, scale);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, TW.PAGE_W, TW.PAGE_H);
  ctx.fillStyle = P.line;
  for (const r of P.rects) ctx.fillRect(r[0], r[1], r[2], r[3]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (page) for (const s of page.strokes) {
    ctx.strokeStyle = (mark && s.fb) ? '#D97706' : layout.settings.ink;
    ctx.lineWidth = s.w;
    ctx.beginPath(); ctx.moveTo(s.x, s.y);
    for (let i = 0; i < s.q.length; i += 4) ctx.quadraticCurveTo(s.q[i], s.q[i + 1], s.q[i + 2], s.q[i + 3]);
    ctx.stroke();
  }
  ctx.restore();
}
function sheetScale() {
  if (S.zoom !== 'fit') return parseFloat(S.zoom) * 96 / 72;
  const sc = $('#sheetScroll'), w = sc.clientWidth - 56, h = sc.clientHeight - 124;
  return clamp(Math.min(w / TW.PAGE_W, h / TW.PAGE_H), 0.3, 4);
}
function drawSheet() {
  if (!S.layout) return;
  const sc = sheetScale(), dpr = Math.min(window.devicePixelRatio || 1, 3);
  const sheet = $('#sheet'), cv = $('#sheetCanvas');
  const cw = Math.round(TW.PAGE_W * sc), ch = Math.round(TW.PAGE_H * sc);
  if (cw < 10 || ch < 10) return;
  sheet.style.width = cw + 'px'; sheet.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  const ctx = cv.getContext('2d');
  renderPage(ctx, S.layout, S.page, cv.width / TW.PAGE_W, S.settings.style === 'eigen' && S.settings.markFallback);
}
function updatePager() {
  const n = S.layout.pages.length;
  S.page = clamp(S.page, 0, n - 1);
  $('#pgLabel').textContent = `${S.page + 1} / ${n}`; $('#pgLabel').setAttribute('aria-label', `Seite ${S.page + 1} von ${n}`);
  $('#pgPrev').disabled = S.page <= 0; $('#pgNext').disabled = S.page >= n - 1;
  const st = S.layout.stats;
  $('#statsChip').textContent = `${n} ${n === 1 ? 'Seite' : 'Seiten'} · ${st.strokes.toLocaleString('de-DE')} Striche`;
}
let layT = 0;
function relayout(now) {
  clearTimeout(layT);
  const run = () => {
    S.layout = TW.layout(S.draft, S.settings, S.own);
    updatePager(); drawSheet(); updateWarnings(); updateEditorStats();
  };
  if (now) run(); else layT = setTimeout(run, 140);
}
$('#pgPrev').addEventListener('click', () => { S.page--; updatePager(); drawSheet(); $('#sheetScroll').scrollTop = 0; });
$('#pgNext').addEventListener('click', () => { S.page++; updatePager(); drawSheet(); $('#sheetScroll').scrollTop = 0; });
/* Zoom in der Bottom-Pill: − / Anzeige (Tipp = Anpassen ↔ 100 %) / + */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
function stepZoom(dir) {
  const cur = sheetScale() * 72 / 96;
  const next = dir > 0 ? ZOOMS.find(z => z > cur + 0.01) : ZOOMS.slice().reverse().find(z => z < cur - 0.01);
  if (!next) return;
  S.zoom = String(next); saveUi(); syncZoom(); drawSheet();
}
$('#zoomIn').addEventListener('click', () => stepZoom(1));
$('#zoomOut').addEventListener('click', () => stepZoom(-1));
$('#zoomLabel').addEventListener('click', () => { S.zoom = S.zoom === 'fit' ? '1' : 'fit'; saveUi(); syncZoom(); drawSheet(); });
/* Zwei-Finger-Zoom (Touch) und Strg+Mausrad/Trackpad-Pinch; Verschieben läuft über natives Scrollen */
(function () {
  const sc = $('#sheetScroll'); let p0 = null, raf = 0;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  function zoomTo(scale, fx, fy) {
    const old = sheetScale(), next = clamp(scale, 0.35, 4), r = next / old;
    if (Math.abs(r - 1) < 0.002) return;
    const px = sc.scrollLeft + fx, py = sc.scrollTop + fy;
    S.zoom = String(Math.round(next * 72 / 96 * 1000) / 1000);
    syncZoom();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawSheet(); sc.scrollLeft = px * r - fx; sc.scrollTop = py * r - fy; });
  }
  sc.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { const b = sc.getBoundingClientRect(); p0 = { d: dist(e.touches), s: sheetScale(), fx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - b.left, fy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - b.top }; }
  }, { passive: true });
  sc.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && p0) {
      e.preventDefault();
      const b = sc.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - b.left, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - b.top;
      zoomTo(p0.s * dist(e.touches) / p0.d, cx, cy);
    }
  }, { passive: false });
  const end = e => { if (e.touches.length < 2 && p0) { p0 = null; saveUi(); } };
  sc.addEventListener('touchend', end); sc.addEventListener('touchcancel', end);
  ['gesturestart', 'gesturechange'].forEach(ev => sc.addEventListener(ev, e => e.preventDefault()));    // Safari: kein Seiten-Zoom
  sc.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const b = sc.getBoundingClientRect();
    zoomTo(sheetScale() * Math.exp(-e.deltaY * 0.01), e.clientX - b.left, e.clientY - b.top);
    clearTimeout(zoomTo.t); zoomTo.t = setTimeout(saveUi, 400);
  }, { passive: false });
})();
function syncZoom() { $('#zoomLabel').textContent = S.zoom === 'fit' ? 'Anpassen' : Math.round(parseFloat(S.zoom) * 100) + ' %'; }
let rsT = 0;
window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { drawSheet(); if (!$('#cropModal').hidden) fitCrop(); }, 80); });

/* ---------- Editor, Titel, Entwurfsschutz ---------- */
const editor = $('#editor'), titleInput = $('#noteTitle');
function syncDraftUi() {
  editor.value = S.draft.text; titleInput.value = S.draft.title;
  $('#sampleBadge').hidden = !S.draft.isSample;
  $('#btnUndo').disabled = !S.undo;
  $('#btnUndo').title = S.undo ? 'Rückgängig: ' + (S.undo.reason || 'letzter Import') : 'Letzten Import rückgängig machen';
  updateAppendOption();
}
function updateEditorStats() {
  const t = S.draft.text.trim(), words = t ? t.split(/\s+/).length : 0;
  $('#editorStats').textContent = `${words.toLocaleString('de-DE')} Wörter · ${S.draft.text.length.toLocaleString('de-DE')} Zeichen · automatisch lokal gespeichert`;
}
/* Hochzahlen (x^2, x2 -> x²) beim Verlassen des Feldes setzen – nicht während des Tippens */
function applyTypo(el, key) {
  if (S.settings.autoSup === false) return;
  const t = TW.typo(el.value);
  if (t === el.value) return;
  el.value = t; S.draft[key] = t; saveDraft(); relayout();
}
editor.addEventListener('change', () => applyTypo(editor, 'text'));
titleInput.addEventListener('change', () => applyTypo(titleInput, 'title'));
editor.addEventListener('input', () => {
  S.draft.text = editor.value;
  if (S.draft.isSample) { S.draft.isSample = false; $('#sampleBadge').hidden = true; updateAppendOption(); }
  saveDraft(); relayout();
});
titleInput.addEventListener('input', () => {
  S.draft.title = titleInput.value;
  if (S.draft.isSample) { S.draft.isSample = false; $('#sampleBadge').hidden = true; updateAppendOption(); }
  saveDraft(); relayout();
});
function snapshot(reason) {
  S.undo = { title: S.draft.title, text: S.draft.text, isSample: !!S.draft.isSample, imports: S.draft.imports || 0, reason, at: Date.now() };
  LS.set(K.undo, S.undo);
}
function setDraft(d) { S.draft = d; saveDraftNow(); S.page = 0; syncDraftUi(); relayout(true); }
$('#btnUndo').addEventListener('click', () => {
  if (!S.undo) return;
  const u = S.undo;
  S.undo = null; LS.del(K.undo);
  setDraft({ title: u.title, text: u.text, isSample: u.isSample, imports: u.imports });
  toast('Vorheriger Stand wiederhergestellt.');
});
$('#btnNew').addEventListener('click', async () => {
  const has = S.draft.text.trim() && !S.draft.isSample;
  if (has && !(await confirmDialog('Neue leere Notiz?', 'Der aktuelle Entwurf wird geleert. Mit dem Rückgängig-Pfeil kannst du ihn einmal wiederherstellen.', 'Leeren'))) return;
  if (has) snapshot('Notiz geleert');
  setDraft({ title: '', text: '', isSample: false, imports: 0 });
  setMode('import'); editor.focus();
  toast('Neue leere Notiz angelegt.');
});

/* ---------- Übernahme aus dem Prüfungsfenster ---------- */
function updateAppendOption() {
  const empty = !S.draft.text.trim();
  const blocked = S.draft.isSample || empty;
  const a = $('#optAppendL input');
  a.disabled = blocked; $('#optAppendL').classList.toggle('disabled', blocked);
  $('#appendHint').textContent = S.draft.isSample ? 'Nicht möglich: An die Beispielnotiz wird nie angehängt.' : (empty ? 'Der aktuelle Entwurf ist leer.' : 'Fügt den Text mit einem Absatzumbruch unten an.');
  if (blocked && a.checked) $('#optReplaceL input').checked = true;
  syncRadioCards();
}
function syncRadioCards() { $$('.radio').forEach(l => { const i = $('input', l); if (i) l.classList.toggle('on', i.checked); }); }
document.addEventListener('change', e => { if (e.target.matches('.radio input')) syncRadioCards(); });
function titleFromText(text) {
  for (const raw of text.split('\n')) {
    const l = raw.replace(/^\s*#{1,3}\s+/, '').replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim();
    if (l.replace(/[^A-Za-zÄÖÜäöüß0-9]/g, '').length >= 3) return l.length > 60 ? l.slice(0, 57).replace(/\s+\S*$/, '') + ' …' : l;
  }
  return 'Notiz vom ' + new Date().toLocaleDateString('de-DE');
}
function showStaging(text, info) {
  $('#stagingText').value = text;
  $('#stagingCard').hidden = false;
  if (info) $('#stagingInfo').textContent = info;
  $('#optReplaceL input').checked = true;      // „Als neue Notiz“ ist immer die Vorauswahl
  updateAppendOption();
  setMode('import');
  requestAnimationFrame(() => $('#stagingCard').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
function hideStaging() { $('#stagingCard').hidden = true; $('#stagingText').value = ''; }
$('#btnDiscard').addEventListener('click', async () => {
  if ($('#stagingText').value.trim() && !(await confirmDialog('Erkannten Text verwerfen?', 'Der geprüfte OCR-Text wird gelöscht. Dein Entwurf bleibt unverändert.', 'Verwerfen', true))) return;
  hideStaging();
});
$('#btnTake').addEventListener('click', () => {
  const text = $('#stagingText').value.replace(/\r\n?/g, '\n').trim();
  if (!text) { toast('Das Prüfungsfenster ist leer.'); return; }
  let mode = ($('input[name=takeMode]:checked') || {}).value || 'replace';
  if (mode === 'append' && (S.draft.isSample || !S.draft.text.trim())) mode = 'replace';   // Sicherheitsregel: nie an die Beispielnotiz anhängen
  snapshot(mode === 'append' ? 'Import angehängt' : 'Import als neue Notiz');
  if (mode === 'append') {
    setDraft({ title: S.draft.title, text: S.draft.text.replace(/\s+$/, '') + '\n\n' + text, isSample: false, imports: (S.draft.imports || 0) + 1 });
    toast('Text an die aktuelle Notiz angehängt.');
  } else {
    setDraft({ title: titleFromText(text), text, isSample: false, imports: 1 });
    toast('Als neue Notiz übernommen. Titel automatisch erzeugt.');
  }
  hideStaging();
});

/* ---------- Screenshot-Import: Zuschneiden ---------- */
const crop = { rect: { x: 0, y: 0, w: 1, h: 1 }, img: null, resolve: null, last: null };
const cropWrap = $('#cropWrap'), cropRect = $('#cropRect'), cropImg = $('#cropImg');
function fitCrop() {
  if (!crop.img) return;
  const st = $('#cropStage'), aw = st.clientWidth - 56, ah = st.clientHeight - 56;
  const k = Math.min(aw / crop.img.naturalWidth, ah / crop.img.naturalHeight);
  cropWrap.style.width = Math.max(40, Math.floor(crop.img.naturalWidth * k)) + 'px';
  cropWrap.style.height = Math.max(40, Math.floor(crop.img.naturalHeight * k)) + 'px';
}
function paintCrop() {
  const r = crop.rect;
  cropRect.style.left = r.x * 100 + '%'; cropRect.style.top = r.y * 100 + '%';
  cropRect.style.width = r.w * 100 + '%'; cropRect.style.height = r.h * 100 + '%';
}
function cropDrag(e, mode) {
  e.preventDefault(); e.stopPropagation();
  const el = e.currentTarget, box = cropWrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, r0 = Object.assign({}, crop.rect), MIN = 0.05;
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* ältere Browser */ }
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    ev.preventDefault();
    const dx = (ev.clientX - sx) / box.width, dy = (ev.clientY - sy) / box.height;
    let x = r0.x, y = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
    if (mode === 'move') { x = clamp(r0.x + dx, 0, 1 - r0.w); y = clamp(r0.y + dy, 0, 1 - r0.h); x2 = x + r0.w; y2 = y + r0.h; }
    else {
      if (mode.includes('w')) x = clamp(x + dx, 0, x2 - MIN);
      if (mode.includes('e')) x2 = clamp(x2 + dx, x + MIN, 1);
      if (mode.includes('n')) y = clamp(y + dy, 0, y2 - MIN);
      if (mode.includes('s')) y2 = clamp(y2 + dy, y + MIN, 1);
    }
    crop.rect = { x, y, w: x2 - x, h: y2 - y }; paintCrop();
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
cropRect.addEventListener('pointerdown', e => { if (e.target === cropRect) cropDrag(e, 'move'); });
$$('.ch', cropRect).forEach(h => h.addEventListener('pointerdown', e => cropDrag(e, h.dataset.h)));
$('#cropStage').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
$('#cropPreset').addEventListener('click', () => { crop.rect = { x: 0.26, y: 0.06, w: 0.74, h: 0.80 }; paintCrop(); });   // Statusleiste ~6 %, Seitenleiste ~26 %, Eingabefeld ~14 %
$('#cropFull').addEventListener('click', () => { crop.rect = { x: 0, y: 0, w: 1, h: 1 }; paintCrop(); });
$('#cropCancel').addEventListener('click', () => crop.resolve && crop.resolve('cancel'));
$('#cropSkip').addEventListener('click', () => crop.resolve && crop.resolve('skip'));
$('#cropOk').addEventListener('click', () => crop.resolve && crop.resolve('ok'));
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({ img, url }); img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}
async function cropOne(file, idx, total) {
  const { img, url } = await loadImage(file);
  crop.img = img; cropImg.src = url;
  crop.rect = crop.last ? Object.assign({}, crop.last) : { x: 0, y: 0, w: 1, h: 1 };
  $('#cropCount').textContent = total > 1 ? `Bild ${idx + 1} von ${total}` : file.name || '';
  openModal('#cropModal'); fitCrop(); paintCrop();
  const action = await new Promise(r => { crop.resolve = r; });
  crop.resolve = null;
  let canvas = null;
  if (action === 'ok') {
    const r = crop.rect; crop.last = Object.assign({}, r);
    const sx = Math.round(r.x * img.naturalWidth), sy = Math.round(r.y * img.naturalHeight);
    const sw = Math.max(8, Math.round(r.w * img.naturalWidth)), sh = Math.max(8, Math.round(r.h * img.naturalHeight));
    let k = 1; const long = Math.max(sw, sh);
    if (long > 2800) k = 2800 / long; else if (sw < 1100) k = Math.min(2, 2200 / long);
    canvas = document.createElement('canvas');          // Offscreen-Canvas: nur der Ausschnitt geht in die OCR
    canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
    const c = canvas.getContext('2d'); c.imageSmoothingQuality = 'high';
    c.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  URL.revokeObjectURL(url); cropImg.removeAttribute('src'); crop.img = null;
  return { action, canvas };
}

/* ---------- Lokale OCR (Tesseract.js, nachgeladen) ---------- */
const OCR = { worker: null, cancelled: false, busy: false, loading: null };
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('Skript nicht ladbar')); }; document.head.appendChild(s); });
}
function ocrProgress(msg, frac) {
  $('#ocrStatus').hidden = false; $('#ocrMsg').textContent = msg;
  if (frac != null) $('#ocrBar').style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
}
const OCR_STEPS = { 'loading tesseract core': 'OCR-Kern wird geladen', 'initializing tesseract': 'OCR wird gestartet', 'loading language traineddata': 'Sprachdaten Deutsch + Englisch werden geladen', 'initializing api': 'OCR wird vorbereitet', 'recognizing text': 'Text wird erkannt' };
function lineText(l) {
  const ws = (l.words || []).filter(w => w.text && w.text.trim());
  if (!ws.length) return (l.text || '').trim();
  const h = Math.max(6, l.bbox.y1 - l.bbox.y0);
  let s = ws[0].text.trim();
  for (let i = 1; i < ws.length; i++) {
    const gap = ws[i].bbox.x0 - ws[i - 1].bbox.x1;
    s += (gap > h * 2.2 ? ' | ' : ' ') + ws[i].text.trim();      // große Lücken = einfache Tabellenspalten
  }
  return s;
}
const LIST_RE = /^([-–—•*·▪●○◦‣»>]|\d{1,3}[.)])\s+\S/;
function ocrToText(data) {
  const blocks = data.blocks || [];
  if (!blocks.length) return (data.text || '').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  for (const b of blocks) for (const p of (b.paragraphs || [])) {
    let cur = null, prev = null;
    const flush = () => { if (cur != null) { out.push(cur); cur = null; } };
    for (const l of (p.lines || [])) {
      const t = lineText(l); if (!t) continue;
      const h = l.bbox.y1 - l.bbox.y0;
      const bigGap = prev && (l.bbox.y0 - prev.bbox.y1) > 0.9 * Math.min(h, prev.bbox.y1 - prev.bbox.y0);
      if (LIST_RE.test(t)) { flush(); cur = /^\d/.test(t) ? t : '- ' + t.replace(/^\S+\s+/, ''); }
      else if (t.includes(' | ')) { flush(); out.push(t); }
      else if (cur != null && !bigGap) {
        if (/[a-zäöüß]-$/.test(cur) && /^[a-zäöüß]/.test(t)) cur = cur.slice(0, -1) + t; else cur += ' ' + t;
      } else { flush(); if (bigGap) out.push(''); cur = t; }
      prev = l;
    }
    flush(); out.push('');
  }
  const isLi = t => /^(- |\d{1,3}[.)]\s)/.test(t || '');
  const res = [];                       // Leerzeilen zwischen aufeinanderfolgenden Listenpunkten entfernen
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '' && isLi(res[res.length - 1]) && isLi(out.slice(i + 1).find(x => x !== ''))) continue;
    res.push(out[i]);
  }
  return res.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function ensureWorker(onLog) {
  if (!window.Tesseract) {
    ocrProgress('OCR-Bibliothek wird geladen (cdn.jsdelivr.net) …', 0.02);
    try { await loadScript(TESS_URL); } catch (e) { throw new Error('Tesseract.js konnte nicht geladen werden. Besteht eine Internetverbindung? (Quelle: cdn.jsdelivr.net)'); }
  }
  OCR.log = onLog;
  if (!OCR.worker) OCR.worker = await window.Tesseract.createWorker(['deu', 'eng'], 1, { logger: m => OCR.log && OCR.log(m) });
  return OCR.worker;
}
async function stopWorker() { const w = OCR.worker; OCR.worker = null; if (w) { try { await w.terminate(); } catch (e) { /* egal */ } } }
$('#ocrCancel').addEventListener('click', async () => { OCR.cancelled = true; await stopWorker(); $('#ocrStatus').hidden = true; OCR.busy = false; toast('Texterkennung abgebrochen. Dein Entwurf ist unverändert.'); });

async function runImport(files, mode) {
  if (OCR.busy) { toast('Es läuft bereits eine Texterkennung.'); return; }
  const imgs = Array.from(files).filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|heic|webp|gif|bmp)$/i.test(f.name));
  if (!imgs.length) { toast('Keine Bilddatei ausgewählt.'); return; }
  OCR.busy = true; OCR.cancelled = false; crop.last = null;
  const crops = [];
  try {
    for (let i = 0; i < imgs.length; i++) {
      let r;
      try { r = await cropOne(imgs[i], i, imgs.length); } catch (e) { toast(`Bild ${i + 1}: ${e.message}`); continue; }
      if (r.action === 'cancel') { closeModal('#cropModal'); OCR.busy = false; toast('Import abgebrochen. Dein Entwurf ist unverändert.'); return; }
      if (r.action === 'ok') crops.push(r.canvas);
    }
  } finally { closeModal('#cropModal'); }
  if (!crops.length) { OCR.busy = false; toast('Kein Bild zur Texterkennung übernommen.'); return; }
  const texts = []; let confSum = 0, confN = 0;
  try {
    for (let i = 0; i < crops.length; i++) {
      if (OCR.cancelled) return;
      const label = crops.length > 1 ? `Bild ${i + 1} von ${crops.length}: ` : '';
      const worker = await ensureWorker(m => {
        const step = OCR_STEPS[m.status] || m.status;
        const p = m.status === 'recognizing text' ? m.progress : (m.progress || 0) * 0.15;
        ocrProgress(`${label}${step} … ${Math.round((m.progress || 0) * 100)} %`, (i + (m.status === 'recognizing text' ? 0.15 + 0.85 * m.progress : p)) / crops.length);
      });
      if (OCR.cancelled) return;
      ocrProgress(`${label}Text wird erkannt …`, (i + 0.15) / crops.length);
      const { data } = await worker.recognize(crops[i], {}, { text: true, blocks: true });
      const t = ocrToText(data);
      if (t) texts.push(t);
      if (typeof data.confidence === 'number') { confSum += data.confidence; confN++; }
      crops[i].width = crops[i].height = 1;          // Speicher freigeben
    }
  } catch (e) {
    if (!OCR.cancelled) { $('#ocrStatus').hidden = true; toast(e.message || 'Texterkennung fehlgeschlagen.', 6000); }
    return;
  } finally { await stopWorker(); OCR.busy = false; }
  $('#ocrStatus').hidden = true;
  if (OCR.cancelled) return;
  if (!texts.length) { toast('Es wurde kein Text erkannt. Ausschnitt größer wählen?', 5000); return; }
  if (mode === 'solve' && APP.solveText) { APP.solveText(texts.join('\n\n'), `${texts.length} ${texts.length === 1 ? 'Seite' : 'Seiten'} erkannt`); return; }
  const prevText = $('#stagingCard').hidden ? '' : $('#stagingText').value.trim();
  const conf = confN ? ` Erkennungssicherheit laut OCR: ca. ${Math.round(confSum / confN)} %.` : '';
  showStaging((prevText ? prevText + '\n\n' : '') + texts.join('\n\n'), `${texts.length} ${texts.length === 1 ? 'Bild' : 'Bilder'} erkannt.${conf} Bitte prüfen – dein Entwurf bleibt unverändert, bis du „Übernehmen“ tippst.`);
}
$('#btnPick').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) runImport(f); });
['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) runImport(e.dataTransfer.files); }));
document.addEventListener('paste', e => {
  const f = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(x => /^image\//.test(x.type));
  if (f.length) { e.preventDefault(); runImport(f); }
});

/* ---------- Info-Popover: Details erst auf Tipp ---------- */
const pop = $('#pop'); let popBtn = null;
const infoFill = {};
function closePop() { if (popBtn) popBtn.setAttribute('aria-expanded', 'false'); popBtn = null; pop.hidden = true; }
function openPop(btn) {
  const tpl = document.getElementById('info-' + btn.dataset.info); if (!tpl) return;
  pop.innerHTML = ''; pop.appendChild(tpl.content.cloneNode(true));
  if (infoFill[btn.dataset.info]) infoFill[btn.dataset.info](pop);
  $$('input[data-opt]', pop).forEach(i => { i.checked = S.settings[i.dataset.opt] !== false; });
  pop.hidden = false; popBtn = btn; btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let top = r.bottom + 6; if (top + h > vh - 12) top = Math.max(12, r.top - h - 6);
  pop.style.left = clamp(r.right - w, 12, vw - w - 12) + 'px'; pop.style.top = top + 'px';
}
document.addEventListener('click', e => {
  const b = e.target.closest('.info');
  if (b) { e.preventDefault(); if (popBtn === b) closePop(); else openPop(b); return; }
  if (!pop.hidden && !e.target.closest('#pop')) closePop();
});
pop.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.opt; if (!k) return;
  S.settings[k] = e.target.checked; saveSettings(); relayout(true);
});
$('#panel').addEventListener('scroll', () => { if (!pop.hidden) closePop(); }, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

/* Schnittstellen für die weiteren Teile */
const APP = { infoFill, closePop, runImport, $, $$, clamp, esc, K, LS, IDB, S, SAMPLE_MARK, toast, confirmDialog, openModal, closeModal, downloadBlob, safeName, setMode, setView, relayout, drawSheet, renderPage, snapshot, setDraft, syncDraftUi, saveSettings, syncZoom, showStaging };
window.TWApp.APP = APP;
let renderTiles = () => {}, refreshBlattPanel = () => {}, updateWarnings = () => {};
APP.hook = (name, fn) => { if (name === 'tiles') renderTiles = fn; else if (name === 'blatt') refreshBlattPanel = fn; else if (name === 'warn') updateWarnings = fn; };
})();
