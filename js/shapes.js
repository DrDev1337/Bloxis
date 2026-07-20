/* Bloxis – blockformer och färgpalett.
   Alla former anges som [rad, kolumn]-celler och normaliseras till origo. */
(function (global) {
  'use strict';

  var PALETTE = [
    '#ff5d6c', // 0 röd
    '#ff9f45', // 1 orange
    '#ffd645', // 2 gul
    '#5ddb6f', // 3 grön
    '#45c8ff', // 4 ljusblå
    '#5d7bff', // 5 blå
    '#b06dff', // 6 lila
    '#ff6dc8'  // 7 rosa
  ];
  var GEM_COLOR = '#6ef2dd';

  function makeShape(cells, color, weight) {
    var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    cells.forEach(function (p) {
      minR = Math.min(minR, p[0]); minC = Math.min(minC, p[1]);
      maxR = Math.max(maxR, p[0]); maxC = Math.max(maxC, p[1]);
    });
    var norm = cells.map(function (p) { return [p[0] - minR, p[1] - minC]; });
    return { cells: norm, color: color, weight: weight, h: maxR - minR + 1, w: maxC - minC + 1 };
  }

  var DEFS = [
    // 1x1
    [[[0,0]], 2, 5],
    // dominoer
    [[[0,0],[0,1]], 4, 5],
    [[[0,0],[1,0]], 4, 5],
    // I3
    [[[0,0],[0,1],[0,2]], 1, 5],
    [[[0,0],[1,0],[2,0]], 1, 5],
    // hörn (3 celler), 4 rotationer
    [[[0,0],[0,1],[1,0]], 7, 3],
    [[[0,0],[0,1],[1,1]], 7, 3],
    [[[0,0],[1,0],[1,1]], 7, 3],
    [[[0,1],[1,0],[1,1]], 7, 3],
    // I4
    [[[0,0],[0,1],[0,2],[0,3]], 0, 4],
    [[[0,0],[1,0],[2,0],[3,0]], 0, 4],
    // kvadrat 2x2
    [[[0,0],[0,1],[1,0],[1,1]], 2, 5],
    // T, 4 rotationer
    [[[0,0],[0,1],[0,2],[1,1]], 6, 2],
    [[[0,1],[1,0],[1,1],[1,2]], 6, 2],
    [[[0,0],[1,0],[2,0],[1,1]], 6, 2],
    [[[0,1],[1,0],[1,1],[2,1]], 6, 2],
    // S / Z
    [[[0,1],[0,2],[1,0],[1,1]], 3, 2],
    [[[0,0],[0,1],[1,1],[1,2]], 3, 2],
    [[[0,0],[1,0],[1,1],[2,1]], 3, 2],
    [[[0,1],[1,0],[1,1],[2,0]], 3, 2],
    // L (4 celler), 4 rotationer
    [[[0,0],[1,0],[2,0],[2,1]], 5, 2],
    [[[0,0],[0,1],[0,2],[1,0]], 5, 2],
    [[[0,0],[0,1],[1,1],[2,1]], 5, 2],
    [[[0,2],[1,0],[1,1],[1,2]], 5, 2],
    // I5
    [[[0,0],[0,1],[0,2],[0,3],[0,4]], 5, 3],
    [[[0,0],[1,0],[2,0],[3,0],[4,0]], 5, 3],
    // rektanglar 2x3 / 3x2
    [[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], 6, 3],
    [[[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]], 6, 3],
    // stort hörn (5 celler), 4 rotationer
    [[[0,0],[1,0],[2,0],[2,1],[2,2]], 1, 2],
    [[[0,0],[0,1],[0,2],[1,0],[2,0]], 1, 2],
    [[[0,0],[0,1],[0,2],[1,2],[2,2]], 1, 2],
    [[[0,2],[1,2],[2,0],[2,1],[2,2]], 1, 2],
    // kvadrat 3x3
    [[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], 3, 2]
  ];

  var SHAPES = DEFS.map(function (d) { return makeShape(d[0], d[1], d[2]); });
  var TOTAL_WEIGHT = SHAPES.reduce(function (s, sh) { return s + sh.weight; }, 0);

  function randomShape(rng) {
    var r = (rng || Math.random)() * TOTAL_WEIGHT;
    for (var i = 0; i < SHAPES.length; i++) {
      r -= SHAPES[i].weight;
      if (r <= 0) return SHAPES[i];
    }
    return SHAPES[SHAPES.length - 1];
  }

  global.BloxisShapes = {
    PALETTE: PALETTE,
    GEM_COLOR: GEM_COLOR,
    SHAPES: SHAPES,
    randomShape: randomShape
  };
})(this);
