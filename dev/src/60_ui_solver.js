/* ==========================================================================
   Tintenwerk – Aufgaben lösen (Hausaufgaben-Helfer): Buchseite → OCR → lokale KI → Lösungsnotiz
   ========================================================================== */
(function () {
'use strict';
const A = window.TWApp.APP, AI = window.TWApp.AI, SV = TW.solver;
const { $, S, K, LS, esc, toast, confirmDialog, openModal, closeModal } = A;
const PK = 'tintenwerk.helfer.v1';
const P = Object.assign({ name: 'Tizian', grade: '', work: true }, LS.get(PK, {}));

/* ---------- Profil ---------- */
$('#stuName').value = P.name;
$('#stuGrade').innerHTML = '<option value="">–</option>' + [5, 6, 7, 8, 9, 10, 11, 12, 13].map(g => `<option value="${g}">${g}</option>`).join('');
$('#stuGrade').value = P.grade; $('#stuWork').checked = !!P.work;
const saveProfile = () => { P.name = $('#stuName').value.trim().slice(0, 40); P.grade = $('#stuGrade').value; P.work = $('#stuWork').checked; LS.quiet(PK, P); };
['input', 'change'].forEach(ev => $('#solveCard').addEventListener(ev, e => { if (e.target.matches('#stuName,#stuGrade,#stuWork')) saveProfile(); }));

/* ---------- Zustand der Schaltflächen ---------- */
function refresh() {
  const ready = AI.state === 'ready' && !!AI.gen;
  $('#btnSolvePages').disabled = $('#btnSolveEditor').disabled = $('#btnSolveStaging').disabled = !ready;
  $('#solveHint').textContent = !ready ? 'Zuerst oben ein KI-Modell laden (für Aufgaben wird „Besser“ empfohlen).'
    : AI.loaded === 'schnell' ? 'Modell bereit. Tipp: Das Modell „Besser“ löst Aufgaben zuverlässiger.' : 'Modell bereit.';
}
document.addEventListener('tw-ai-state', refresh); refresh();

/* ---------- Eingänge ---------- */
$('#btnSolvePages').addEventListener('click', () => { if (AI.state !== 'ready') { toast('Bitte zuerst ein KI-Modell laden.'); return; } $('#solveFile').click(); });
$('#solveFile').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) A.runImport(f, 'solve'); });
$('#btnSolveEditor').addEventListener('click', () => { const t = S.draft.text.trim(); if (!t) { toast('Der Notiztext ist leer.'); return; } solveText(t, 'Notiztext'); });
$('#btnSolveStaging').addEventListener('click', () => { const t = $('#stagingText').value.trim(); if (!t) { toast('Das Prüfungsfenster ist leer.'); return; } solveText(t, 'Erkannter Text'); });

