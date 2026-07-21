/* Banaudit: inga självrensande linjer, ingen mekanik före sin debutvärld,
   sammanhängande världsintervall och rimliga bandefinitioner. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const g = {};
g.global = g; g.window = g; g.self = g;
const ctx = vm.createContext(g);
['js/shapes.js', 'js/levels.js', 'js/game.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx));
const LEVELS = g.BloxisLevels;
const WORLDS = g.BloxisWorlds;

let fails = 0;
const bad = m => { console.log('FEL  ' + m); fails++; };

// Världsintervallen täcker banlistan utan glapp
let expect = 0;
WORLDS.forEach(w => {
  if (w.from !== expect) bad('värld "' + w.name + '" börjar på ' + w.from + ', väntade ' + expect);
  expect = w.to + 1;
});
if (expect !== LEVELS.length) bad('världarna täcker ' + expect + ' banor, listan har ' + LEVELS.length);

const filled = ch => '#GISEAKL'.includes(ch);
const debutType = { ice: 1, sand: 2, mist: 3, eggs: 4, ghosts: 5, keys: 6 };
const debutChar = { I: 1, S: 2, M: 3, E: 4, A: 5, K: 6, L: 6 };

LEVELS.forEach((lv, i) => {
  const w = WORLDS.findIndex(x => i <= x.to);
  const b = lv.board || [];

  // självrensande rader/kolumner
  for (let r = 0; r < 8; r++) {
    if (b[r] && b[r].length === 8 && [...b[r]].every(filled)) bad('bana ' + (i + 1) + ': rad ' + r + ' full vid start');
  }
  for (let c = 0; c < 8; c++) {
    if (b.length === 8 && b.every(row => filled(row[c] || '.'))) bad('bana ' + (i + 1) + ': kolumn ' + c + ' full vid start');
  }

  // mekaniker före sin debutvärld
  if (debutType[lv.type] != null && w < debutType[lv.type]) {
    bad('bana ' + (i + 1) + ': måltypen ' + lv.type + ' före sin debutvärld');
  }
  b.forEach(row => {
    for (const ch of row) {
      if (debutChar[ch] != null && w < debutChar[ch]) bad('bana ' + (i + 1) + ': tecknet ' + ch + ' före sin debutvärld');
    }
  });

  // grundfält
  if (!lv.moves || lv.moves < 15 || lv.moves > 60) bad('bana ' + (i + 1) + ': orimligt antal drag (' + lv.moves + ')');
  if (lv.type === 'score' && !lv.target) bad('bana ' + (i + 1) + ': poängbana utan target');
  if (lv.type === 'collect' && (lv.color == null || !lv.count)) bad('bana ' + (i + 1) + ': färgjakt utan färg/antal');
});

console.log(fails ? fails + ' FEL' : 'Banaudit grön: ' + LEVELS.length + ' banor, ' + WORLDS.length + ' världar.');
process.exit(fails ? 1 : 0);
