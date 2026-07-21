/* Botvalidering: en girig heuristikbot spelar varje bana N gånger och
   larmar om vinstchansen faller under tröskeln. Poäng- och färgjaktsbanor
   rapporteras men gatar inte (boten är strukturellt svag på dem – människor
   klarar dem bevisat bra).
   Miljövariabler: BOT_N (partier per bana, standard 12),
   BOT_MIN (lägsta vinstprocent, standard 15),
   BOT_LEVELS (kommaseparerade index, standard alla). */
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
const Game = g.BloxisGame;
const LEVELS = g.BloxisLevels;

const N = +(process.env.BOT_N || 12);
const MIN = +(process.env.BOT_MIN || 15);

/* Seedad slump gör varje parti deterministiskt: samma resultat i varje
   CI-körning, ingen flakighet. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rnd = Math.random;
const SOFT_TYPES = { score: 1, collect: 1 }; // botens kända svaghet – gatar inte
const IDX = process.env.BOT_LEVELS
  ? process.env.BOT_LEVELS.split(',').map(Number)
  : LEVELS.map((_, i) => i);

function lineCells(game, lines) {
  const cells = new Set();
  lines.rows.forEach(r => { for (let c = 0; c < game.size; c++) cells.add(r + ',' + c); });
  lines.cols.forEach(c => { for (let r = 0; r < game.size; r++) cells.add(r + ',' + c); });
  return [...cells].map(k => k.split(',').map(Number));
}

function evalMove(game, shape, row, col) {
  const lv = game.level;
  const lines = game.previewLines(shape, row, col);
  const nLines = lines.rows.length + lines.cols.length;
  let v = nLines * 40 + rnd();
  const mistSeen = new Set();
  for (const [r, c] of lineCells(game, lines)) {
    const cell = game.board[r][c];
    if (cell) {
      if (cell.gem) v += 220;
      if (cell.ice === 1) v += 220; else if (cell.ice > 1) v += 110;
      if (cell.sand) v += 200;
      if (cell.egg > 0) v += 350 + (20 - cell.egg) * 40;
      if (cell.ghost) v += 280;
      if (cell.key) v += 260;
      if (lv.type === 'collect' && !cell.gem && !cell.ice && !cell.sand && !cell.egg && cell.c === lv.color) v += 130;
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < game.size && cc < game.size && game.mist[rr][cc]) mistSeen.add(rr + ',' + cc);
    }
  }
  if (lv.type === 'mist') v += mistSeen.size * 260;
  if (lv.type === 'score') v += nLines * nLines * 60;
  if (lv.type === 'collect' && shape.color === lv.color) v += 20;
  for (const [dr, dc] of shape.cells) {
    const r = row + dr, c = col + dc;
    for (let i = 0; i < game.size; i++) {
      const near = cell => cell && (cell.gem || cell.ice || cell.sand || cell.egg > 0 || cell.ghost || cell.key);
      if (near(game.board[r][i])) v += 4;
      if (near(game.board[i][c])) v += 4;
      if (game.mist[r][i] || game.mist[i][c]) v += 3;
    }
    for (const [er, ec] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + er, cc = c + ec;
      if (rr >= 0 && cc >= 0 && rr < game.size && cc < game.size && game.mist[rr][cc]) v += 6;
    }
  }
  return v;
}

function playOnce(idx, trial) {
  rnd = mulberry32(idx * 7919 + trial * 104729 + 13);
  const game = new Game({ mode: 'level', level: LEVELS[idx], rng: rnd });
  let guard = 200;
  while (game.status === 'playing' && guard-- > 0) {
    let best = null;
    for (let s = 0; s < 3; s++) {
      const shape = game.pieces[s];
      if (!shape) continue;
      for (let r = 0; r <= game.size - shape.h; r++) {
        for (let c = 0; c <= game.size - shape.w; c++) {
          if (!game.canPlaceAt(shape, r, c)) continue;
          const v = evalMove(game, shape, r, c);
          if (!best || v > best.v) best = { s, r, c, v };
        }
      }
    }
    if (!best) break;
    game.place(best.s, best.r, best.c);
  }
  return game.status === 'won';
}

let hardFails = 0;
for (const idx of IDX) {
  let wins = 0;
  for (let i = 0; i < N; i++) if (playOnce(idx, i)) wins++;
  const lv = LEVELS[idx];
  const rate = Math.round(100 * wins / N);
  const soft = SOFT_TYPES[lv.type];
  const flag = rate < MIN ? (soft ? 'obs ' : 'FEL ') : '    ';
  if (rate < MIN && !soft) hardFails++;
  console.log(flag + 'bana ' + (idx + 1) + ' [' + lv.type + '] ' + rate + '%');
}
console.log(hardFails ? hardFails + ' banor under tröskeln' : 'Botvalidering grön (' + IDX.length + ' banor à ' + N + ' partier).');
process.exit(hardFails ? 1 : 0);