/* ---------- Lösen ---------- */
let results = [], stats = null;
const outEl = $('#solveOut'), tasksEl = $('#solveTasks');
function solveText(text, info) {
  if (AI.state !== 'ready' || !AI.gen) { toast('Bitte zuerst ein KI-Modell laden.'); return; }
  if (AI.running) { toast('Die KI arbeitet noch. Bitte kurz warten oder abbrechen.'); return; }
  tasksEl.value = text; outEl.value = ''; results = [];
  $('#solveWarn').hidden = true; $('#solveBy').textContent = ''; $('#solveProgress').textContent = info ? '· ' + info : '';
  setBtns(false); openModal('#solveModal');
  run();
}
A.solveText = solveText;
function setBtns(busy) {
  $('#solveCancel').hidden = !busy; $('#solveAgain').disabled = busy; $('#solveTake').disabled = busy || !outEl.value.trim();
  const blocked = S.draft.isSample || !S.draft.text.trim();
  $('#solveAppend').disabled = busy || !outEl.value.trim() || blocked;
  $('#solveAppend').title = blocked ? 'Anhängen ist nur an eine eigene, nicht leere Notiz möglich.' : '';
  tasksEl.readOnly = busy; outEl.readOnly = busy;
}
function show(extra) { outEl.value = SV.assemble(extra ? results.concat([extra]) : results); outEl.scrollTop = outEl.scrollHeight; }
async function run() {
  const { context, tasks } = SV.splitTasks(tasksEl.value);
  if (!tasks.length) { toast('Keine Aufgaben erkannt.'); setBtns(false); return; }
  const opt = { name: P.name, grade: P.grade, work: P.work }, sys = SV.buildSystem(opt);
  stats = { calc: 0, ai: 0, open: [] }; results = [];
  AI.running = true; AI.stopper = new AI.tf.InterruptableStoppingCriteria();
  setBtns(true); let aborted = false;
  try {
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      $('#solveProgress').textContent = `· Aufgabe ${i + 1} von ${tasks.length}`;
      const calc = SV.calcTask(t.text);
      if (calc) { results.push({ label: t.label, text: calc.join('\n') }); stats.calc++; show(); continue; }
      let cur = '';
      const streamer = new AI.tf.TextStreamer(AI.gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: x => { cur += x; show({ label: t.label, text: SV.cleanAnswer(cur) }); } });
      const res = await AI.gen([{ role: 'system', content: sys }, { role: 'user', content: SV.buildUser(t, context) }],
        { max_new_tokens: 500, do_sample: false, repetition_penalty: 1.05, streamer, stopping_criteria: AI.stopper });
      let txt = cur;
      try { const g = res[0].generated_text; txt = (Array.isArray(g) ? g[g.length - 1].content : g) || cur; } catch (e) { /* Streamer-Text */ }
      txt = SV.cleanAnswer(txt);
      if (AI.stopper.interrupted) { aborted = true; if (txt) results.push({ label: t.label, text: txt + ' …' }); show(); break; }
      if (SV.isUnsolvable(txt)) stats.open.push(t.label || String(i + 1));
      results.push({ label: t.label, text: txt || '[Keine Antwort]' }); stats.ai++; show();
    }
  } catch (e) { toast('KI-Fehler: ' + ((e && e.message) || e), 6000); }
  AI.running = false;
  $('#solveProgress').textContent = aborted ? '· abgebrochen (Teilergebnis)' : '· fertig';
  $('#solveBy').textContent = `${stats.calc} per Rechner · ${stats.ai} per KI`;
  const w = [];
  if (stats.open.length) w.push(`<b>Nicht lösbar (Bild, Tabelle oder Text fehlt):</b> Aufgabe ${stats.open.map(esc).join(', ')}. Bitte selbst ergänzen.`);
  w.push('<b>Bitte prüfen:</b> KI-Lösungen können falsch sein, besonders in Mathe, bei Diagrammen und Formeln. Links lässt sich der erkannte Text korrigieren und mit „Erneut lösen“ neu rechnen.');
  if (AI.loaded === 'schnell') w.push('Das kleine Modell „Schnell“ löst Aufgaben nur grob – für bessere Ergebnisse „Besser“ laden.');
  $('#solveWarn').innerHTML = w.join('<br>'); $('#solveWarn').hidden = false;
  setBtns(false);
}
$('#solveAgain').addEventListener('click', () => { if (!AI.running) { outEl.value = ''; run(); } });
$('#solveCancel').addEventListener('click', () => { if (AI.stopper) AI.stopper.interrupt(); $('#solveProgress').textContent = '· wird abgebrochen …'; });
$('#solveDiscard').addEventListener('click', () => { if (AI.running && AI.stopper) AI.stopper.interrupt(); closeModal('#solveModal'); });
outEl.addEventListener('input', () => setBtns(false));

/* ---------- Übernehmen (mit Undo-Snapshot, nie automatisch) ---------- */
function title() { return P.name ? `Aufgaben – ${P.name}` : 'Aufgaben'; }
$('#solveTake').addEventListener('click', async () => {
  const text = outEl.value.trim(); if (!text || AI.running) return;
  const has = S.draft.text.trim() && !S.draft.isSample;
  if (has && !(await confirmDialog('Aktuellen Entwurf ersetzen?', 'Die Lösungen werden als neue Notiz übernommen. Mit dem Rückgängig-Pfeil kannst du den Entwurf einmal wiederherstellen.', 'Ersetzen'))) return;
  A.snapshot('Aufgabenlösung als neue Notiz');
  A.setDraft({ title: title(), text, isSample: false, imports: 1 });
  closeModal('#solveModal'); toast('Lösungen als neue Notiz übernommen.');
});
$('#solveAppend').addEventListener('click', () => {
  const text = outEl.value.trim();
  if (!text || AI.running || S.draft.isSample || !S.draft.text.trim()) return;         // Sicherheitsregel: nie an die Beispielnotiz anhängen
  A.snapshot('Aufgabenlösung angehängt');
  A.setDraft({ title: S.draft.title, text: S.draft.text.replace(/\s+$/, '') + '\n\n' + text, isSample: false, imports: (S.draft.imports || 0) + 1 });
  closeModal('#solveModal'); toast('Lösungen an die Notiz angehängt.');
});
})();
