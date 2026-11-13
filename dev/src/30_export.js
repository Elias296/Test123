/* ==========================================================================
   Binärformate: CRC32/ZIP, LZ4 (Apple-Container bv41 … bv4$), TPL, Protobuf, PDF
   Aufbau exakt nach der analysierten .goodnotes-Referenzdatei (Schema 24).
   ========================================================================== */
const te = new TextEncoder(), td = new TextDecoder();
function concatBytes(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
TW.concatBytes = concatBytes;

/* ---- CRC32 + ZIP ---------------------------------------------------------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
TW.crc32 = function (u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function streamCompress(u8, format) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream(format);
    const w = cs.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch (e) { return null; }
}
TW.inflateRaw = async function (u8) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
};
/* files: [{name, data:Uint8Array}] – Deflate wie die Referenz (Methode 8, UTF-8-Flag, Unix-Attribute) */
TW.zip = async function (files, date) {
  const d = date || new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = []; let offset = 0;
  for (const f of files) {
    const name = te.encode(f.name), crc = TW.crc32(f.data);
    let comp = await streamCompress(f.data, 'deflate-raw'), method = 8;
    if (!comp) { comp = f.data; method = 0; }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 0x0315, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, comp.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(38, 0x81A40000, true); ch.setUint32(42, offset, true);
    locals.push(new Uint8Array(lh.buffer), name, comp);
    centrals.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + comp.length;
  }
  const cd = concatBytes(centrals);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cd.length, true); end.setUint32(16, offset, true);
  return concatBytes(locals.concat([cd, new Uint8Array(end.buffer)]));
};
/* ZIP lesen (für Selbsttest) */
TW.unzip = async function (u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ZIP: Endeintrag fehlt');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP: Verzeichnis defekt');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), cs = dv.getUint32(p + 20, true), us = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    const raw = u8.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + cs);
    const data = method === 0 ? raw.slice() : await TW.inflateRaw(raw);
    if (data.length !== us || TW.crc32(data) !== crc) throw new Error('ZIP: CRC-Fehler in ' + name);
    out.push({ name, data });
    p += 46 + nl + xl + cl;
  }
  return out;
};

/* ---- LZ4-Blockformat + Apple-Container ------------------------------------ */
TW.lz4Compress = function (src) {
  const n = src.length, out = [];
  const table = new Int32Array(1 << 13).fill(-1);
  let anchor = 0, i = 0;
  const emit = (litEnd, mlen, off) => {
    const lit = litEnd - anchor;
    let tok = (lit < 15 ? lit : 15) << 4;
    if (mlen) tok |= (mlen - 4 < 15 ? mlen - 4 : 15);
    out.push(tok);
    if (lit >= 15) { let r = lit - 15; while (r >= 255) { out.push(255); r -= 255; } out.push(r); }
    for (let k = anchor; k < litEnd; k++) out.push(src[k]);
    if (mlen) {
      out.push(off & 255, off >>> 8);
      if (mlen - 4 >= 15) { let r = mlen - 19; while (r >= 255) { out.push(255); r -= 255; } out.push(r); }
    }
  };
  const limit = n - 12;                    // letzte Übereinstimmung muss >= 12 Byte vor dem Ende beginnen
  while (i <= limit) {
    const seq = (src[i] | src[i + 1] << 8 | src[i + 2] << 16 | src[i + 3] << 24);
    const h = (Math.imul(seq, 2654435761) >>> 19);
    const ref = table[h]; table[h] = i;
    if (ref >= 0 && i - ref < 65536 && src[ref] === src[i] && src[ref + 1] === src[i + 1] && src[ref + 2] === src[i + 2] && src[ref + 3] === src[i + 3]) {
      let ml = 4; const maxEnd = n - 5;      // die letzten 5 Byte bleiben Literale
      while (i + ml < maxEnd && src[ref + ml] === src[i + ml]) ml++;
      emit(i, ml, i - ref);
      i += ml; anchor = i;
    } else i++;
  }
  emit(n, 0, 0);
  return Uint8Array.from(out);
};
TW.lz4Decompress = function (src, usize) {
  const out = new Uint8Array(usize); let o = 0, i = 0;
  while (i < src.length) {
    const t = src[i++]; let ll = t >> 4;
    if (ll === 15) { let c; do { c = src[i++]; ll += c; } while (c === 255); }
    out.set(src.subarray(i, i + ll), o); o += ll; i += ll;
    if (i >= src.length) break;
    const off = src[i] | src[i + 1] << 8; i += 2;
    let ml = t & 15;
    if (ml === 15) { let c; do { c = src[i++]; ml += c; } while (c === 255); }
    ml += 4;
    if (off === 0 || off > o) throw new Error('LZ4: ungültiger Versatz');
    for (let k = 0; k < ml; k++) { out[o] = out[o - off]; o++; }
  }
  if (o !== usize) throw new Error('LZ4: Länge stimmt nicht');
  return out;
};
TW.appleLz4 = function (raw) {
  const block = TW.lz4Compress(raw);
  const out = new Uint8Array(12 + block.length + 4), dv = new DataView(out.buffer);
  out.set([0x62, 0x76, 0x34, 0x31]);                       // "bv41"
  dv.setUint32(4, raw.length, true); dv.setUint32(8, block.length, true);
  out.set(block, 12);
  out.set([0x62, 0x76, 0x34, 0x24], 12 + block.length);    // "bv4$"
  return out;
};
TW.appleLz4Decode = function (b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), parts = []; let i = 0;
  for (;;) {
    const m = td.decode(b.subarray(i, i + 4)); i += 4;
    if (m === 'bv41') { const us = dv.getUint32(i, true), cs = dv.getUint32(i + 4, true); i += 8; parts.push(TW.lz4Decompress(b.subarray(i, i + cs), us)); i += cs; }
    else if (m === 'bv4-') { const us = dv.getUint32(i, true); i += 4; parts.push(b.slice(i, i + us)); i += us; }
    else if (m === 'bv4$') { if (i !== b.length) throw new Error('Apple-LZ4: Daten nach Endmarke'); return concatBytes(parts); }
    else throw new Error('Apple-LZ4: unbekannte Blockkennung');
  }
};

