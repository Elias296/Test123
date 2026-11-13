/* ==========================================================================
   Layout-Engine: eine einzige Quelle für Vorschau, PDF und .goodnotes
   Alle Koordinaten in PDF-Punkten, Ursprung oben links.
   ========================================================================== */
TW.SIZES = { fein: { em: 9.2, pen: 0.75, name: 'Fein' }, mittel: { em: 11.2, pen: 0.9, name: 'Mittel' }, gross: { em: 13.8, pen: 1.1, name: 'Groß' } };
TW.SPACINGS = { ref: 17.5, '5': 5 * TW.MM, '6': 6 * TW.MM, '7': 7 * TW.MM };
TW.INKS = [
  { id: 'kugel', name: 'Kugelschreiber-Blau', hex: '#1A4B8C' },
  { id: 'mitternacht', name: 'Mitternachtsblau', hex: '#0F294A' },
  { id: 'graphit', name: 'Graphitschwarz', hex: '#222428' },
  { id: 'wald', name: 'Waldgrün', hex: '#1B5E20' },
  { id: 'wein', name: 'Weinrot', hex: '#8E1B1B' }
];
TW.PAPER_COLORS = { weiss: { bg: '#FFFFFF', line: '#D6DCE5', name: 'White' }, creme: { bg: '#FDFBF2', line: '#E5DEC9', name: 'Yellow' } };
TW.STYLES = {
  klar: { slant: 0, slantJ: 0, sizeJ: 0.012, ptJ: 0.45, track: 15, trackJ: 0.8, xs: 1, cornerR: 0, space: 30, spaceJ: 1 },
  locker: { slant: 0.2, slantJ: 0.03, sizeJ: 0.05, ptJ: 1.3, track: 13.5, trackJ: 2.5, xs: 0.93, cornerR: 5, space: 29, spaceJ: 4 },
  eigen: { slant: 0, slantJ: 0, sizeJ: 0.02, ptJ: 0.3, track: 11, trackJ: 1.2, xs: 1, cornerR: 0, space: 30, spaceJ: 2 }
};
TW.DEFAULT_SETTINGS = { style: 'klar', size: 'mittel', ink: '#1A4B8C', paper: 'liniert', paperColor: 'weiss', spacing: 'ref', margin: 12, markFallback: true };

TW.hexRgb = function (hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash32(a, b) {
  let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x7F4A7C15, 0xC2B2AE35);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 13;
  return h >>> 0;
}

/* Raster des Blattes */
TW.grid = function (settings) {
  const S = TW.SPACINGS[settings.spacing] || TW.REF_SPACING;
  const y0 = TW.FIRST_LINE;
  const maxBaseline = TW.PAGE_H - 19.5;
  const rows = Math.floor((maxBaseline - y0) / S + 1e-9) + 1;
  const m = (settings.margin || 12) * TW.MM;
  return { S, y0, rows, left: m, right: TW.PAGE_W - m, maxBaseline };
};

/* Papier-Primitive (Linien als 0,5-pt-Rechtecke wie in der Referenz-PDF) */
TW.paper = function (settings) {
  const g = TW.grid(settings), pc = TW.PAPER_COLORS[settings.paperColor] || TW.PAPER_COLORS.weiss;
  const W = TW.PAGE_W, H = TW.PAGE_H, T = 0.5, rects = [];
  if (settings.paper === 'liniert') {
    for (let r = 0; r < g.rows; r++) rects.push([0, g.y0 + r * g.S - T / 2, W, T]);
  } else if (settings.paper === 'kariert') {
    const kMin = Math.ceil((3 - g.y0) / g.S), kMax = Math.floor((H - 3 - g.y0) / g.S);
    for (let k = kMin; k <= kMax; k++) rects.push([0, g.y0 + k * g.S - T / 2, W, T]);
    const x0 = (W - Math.floor((W - 6) / g.S) * g.S) / 2;
    for (let x = x0; x <= W - 3 + 1e-6; x += g.S) rects.push([x - T / 2, 0, T, H]);
  }
  return { bg: pc.bg, line: pc.line, rects, grid: g };
};

