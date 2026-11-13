'use strict';
/* ==========================================================================
   Tintenwerk – Engine (DOM-frei): Vektorschrift, Layout, Goodnotes-/PDF-Export
   Einheiten der Schriftpfade: Grundlinie y=0, x-Höhe 50, Oberlänge 100, Unterlänge -38
   ========================================================================== */
const TW = {};
TW.PAGE_W = 419.53;          // A5-Referenz in echten PDF-Punkten
TW.PAGE_H = 595.28;
TW.PEN = 11 / 6;             // Stiftkoordinate = PDF-Punkt * 11/6
TW.FIRST_LINE = 50.25;       // erste Linie der Referenzvorlage (PDF-Punkte von oben)
TW.REF_SPACING = 17.5;       // Linienabstand der Referenzvorlage
TW.SCHEMA = 24;              // schema.pb der Referenzdatei
TW.MM = 72 / 25.4;

/* ---- Pfad-Kurzsprache ----------------------------------------------------
   "x,y"      Stützpunkt (weich)        "x,y!"  Eckpunkt (scharf)
   "@cx,cy,rx,ry,a0,a1"  Ellipsenbogen in Grad (0° = rechts, 90° = oben)
   "/"        Stift absetzen (neuer Strich)                                  */
const GLYPH_SRC = {
  // Kleinbuchstaben
  a: '@23,25,23,25,25,385 46,50! 46,30 46,10 48,3 54,0',
  b: '0,100! 0,50 0,0! 0,30 @24,25,24,25,150,-150',
  c: '@24,25,24,25,42,318',
  d: '@23,25,23,25,25,385 46,100! 46,50 46,10 48,3 54,0',
  e: '2,26 46,26! @24,25,23,25,3,322',
  f: '@25,84,13,16,15,180 12,40 12,0 / 0,50 28,50',
  g: '@23,25,23,25,25,385 46,50! 46,10 46,-16 @24,-16,22,22,0,-155',
  h: '0,100! 0,50 0,0! 0,28 @22,28,22,22,180,0 44,10 44,0',
  i: '2,50 2,6 4,1 9,0 / 2,70 3,72',
  j: '14,50 14,-14 @2,-16,12,20,0,-140 / 14,70 15,72',
  k: '0,100 0,0 / 36,50 2,22! 40,0',
  l: '0,100 0,10 2,3 8,0',
  m: '0,50! 0,25 0,0! 0,30 @17,32,17,18,180,0 34,0! 34,30 @51,32,17,18,180,0 68,10 68,0',
  n: '0,50! 0,25 0,0! 0,28 @22,28,22,22,180,0 44,10 44,0',
  o: '@24,25,24,25,90,450',
  p: '0,50! 0,0 0,-38! 0,20 @24,25,24,25,150,-150',
  q: '@23,25,23,25,25,385 46,50! 46,0 46,-38',
  r: '0,50! 0,25 0,0! 0,28 @19,28,19,22,180,35',
  s: '40,42 32,49 20,50 9,46 5,38 9,30 22,25 35,20 40,12 36,4 24,0 10,1 2,8',
  t: '12,86! 12,40 12,12 15,3 23,0 30,3 / 0,50 28,50',
  u: '0,50 0,22 @22,20,22,20,180,360 44,50! 44,25 44,8 46,2 52,0',
  v: '0,50 21,0! 42,50',
  w: '0,50 15,0! 30,40! 45,0! 60,50',
  x: '0,50 38,0 / 38,50 0,0',
  y: '0,50 21,2 / 42,50 21,2 12,-22 5,-34 -4,-38',
  z: '0,50 36,50! 0,0! 38,0',
  'ß': '0,0! 0,40 0,78 6,95 18,100 30,94 33,80 28,66 18,56! 30,48 38,34 38,18 30,5 18,0 8,3',
  // Großbuchstaben
  A: '0,0 32,94! 64,0 / 12,32 52,32',
  B: '0,0! 0,94! 26,94 @26,72,22,22,90,-90 0,50! 30,50 @30,25,26,25,90,-90 0,0',
  C: '@36,47,36,47,50,310',
  D: '0,0! 0,94! 22,94 @24,47,40,47,90,-90 0,0',
  E: '48,94 0,94! 0,0! 48,0 / 0,50 38,50',
  F: '48,94 0,94! 0,0 / 0,50 36,50',
  G: '@36,47,36,47,50,330 68,44! 42,44',
  H: '0,94 0,0 / 54,94 54,0 / 0,48 54,48',
  I: '8,94 8,0 / 0,94 16,94 / 0,0 16,0',
  J: '8,94 42,94 / 30,94 30,22 @15,22,15,22,0,-170',
  K: '0,94 0,0 / 46,94 2,42! 50,0',
  L: '0,94 0,0! 44,0',
  M: '0,0 0,94! 34,20! 68,94! 68,0',
  N: '0,0 0,94! 54,0! 54,94',
  O: '@38,47,38,47,90,450',
  P: '0,0! 0,94! 26,94 @26,70,24,24,90,-90 0,46',
  Q: '@38,47,38,47,90,450 / 44,22 72,-6',
  R: '0,0! 0,94! 26,94 @26,70,24,24,90,-90 0,46! / 22,46 54,0',
  S: '58,80 48,91 32,94 14,90 5,76 10,60 30,48 50,38 60,22 52,7 34,0 14,2 2,14',
  T: '0,94 60,94 / 30,94 30,0',
  U: '0,94 0,34 @28,32,28,32,180,360 56,94',
  V: '0,94 30,0! 60,94',
  W: '0,94 20,0! 42,72! 64,0! 84,94',
  X: '0,94 56,0 / 56,94 0,0',
  Y: '0,94 28,46! 56,94 / 28,46 28,0',
  Z: '0,94 56,94! 0,0! 58,0',
  // Ziffern
  0: '@26,47,26,47,90,450',
  1: '0,70 24,94! 24,0',
  2: '4,72 10,86 26,94 42,88 48,72 42,56 4,0! 52,0',
  3: '4,84 14,92 28,94 42,88 46,74 40,60 24,52! 42,44 50,28 44,10 28,0 12,3 2,14',
  4: '54,30 0,30! 38,94! 38,0',
  5: '46,94 8,94! 4,52! 18,58 32,56 46,44 50,28 44,10 28,0 12,3 2,14',
  6: '46,88 32,94 16,82 6,58 4,30 @27,28,23,28,180,540',
  7: '0,94 52,94! 18,0 / 14,48 42,48',
  8: '28,50 @28,72,20,22,270,-90 @28,25,26,25,90,450',
  9: '@26,66,24,28,0,360 50,66! 48,30 38,8 22,0 8,4',
  // Satzzeichen & Symbole
  '.': '0,0 1,2',
  ',': '4,6 5,0 3,-8 0,-14',
  ';': '4,6 5,0 3,-8 0,-14 / 4,40 5,42',
  ':': '0,0 1,2 / 0,40 1,42',
  '!': '2,94 2,26 / 2,0 3,2',
  '?': '0,74 6,88 20,94 34,88 38,74 32,60 20,48 19,26 / 19,0 20,2',
  '-': '0,30 24,30',
  '–': '0,30 42,30',
  '—': '0,30 68,30',
  '(': '16,104 6,80 2,45 6,10 16,-14',
  ')': '0,104 10,80 14,45 10,10 0,-14',
  '/': '0,-8 34,100',
  '\\': '0,100 34,-8',
  '"': '0,96 1,74 / 14,96 15,74',
  "'": '0,96 1,74',
  '+': '0,36 44,36 / 22,58 22,14',
  '=': '0,46 44,46 / 0,26 44,26',
  '%': '2,0 50,94 / @10,80,10,14,90,450 / @42,14,10,14,90,450',
  '&': '56,0 14,62 12,78 20,92 30,94 38,84 34,70 8,34 2,18 8,5 22,0 36,6 48,22 54,40',
  '_': '0,-6 50,-6',
  '*': '14,90 14,56 / 0,82 28,64 / 28,82 0,64',
  '#': '16,90 10,6 / 40,90 34,6 / 2,62 50,62 / 0,32 48,32',
  '@': '@34,36,13,15,30,390 48,50! 48,26 54,19 62,22 68,36 @36,38,34,42,-3,290',
  '€': '@36,47,30,47,50,310 / 0,56 40,56 / 0,38 36,38',
  '$': '46,76 38,86 26,88 12,84 6,72 10,58 26,48 42,38 48,24 42,10 28,4 12,6 2,18 / 26,102 26,-10',
  '<': '40,64 0,36! 40,8',
  '>': '0,64 40,36! 0,8',
  '[': '14,104 0,104! 0,-14! 14,-14',
  ']': '0,104 14,104! 14,-14! 0,-14',
  '{': '18,104 11,100 10,90 10,56 2,45! 10,34 10,0 11,-10 18,-14',
  '}': '0,104 7,100 8,90 8,56 16,45! 8,34 8,0 7,-10 0,-14',
  '|': '0,104 0,-14',
  '~': '0,34 8,42 16,42 28,32 36,32 44,40',
  '^': '0,70 16,94! 32,70',
  '°': '@9,84,9,10,90,450',
  '§': '36,84 28,94 16,94 8,86 10,74 30,58 36,46 30,36 / 10,62 4,50 10,40 30,24 34,10 26,0 14,0 6,8',
  '•': '@7,27,6,6,90,450 @7,27,2.5,2.5,90,450',
  '·': '0,27 1,29',
  '×': '0,54 36,18 / 36,54 0,18',
  '÷': '0,36 44,36 / 22,56 23,58 / 22,14 23,16',
  '±': '0,46 44,46 / 22,66 22,26 / 0,8 44,8',
  '→': '0,36 52,36 / 38,50 52,36! 38,22',
  '←': '52,36 0,36 / 14,50 0,36! 14,22',
  '„': '4,6 5,0 3,-8 0,-14 / 18,6 19,0 17,-8 14,-14',
  '“': '2,74 0,82 2,90 5,96 / 16,74 14,82 16,90 19,96',
  '…': '0,0 1,2 / 20,0 21,2 / 40,0 41,2',
  'µ': '0,-38 0,50! 0,22 @22,20,22,20,180,360 44,50! 44,8 46,2 52,0'
};