/* ---- TPL-Stiftstrich: "vuA(v)A(S(uu))A(S(uuuu))vA(f)" ---------------------
   v=2 | u=Strichbreite(f32) | A(v)=Operationen [0=Start,1=Quad…] | A(S(uu))=Startpunkt
   A(S(uuuu))=Quad-Segmente (Kontrollpunkt, Endpunkt) | v=1 | A(f)=leer            */
const TPL_SIG = 'vuA(v)A(S(uu))A(S(uuuu))vA(f)';
TW.tplEncode = function (stroke, scale) {
  const nq = stroke.q.length / 4;
  const total = 8 + TPL_SIG.length + 1 + 2 + 4 + 4 + 2 * (nq + 1) + 4 + 8 + 4 + 16 * nq + 2 + 4;
  const b = new Uint8Array(total), dv = new DataView(b.buffer);
  b.set([0x74, 0x70, 0x6c, 0x00]); dv.setUint32(4, total, true);
  b.set(te.encode(TPL_SIG), 8);
  let o = 8 + TPL_SIG.length + 1;
  dv.setUint16(o, 2, true); o += 2;
  dv.setFloat32(o, stroke.w * scale, true); o += 4;
  dv.setUint32(o, nq + 1, true); o += 4;
  dv.setUint16(o, 0, true); o += 2;
  for (let i = 0; i < nq; i++) { dv.setUint16(o, 1, true); o += 2; }
  dv.setUint32(o, 1, true); o += 4;
  dv.setFloat32(o, stroke.x * scale, true); dv.setFloat32(o + 4, stroke.y * scale, true); o += 8;
  dv.setUint32(o, nq, true); o += 4;
  for (let i = 0; i < stroke.q.length; i++) { dv.setFloat32(o, stroke.q[i] * scale, true); o += 4; }
  dv.setUint16(o, 1, true); o += 2;
  dv.setUint32(o, 0, true);
  return b;
};
TW.tplDecode = function (b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (td.decode(b.subarray(0, 3)) !== 'tpl' || dv.getUint32(4, true) !== b.length) throw new Error('TPL: Kopf ungültig');
  if (td.decode(b.subarray(8, 8 + TPL_SIG.length)) !== TPL_SIG) throw new Error('TPL: Signatur weicht ab');
  let o = 8 + TPL_SIG.length + 1;
  const ver = dv.getUint16(o, true); o += 2;
  const w = dv.getFloat32(o, true); o += 4;
  const nOps = dv.getUint32(o, true); o += 4 + 2 * nOps;
  const nStart = dv.getUint32(o, true); o += 4;
  const x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true); o += 8 * nStart;
  const nq = dv.getUint32(o, true); o += 4;
  const q = new Float32Array(nq * 4);
  for (let i = 0; i < nq * 4; i++) { q[i] = dv.getFloat32(o, true); o += 4; }
  if (o + 6 !== b.length || nOps !== nq + 1 || ver !== 2) throw new Error('TPL: Struktur weicht ab');
  return { w, x, y, q };
};

