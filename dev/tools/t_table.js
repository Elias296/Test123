const TW=require('./t_engine.js');
const L=TW.layout({title:'T',text:'Name | Wert | Einheit\n| --- | --- | --- |\nGeschwindigkeit des Lichts im Vakuum | 299792458 | m/s\nMasse | 5 | kg\n\nDanach Text.'},{});
console.log(L.stats,TW.verifyLayout(L));
const rows=[...new Set(L.pages[0].glyphs.map(g=>g.row))];console.log('rows',rows);
const byRow={};for(const g of L.pages[0].glyphs){(byRow[g.row]=byRow[g.row]||[]).push(Math.round(g.x))}
for(const r in byRow)console.log(r,Math.min(...byRow[r]),Math.max(...byRow[r]));