/* Abweichende, geschwungenere Formen für den Stil „Locker & geschwungen“ */
const GLYPH_LOCKER = {
  b: '0,28 10,48 17,82 13,98 7,100 3,88 2,40 3,0! 4,26 @25,25,23,25,160,-150',
  d: '@23,25,23,25,25,385 50,88 50,100 45,96 44,60 45,12 48,3 55,0',
  f: '2,40 14,56 24,84 20,98 14,100 11,88 11,20 11,-22 7,-36 1,-34 0,-24 8,-8 28,10 / 0,50 26,52',
  g: '@23,25,23,25,25,385 46,50! 46,10 45,-18 38,-34 26,-38 16,-30 22,-16 44,-2 58,10',
  h: '0,26 10,48 17,82 13,98 7,100 3,88 2,40 3,0! 4,26 @24,28,20,22,180,0 44,12 46,3 53,0',
  j: '16,50 16,-10 14,-28 6,-38 -2,-32 2,-18 20,-4 34,8 / 16,70 17,72',
  k: '0,26 10,48 17,82 13,98 7,100 3,88 2,40 3,0 / 34,48 26,52 14,40 4,28! 16,26 26,14 34,2 42,0',
  l: '0,28 10,46 18,82 14,98 8,100 4,88 3,40 4,12 8,3 15,0 22,5',
  p: '0,50! 1,10 2,-38! 3,22 @26,25,23,25,160,-160',
  q: '@23,25,23,25,25,385 46,50! 46,0 46,-30 50,-38 56,-28 60,-10',
  r: '0,50! 1,25 2,0! 3,28 8,42 18,50 28,50 36,44',
  t: '12,90 12,40 13,12 16,3 24,0 32,5 / 0,52 30,56',
  y: '0,50 0,24 @21,20,21,20,180,360 42,50! 42,10 41,-18 34,-34 22,-38 12,-30 18,-16 40,-2 54,10',
  z: '0,46 10,50 34,50 6,2! 30,2 40,6',
  e: '2,22 24,26 42,34 42,44 30,50 16,46 4,32 4,16 14,3 28,0 46,10',
  '1': '0,68 24,94! 23,0',
  '7': '0,90 10,94 52,94! 22,0 / 14,48 42,50'
};