/* ---- Protobuf -------------------------------------------------------------- */
class Pb {
  constructor() { this.p = []; }
  _v(n) { let v = BigInt(n); const a = []; do { let b = Number(v & 0x7Fn); v >>= 7n; if (v) b |= 0x80; a.push(b); } while (v); this.p.push(Uint8Array.from(a)); }
  _k(f, w) { this._v((f << 3) | w); }
  varint(f, n) { this._k(f, 0); this._v(n); return this; }
  bytes(f, u8) { this._k(f, 2); this._v(u8.length); this.p.push(u8); return this; }
  str(f, s) { return this.bytes(f, te.encode(s)); }
  msg(f, m) { return this.bytes(f, m.done()); }
  f32(f, x) { this._k(f, 5); const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, true); this.p.push(b); return this; }
  f64(f, x) { this._k(f, 1); const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x, true); this.p.push(b); return this; }
  done() { return concatBytes(this.p); }
}
function delimited(msgs) {
  const parts = [];
  for (const m of msgs) { const h = new Pb(); h._v(m.length); parts.push(h.done(), m); }
  return concatBytes(parts);
}
TW.pbParse = function (b) {
  const out = []; let i = 0;
  const rv = () => { let r = 0n, s = 0n, c; do { c = b[i++]; r |= BigInt(c & 127) << s; s += 7n; } while (c & 128); return r; };
  while (i < b.length) {
    const k = Number(rv()), f = k >> 3, w = k & 7; let v;
    if (w === 0) v = rv();
    else if (w === 1) { v = b.subarray(i, i + 8); i += 8; }
    else if (w === 2) { const l = Number(rv()); v = b.subarray(i, i + l); i += l; }
    else if (w === 5) { v = b.subarray(i, i + 4); i += 4; }
    else throw new Error('Protobuf: unbekannter Drahttyp');
    if (i > b.length || f === 0) throw new Error('Protobuf: abgeschnitten');
    out.push({ f, w, v });
  }
  return out;
};
TW.pbDelimited = function (b) {
  const out = []; let i = 0;
  while (i < b.length) { let l = 0, s = 0, c; do { c = b[i++]; l |= (c & 127) << s; s += 7; } while (c & 128); out.push(b.subarray(i, i + l)); i += l; }
  if (i !== b.length) throw new Error('Protobuf: Längenfeld passt nicht');
  return out;
};
const pbGet = (items, f) => { const it = items.find(x => x.f === f); return it ? it.v : undefined; };
const pbStr = v => v === undefined ? undefined : td.decode(v);
const f32of = v => new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true);