function applyCorners(pts, r) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!p[2] || i === 0 || i === n - 1) { out.push(p); continue; }
    if (r <= 0) { out.push(p, p); continue; }
    const a = pts[i - 1], b = pts[i + 1];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const da = Math.min(r, la / 2.5), db = Math.min(r, lb / 2.5);
    out.push([p[0] + (a[0] - p[0]) / la * da, p[1] + (a[1] - p[1]) / la * da], [p[0] + (b[0] - p[0]) / lb * db, p[1] + (b[1] - p[1]) / lb * db]);
  }
  return out;
}

/* Eine Glyphen-Instanz in Punkt-Einheiten relativ zum Schreibursprung (x nach rechts, y nach oben) */
function instGlyph(found, st, rnd, em) {
  const g = found.g;
  const k = em / 100 * (1 + (rnd() - 0.5) * 2 * st.sizeJ);
  const sl = st.slant + (rnd() - 0.5) * 2 * st.slantJ;
  const strokes = [];
  for (let si = 0; si < g.s.length; si++) {
    const s = g.s[si];
    let pts;
    if (found.own) {          // eigene Handschrift: flach gespeichert [x, y, Ecke(0/1), …]
      pts = [];
      for (let i = 0; i < s.length; i += 3) pts.push([s[i], s[i + 1], s[i + 2] ? 1 : 0]);
    } else pts = s;
    const j = pts.map(p => [p[0] + (rnd() - 0.5) * 2 * st.ptJ, p[1] === 0 ? 0 : p[1] + (rnd() - 0.5) * 2 * st.ptJ, p[2]]);
    const c = applyCorners(j, st.cornerR);
    strokes.push({ pts: c.map(p => [(p[0] * st.xs + p[1] * sl) * k, p[1] * k]), wf: (g.wf && g.wf[si]) || 1 });
  }
  return { strokes, adv: Math.max(0.5, (g.w * st.xs + st.track + (rnd() - 0.5) * 2 * st.trackJ) * k), w: g.w * st.xs * k, fb: found.fb };
}

/* Glyphe als Quad-Pfade in Schrifteinheiten (für Kachel-Vorschau und Zeichenvorlage) */
TW.glyphQuads = function (found) {
  const out = [];
  for (const s of found.g.s) {
    let pts = s;
    if (found.own) { pts = []; for (let i = 0; i < s.length; i += 3) pts.push([s[i], s[i + 1], s[i + 2] ? 1 : 0]); }
    const q = TW.toQuads(applyCorners(pts, 0));
    if (q) out.push(q);
  }
  return out;
};