function parseGlyph(src) {
  const strokes = [];
  for (const part of src.split('/')) {
    const pts = [];
    for (const tok of part.trim().split(/\s+/)) {
      if (!tok) continue;
      if (tok[0] === '@') {
        const [cx, cy, rx, ry, a0, a1] = tok.slice(1).split(',').map(Number);
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 30));
        for (let i = 0; i <= n; i++) {
          const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
          pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), 0]);
        }
      } else {
        const c = tok.endsWith('!');
        const [x, y] = (c ? tok.slice(0, -1) : tok).split(',').map(Number);
        pts.push([x, y, c ? 1 : 0]);
      }
    }
    if (pts.length > 1) strokes.push(pts);
  }
  return strokes;
}
function normGlyph(strokes) {
  let mn = Infinity, mx = -Infinity;
  for (const s of strokes) for (const p of s) { if (p[0] < mn) mn = p[0]; if (p[0] > mx) mx = p[0]; }
  if (!isFinite(mn)) return { s: [], w: 0 };
  return { s: strokes.map(s => s.map(p => [p[0] - mn, p[1], p[2] || 0])), w: mx - mn };
}
function shiftStrokes(strokes, dx, dy, sc) {
  sc = sc || 1;
  return strokes.map(s => s.map(p => [p[0] * sc + dx, p[1] * sc + dy, p[2] || 0]));
}
/* Akzente (um x=0 zentriert, y=0 = Unterkante des Akzents) */
const ACCENTS = {
  '̈': '-9,2 -8,4 / 9,2 10,4',           // Trema / Umlautpunkte
  '́': '-6,0 7,13',                       // Akut
  '̀': '-7,13 6,0',                       // Gravis
  '̂': '-10,0 0,12! 10,0',                // Zirkumflex
  '̌': '-10,12 0,0! 10,12',               // Hatschek
  '̃': '-13,3 -7,9 0,6 7,3 13,9',         // Tilde
  '̊': '@0,7,6,7,90,450',                 // Ring
  '̧': '0,0 4,-8 0,-14 -7,-12'            // Cedille (unter dem Buchstaben)
};
const TALL = /[A-ZÄÖÜbdfhklt0-9]/;
function composeAccent(base, ch, mark) {
  const acc = parseGlyph(ACCENTS[mark]);
  const below = mark === '̧';
  const y = below ? 0 : (TALL.test(ch) ? 104 : 62);
  return normGlyph(base.s.map(s => s.map(p => p.slice())).concat(shiftStrokes(acc, base.w / 2, y)));
}

