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
