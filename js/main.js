/* Bloxis – UI, rendering och pekstyrning. */
(function () {
  'use strict';

  var Shapes = window.BloxisShapes;
  var LEVELS = window.BloxisLevels;
  var Game = window.BloxisGame;
  var SIZE = 8;

  /* ===== Lagring ===== */
  var store = {
    getBest: function () { return +localStorage.getItem('bloxis.best') || 0; },
    setBest: function (v) { localStorage.setItem('bloxis.best', String(v)); },
    getStars: function () {
      try { return JSON.parse(localStorage.getItem('bloxis.stars')) || {}; }
      catch (e) { return {}; }
    },
    setStars: function (levelIdx, stars) {
      var all = this.getStars();
      all[levelIdx] = Math.max(all[levelIdx] || 0, stars);
      localStorage.setItem('bloxis.stars', JSON.stringify(all));
    }
  };

  /* ===== Element ===== */
  function $(sel) { return document.querySelector(sel); }
  var screens = {
    menu: $('#screen-menu'),
    levels: $('#screen-levels'),
    game: $('#screen-game')
  };
  var boardWrap = $('#board-wrap');
  var boardCanvas = $('#board');
  var boardCtx = boardCanvas.getContext('2d');
  var dragCanvas = $('#drag-piece');
  var dragCtx = dragCanvas.getContext('2d');
  var slotEls = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  var hudScore = $('#hud-score');
  var hudSub = $('#hud-sub');
  var hudObjective = $('#hud-objective');
  var comboPop = $('#combo-pop');
  var overlay = $('#overlay');

  /* ===== Tillstånd ===== */
  var game = null;
  var mode = 'endless';
  var levelIndex = 0;
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var boardRect = null;    // CSS-pixlar, cachas under drag/resize
  var cellCss = 0;         // cellstorlek i CSS-pixlar
  var drag = null;         // { slot, shape, w, h, target, lines }
  var clearAnims = [];     // [{r, c, cell, start}]
  var animRunning = false;
  var CLEAR_MS = 300;
  var DRAG_LIFT = 60;      // px ovanför fingret så pjäsen syns

  /* ===== Skärmbyten ===== */
  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
    if (name === 'menu') $('#menu-best').textContent = store.getBest();
    if (name === 'levels') renderLevelGrid();
    if (name === 'game') requestAnimationFrame(layout);
  }

  /* ===== Ritverktyg ===== */
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBlock(ctx, x, y, size, colorIdx, opts) {
    opts = opts || {};
    var pad = size * 0.06;
    var s = size - pad * 2;
    var rad = size * 0.16;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.scale != null && opts.scale !== 1) {
      var cx = x + size / 2, cy = y + size / 2;
      ctx.translate(cx, cy);
      ctx.scale(opts.scale, opts.scale);
      ctx.translate(-cx, -cy);
    }
    var color = opts.gem ? Shapes.GEM_COLOR : Shapes.PALETTE[colorIdx % Shapes.PALETTE.length];
    roundRectPath(ctx, x + pad, y + pad, s, s, rad);
    ctx.fillStyle = color;
    ctx.fill();
    // glans upptill
    var grad = ctx.createLinearGradient(0, y + pad, 0, y + pad + s);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.fill();
    if (opts.gem) {
      // diamantsymbol
      var cx2 = x + size / 2, cy2 = y + size / 2, d = s * 0.28;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - d);
      ctx.lineTo(cx2 + d, cy2);
      ctx.lineTo(cx2, cy2 + d);
      ctx.lineTo(cx2 - d, cy2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,120,110,0.5)';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShapeOn(ctx, shape, cellSize, opts) {
    shape.cells.forEach(function (p) {
      drawBlock(ctx, p[1] * cellSize, p[0] * cellSize, cellSize, shape.color, opts);
    });
  }

  /* ===== Layout / storlekar ===== */
  function layout() {
    var rect = boardWrap.getBoundingClientRect();
    if (rect.width < 10) return;
    boardRect = rect;
    cellCss = rect.width / SIZE;
    boardCanvas.width = Math.round(rect.width * dpr);
    boardCanvas.height = Math.round(rect.height * dpr);
    renderBoard();
    renderTray(false);
  }

  /* ===== Brädrendering ===== */
  function renderBoard() {
    if (!game) return;
    var ctx = boardCtx;
    var cell = boardCanvas.width / SIZE;
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    // bakgrundsplatta
    roundRectPath(ctx, 0, 0, boardCanvas.width, boardCanvas.height, cell * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    var r, c;
    // markera linjer som skulle rensas av draget
    var hlRows = {}, hlCols = {};
    if (drag && drag.target && drag.target.valid && drag.lines) {
      drag.lines.rows.forEach(function (x) { hlRows[x] = true; });
      drag.lines.cols.forEach(function (x) { hlCols[x] = true; });
    }

    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        var x = c * cell, y = r * cell;
        var pad = cell * 0.06;
        roundRectPath(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.14);
        ctx.fillStyle = (hlRows[r] || hlCols[c]) ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.05)';
        ctx.fill();
        var cellData = game.board[r][c];
        if (cellData) drawBlock(ctx, x, y, cell, cellData.c, { gem: cellData.gem });
      }
    }

    // spökpjäs
    if (drag && drag.target && drag.target.valid) {
      var t = drag.target;
      drag.shape.cells.forEach(function (p) {
        drawBlock(ctx, (t.col + p[1]) * cell, (t.row + p[0]) * cell, cell, drag.shape.color, { alpha: 0.45 });
      });
    }

    // rensningsanimation
    if (clearAnims.length) {
      var now = performance.now();
      clearAnims.forEach(function (a) {
        var tt = Math.min(1, (now - a.start) / CLEAR_MS);
        drawBlock(ctx, a.c * cell, a.r * cell, cell, a.cell.c, {
          gem: a.cell.gem,
          alpha: 1 - tt,
          scale: 1 - tt * 0.7
        });
      });
    }
  }

  function tickAnim() {
    var now = performance.now();
    clearAnims = clearAnims.filter(function (a) { return now - a.start < CLEAR_MS; });
    renderBoard();
    if (clearAnims.length) {
      requestAnimationFrame(tickAnim);
    } else {
      animRunning = false;
    }
  }

  function startClearAnim(cleared) {
    var now = performance.now();
    cleared.forEach(function (cc) {
      clearAnims.push({ r: cc.r, c: cc.c, cell: cc.cell, start: now });
    });
    if (!animRunning && clearAnims.length) {
      animRunning = true;
      requestAnimationFrame(tickAnim);
    }
  }

  /* ===== Bricklåda ===== */
  function renderTray(animateNew) {
    if (!game) return;
    slotEls.forEach(function (slotEl, i) {
      var shape = game.pieces[i];
      var cv = slotEl.querySelector('canvas');
      slotEl.classList.toggle('empty', !shape);
      if (!shape) return;
      var srect = slotEl.getBoundingClientRect();
      var mini = Math.max(8, Math.min((srect.width - 18) / 5, (srect.height - 18) / 5));
      cv.width = Math.round(shape.w * mini * dpr);
      cv.height = Math.round(shape.h * mini * dpr);
      cv.style.width = (shape.w * mini) + 'px';
      cv.style.height = (shape.h * mini) + 'px';
      var ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, shape.w * mini, shape.h * mini);
      drawShapeOn(ctx, shape, mini);
      if (animateNew) {
        cv.classList.remove('appear');
        void cv.offsetWidth; // starta om animationen
        cv.classList.add('appear');
      }
    });
  }

  /* ===== HUD ===== */
  function updateHud() {
    if (!game) return;
    hudScore.textContent = game.score;
    if (mode === 'endless') {
      hudSub.textContent = 'Rekord: ' + Math.max(store.getBest(), game.score);
      hudObjective.classList.add('hidden');
    } else {
      hudSub.textContent = 'Bana ' + (levelIndex + 1);
      hudObjective.classList.remove('hidden');
      var left = game.movesLeft();
      if (game.level.type === 'score') {
        hudObjective.innerHTML = '&#127919; M&aring;l: <b>' + game.level.target + '</b> p &bull; ' + left + ' drag kvar';
      } else {
        hudObjective.innerHTML = '&#128142; <b>' + game.gemsLeft + '</b> kvar &bull; ' + left + ' drag kvar';
      }
    }
  }

  function showCombo(text) {
    comboPop.textContent = text;
    comboPop.classList.remove('hidden', 'show');
    void comboPop.offsetWidth;
    comboPop.classList.add('show');
  }

  /* ===== Overlay ===== */
  function showOverlay(cfg) {
    $('#ov-title').textContent = cfg.title;
    var starsEl = $('#ov-stars');
    if (cfg.stars != null) {
      var html = '';
      for (var i = 1; i <= 3; i++) {
        html += '<span class="' + (i <= cfg.stars ? 'on' : 'off') + '">&#9733;</span>';
      }
      starsEl.innerHTML = html;
      starsEl.classList.remove('hidden');
    } else {
      starsEl.classList.add('hidden');
    }
    $('#ov-text').innerHTML = cfg.html || '';
    var btnWrap = $('#ov-buttons');
    btnWrap.innerHTML = '';
    (cfg.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.className = 'btn big' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.addEventListener('click', function () {
        hideOverlay();
        b.fn();
      });
      btnWrap.appendChild(el);
    });
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  /* ===== Spelflöde ===== */
  function startEndless() {
    mode = 'endless';
    game = new Game({ mode: 'endless' });
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
  }

  function startLevel(idx) {
    mode = 'level';
    levelIndex = idx;
    game = new Game({ mode: 'level', level: LEVELS[idx] });
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
  }

  function restartCurrent() {
    if (mode === 'endless') startEndless();
    else startLevel(levelIndex);
  }

  function finishGame() {
    if (!game || game.status === 'playing') return;
    var g = game;
    setTimeout(function () {
      if (game !== g) return; // spelet har redan startats om
      if (mode === 'endless') {
        var isRecord = g.score > store.getBest();
        if (isRecord) store.setBest(g.score);
        showOverlay({
          title: 'Spelet är slut!',
          html: (isRecord ? '&#127881; Nytt rekord!' : 'Bra spelat!') +
            '<span class="score-big">' + g.score + ' p</span>' +
            'Rekord: ' + store.getBest(),
          buttons: [
            { label: 'Spela igen', primary: true, fn: startEndless },
            { label: 'Till menyn', fn: function () { showScreen('menu'); } }
          ]
        });
      } else if (g.status === 'won') {
        var stars = g.stars();
        store.setStars(levelIndex, stars);
        var buttons = [];
        if (levelIndex + 1 < LEVELS.length) {
          buttons.push({ label: 'Nästa bana', primary: true, fn: function () { startLevel(levelIndex + 1); } });
        }
        buttons.push({ label: 'Spela igen', fn: function () { startLevel(levelIndex); } });
        buttons.push({ label: 'Till banorna', fn: function () { showScreen('levels'); } });
        showOverlay({
          title: 'Bana ' + (levelIndex + 1) + ' klarad!',
          stars: stars,
          html: '<span class="score-big">' + g.score + ' p</span>',
          buttons: buttons
        });
      } else {
        showOverlay({
          title: 'Det gick inte den här gången',
          html: g.lossReason === 'moves'
            ? 'Dragen tog slut innan målet nåddes.'
            : 'Ingen pjäs fick plats på brädet.',
          buttons: [
            { label: 'Försök igen', primary: true, fn: function () { startLevel(levelIndex); } },
            { label: 'Till banorna', fn: function () { showScreen('levels'); } }
          ]
        });
      }
    }, CLEAR_MS + 250);
  }

  function doPlace(slotIdx, row, col) {
    var res = game.place(slotIdx, row, col);
    if (!res) return false;
    var refilled = game.pieces.every(function (p) { return p !== null; });
    updateHud();
    renderTray(refilled);
    if (res.cleared.length) {
      startClearAnim(res.cleared);
      if (res.nLines >= 2) showCombo(res.nLines + ' linjer!');
      else if (res.combo >= 2) showCombo('Kombo x' + res.combo + '!');
    } else {
      renderBoard();
    }
    if (game.status !== 'playing') finishGame();
    return true;
  }

  /* ===== Dra och släpp ===== */
  function startDrag(slotEl, slotIdx, ev) {
    if (!game || game.status !== 'playing' || drag) return;
    var shape = game.pieces[slotIdx];
    if (!shape) return;
    boardRect = boardWrap.getBoundingClientRect();
    cellCss = boardRect.width / SIZE;

    var w = shape.w * cellCss, h = shape.h * cellCss;
    dragCanvas.width = Math.round(w * dpr);
    dragCanvas.height = Math.round(h * dpr);
    dragCanvas.style.width = w + 'px';
    dragCanvas.style.height = h + 'px';
    dragCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dragCtx.clearRect(0, 0, w, h);
    drawShapeOn(dragCtx, shape, cellCss);
    dragCanvas.classList.remove('hidden');

    drag = { slot: slotIdx, shape: shape, w: w, h: h, target: null, lines: null };
    slotEl.classList.add('dragging');
    try { slotEl.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    moveDrag(ev);
  }

  function moveDrag(ev) {
    if (!drag) return;
    var gx = ev.clientX - drag.w / 2;
    var gy = ev.clientY - drag.h - DRAG_LIFT;
    dragCanvas.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';

    var col = Math.round((gx - boardRect.left) / cellCss);
    var row = Math.round((gy - boardRect.top) / cellCss);
    var valid = row >= 0 && col >= 0 &&
      row + drag.shape.h <= SIZE && col + drag.shape.w <= SIZE &&
      game.canPlaceAt(drag.shape, row, col);
    drag.target = { row: row, col: col, valid: valid };
    drag.lines = valid ? game.previewLines(drag.shape, row, col) : null;
    renderBoard();
  }

  function endDrag(commit) {
    if (!drag) return;
    var d = drag;
    drag = null;
    dragCanvas.classList.add('hidden');
    slotEls.forEach(function (el) { el.classList.remove('dragging'); });
    if (commit && d.target && d.target.valid) {
      doPlace(d.slot, d.target.row, d.target.col);
    } else {
      renderBoard();
    }
  }

  slotEls.forEach(function (slotEl, i) {
    slotEl.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      startDrag(slotEl, i, ev);
    });
    slotEl.addEventListener('pointermove', function (ev) {
      if (drag && drag.slot === i) moveDrag(ev);
    });
    slotEl.addEventListener('pointerup', function () {
      if (drag && drag.slot === i) endDrag(true);
    });
    slotEl.addEventListener('pointercancel', function () {
      if (drag && drag.slot === i) endDrag(false);
    });
  });

  /* ===== Banval ===== */
  function renderLevelGrid() {
    var grid = $('#level-grid');
    grid.innerHTML = '';
    var stars = store.getStars();
    LEVELS.forEach(function (lv, i) {
      var unlocked = i === 0 || (stars[i - 1] || 0) > 0;
      var el = document.createElement('button');
      el.className = 'level-cell' + (unlocked ? '' : ' locked');
      var starStr = '';
      for (var s = 1; s <= 3; s++) starStr += s <= (stars[i] || 0) ? '★' : '☆';
      el.innerHTML =
        '<span class="num">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        '<span class="stars">' + (unlocked ? starStr : '') + '</span>' +
        '<span class="type-icon">' + (lv.type === 'gems' ? '💎' : '🎯') + '</span>';
      if (unlocked) el.addEventListener('click', function () { startLevel(i); });
      grid.appendChild(el);
    });
  }

  /* ===== Hjälp ===== */
  function showHelp() {
    showOverlay({
      title: 'Så spelar du',
      html:
        '<ul>' +
        '<li><b>Dra</b> pjäserna från lådan och släpp dem på brädet.</li>' +
        '<li>Fyll en hel <b>rad eller kolumn</b> så rensas den och ger poäng.</li>' +
        '<li>Rensa flera linjer samtidigt och kedja ihop rensningar för <b>kombopoäng</b>.</li>' +
        '<li><b>Oändligt läge:</b> spela så länge du kan – spelet tar slut när ingen pjäs får plats.</li>' +
        '<li><b>Banor:</b> nå poängmålet &#127919; eller rensa alla ädelstenar &#128142; innan dragen tar slut.</li>' +
        '</ul>',
      buttons: [{ label: 'Stäng', primary: true, fn: function () {} }]
    });
  }

  /* ===== Knappar ===== */
  $('#btn-endless').addEventListener('click', startEndless);
  $('#btn-levels').addEventListener('click', function () { showScreen('levels'); });
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-restart').addEventListener('click', restartCurrent);
  document.querySelectorAll('.btn-back').forEach(function (btn) {
    btn.addEventListener('click', function () {
      endDrag(false);
      hideOverlay();
      showScreen(mode === 'level' && screens.game.classList.contains('active') ? 'levels' : 'menu');
    });
  });

  window.addEventListener('resize', function () {
    if (screens.game.classList.contains('active')) layout();
  });
  window.addEventListener('contextmenu', function (ev) {
    if (ev.target.closest('#board-wrap, #tray')) ev.preventDefault();
  });

  /* ===== PWA ===== */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline-stöd är valfritt */ });
    });
  }

  showScreen('menu');
})();