const BUILTIN = { klar: new Map(), locker: new Map() };
(function buildTables() {
  for (const ch in GLYPH_SRC) BUILTIN.klar.set(ch, normGlyph(parseGlyph(GLYPH_SRC[ch])));
  for (const [ch, g] of BUILTIN.klar) BUILTIN.locker.set(ch, g);
  for (const ch in GLYPH_LOCKER) BUILTIN.locker.set(ch, normGlyph(parseGlyph(GLYPH_LOCKER[ch])));
  for (const st of ['klar', 'locker']) {
    const T = BUILTIN[st];
    for (const [u, b] of [['ä', 'a'], ['ö', 'o'], ['ü', 'u'], ['Ä', 'A'], ['Ö', 'O'], ['Ü', 'U']]) T.set(u, composeAccent(T.get(b), b, '̈'));
    for (const [sup, d] of [['²', '2'], ['³', '3'], ['¹', '1']]) T.set(sup, normGlyph(shiftStrokes(T.get(d).s, 0, 48, 0.55)));
  }
})();

/* Typografische Varianten, die auf vorhandene Pfade abgebildet werden (kein Zeichen geht verloren) */
const CHAR_ALIAS = {
  '”': '"', '«': '"', '»': '"', '″': '"', '‟': '"',
  '’': "'", '‘': "'", '‚': ',', '′': "'", '`': "'", '´': "'",
  '‐': '-', '‑': '-', '‒': '–', '−': '-', '―': '—',
  '∙': '·', '●': '•', '▪': '•', '◦': '•', '‣': '•', '○': '•',
  '⁄': '/', '∗': '*', '➔': '→', '⇒': '→', '➜': '→', 'ẞ': 'ß', 'μ': 'µ'
};
TW.CHAR_ALIAS = CHAR_ALIAS;
TW.CHAR_GROUPS = [
  { id: 'klein', name: 'Kleinbuchstaben (a–z)', chars: 'abcdefghijklmnopqrstuvwxyz'.split('') },
  { id: 'gross', name: 'Großbuchstaben (A–Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { id: 'umlaut', name: 'Umlaute & Eszett', chars: ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß'] },
  { id: 'ziffern', name: 'Ziffern (0–9)', chars: '0123456789'.split('') },
  { id: 'satz', name: 'Satzzeichen', chars: ['.', ',', ';', ':', '!', '?', '-', '(', ')', '/', '"', "'", '+', '=', '%', '&'] }
];