/* ---- Kennungen ------------------------------------------------------------- */
function randBytes(n) { const b = new Uint8Array(n); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(b); return b; }
function rand32() { return new DataView(randBytes(4).buffer).getUint32(0, true); }
const HEX = [...Array(256)].map((_, i) => i.toString(16).padStart(2, '0').toUpperCase());
TW.uuid = function () {
  const b = randBytes(16); b[6] = (b[6] & 0x0F) | 0x40; b[8] = (b[8] & 0x3F) | 0x80;
  const h = Array.from(b, x => HEX[x]).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
/* Stiftspeicher-UUID = Seiten-UUID + 1 (128-Bit-Zahlenwert) */
TW.uuidPlusOne = function (u) {
  const n = (BigInt('0x' + u.replace(/-/g, '')) + 1n) & ((1n << 128n) - 1n);
  const h = n.toString(16).toUpperCase().padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
TW.pageUuidPair = function () {
  let p; do { p = TW.uuid(); } while (/F{4}$/.test(p));   // kein Übertrag über die letzte Gruppe hinaus
  return { page: p, notes: TW.uuidPlusOne(p) };
};
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function orderKey(i, n) {          // aufsteigende Sortierschlüssel (6 Zeichen, wie '4jA7O2' der Referenz)
  let v = Math.floor((i + 1) / (n + 1) * Math.pow(62, 5)), s = '';
  for (let k = 0; k < 5; k++) { s = B62[v % 62] + s; v = Math.floor(v / 62); }
  return s + B62[1 + Math.floor(Math.random() * 61)];
}

/* ---- PDF ------------------------------------------------------------------- */
const num = x => { const s = (Math.round(x * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
function pdfAssemble(objs, rootId, infoId) {
  const parts = [te.encode('%PDF-1.7\n%\x80\x80\x80\x80\n\n')]; let off = parts[0].length; const offs = [];
  objs.forEach((o, i) => {
    offs.push(off);
    const head = te.encode(`${i + 1} 0 obj\n`);
    const body = o instanceof Uint8Array ? o : te.encode(o);
    const tail = te.encode('\nendobj\n\n');
    parts.push(head, body, tail); off += head.length + body.length + tail.length;
  });
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) x += String(o).padStart(10, '0') + ' 00000 n \n';
  x += `trailer\n<< /Size ${objs.length + 1} /Root ${rootId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ''} >>\nstartxref\n${off}\n%%EOF\n`;
  parts.push(te.encode(x));
  return concatBytes(parts);
}
function streamObj(dict, data) {
  return concatBytes([te.encode(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, te.encode('\nendstream')]);
}
function paperOps(paper) {
  const H = TW.PAGE_H, [r, g, b] = TW.hexRgb(paper.bg), [lr, lg, lb] = TW.hexRgb(paper.line);
  let s = `q\n${num(r)} ${num(g)} ${num(b)} rg\n0 0 ${num(TW.PAGE_W)} ${num(H)} re\nf\n`;
  if (paper.rects.length) {
    s += `${num(lr)} ${num(lg)} ${num(lb)} rg\n`;
    for (const R of paper.rects) s += `${num(R[0])} ${num(H - R[1] - R[3])} ${num(R[2])} ${num(R[3])} re\n`;
    s += 'f\n';
  }
  return s + 'Q\n';
}
function strokeOps(strokes, ink) {
  const H = TW.PAGE_H, [r, g, b] = TW.hexRgb(ink);
  let s = `q\n1 J 1 j\n${num(r)} ${num(g)} ${num(b)} RG\n`, lw = -1;
  for (const st of strokes) {
    if (st.w !== lw) { s += `${num(st.w)} w\n`; lw = st.w; }
    let px = st.x, py = st.y;
    s += `${num(px)} ${num(H - py)} m\n`;
    for (let i = 0; i < st.q.length; i += 4) {      // Quad -> kubische Bézierkurve (exakt)
      const cx = st.q[i], cy = st.q[i + 1], x = st.q[i + 2], y = st.q[i + 3];
      s += `${num(px + 2 / 3 * (cx - px))} ${num(H - (py + 2 / 3 * (cy - py)))} ${num(x + 2 / 3 * (cx - x))} ${num(H - (y + 2 / 3 * (cy - y)))} ${num(x)} ${num(H - y)} c\n`;
      px = x; py = y;
    }
    s += 'S\n';
  }
  return s + 'Q\n';
}
const MEDIABOX = () => `[0 0 ${num(TW.PAGE_W)} ${num(TW.PAGE_H)}]`;
/* Hintergrund-PDF einer Seite: zwingend in echten PDF-Punkten (419,53 × 595,28) */
TW.backgroundPdf = function (settings) {
  const content = te.encode(paperOps(TW.paper(settings)));
  return pdfAssemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox ${MEDIABOX()} /Contents 4 0 R /Resources << /ProcSet [/PDF] >> >>`,
    streamObj('', content),
    '<< /Producer (Tintenwerk) >>'
  ], 1, 5);
};
function pdfTextString(s) {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}
/* Standard-PDF: Papier + Vektor-Handschrift, identische Koordinaten wie Vorschau/Goodnotes */
TW.buildPdf = async function (layout, title) {
  const paper = TW.paper(layout.settings), n = layout.pages.length;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null];
  const kids = [];
  for (let i = 0; i < n; i++) {
    const raw = te.encode(paperOps(paper) + strokeOps(layout.pages[i].strokes, layout.settings.ink));
    const z = await streamCompress(raw, 'deflate');
    const pageId = objs.length + 1, contId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox ${MEDIABOX()} /Contents ${contId} 0 R /Resources << /ProcSet [/PDF] >> >>`);
    objs.push(z ? streamObj('/Filter /FlateDecode', z) : streamObj('', raw));
  }
  objs[1] = `<< /Type /Pages /Count ${n} /Kids [${kids.join(' ')}] >>`;
  objs.push(`<< /Title ${pdfTextString(title || 'Notiz')} /Producer (Tintenwerk) /Creator (Tintenwerk) >>`);
  return pdfAssemble(objs, 1, objs.length);
};

/* ---- .goodnotes ------------------------------------------------------------ */
const REF_TEMPLATE = '238EE861-EE9A-51BD-B010-832CD3C50D2C_a5_1_2 - White';
TW.buildGoodnotes = async function (layout, title, thumbJpeg) {
  const S = layout.settings, PEN = TW.PEN, V = TW.SCHEMA;
  const docId = TW.uuid(), device = BigInt.asUintN(62, new DataView(randBytes(8).buffer).getBigUint64(0, true)) | (1n << 61n);
  let ts = Date.now() + 0.25, seq = BigInt(Date.now());
  const tick = () => { ts += 3 + Math.random() * 4; seq += 1n + BigInt(Math.floor(Math.random() * 3)); };
  const clk = c => { const m = new Pb(); if (c) m.varint(1, c); return m.varint(2, rand32()); };
  const reg = (v, isStr) => { const m = new Pb(); if (isStr) m.str(1, v); else if (v !== null) m.varint(1, v); return m.msg(2, clk(1)); };
  const rgba = c => new Pb().f32(1, c[0]).f32(2, c[1]).f32(3, c[2]).f32(4, 1);
  const ev = (key, field, m) => new Pb().str(1, key).msg(field, m).done();

  const paper = TW.paper(S), pc = TW.PAPER_COLORS[S.paperColor] || TW.PAPER_COLORS.weiss;
  const spacingPen = paper.grid.S * PEN, lineT = 0.5 * PEN;
  const isRef = S.paper === 'liniert' && S.paperColor === 'weiss' && S.spacing === 'ref';
  const tplName = isRef ? REF_TEMPLATE : `${TW.uuid()}_a5_1_2 - ${pc.name}`;
  const bgPdf = TW.backgroundPdf(S);
  const Wp = Math.fround(TW.PAGE_W * PEN), Hp = Math.fround(TW.PAGE_H * PEN);
  const originY = (TW.FIRST_LINE - 0.25) * PEN - (spacingPen - lineT);
  const [ir, ig, ib] = TW.hexRgb(S.ink);
  const xUuid = TW.uuid();

  const events = [], files = [], pagesMeta = [];
  const idxNotes = [], idxAtt = [], idxSearch = [];
  // Dokument-Ereignis (Feld 30)
  events.push(ev(docId, 30, new Pb().str(1, docId).msg(2, reg(title || 'Unbenanntes Notizbuch', true)).msg(3, reg(xUuid, true))
    .msg(6, reg('P', true)).msg(7, reg(xUuid, true)).str(9, 'auto').f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq)
    .bytes(17, new Uint8Array(0)).bytes(18, new Uint8Array(0)).msg(19, new Pb().msg(2, clk(1))).varint(20, V)));

  const nPages = layout.pages.length;
  let strokeCounter = 1000000 + Math.floor(Math.random() * 3000000);
  for (let pi = 0; pi < nPages; pi++) {
    const ids = TW.pageUuidPair(), attId = TW.uuid(), bgId = TW.uuid();
    // Anhang (Hintergrund-PDF, Feld 6)
    tick();
    events.push(ev(attId, 6, new Pb().str(1, attId).str(2, attId).varint(5, bgPdf.length).str(6, docId).f64(10, ts).str(11, TW.uuid())
      .msg(12, new Pb().varint(1, 1).varint(2, 1)).varint(14, device).varint(15, seq).varint(16, V)));
    // Seitenvorlage (Feld 2): Maße in Stiftkoordinaten
    tick();
    events.push(ev(bgId, 2, new Pb().str(1, docId).str(2, bgId).str(4, attId).varint(5, 1).varint(6, 1).f64(7, Math.fround(spacingPen))
      .msg(8, new Pb().f32(1, Wp).f32(2, Hp)).str(9, tplName).f64(10, ts).str(11, TW.uuid())
      .msg(12, new Pb().f64(1, Math.fround(spacingPen)).msg(2, clk(1))).msg(13, reg(1)).varint(15, device).varint(16, seq).msg(17, reg(1))
      .msg(18, new Pb().msg(1, new Pb().msg(1, new Pb().f32(1, 44).f32(2, originY)).msg(2, new Pb().f32(1, Wp - 88).f32(2, Hp - 2 * originY)))
        .f32(2, spacingPen - lineT).f32(3, lineT).varint(5, 1))
      .msg(19, new Pb().msg(2, clk(1))).varint(21, V)));
    // Seite (Feld 54)
    tick();
    events.push(ev(ids.page, 54, new Pb().str(1, docId).str(2, ids.page).msg(3, reg(bgId, true)).msg(4, reg(orderKey(pi, nPages), true))
      .f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq).varint(15, V)
      .msg(17, new Pb().msg(1, new Pb().msg(2, new Pb().msg(1, rgba(TW.hexRgb(pc.line))).msg(2, rgba(TW.hexRgb(pc.bg))))).msg(2, clk(1)))));
    // Stiftspeicher-Ereignisse (104, 102, 105, 104) + Anhang-Index (105)
    const e104 = () => { tick(); events.push(ev(ids.notes, 104, new Pb().str(1, docId).str(2, ids.notes).f64(10, ts).str(11, TW.uuid()).str(13, 'auto').varint(14, 1).str(15, TW.uuid()).varint(17, device).varint(18, seq).varint(19, V))); };
    e104();
    tick();
    events.push(ev(ids.notes, 102, new Pb().str(1, ids.notes).f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq).varint(15, V).str(16, docId)));
    tick();
    events.push(ev(ids.notes, 105, new Pb().varint(1, 1).str(2, docId).str(4, ids.notes).str(6, 'auto').f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq).varint(15, V)));
    e104();
    tick();
    events.push(ev(attId, 105, new Pb().str(2, docId).str(3, attId).f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq).varint(15, V)));

    // Stiftstriche: Kopf-Datensatz + Strich-Datensatz (Feld 7) je Strich
    const recs = [], strokes = layout.pages[pi].strokes;
    for (let si = 0; si < strokes.length; si++) {
      const sid = TW.uuid(), r = rand32();
      recs.push(new Pb().str(1, sid).msg(2, new Pb().varint(1, 2).varint(2, r)).varint(8, device).varint(9, strokeCounter++).varint(14, 5381).varint(16, V).done());
      const col = new Pb(); if (ir) col.f32(1, ir); if (ig) col.f32(2, ig); if (ib) col.f32(3, ib); col.f32(4, 1);
      recs.push(new Pb().msg(7, new Pb().str(1, sid).bytes(2, TW.appleLz4(TW.tplEncode(strokes[si], PEN))).msg(4, col)
        .bytes(6, new Uint8Array(0)).msg(7, new Pb().msg(1, clk(si))).bytes(9, new Uint8Array(0))
        .msg(15, new Pb().varint(1, 2).varint(2, r)).bytes(20, new Uint8Array(0)).varint(21, V)).done());
    }
    const notesData = delimited(recs);
    idxNotes.push(new Pb().str(1, ids.notes).str(2, 'notes/' + ids.notes).done());
    idxAtt.push(new Pb().str(1, attId).str(2, 'attachments/' + attId).done());
    idxSearch.push(new Pb().str(1, ids.notes).str(2, 'search/' + ids.notes).done());
    idxSearch.push(new Pb().str(1, attId).str(2, 'search/' + attId).varint(3, 1).done());
    files.push({ name: 'search/' + attId, data: delimited([new Pb().varint(2, 1).bytes(3, new Uint8Array(0)).done()]), grp: 1 });
    // Suchindex der Seite: Kopf + Abschlussfelder der Referenz, ohne erfundene Erkennungsergebnisse
    files.push({ name: 'search/' + ids.notes, data: new Pb().str(5, ids.page).str(13, 'auto').f32(14, 5).varint(15, 26).varint(16, 1).done(), grp: 1 });
    files.push({ name: 'notes/' + ids.notes, data: notesData, grp: 2 });
    files.push({ name: 'attachments/' + attId, data: bgPdf, grp: 3 });
    pagesMeta.push({ pageId: ids.page, notesId: ids.notes, attId, bgId, strokes: strokes.length });
  }
  tick();
  events.push(ev(docId, 10, new Pb().str(1, docId).str(2, pagesMeta[0].pageId).str(3, 'PagingViewServiceUpdater:' + TW.uuid()).f64(10, ts).str(11, TW.uuid()).varint(13, device).varint(14, seq).varint(15, V)));

  const grp = g => files.filter(f => f.grp === g).map(f => ({ name: f.name, data: f.data }));
  const zipFiles = [
    { name: 'document.info.pb', data: new Uint8Array(0) },
    { name: 'index.search.pb', data: delimited(idxSearch) },
    { name: 'index.notes.pb', data: delimited(idxNotes) },
    ...grp(1), ...grp(2),
    { name: 'index.events.pb', data: delimited(events) },
    { name: 'thumbnail.jpg', data: thumbJpeg || new Uint8Array(0) },
    { name: 'index.attachments.pb', data: delimited(idxAtt) },
    ...grp(3),
    { name: 'schema.pb', data: new Pb().varint(1, V).done() }
  ];
  return { zip: await TW.zip(zipFiles), meta: { docId, pages: pagesMeta }, files: zipFiles };
};