/* Markdown-ähnliche Zeilenanalyse */
function classifyLine(raw) {
  const line = raw.replace(/\t/g, '    ').replace(/[   ]/g, ' ');
  if (!line.trim()) return { type: 'blank' };
  let m;
  if (/^[\s|:+-]+$/.test(line) && line.includes('|')) return { type: 'sep' };      // Markdown-Trennzeile |---|---|
  if (/\S\s*\|\s*\S/.test(line) && !/^\s*#/.test(line)) {                    // einfache Tabellenzeile: Zellen durch | getrennt
    const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    if (cells.length >= 2 && cells.length <= 6) return { type: 'row', cells };
  }
  if ((m = /^\s{0,3}(#{1,3})\s+(.*)$/.exec(line))) return { type: 'h', level: m[1].length, text: m[2].replace(/\s+#+\s*$/, '') };
  if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(line))) return { type: 'li', indent: Math.min(3, Math.floor(m[1].length / 2)), text: m[2] };
  if ((m = /^(\s*)(\d{1,3}[.)])\s+(.*)$/.exec(line))) return { type: 'ol', indent: Math.min(3, Math.floor(m[1].length / 2)), label: m[2], text: m[3] };
  return { type: 'p', text: line.trim() };
}
TW.normTitle = s => (s || '').replace(/^\s*#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/* Hauptfunktion */
TW.layout = function (note, settings, own) {
  settings = Object.assign({}, TW.DEFAULT_SETTINGS, settings || {});
  const grid = TW.grid(settings), st = TW.STYLES[settings.style] || TW.STYLES.klar;
  const size = TW.SIZES[settings.size] || TW.SIZES.mittel;
  const E = size.em, penW = size.pen;
  const pages = [];
  const unmapped = new Map(), fallback = new Map();
  let page = null, lastRow = -1, pendingBlank = 0, charSeq = 0;
  const seedBase = settings.style === 'locker' ? 7331 : (settings.style === 'eigen' ? 4242 : 1009);

  function newPage() { page = { strokes: [], glyphs: [], rowsUsed: [] }; pages.push(page); lastRow = -1; }
  newPage();
  const rowsFor = em => Math.max(1, Math.ceil(em * 1.2 / grid.S - 1e-9));
  const yOf = r => grid.y0 + r * grid.S;

  function nextRow(em, extra) {
    let row = lastRow < 0 ? 0 : lastRow + rowsFor(em) + (extra || 0);
    if (yOf(row) > grid.maxBaseline + 1e-6) { newPage(); row = 0; }
    lastRow = row;
    page.rowsUsed.push(row);
    return row;
  }

  function makeWord(str, em) {
    const items = [];
    let width = 0;
    for (const ch of str) {
      const idx = charSeq++;
      const found = TW.lookupGlyph(settings.style, ch, own);
      if (!found) { unmapped.set(ch, (unmapped.get(ch) || 0) + 1); continue; }
      if (found.fb) fallback.set(ch, (fallback.get(ch) || 0) + 1);
      const rnd = mulberry32(hash32(seedBase + idx, ch.codePointAt(0)));
      const it = instGlyph(found, st, rnd, em);
      it.ch = ch;
      items.push(it); width += it.adv;
    }
    return { items, width };
  }
  function spaceW(em) {
    const rnd = mulberry32(hash32(seedBase + 99991, charSeq++));
    return (st.space + (rnd() - 0.5) * 2 * st.spaceJ) * em / 100;
  }
  function tokenize(text) {
    const out = [];
    let bold = false;
    for (const part of text.split(/(\*\*)/)) {
      if (part === '**') { bold = !bold; continue; }
      for (const w of part.split(/\s+/)) if (w) out.push({ s: w, bold });
    }
    return out;
  }
  function emit(items, x, row, em, wmul, bold) {
    const base = yOf(row);
    for (const it of items) {
      for (const s of it.strokes) {
        const q = TW.toQuads(s.pts.map(p => [x + p[0], base - p[1]]));
        if (q) { q.w = penW * wmul * (bold ? 1.4 : 1) * s.wf; q.fb = !!it.fb; page.strokes.push(q); }
      }
      page.glyphs.push({ ch: it.ch, x, adv: it.adv, w: it.w, base, row });
      x += it.adv;
    }
    return x;
  }
  /* Fließtext mit Wortumbruch; firstX = Einzug der ersten Zeile, restX = hängender Einzug */
  function flow(text, em, wmul, firstX, restX, extraFirst, xMaxOpt) {
    const xMax = xMaxOpt || grid.right;
    const toks = tokenize(text);
    let line = [], lineW = 0, x0 = firstX, first = true, place = null;
    const flush = () => {
      if (!line.length) return;
      const row = nextRow(em, first ? extraFirst : 0);
      if (first) place = { page, row };
      first = false;
      let x = x0;
      for (const w of line) { if (w.gap) x += w.gap; x = emit(w.items, x, row, em, wmul, w.bold); }
      line = []; lineW = 0; x0 = restX;
    };
    for (const t of toks) {
      const w = makeWord(t.s, em);
      w.bold = t.bold;
      if (!w.items.length) continue;
      let avail = xMax - x0;
      const gap = line.length ? spaceW(em) : 0;
      if (line.length && lineW + gap + w.width > avail) { flush(); avail = xMax - x0; }
      if (w.width > avail) {              // überlanges Wort: rechtzeitig zeichenweise umbrechen
        let chunk = [], cw = 0;
        for (const it of w.items) {
          if (chunk.length && cw + it.adv > avail) {
            line.push({ items: chunk, bold: w.bold, gap: 0 }); flush(); avail = xMax - x0; chunk = []; cw = 0;
          }
          chunk.push(it); cw += it.adv;
        }
        line.push({ items: chunk, bold: w.bold, gap: 0 }); lineW = cw;
        continue;
      }
      w.gap = line.length ? gap : 0;
      line.push(w); lineW += w.gap + w.width;
    }
    flush();
    return place;
  }

  const title = (note.title || '').trim();
  const lines = (note.text || '').replace(/\r\n?/g, '\n').split('\n').map(classifyLine);
  /* Keine doppelte Überschrift: erste sinnvolle Zeile == Titel -> nur einmal (als Titel) setzen.
     Der Rohtext im Editor bleibt dabei unverändert. */
  let skipIdx = -1;
  if (title) {
    const fi = lines.findIndex(l => l.type !== 'blank');
    if (fi >= 0 && TW.normTitle(lines[fi].text) === TW.normTitle(title)) skipIdx = fi;
  }
  let prev = null;          // null | 'title' | 'h' | 'body'
  if (title && flow(title, E * 1.5, 1.6, grid.left, grid.left, 0)) prev = 'title';
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (i === skipIdx) continue;
    if (L.type === 'sep') continue;
    if (L.type === 'blank') { if (prev === 'body') pendingBlank = 1; continue; }
    if (L.type === 'h') {
      const em = E * (L.level === 1 ? 1.32 : L.level === 2 ? 1.2 : 1.1);
      const extra = prev === null ? 0 : 1;          // immer eine freie Rasterzeile vor einer Überschrift
      if (flow(L.text, em, L.level === 1 ? 1.5 : 1.35, grid.left, grid.left, extra)) { prev = 'h'; pendingBlank = 0; }
      continue;
    }
    const extra = prev === 'title' ? 1 : (prev === 'h' ? 0 : pendingBlank);
    let place = null;
    if (L.type === 'row') {
      /* Tabellenzeile: Spalten gleich breit, alle Zellen beginnen auf derselben Rasterzeile */
      const n = L.cells.length, gap = E * 0.9, colW = (grid.right - grid.left) / n;
      const startPage = page, startLast = lastRow;
      let first = null, end = null;
      for (let c = 0; c < n; c++) {
        if (first) { page = first.page; lastRow = first.row - rowsFor(E) - extra; } else { page = startPage; lastRow = startLast; }
        const x0 = grid.left + c * colW;
        const pl = flow(L.cells[c], E, c === 0 ? 1.15 : 1, x0, x0, extra, x0 + colW - (c < n - 1 ? gap : 0));
        if (!first && pl) first = pl;
        const pi = pages.indexOf(page);
        if (pl && (!end || pi > end.pi || (pi === end.pi && lastRow > end.row))) end = { pi, row: lastRow };
      }
      if (end) { page = pages[end.pi]; lastRow = end.row; place = first; }
      else { page = startPage; lastRow = startLast; }
    } else if (L.type === 'li') {
      const ind = grid.left + L.indent * E * 1.1, tx = ind + E * 1.05, cs = charSeq;
      place = flow(L.text, E, 1, tx, tx, extra);
      if (place) {               // gezeichneter Aufzählungspunkt auf der ersten Textzeile
        const it = instGlyph(TW.lookupGlyph('klar', '•', null), TW.STYLES.klar, mulberry32(hash32(seedBase + 5, cs)), E);
        const base = yOf(place.row);
        for (const s of it.strokes) {
          const q = TW.toQuads(s.pts.map(p => [ind + E * 0.14 + p[0], base - p[1]]));
          q.w = penW * 1.15; q.fb = false; place.page.strokes.push(q);
        }
      }
    } else if (L.type === 'ol') {
      const ind = grid.left + L.indent * E * 1.1;
      const lab = makeWord(L.label, E);
      const tx = ind + Math.max(lab.width + E * 0.2, E * 1.05);
      place = flow(L.text, E, 1, tx, tx, extra);
      if (place) { const sv = page; page = place.page; emit(lab.items, ind, place.row, E, 1, false); page = sv; }
    } else {
      place = flow(L.text, E, 1, grid.left, grid.left, extra);
    }
    if (place) { prev = 'body'; pendingBlank = 0; }
  }
  let nStrokes = 0, nGlyphs = 0;
  for (const p of pages) { nStrokes += p.strokes.length; nGlyphs += p.glyphs.length; }
  return { pages, grid, settings, unmapped, fallback, stats: { strokes: nStrokes, glyphs: nGlyphs, pages: pages.length }, em: E };
};
