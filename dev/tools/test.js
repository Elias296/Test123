// Engine-Tests ohne Browser: node dev/tools/test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const TW = require('./t_engine.js');
(async () => {
  const text = fs.readFileSync(path.join(__dirname, 'sample.txt'), 'utf8');
  for (const [name, st, rep] of [['Referenzblatt', {}, 1], ['Mehrseitig/Locker/Kariert', { style: 'locker', size: 'gross', spacing: '5', paper: 'kariert', paperColor: 'creme', margin: 16 }, 4]]) {
    const L = TW.layout({ title: 'Test', text: text.repeat(rep) }, st);
    const g = await TW.buildGoodnotes(L, 'Test', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    const v = await TW.verifyGoodnotes(g.zip, L), lv = TW.verifyLayout(L);
    assert(v.ok, name + ': Export-Prüfung fehlgeschlagen: ' + JSON.stringify(v.checks.filter(c => !c.ok)));
    assert(lv.offBase === 0 && lv.offMargin === 0 && lv.offPage === 0, name + ': Layout ' + JSON.stringify(lv));
    console.log('OK', name, L.stats);
  }
  const T = TW.layout({ title: 'T', text: '| A | B |\n|---|---|\n| lang lang lang lang lang lang | x |\nDanach' }, {});
  assert(TW.verifyLayout(T).offBase === 0 && T.pages[0].glyphs.length > 10); console.log('OK Tabelle');
  for (let t = 0; t < 300; t++) { const n = Math.floor(Math.random() * 600), b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.random() < .6 ? i % 7 : Math.random() * 256 | 0; assert.deepStrictEqual(Buffer.from(TW.lz4Decompress(TW.lz4Compress(b), n)), Buffer.from(b)); }
  console.log('OK LZ4-Fuzz');
  const p = TW.pageUuidPair(); assert.strictEqual(TW.uuidPlusOne('02F50933-3868-4744-A592-0909AFC3EDD2'), '02F50933-3868-4744-A592-0909AFC3EDD3'); assert.strictEqual(TW.uuidPlusOne(p.page), p.notes); console.log('OK UUID+1');
})().catch(e => { console.error('FEHLER', e.message); process.exit(1); });
// ---- Aufgaben-Kern
(() => {
  const S = TW.solver;
  const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
  eq(S.calcLine('345 + 678 =').result, '1023'); eq(S.calcLine('a) 12 × 7 = ____').result, '84'); eq(S.calcLine('3,5 · 2 =').result, '7');
  eq(S.calcLine('1.000 : 8 =').result, '125'); eq(S.calcLine('(2 + 3) * 4 =').result, '20'); eq(S.calcLine('7 : 2 =').result, '3,5'); eq(S.calcLine('10 000 + 5 =') , null);
  eq(S.calcLine('5 / 0 ='), null); eq(S.calcLine('Berechne 3 + 4'), null); eq(S.calcLine('2024 ='), null); eq(S.calcLine('12 - 5 =').result, '7'); eq(S.calcLine('5.000 + 5.000 =').result, '10.000');
  eq(S.calcTask('a) 3+4 =\nb) 5·6 =\nc) 9-2 ='), ['3+4 = 7', '5·6 = 30', '9-2 = 7']); eq(S.calcTask('a) 3+4 =\nb) Erkläre'), null);
  eq(S.calcTask('Berechne:\n\n345 + 678 ='), ['345 + 678 = 1023']); eq(S.calcTask('Berechne:\nErkläre warum'), null);
  const r = S.splitTasks('Lies den Text.\nEr erschien am 12. Januar 1945.\n1. Nenne das Datum.\n2. Was geschah?\na) Erkläre\nb) Begründe\n3) Rechne 3+4 =');
  eq(r.tasks.map(t => t.label), ['1', '2', '3']); assert(r.context.startsWith('Lies den Text'), 'context'); assert(r.tasks[1].text.includes('b) Begründe'));
  eq(S.splitTasks('Aufgabe 1: Berechne.\nAufgabe 2: Zeichne.').tasks.map(t => t.label), ['1', '2']);
  eq(S.splitTasks('Erster Absatz.\n\nZweiter Absatz.').tasks.length, 2); eq(S.splitTasks('Nur ein Text').tasks.length, 1); eq(S.splitTasks('').tasks.length, 0);
  eq(S.cleanAnswer('## Lösung\n$\\frac{3}{4} \\cdot 2 = 1,5$\n* Punkt **fett**'), 'Lösung\n3/4 · 2 = 1,5\n- Punkt fett'); assert(S.isUnsolvable('[Nicht lösbar: Bild fehlt]'));
  assert(S.buildSystem({ name: 'Mia', grade: '7' }).includes('für Mia (Klasse 7)')); assert(S.buildSystem({}).startsWith('Du heißt Tizian')); assert(!/ sein | ihr | er /.test(S.buildSystem({ name: 'Mia' })), 'keine Pronomen');
  eq(S.assemble([{ label: '1', text: 'A' }, { label: '2', text: 'a) x\nb) y' }]), '**1.** A\n\n**2.** \na) x\nb) y');
  console.log('OK Aufgaben-Kern');
})();
// ---- Typografie: Hochzahlen und spitze Klammern
(() => {
  const eq = (a, b) => assert.strictEqual(a, b);
  eq(TW.typo('y=x2 heißt Normalparabel'), 'y=x² heißt Normalparabel'); eq(TW.typo('x^2 + y^2 = r^2'), 'x² + y² = r²'); eq(TW.typo('10^-3 und a^(12)'), '10⁻³ und a¹²');
  eq(TW.typo('x2+y2'), 'x²+y²'); eq(TW.typo('(a+b)^2'), '(a+b)²'); eq(TW.typo('5 cm2 und 3 km3, 2 m3'), '5 cm² und 3 km³, 2 m³');
  for (const keep of ['CO2 und H2O', 'A4 Papier', 'x20', 'x2,5', 'B12', 'ab2', 'x_2', 'Seite 2', 'a^b', 'O2']) eq(TW.typo(keep), keep);
  const L = TW.layout({ title: '', text: 'y=x2 und a < b > c, x^10' }, {});
  eq([...L.unmapped.keys()].join(''), ''); assert(L.pages[0].glyphs.some(g => g.ch === '²') && L.pages[0].glyphs.some(g => g.ch === '<') && L.pages[0].glyphs.some(g => g.ch === '⁰'));
  assert(!TW.layout({ title: '', text: 'y=x2' }, { autoSup: false }).pages[0].glyphs.some(g => g.ch === '²'));
  console.log('OK Typografie');
})();
