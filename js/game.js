/* Bloxis – spellogik (UI-oberoende, går att köra i Node för tester). */
(function (global) {
  'use strict';

  var Shapes = global.BloxisShapes;
  var DEFAULT_SIZE = 8;

  /* En cell är null eller { c: färgindex, gem: bool, ice: 0|1|2 }
     ice=2: hel is (kräver två rensningar), ice=1: sprucken is. */

  function cloneBoard(board) {
    return board.map(function (row) {
      return row.map(function (cell) {
        return cell ? { c: cell.c, gem: !!cell.gem, ice: cell.ice || 0 } : null;
      });
    });
  }

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'endless';       // 'endless' | 'level'
    this.level = opts.level || null;           // bandefinition vid mode 'level'
    this.size = opts.size || DEFAULT_SIZE;     // brädets sida (banor är alltid 8)
    this.shapeRamp = opts.shapeRamp || null;   // { t2, t3 }: drag då nivå 2/3-former släpps in
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
    if (this.level && this.level.board) this._loadBoard(this.level.board);
    this.gemsLeft = this._count(function (c) { return c.gem; });
    this.iceLeft = this._count(function (c) { return c.ice > 0; });
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
    for (var attempt = 0; attempt < 25; attempt++) {
      var set = [Shapes.randomShape(tier), Shapes.randomShape(tier), Shapes.randomShape(tier)];
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
      pieces: this.pieces.slice(),
      score: this.score, combo: this.combo, movesUsed: this.movesUsed,
      gemsLeft: this.gemsLeft, iceLeft: this.iceLeft, collected: this.collected,
      status: this.status, lossReason: this.lossReason
    };
  };

  /* Ångrar senaste draget/boostern (ett steg). */
  Game.prototype.undo = function () {
    var s = this._undo;
    if (!s) return false;
    this.board = s.board;
    this.pieces = s.pieces;
    this.score = s.score; this.combo = s.combo; this.movesUsed = s.movesUsed;
    this.gemsLeft = s.gemsLeft; this.iceLeft = s.iceLeft; this.collected = s.collected;
    this.status = s.status; this.lossReason = s.lossReason;
    this._undo = null;
    return true;
  };

  /* Tar bort en lista celler direkt (boosters). Is försvinner helt. */
  Game.prototype._removeCells = function (coords) {
    var removed = [];
    var collectColor = this.level && this.level.type === 'collect' ? this.level.color : -1;
    for (var i = 0; i < coords.length; i++) {
      var r = coords[i][0], c = coords[i][1];
      var cell = this.board[r] && this.board[r][c];
      if (!cell) continue;
      if (cell.gem) this.gemsLeft--;
      if (cell.ice > 0) this.iceLeft--;
      if (!cell.gem && !cell.ice && cell.c === collectColor) this.collected++;
      removed.push({ r: r, c: c, cell: cell });
      this.board[r][c] = null;
    }
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
    var gemsCleared = 0;
    var collectColor = this.level && this.level.type === 'collect' ? this.level.color : -1;
    var seen = {};

    lines.rows.forEach(function (rr) {
      for (var cc = 0; cc < size; cc++) seen[rr + ',' + cc] = true;
    });
    lines.cols.forEach(function (cc) {
      for (var rr = 0; rr < size; rr++) seen[rr + ',' + cc] = true;
    });
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
      if (cell.gem) gemsCleared++;
      if (cell.ice > 0) this.iceLeft--;
      if (!cell.gem && !cell.ice && cell.c === collectColor) this.collected++;
      cleared.push({ r: r, c: c, cell: cell });
      this.board[r][c] = null;
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

    if (this.pieces.every(function (p) { return p === null; })) this.refill();
    this._checkOutcome(true);

    return {
      placed: shape.cells.map(function (p) { return { r: row + p[0], c: col + p[1] }; }),
      cleared: cleared,
      iceHits: iceHits,
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
