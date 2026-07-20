/* Bloxis – spellogik (UI-oberoende, går att köra i Node för tester). */
(function (global) {
  'use strict';

  var Shapes = global.BloxisShapes;
  var SIZE = 8;

  /* En cell är null eller { c: färgindex, gem: bool } */

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'endless';       // 'endless' | 'level'
    this.level = opts.level || null;           // bandefinition vid mode 'level'
    this.size = SIZE;
    this.score = 0;
    this.combo = 0;                            // pågående kombokedja
    this.movesUsed = 0;
    this.status = 'playing';                   // 'playing' | 'won' | 'lost'
    this.lossReason = null;                    // 'moves' | 'stuck'
    this.board = [];
    for (var r = 0; r < SIZE; r++) {
      this.board.push(new Array(SIZE).fill(null));
    }
    if (this.level && this.level.board) this._loadBoard(this.level.board);
    this.gemsLeft = this._countGems();
    this.pieces = [null, null, null];
    this.refill();
  }

  Game.prototype._loadBoard = function (rows) {
    for (var r = 0; r < SIZE; r++) {
      var row = rows[r] || '';
      for (var c = 0; c < SIZE; c++) {
        var ch = row[c] || '.';
        if (ch === '#') this.board[r][c] = { c: (r * 3 + c * 5) % 8, gem: false };
        else if (ch === 'G') this.board[r][c] = { c: 0, gem: true };
      }
    }
  };

  Game.prototype._countGems = function () {
    var n = 0;
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      if (this.board[r][c] && this.board[r][c].gem) n++;
    }
    return n;
  };

  Game.prototype.movesLeft = function () {
    if (this.mode !== 'level') return Infinity;
    return Math.max(0, this.level.moves - this.movesUsed);
  };

  Game.prototype.canPlaceAt = function (shape, row, col) {
    for (var i = 0; i < shape.cells.length; i++) {
      var r = row + shape.cells[i][0];
      var c = col + shape.cells[i][1];
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
      if (this.board[r][c]) return false;
    }
    return true;
  };

  Game.prototype.canPlaceAnywhere = function (shape) {
    for (var r = 0; r <= SIZE - shape.h; r++) {
      for (var c = 0; c <= SIZE - shape.w; c++) {
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

  /* Fyller på tre nya pjäser. Försöker (upp till 25 ggr) hitta en uppsättning
     där minst en pjäs går att lägga, som en mild barmhärtighetsregel. */
  Game.prototype.refill = function () {
    for (var attempt = 0; attempt < 25; attempt++) {
      var set = [Shapes.randomShape(), Shapes.randomShape(), Shapes.randomShape()];
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
    for (r = 0; r < SIZE; r++) {
      full = true;
      for (c = 0; c < SIZE; c++) if (!this.board[r][c]) { full = false; break; }
      if (full) rows.push(r);
    }
    for (c = 0; c < SIZE; c++) {
      full = true;
      for (r = 0; r < SIZE; r++) if (!this.board[r][c]) { full = false; break; }
      if (full) cols.push(c);
    }
    return { rows: rows, cols: cols };
  };

  /* Vilka linjer skulle rensas om shape lades på (row, col)? Endast för förhandsvisning. */
  Game.prototype.previewLines = function (shape, row, col) {
    if (!this.canPlaceAt(shape, row, col)) return { rows: [], cols: [] };
    var i;
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = { c: shape.color, gem: false };
    }
    var lines = this.fullLines();
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = null;
    }
    return lines;
  };

  /* Lägger pjäs nr slotIdx på (row, col). Returnerar resultatobjekt eller null om ogiltigt. */
  Game.prototype.place = function (slotIdx, row, col) {
    var shape = this.pieces[slotIdx];
    if (this.status !== 'playing' || !shape || !this.canPlaceAt(shape, row, col)) return null;

    var i, r, c;
    for (i = 0; i < shape.cells.length; i++) {
      this.board[row + shape.cells[i][0]][col + shape.cells[i][1]] = { c: shape.color, gem: false };
    }
    this.pieces[slotIdx] = null;
    this.movesUsed++;

    var points = shape.cells.length; // baspoäng: en poäng per cell
    var lines = this.fullLines();
    var cleared = [];
    var gemsCleared = 0;
    var seen = {};

    lines.rows.forEach(function (rr) {
      for (var cc = 0; cc < SIZE; cc++) seen[rr + ',' + cc] = true;
    });
    lines.cols.forEach(function (cc) {
      for (var rr = 0; rr < SIZE; rr++) seen[rr + ',' + cc] = true;
    });
    for (var key in seen) {
      var parts = key.split(',');
      r = +parts[0]; c = +parts[1];
      var cell = this.board[r][c];
      if (cell) {
        if (cell.gem) gemsCleared++;
        cleared.push({ r: r, c: c, cell: cell });
        this.board[r][c] = null;
      }
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

    // Utfall
    if (this.mode === 'level') {
      var won = this.level.type === 'score'
        ? this.score >= this.level.target
        : this.gemsLeft <= 0;
      if (won) {
        this.status = 'won';
      } else if (this.movesLeft() <= 0) {
        this.status = 'lost';
        this.lossReason = 'moves';
      } else if (!this.anyMoveLeft()) {
        this.status = 'lost';
        this.lossReason = 'stuck';
      }
    } else if (!this.anyMoveLeft()) {
      this.status = 'lost';
      this.lossReason = 'stuck';
    }

    return {
      placed: shape.cells.map(function (p) { return { r: row + p[0], c: col + p[1] }; }),
      cleared: cleared,
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
