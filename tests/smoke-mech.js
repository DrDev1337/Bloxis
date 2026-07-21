/* Logiksmoke för spelmekanikerna (körs i ren Node, ingen webbläsare).
   Täcker stjärndimma, sand, drakägg, andar, nycklar/lås och ångra. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const g = {};
g.global = g; g.window = g; g.self = g;
const ctx = vm.createContext(g);
['js/shapes.js', 'js/game.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx));
const Game = g.BloxisGame;

let fails = 0;
const check = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const bar = n => ({ cells: Array.from({ length: n }, (_, i) => [0, i]), color: 2, w: n, h: 1 });
const cell1 = () => ({ cells: [[0, 0]], color: 2, w: 1, h: 1 });

// ===== Stjärndimma =====
{
  const lv = { type: 'mist', moves: 30, board: [
    'MM......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv });
  check(game.mistLeft === 2, 'dimma: 2 rutor vid start');
  check(!game.canPlaceAt(cell1(), 0, 0), 'dimma: kan inte placera på dimruta');
  check(game.canPlaceAt(cell1(), 0, 2), 'dimma: kan placera bredvid');
  game.pieces = [bar(8), cell1(), cell1()];
  const res = game.place(0, 1, 0);
  check(res.nLines === 1, 'dimma: rad 1 rensades');
  check(game.mistLeft === 0 && res.mistLifted.length === 2, 'dimma: båda dimrutor lyfta');
  check(game.status === 'won', 'dimma: banan vanns när dimman var borta');
}

// ===== Sand =====
{
  const lv = { type: 'sand', moves: 30, sandEvery: 2, board: [
    'S.......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv, rng: () => 0.01 });
  check(game.sandLeft === 1, 'sand: 1 vid start');
  game.pieces = [cell1(), cell1(), bar(7)];
  game.place(0, 6, 0);
  check(game.sandLeft === 1, 'sand: ingen spridning på drag 1');
  game.place(1, 6, 1);
  check(game.sandLeft === 2, 'sand: spred sig på drag 2');
}

// ===== Drakägg =====
{
  const lv = { type: 'eggs', moves: 30, eggTimer: 3, board: [
    'E.......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv });
  check(game.eggsLeft === 1 && game.board[0][0].egg === 3, 'ägg: timer 3 vid start');
  game.pieces = [cell1(), cell1(), cell1()];
  game.place(0, 5, 0);
  check(game.board[0][0].egg === 2 && game.status === 'playing', 'ägg: tickar ner');
  game.place(1, 5, 1);
  game.place(2, 5, 2);
  check(game.status === 'lost' && game.lossReason === 'egg', 'ägg: kläcks -> förlust');
}
{
  const lv = { type: 'eggs', moves: 30, eggTimer: 3, board: [
    'E.......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv });
  game.pieces = [bar(7), cell1(), cell1()];
  const res = game.place(0, 0, 1);
  check(res.nLines === 1 && game.eggsLeft === 0 && game.status === 'won',
    'ägg: rensning räddar ägget och vinner');
}

// ===== Andar =====
{
  const lv = { type: 'ghosts', moves: 30, ghostEvery: 2, board: [
    'A.......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv, rng: () => 0.01 });
  check(game.ghostsLeft === 1, 'ande: 1 vid start');
  game.pieces = [cell1(), cell1(), bar(7)];
  game.place(0, 6, 6);
  check(game.board[0][0] && game.board[0][0].ghost, 'ande: står still på drag 1');
  const res2 = game.place(1, 6, 7);
  check(res2.ghostMoves.length === 1 && game.board[1][0] && game.board[1][0].ghost,
    'ande: svävade på drag 2');
  game.pieces = [bar(7), cell1(), cell1()];
  const res3 = game.place(0, 1, 1);
  check(res3.nLines === 1 && game.ghostsLeft === 0 && game.status === 'won',
    'ande: fångad av rensning -> vinst');
}

// ===== Nycklar och lås =====
{
  const lv = { type: 'keys', moves: 30, board: [
    'K.......', '........', '........', '........',
    '........', '........', '........', 'L.......'] };
  const game = new Game({ mode: 'level', level: lv });
  check(game.keysLeft === 1, 'nyckel: 1 vid start');
  game.pieces = [bar(7), bar(7), cell1()];
  const resL = game.place(0, 7, 1);
  check(resL.nLines === 1 && resL.lockHits.length === 1 && game.board[7][0] && game.board[7][0].lock,
    'lås: står emot rensning medan nyckeln är kvar');
  const resK = game.place(1, 0, 1);
  check(resK.nLines === 1 && game.keysLeft === 0, 'nyckel: samlad');
  check(resK.locksShattered.length === 1 && !game.board[7][0] && game.status === 'won',
    'lås: krossas när alla nycklar samlats -> vinst');
}

// ===== Ångra återställer allt =====
{
  const lv = { type: 'mist', moves: 30, board: [
    'MM......', '........', '........', '........',
    '........', '........', '........', '........'] };
  const game = new Game({ mode: 'level', level: lv });
  game.pieces = [bar(8), cell1(), cell1()];
  game.place(0, 1, 0);
  game.undo();
  check(game.mistLeft === 2 && game.mist[0][0] && game.status === 'playing',
    'ångra: dimman är tillbaka');
}

console.log(fails ? fails + ' FEL' : 'Alla mekaniktester gröna.');
process.exit(fails ? 1 : 0);
