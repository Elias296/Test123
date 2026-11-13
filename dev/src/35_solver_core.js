/* ==========================================================================
   Aufgaben-Kern (DOM-frei, testbar): Aufgaben aus OCR-Text trennen, einfache
   Rechenaufgaben exakt berechnen, Prompt bauen, Modellausgabe bereinigen.
   ========================================================================== */
TW.solver = (function () {
  const HEAD_RE = /^\s*(?:Aufgabe|Übung|Uebung|Task|Exercise)\s*(\d{1,2})\b\s*[.:)]?\s*(.*)$/i;
  const NUM_RE = /^\s*(\d{1,2})\s*[.)]\s+(\S.*)$/;

  /* Zerlegt Seitentext in {context, tasks:[{label, text}]}.
     Aufgaben beginnen mit "1.", "2)", "Aufgabe 3"; die Nummern müssen aufsteigen (schützt vor "12. Januar" mitten im Text). */
  function splitTasks(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const starts = [];
    let last = 0;
    lines.forEach((ln, i) => {
      let m = HEAD_RE.exec(ln), n = null;
      if (m) n = +m[1]; else if ((m = NUM_RE.exec(ln))) n = +m[1];
      if (n !== null && n > last && n <= last + 5) { starts.push({ i, n }); last = n; }
    });
    if (!starts.length) {
      const paras = String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      if (paras.length > 1) return { context: '', tasks: paras.map((t, k) => ({ label: String(k + 1), text: t })) };
      const t = paras[0] || '';
      return { context: '', tasks: t ? [{ label: '', text: t }] : [] };
    }
    const context = lines.slice(0, starts[0].i).join('\n').trim();
    const tasks = starts.map((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].i : lines.length;
      let body = lines.slice(s.i, end).join('\n').trim();
      body = body.replace(/^\s*(?:Aufgabe|Übung|Uebung|Task|Exercise|Nr\.?)?\s*\d{1,2}\s*[.):]?\s*/i, '');
      return { label: String(s.n), text: body };
    }).filter(t => t.text);
    return { context, tasks };
  }

  /* ---- sicherer Mini-Rechner (kein eval): + − × ÷ : * / ( ) mit deutscher Zahlenschreibweise ---- */
  function tokenize(s) {
    const t = [], re = /\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?|[+\-−–×·*÷:/()])/y;
    let m, pos = 0;
    s = s.trim();
    while (pos < s.length) {
      re.lastIndex = pos; m = re.exec(s);
      if (!m) return null;
      pos = re.lastIndex;
      const v = m[1];
      if (/^\d/.test(v)) t.push({ n: parseFloat(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(',', '.')) });
      else t.push({ o: v === '−' || v === '–' ? '-' : v === '×' || v === '·' ? '*' : v === '÷' || v === ':' ? '/' : v });
    }
    return t;
  }
  function evaluate(expr) {
    const t = tokenize(expr);
    if (!t || !t.length || t.length > 60) return null;
    let i = 0, ok = true;
    const peek = () => t[i], op = o => t[i] && t[i].o === o;
    function prim() {
      if (op('(')) { i++; const v = add(); if (!op(')')) { ok = false; return 0; } i++; return v; }
      if (op('-')) { i++; return -prim(); }
      if (op('+')) { i++; return prim(); }
      if (t[i] && t[i].n !== undefined) return t[i++].n;
      ok = false; return 0;
    }
    function mul() { let v = prim(); while (op('*') || op('/')) { const o = t[i++].o, r = prim(); if (o === '/' && r === 0) { ok = false; return 0; } v = o === '*' ? v * r : v / r; } return v; }
    function add() { let v = mul(); while (op('+') || op('-')) { const o = t[i++].o, r = mul(); v = o === '+' ? v + r : v - r; } return v; }
    const v = add();
    if (!ok || i !== t.length || !isFinite(v)) return null;
    return v;
  }
  function fmtNum(v) {
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, v >= 10000 || v <= -10000 ? '.' : '');
    return String(Math.round(v * 1e6) / 1e6).replace('.', ',');
  }
  /* Reine Rechenzeile "345 + 678 =" (ggf. mit a) davor, Leerstellen/Punkte nach dem =) → {expr, result, text} oder null */
  function calcLine(raw) {
    const m = /^\s*(?:[a-z][.)]\s*)?([\d\s.,+\-−–×·*÷:/()]+?)\s*=\s*[._\s?…□]*$/i.exec(String(raw || '').trim());
    if (!m) return null;
    const expr = m[1].trim();
    if (!/\d/.test(expr) || !/[+\-−–×·*÷:/]/.test(expr.replace(/^-/, ''))) return null;
    const v = evaluate(expr);
    if (v === null) return null;
    const res = fmtNum(v);
    return { expr, result: res, text: `${expr} = ${res}` };
  }
  /* Eine Aufgabe, die nur aus Rechenzeilen besteht (z. B. "a) 3+4 =\nb) 5·6 =") → Zeilen mit Ergebnis oder null */
  function calcTask(text) {
    let lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean)
      .map(l => l.replace(/^[A-Za-zÄÖÜäöüß ]{3,40}:\s*(?=[\d(−-])/, ''));          // "Berechne: 12 + 30 =" -> "12 + 30 ="
    if (lines.some(l => calcLine(l))) lines = lines.filter(l => !(l.length < 45 && !/\d/.test(l) && /:$/.test(l)));    // Anweisungszeile wie "Berechne:" überspringen
    if (!lines.length || lines.length > 12) return null;
    const out = [];
    for (const l of lines) { const c = calcLine(l); if (!c) return null; out.push(c.text); }
    return out;
  }

  function buildSystem(opt) {
    const name = (opt.name || '').trim(), grade = (opt.grade || '').trim();
    return `Du heißt Tizian und bist ein geduldiger Hausaufgaben-Helfer${name ? ` für ${name}` : ''}${grade ? ` (Klasse ${grade})` : ''}. ` +
      `Löse die Aufgabe so, wie sie ins Heft geschrieben würde: fachlich richtig, klar, in kurzen vollständigen Sätzen und passend zur Klassenstufe. ` +
      'Antworte in der Sprache der Aufgabe. ' +
      (opt.work === false ? 'Schreibe bei Rechenaufgaben nur das Ergebnis. ' : 'Zeige bei Rechenaufgaben den Rechenweg kurz und schreibe am Ende "Ergebnis: …". ') +
      'Beantworte Teilaufgaben (a, b, …) einzeln und beginne jede Zeile mit dem Buchstaben. ' +
      'Erfinde keine Fakten und rate nicht. Wenn zur Aufgabe ein Bild, eine Zeichnung, eine Tabelle oder ein Text nötig ist, der fehlt, antworte genau mit: [Nicht lösbar: kurzer Grund]. ' +
      'Gib nur die Lösung aus, ohne Einleitung und ohne Wiederholung der Aufgabe. Verwende keine Markdown-Überschriften und kein LaTeX.';
  }
  function buildUser(task, context) {
    const ctx = (context || '').trim().slice(0, 1500);
    return (ctx ? `Textgrundlage:\n${ctx}\n\n` : '') + `Aufgabe${task.label ? ' ' + task.label : ''}:\n${task.text}`;
  }

  /* Modellausgabe in schreibbaren Text umwandeln (kein LaTeX/Markdown-Reste) */
  function cleanAnswer(s) {
    return String(s || '')
      .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, '')
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
      .replace(/\\(?:cdot|times)/g, '·').replace(/\\div/g, ':').replace(/\\(?:left|right)/g, '').replace(/\\,/g, ' ').replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/^#{1,6}\s*/gm, '').replace(/`+/g, '').replace(/^\s*[*•]\s+/gm, '- ').replace(/\*\*/g, '')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const isUnsolvable = s => /^\s*\[?\s*Nicht lösbar/i.test(s);
  /* Ergebnisse -> Notiztext fürs Blatt (fette Nummer, dann die Lösung) */
  function assemble(results) {
    return results.map(r => {
      const head = r.label ? `**${r.label}.** ` : '';
      const body = r.text.trim();
      return head + (body.includes('\n') ? '\n' + body : body);
    }).join('\n\n');
  }
  return { splitTasks, calcLine, calcTask, evaluate, fmtNum, buildSystem, buildUser, cleanAnswer, isUnsolvable, assemble };
})();