/* ---- Verifikation einer erzeugten .goodnotes-Datei (liest die echten Bytes zurück) ---- */
TW.verifyGoodnotes = async function (zipBytes, layout) {
  const res = { ok: true, checks: [] };
  const add = (name, ok, detail) => { res.checks.push({ name, ok, detail }); if (!ok) res.ok = false; };
  let files;
  try { files = await TW.unzip(zipBytes); } catch (e) { add('ZIP-Archiv lesbar', false, e.message); return res; }
  const byName = new Map(files.map(f => [f.name, f.data]));
  const need = ['document.info.pb', 'index.search.pb', 'index.notes.pb', 'index.events.pb', 'thumbnail.jpg', 'index.attachments.pb', 'schema.pb'];
  const missing = need.filter(n => !byName.has(n));
  add('ZIP-Archiv mit allen Pflichtdateien (CRC geprüft)', !missing.length, missing.length ? 'fehlt: ' + missing.join(', ') : files.length + ' Dateien');

  // Ereignisse lesen
  const pages = [], sizes = [], spacings = [];
  let evOk = true;
  try {
    for (const rec of TW.pbDelimited(byName.get('index.events.pb'))) {
      const it = TW.pbParse(rec), key = pbStr(pbGet(it, 1));
      const p54 = pbGet(it, 54), p2 = pbGet(it, 2);
      if (p54) pages.push(key);
      if (p2) { const m = TW.pbParse(p2), sz = TW.pbParse(pbGet(m, 8)); sizes.push([f32of(pbGet(sz, 1)), f32of(pbGet(sz, 2))]); spacings.push(new DataView(pbGet(m, 7).buffer, pbGet(m, 7).byteOffset, 8).getFloat64(0, true)); }
    }
  } catch (e) { evOk = false; }
  add('Seitenereignisse (Protobuf) lesbar', evOk && pages.length === layout.pages.length, `${pages.length} Seite(n)`);

  // UUID + 1
  const notesIdx = TW.pbDelimited(byName.get('index.notes.pb')).map(r => pbStr(pbGet(TW.pbParse(r), 1)));
  const bad = [];
  pages.forEach((p, i) => { const want = TW.uuidPlusOne(p); if (notesIdx[i] !== want || !byName.has('notes/' + want)) bad.push(`Seite ${i + 1}`); });
  add('UUID-Kopplung: Stiftspeicher = Seiten-UUID + 1 (jede Seite)', pages.length > 0 && !bad.length, bad.length ? 'verletzt bei ' + bad.join(', ') : pages.map((p, i) => `…${p.slice(-4)} → …${notesIdx[i].slice(-4)}`).slice(0, 4).join(', ') + (pages.length > 4 ? ' …' : ''));

  // Maße: PDF in echten Punkten, Seitenmaß in Stiftkoordinaten
  let pdfOk = true, pdfDetail = '';
  for (const f of files) if (f.name.startsWith('attachments/')) {
    const m = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(td.decode(f.data));
    if (!m || Math.abs(+m[1] - 419.53) > 0.005 || Math.abs(+m[2] - 595.28) > 0.005) pdfOk = false;
    pdfDetail = m ? `${m[1]} × ${m[2]} pt` : 'MediaBox fehlt';
  }
  add('Hintergrund-PDF in echten PDF-Punkten (419,53 × 595,28)', pdfOk && pdfDetail !== '', pdfDetail);
  const szOk = sizes.length === pages.length && sizes.every(s => Math.abs(s[0] - 419.53 * 11 / 6) < 0.01 && Math.abs(s[1] - 595.28 * 11 / 6) < 0.01);
  add('Seitenmaß in Stiftkoordinaten (× 11/6 = 769,14 × 1091,35)', szOk, sizes[0] ? `${sizes[0][0].toFixed(2)} × ${sizes[0][1].toFixed(2)}` : '');
  const spOk = spacings.every(s => Math.abs(s - layout.grid.S * 11 / 6) < 0.001);
  add('Linienabstand der Vorlage in Stiftkoordinaten', spOk, spacings[0] ? `${spacings[0].toFixed(3)} = ${num(layout.grid.S)} pt × 11/6` : '');

  // Stiftstriche: Apple-LZ4 -> TPL -> Koordinatenvergleich mit dem Layout
  let total = 0, maxDev = 0, inside = true, err = '';
  try {
    pages.forEach((p, pi) => {
      const recs = TW.pbDelimited(byName.get('notes/' + TW.uuidPlusOne(p)));
      const src = layout.pages[pi].strokes; let si = 0;
      for (const r of recs) {
        const s7 = pbGet(TW.pbParse(r), 7); if (!s7) continue;
        const t = TW.tplDecode(TW.appleLz4Decode(pbGet(TW.pbParse(s7), 2)));
        const o = src[si++]; total++;
        maxDev = Math.max(maxDev, Math.abs(t.x * 6 / 11 - o.x), Math.abs(t.y * 6 / 11 - o.y), Math.abs(t.w * 6 / 11 - o.w));
        for (let k = 0; k < t.q.length; k++) {
          maxDev = Math.max(maxDev, Math.abs(t.q[k] * 6 / 11 - o.q[k]));
          const lim = k % 2 ? 1091.35 : 769.14;
          if (t.q[k] < -2 || t.q[k] > lim + 2) inside = false;
        }
      }
      if (si !== src.length) throw new Error(`Seite ${pi + 1}: ${si} statt ${src.length} Striche`);
    });
  } catch (e) { err = e.message; }
  add('Stiftstriche: Apple-LZ4 (bv41…bv4$) + TPL verlustfrei rücklesbar', !err, err || `${total} Striche`);
  add('Stiftkoordinaten = Layout-Punkte × 11/6 (Abweichung < 0,001 pt)', !err && maxDev < 0.001 && inside, err ? '' : `max. Abweichung ${maxDev.toExponential(1)} pt`);
  return res;
};

/* Grundlinien- und Rand-Prüfung direkt auf dem Layout */
TW.verifyLayout = function (layout) {
  const g = layout.grid; let offBase = 0, offMargin = 0, offPage = 0, n = 0;
  for (const p of layout.pages) {
    for (const gl of p.glyphs) {
      n++;
      const r = (gl.base - g.y0) / g.S;
      if (Math.abs(r - Math.round(r)) > 1e-6 || gl.base > g.maxBaseline + 1e-6) offBase++;
      if (gl.x < g.left - 1e-6 || gl.x + gl.w > g.right + 1e-6) offMargin++;
    }
    for (const s of p.strokes) {
      if (s.x < 0 || s.x > TW.PAGE_W || s.y < 0 || s.y > TW.PAGE_H) offPage++;
      for (let i = 0; i < s.q.length; i += 2) if (s.q[i] < 0 || s.q[i] > TW.PAGE_W || s.q[i + 1] < 0 || s.q[i + 1] > TW.PAGE_H) { offPage++; break; }
    }
  }
  return { n, offBase, offMargin, offPage };
};

if (typeof module !== 'undefined' && module.exports) module.exports = TW;
