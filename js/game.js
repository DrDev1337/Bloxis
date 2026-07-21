/* Bloxis – spellogik (UI-oberoende, går att köra i Node för tester). */
(function (global) {
  'use strict';

  var Shapes = global.BloxisShapes;
  var DEFAULT_SIZE = 8;

  /* En cell är null eller { c: färgindex, gem: bool, ice: 0|1|2, sand: bool,
     egg: 0|n, ghost: bool, key: bool, lock: bool }.
     ice=2: hel is (kräver två rensningar), ice=1: sprucken is.
     sand: sprider sig till en tom granne var level.sandEvery:e drag.
     egg=n: drakägg som kläcks (förlust) om det inte rensas inom n drag.
     ghost: ande som svävar till en tom granne var ghostEvery:e drag.
     key/lock: lås kan inte rensas förrän alla nycklar samlats – då
     krossas alla lås på en gång.
     Stjärndimma ligger i ett eget rutnät (this.mist): tomma rutor som inte
     går att bygga på förrän en rensning intill lyfter dimman. */

  function cloneBoard(board) {
    return board.map(function (row) {
      return row.map(function (cell) {
        return cell ? {
          c: cell.c, gem: !!cell.gem, ice: cell.ice || 0, sand: !!cell.sand,
          egg: cell.egg || 0, ghost: !!cell.ghost, key: !!cell.key, lock: !!cell.lock
        } : null;
      });
    });
  }

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'endless';       // 'endless' | 'level'
    this.level = opts.level || null;           // bandefinition vid mode 'level'
    this.size = opts.size || DEFAULT_SIZE;     // brädets sida (banor är alltid 8)
    this.shapeRamp = opts.shapeRamp || null;   // { t2, t3 }: drag då nivå 2/3-former släpps in
    this.rng = opts.rng || null;               // deterministisk slump (dagliga utmaningen)
    this.score = 0;
    this.combo = 0;                            // pågående kombokedja
    this.movesUsed = 0;
    this.status = 'playing';                   // 'playing' | 'won' | 'lost'
    this.lossReason = null;                    // 'moves' | 'stuck'
    this.collected = 0;                        // insamlade block (mål 'collect')
    this._undo = null;                         // ett stegs ångra
    this.board = [];
    for (var r = 0; r < this.size; r++) {
      this.board.push(new Array(this.size).fill(null));
    }
    this.mist = [];
    for (var m = 0; m < this.size; m++) {
      this.mist.push(new Array(this.size).fill(false));
    }
    if (this.level && this.level.board) this._loadBoard(this.level.board);
    this.gemsLeft = this._count(function (c) { return c.gem; });
    this.iceLeft = this._count(function (c) { return c.ice > 0; });
    this.sandLeft = this._count(function (c) { return c.sand; });
    this.eggsLeft = this._count(function (c) { return c.egg > 0; });
    this.ghostsLeft = this._count(function (c) { return c.ghost; });
    this.keysLeft = this._count(function (c) { return c.key; });
    this.mistLeft = 0;
    for (var mr = 0; mr < this.size; mr++) for (var mc = 0; mc < this.size; mc++) {
      if (this.mist[mr][mc]) this.mistLeft++;
    }
    this.pieces = [null, null, null];
    this.refill();
  }

  Game.prototype._loadBoard = function (rows) {
    var n = Math.min(rows.length, this.size);
    for (var r = 0; r < n; r++) {
      var row = rows[r] || '';
      for (var c = 0; c < Math.min(row.length, this.size); c++) {
        var ch = row[c] || '.';
        if (ch === '#') this.board[r][c] = { c: (r * 3 + c * 5) % 8, gem: false, ice: 0 };
        else if (ch === 'G') this.board[r][c] = { c: 0, gem: true, ice: 0 };
        else if (ch === 'I') this.board[r][c] = { c: 4, gem: false, ice: 2 };
        else if (ch === 'S') this.board[r][c] = { c: 1, gem: false, ice: 0, sand: true };
        else if (ch === 'E') this.board[r][c] = { c: 6, gem: false, ice: 0, egg: (this.level && this.level.eggTimer) || 12 };
        else if (ch === 'A') this.board[r][c] = { c: 4, gem: false, ice: 0, ghost: true };
        else if (ch === 'K') this.board[r][c] = { c: 2, gem: false, ice: 0, key: true };
        else if (ch === 'L') this.board[r][c] = { c: 5, gem: false, ice: 0, lock: true };
        else if (ch === 'M') this.mist[r][c] = true;
      }
    }
  };

  Game.prototype._count = function (pred) {
    var n = 0;
    for (var r = 0; r < this.size; r++) for (var c = 0; c < this.size; c++) {
      if (this.board[r][c] && pred(this.board[r][c])) n++;
    }
    return n;
  };

  Game.prototype.movesLeft = function () {
    if (this.mode !== 'level') return Infinity;
    return Math.max(0, this.level.moves - this.movesUsed);
  };

  Game.prototype.collectLeft = function () {
    if (!this.level || this.level.type !== 'collect') return 0;
    return Math.max(0, this.level.count - this.collected);
  };

  Game.prototype.canPlaceAt = function (shape, row, col) {
    for (var i = 0; i < shape.cells.length; i++) {
      var r = row + shape.cells[i][0];
      var c = col + shape.cells[i][1];
      if (r < 0 || c < 0 || r >= this.size || c >= this.size) return false;
      if (this.board[r][c]) return false;
      if (this.mist[r][c]) return false;
    }
    return true;
  };

  Game.prototype.canPlaceAnywhere = function (shape) {
    for (var r = 0; r <= this.size - shape.h; r++) {
      for (var c = 0; c <= this.size - shape.w; c++) {
        if (this.canPlaceAt(shape, r, c)) return true;
      }
    }
    return false;
  };

  Game.prototype.anyMoveLeft = function () {
    for (var i = 0; i < this.pieces.length; i++) {
      if (this.pieces[i] && this.canPlaceAnywhere(this.pieces[i])) return true;
    }
    return false;
  };

  /* Max formnivå just nu, utifrån svårighetsstegringen. */
  Game.prototype.maxTier = function () {
    if (!this.shapeRamp) return 3;
    if (this.movesUsed < this.shapeRamp.t2) return 1;
    if (this.movesUsed < this.shapeRamp.t3) return 2;
    return 3;
  };

  /* Fyller på tre nya pjäser. Försöker (upp till 25 ggr) hitta en uppsättning
     där minst en pjäs går att lägga, som en mild barmhärtighetsregel.
     På samlabanor garanteras minst en pjäs i målfärgen, annars kan målet
     bli omöjligt att nå. */
  Game.prototype.refill = function () {
    var tier = this.maxTier();
    var rng = this.rng;
    for (var attempt = 0; attempt < 25; attempt++) {
      var set = [Shapes.randomShape(tier, rng), Shapes.randomShape(tier, rng), Shapes.randomShape(tier, rng)];
      if (this.level && this.level.type === 'collect') {
        var color = this.level.color;
        if (!set.some(function (sh) { return sh.color === color; })) {
          var candidates = Shapes.SHAPES.filter(function (sh) { return sh.color === color; });
          if (candidates.length) {
            set[Math.floor(Math.random() * set.length)] =
              candidates[Math.floor(Math.random() * candidates.length)];
          }
        }
      }
      var ok = set.some(function (sh) { return this.canPlaceAnywhere(sh); }, this);
      if (ok || attempt === 24) {
        this.pieces = set;
        return;
      }
    }
  };

  /* Hittar fulla rader och kolumner. */
  Game.prototype.fullLines = function () {
    var rows = [], cols = [], r, c, full;
    for (r = 0; r < this.size; r++) {
      full = true;
      for (c = 0; c < this.size; c++) if (!this.board[r][c]) { full = false; break; }
      if (full) rows.push(r);
    }
    for (c = 0; c < this.size; c++) {
      full = true;
      for (r = 0; r < this.size; r++) if (!this.board[r][c]) { full = false; break; }
      if (full) cols.push(c);
    }
    return { rows: rows, cols: cols };
  };

  /* Vilka linjer skulle rensas om shape lades på (row, col)? Endast för förhandsvisning. */
  Game.prototype.previewLines = function (shape, row, col) {
    if (!this.canPlaceAt(shape, row, col)) return { rows: [], cols: [] };
    var i;
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = { c: shape.color, gem: false, ice: 0 };
    }
    var lines = this.fullLines();
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = null;
    }
    return lines;
  };

  Game.prototype._snapshot = function () {
    this._undo = {
      board: cloneBoard(this.board),
      mist: this.mist.map(function (row) { return row.slice(); }),
      pieces: this.pieces.slice(),
      score: this.score, combo: this.combo, movesUsed: this.movesUsed,
      gemsLeft: this.gemsLeft, iceLeft: this.iceLeft, collected: this.collected,
      sandLeft: this.sandLeft, mistLeft: this.mistLeft, eggsLeft: this.eggsLeft,
      ghostsLeft: this.ghostsLeft, keysLeft: this.keysLeft,
      status: this.status, lossReason: this.lossReason
    };
  };

  /* Ångrar senaste draget/boostern (ett steg). */
  Game.prototype.undo = function () {
    var s = this._undo;
    if (!s) return false;
    this.board = s.board;
    this.mist = s.mist;
    this.pieces = s.pieces;
    this.score = s.score; this.combo = s.combo; this.movesUsed = s.movesUsed;
    this.gemsLeft = s.gemsLeft; this.iceLeft = s.iceLeft; this.collected = s.collected;
    this.sandLeft = s.sandLeft; this.mistLeft = s.mistLeft; this.eggsLeft = s.eggsLeft;
    this.ghostsLeft = s.ghostsLeft; this.keysLeft = s.keysLeft;
    this.status = s.status; this.lossReason = s.lossReason;
    this._undo = null;
    return true;
  };

  /* Alla nycklar samlade: krossa samtliga lås på brädet. */
  Game.prototype._shatterLocks = function (out) {
    for (var r = 0; r < this.size; r++) for (var c = 0; c < this.size; c++) {
      var cell = this.board[r][c];
      if (cell && cell.lock) {
        out.push({ r: r, c: c, cell: cell, shattered: true });
        this.board[r][c] = null;
      }
    }
  };

  /* Lyfter stjärndimma i rutorna rakt intill (r, c). */
  Game.prototype._liftMistAround = function (r, c, lifted) {
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var i = 0; i < dirs.length; i++) {
      var rr = r + dirs[i][0], cc = c + dirs[i][1];
      if (rr < 0 || cc < 0 || rr >= this.size || cc >= this.size) continue;
      if (this.mist[rr][cc]) {
        this.mist[rr][cc] = false;
        this.mistLeft--;
        lifted.push({ r: rr, c: cc });
      }
    }
  };

  /* Tar bort en lista celler direkt (boosters). Is försvinner helt,
     dimma intill borttagna celler lyfter. */
  Game.prototype._removeCells = function (coords) {
    var removed = [];
    var lifted = [];
    var collectColor = this.level && this.level.type === 'collect' ? this.level.color : -1;
    for (var i = 0; i < coords.length; i++) {
      var r = coords[i][0], c = coords[i][1];
      var cell = this.board[r] && this.board[r][c];
      if (!cell) continue;
      if (cell.lock && this.keysLeft > 0) continue; // lås tål allt tills nycklarna är samlade
      if (cell.gem) this.gemsLeft--;
      if (cell.ice > 0) this.iceLeft--;
      if (cell.sand) this.sandLeft--;
      if (cell.egg > 0) this.eggsLeft--;
      if (cell.ghost) this.ghostsLeft--;
      if (cell.key) this.keysLeft--;
      if (!cell.gem && !cell.ice && !cell.sand && !cell.egg && !cell.ghost && !cell.key && !cell.lock && cell.c === collectColor) this.collected++;
      removed.push({ r: r, c: c, cell: cell });
      this.board[r][c] = null;
      this._liftMistAround(r, c, lifted);
    }
    if (this.keysLeft <= 0) this._shatterLocks(removed);
    removed.mistLifted = lifted;
    return removed;
  };

  Game.prototype._checkOutcome = function (consumedMove) {
    if (this.status !== 'playing') return;
    if (this.mode === 'level') {
      var lv = this.level, won = false;
      if (lv.type === 'score') won = this.score >= lv.target;
      else if (lv.type === 'gems') won = this.gemsLeft <= 0;
      else if (lv.type === 'ice') won = this.iceLeft <= 0;
      else if (lv.type === 'collect') won = this.collected >= lv.count;
      else if (lv.type === 'sand') won = this.sandLeft <= 0;
      else if (lv.type === 'mist') won = this.mistLeft <= 0;
      else if (lv.type === 'eggs') won = this.eggsLeft <= 0;
      else if (lv.type === 'ghosts') won = this.ghostsLeft <= 0;
      else if (lv.type === 'keys') won = this.keysLeft <= 0;
      if (won) { this.status = 'won'; return; }
      if (consumedMove && this.movesLeft() <= 0) {
        this.status = 'lost'; this.lossReason = 'moves'; return;
      }
    }
    if (!this.anyMoveLeft()) {
      this.status = 'lost'; this.lossReason = 'stuck';
    }
  };

  /* Booster: hammare – tar bort en enskild cell. */
  Game.prototype.hammer = function (r, c) {
    if (this.status !== 'playing' || !this.board[r] || !this.board[r][c]) return null;
    this._snapshot();
    var removed = this._removeCells([[r, c]]);
    this._checkOutcome(false);
    return removed;
  };

  /* Booster: bomb – rensar 3x3-området runt (r, c). */
  Game.prototype.bomb = function (r, c) {
    if (this.status !== 'playing') return null;
    var coords = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < this.size && cc < this.size && this.board[rr][cc]) coords.push([rr, cc]);
    }
    if (!coords.length) return null;
    this._snapshot();
    var removed = this._removeCells(coords);
    this._checkOutcome(false);
    return removed;
  };

  /* Booster: byt – slumpar om de tre pjäserna. */
  Game.prototype.swapPieces = function () {
    if (this.status !== 'playing') return false;
    this._snapshot();
    this.refill();
    this._checkOutcome(false);
    return true;
  };

  /* Lägger pjäs nr slotIdx på (row, col). Returnerar resultatobjekt eller null om ogiltigt. */
  Game.prototype.place = function (slotIdx, row, col) {
    var shape = this.pieces[slotIdx];
    if (this.status !== 'playing' || !shape || !this.canPlaceAt(shape, row, col)) return null;
    this._snapshot();

    var i, r, c;
    var size = this.size;
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = { c: shape.color, gem: false, ice: 0 };
    }
    this.pieces[slotIdx] = null;
    this.movesUsed++;

    var points = shape.cells.length; // baspoäng: en poäng per cell
    var lines = this.fullLines();
    var cleared = [];       // borttagna celler
    var iceHits = [];       // is som spruckit (men står kvar)
    var mistLifted = [];    // stjärndimma som lyft
    var gemsCleared = 0;
    var collectColor = this.level && this.level.type === 'collect' ? this.level.color : -1;
    var seen = {};

    lines.rows.forEach(function (rr) {
      for (var cc = 0; cc < size; cc++) seen[rr + ',' + cc] = true;
    });
    lines.cols.forEach(function (cc) {
      for (var rr = 0; rr < size; rr++) seen[rr + ',' + cc] = true;
    });
    var lockHits = [];      // lås som höll emot (nycklar kvar)
    var hadLocks = false;
    for (var key in seen) {
      var parts = key.split(',');
      r = +parts[0]; c = +parts[1];
      var cell = this.board[r][c];
      if (!cell) continue;
      if (cell.ice > 1) {
        cell.ice--;
        iceHits.push({ r: r, c: c });
        continue;
      }
      if (cell.lock) {
        // lås rensas aldrig av linjer – de krossas när alla nycklar samlats
        lockHits.push({ r: r, c: c });
        continue;
      }
      if (cell.gem) gemsCleared++;
      if (cell.ice > 0) this.iceLeft--;
      if (cell.sand) this.sandLeft--;
      if (cell.egg > 0) this.eggsLeft--;
      if (cell.ghost) this.ghostsLeft--;
      if (cell.key) this.keysLeft--;
      if (!cell.gem && !cell.ice && !cell.sand && !cell.egg && !cell.ghost && !cell.key && cell.c === collectColor) this.collected++;
      cleared.push({ r: r, c: c, cell: cell });
      this.board[r][c] = null;
      this._liftMistAround(r, c, mistLifted);
    }
    for (r = 0; r < size && !hadLocks; r++) for (c = 0; c < size; c++) {
      if (this.board[r][c] && this.board[r][c].lock) { hadLocks = true; break; }
    }
    var locksShattered = [];
    if (hadLocks && this.keysLeft <= 0) {
      this._shatterLocks(locksShattered);
      locksShattered.forEach(function (l) { cleared.push(l); });
    }

    var nLines = lines.rows.length + lines.cols.length;
    if (nLines > 0) {
      this.combo++;
      var base = 100 * nLines * nLines;                 // 1 linje=100, 2=400, 3=900 ...
      var mult = 1 + 0.25 * (this.combo - 1);           // kombokedja ger upp till +25 %/steg
      points += Math.round(base * mult);
    } else {
      this.combo = 0;
    }

    this.score += points;
    this.gemsLeft -= gemsCleared;

    // Sanden sprider sig: var sandEvery:e drag växer den in i en slumpad tom granne.
    var sandGrown = null;
    var sandEvery = (this.level && this.level.sandEvery) || 3;
    if (this.sandLeft > 0 && this.movesUsed % sandEvery === 0) {
      var frontier = [];
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (r = 0; r < size; r++) for (c = 0; c < size; c++) {
        if (!this.board[r][c] || !this.board[r][c].sand) continue;
        for (var d = 0; d < dirs.length; d++) {
          var rr2 = r + dirs[d][0], cc2 = c + dirs[d][1];
          if (rr2 < 0 || cc2 < 0 || rr2 >= size || cc2 >= size) continue;
          if (!this.board[rr2][cc2] && !this.mist[rr2][cc2]) frontier.push([rr2, cc2]);
        }
      }
      if (frontier.length) {
        var rand = this.rng ? this.rng() : Math.random();
        var pick = frontier[Math.floor(rand * frontier.length)];
        this.board[pick[0]][pick[1]] = { c: 1, gem: false, ice: 0, sand: true };
        this.sandLeft++;
        sandGrown = { r: pick[0], c: pick[1] };
      }
    }

    // Andarna svävar: var ghostEvery:e drag flyttar varje ande till en slumpad tom granne.
    var ghostMoves = [];
    var ghostEvery = (this.level && this.level.ghostEvery) || 2;
    if (this.ghostsLeft > 0 && this.movesUsed % ghostEvery === 0) {
      var gdirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      var ghosts = [];
      for (r = 0; r < size; r++) for (c = 0; c < size; c++) {
        if (this.board[r][c] && this.board[r][c].ghost) ghosts.push([r, c]);
      }
      for (var gi = 0; gi < ghosts.length; gi++) {
        var gr = ghosts[gi][0], gc = ghosts[gi][1];
        var opts2 = [];
        for (var gd = 0; gd < gdirs.length; gd++) {
          var nr = gr + gdirs[gd][0], nc = gc + gdirs[gd][1];
          if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
          if (!this.board[nr][nc] && !this.mist[nr][nc]) opts2.push([nr, nc]);
        }
        if (!opts2.length) continue;
        var grand = this.rng ? this.rng() : Math.random();
        var dest = opts2[Math.floor(grand * opts2.length)];
        this.board[dest[0]][dest[1]] = this.board[gr][gc];
        this.board[gr][gc] = null;
        ghostMoves.push({ from: { r: gr, c: gc }, to: { r: dest[0], c: dest[1] } });
      }
    }

    // Drakäggen räknar ner; når ett ägg noll kläcks det och banan är förlorad.
    var hatched = null;
    if (this.eggsLeft > 0) {
      for (r = 0; r < size && !hatched; r++) for (c = 0; c < size; c++) {
        var eggCell = this.board[r][c];
        if (eggCell && eggCell.egg > 0) {
          eggCell.egg--;
          if (eggCell.egg <= 0) { hatched = { r: r, c: c }; break; }
        }
      }
      if (hatched) {
        this.status = 'lost';
        this.lossReason = 'egg';
      }
    }

    if (this.pieces.every(function (p) { return p === null; })) this.refill();
    this._checkOutcome(true);

    return {
      placed: shape.cells.map(function (p) { return { r: row + p[0], c: col + p[1] }; }),
      cleared: cleared,
      iceHits: iceHits,
      lockHits: lockHits,
      locksShattered: locksShattered,
      ghostMoves: ghostMoves,
      mistLifted: mistLifted,
      sandGrown: sandGrown,
      hatched: hatched,
      lines: lines,
      nLines: nLines,
      points: points,
      combo: this.combo,
      gemsCleared: gemsCleared
    };
  };

  /* Stjärnor 1–3 för en vunnen bana, utifrån hur många drag som blev över. */
  Game.prototype.stars = function () {
    if (this.mode !== 'level' || this.status !== 'won') return 0;
    var frac = (this.level.moves - this.movesUsed) / this.level.moves;
    if (frac >= 0.35) return 3;
    if (frac >= 0.12) return 2;
    return 1;
  };

  global.BloxisGame = Game;
})(this);