/* Liefert {g, fb} – g = Glyphe, fb = true wenn auf Standardschrift ausgewichen wurde; null = kein Pfad vorhanden */
TW.lookupGlyph = function (style, ch, own) {
  if (CHAR_ALIAS[ch]) ch = CHAR_ALIAS[ch];
  if (style === 'eigen') {
    const o = own && own.glyphs && own.glyphs[ch];
    if (o && o.s && o.s.length) return { g: o, fb: false, own: true };
    const b = TW.lookupGlyph('klar', ch, null);
    return b ? { g: b.g, fb: true } : null;
  }
  const T = BUILTIN[style] || BUILTIN.klar;
  let g = T.get(ch);
  if (g) return { g, fb: false };
  const d = ch.normalize('NFD');
  if (d.length === 2 && T.get(d[0]) && ACCENTS[d[1]]) {
    g = composeAccent(T.get(d[0]), d[0], d[1]);
    T.set(ch, g);
    return { g, fb: false };
  }
  return null;
};
TW.hasBuiltin = ch => !!TW.lookupGlyph('klar', ch, null);

/* ---- gemeinsame Kurvenumwandlung: Stützpunkte -> quadratische Bézier-Segmente
   (identisch für Vorschau, PDF und Goodnotes-TPL; entspricht dem Mittelpunkt-Schema der Referenzstriche) */
TW.toQuads = function (pts) {
  const n = pts.length, q = [];
  if (n < 2) return null;
  const x0 = pts[0][0], y0 = pts[0][1];
  if (n === 2) {
    q.push((x0 + pts[1][0]) / 2, (y0 + pts[1][1]) / 2, pts[1][0], pts[1][1]);
  } else {
    let mx = (x0 + pts[1][0]) / 2, my = (y0 + pts[1][1]) / 2;
    q.push((x0 + mx) / 2, (y0 + my) / 2, mx, my);
    for (let i = 1; i < n - 1; i++) {
      mx = (pts[i][0] + pts[i + 1][0]) / 2; my = (pts[i][1] + pts[i + 1][1]) / 2;
      q.push(pts[i][0], pts[i][1], mx, my);
    }
    const lx = pts[n - 1][0], ly = pts[n - 1][1];
    q.push((mx + lx) / 2, (my + ly) / 2, lx, ly);
  }
  return { x: x0, y: y0, q };
};
