/* Bloxis – UI, rendering och pekstyrning. */
(function () {
  'use strict';

  var Shapes = window.BloxisShapes;
  var LEVELS = window.BloxisLevels;
  var WORLDS = window.BloxisWorlds;
  var Game = window.BloxisGame;
  var SIZE = 8;

  var BOOSTER_PRICES = { hammer: 30, bomb: 60, swap: 20, undo: 25 };

  /* ===== Lagring ===== */
  var store = {
    getBest: function () { return +localStorage.getItem('bloxis.best') || 0; },
    setBest: function (v) { localStorage.setItem('bloxis.best', String(v)); },
    /* Rekord per oändligt-konfiguration (storlek + svårighet). */
    getBestFor: function (cfg) {
      var v = +localStorage.getItem('bloxis.best.' + cfg.size + '.' + cfg.diff) || 0;
      if (!v && cfg.size === 8 && cfg.diff === 'klassisk') v = this.getBest();
      return v;
    },
    setBestFor: function (cfg, v) {
      localStorage.setItem('bloxis.best.' + cfg.size + '.' + cfg.diff, String(v));
      if (v > this.getBest()) this.setBest(v); // totalrekordet på menyn
    },
    getCoins: function () { return +localStorage.getItem('bloxis.coins') || 0; },
    addCoins: function (n) { localStorage.setItem('bloxis.coins', String(this.getCoins() + n)); },
    spendCoins: function (n) {
      if (this.getCoins() < n) return false;
      localStorage.setItem('bloxis.coins', String(this.getCoins() - n));
      return true;
    },
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

  /* ===== Ljud (syntetiserat med WebAudio – inga filer) ===== */
  var Sound = (function () {
    var ctx = null;
    function ac() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, delay) {
      var c = ac();
      if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(c.destination);
      var t = c.currentTime + (delay || 0);
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.03);
    }
    return {
      unlock: function () { ac(); },
      click: function () { tone(600, 0.05, 'sine', 0.06); },
      place: function () { tone(300, 0.07, 'triangle', 0.1); tone(420, 0.06, 'triangle', 0.07, 0.03); },
      clear: function (n) {
        for (var i = 0; i < Math.min(n + 1, 5); i++) {
          tone(440 * Math.pow(1.26, i), 0.13, 'triangle', 0.13, i * 0.055);
        }
      },
      ice: function () { tone(1200, 0.08, 'square', 0.05); tone(900, 0.1, 'square', 0.04, 0.04); },
      boom: function () { tone(90, 0.35, 'sawtooth', 0.2); tone(60, 0.4, 'sawtooth', 0.15, 0.05); },
      coin: function () { tone(988, 0.07, 'square', 0.05); tone(1319, 0.14, 'square', 0.05, 0.07); },
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.14, i * 0.12); }); },
      lose: function () { [330, 262, 196].forEach(function (f, i) { tone(f, 0.22, 'sawtooth', 0.06, i * 0.16); }); }
    };
  })();

  function buzz(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ok */ } }
  }

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
  var boosterEls = Array.prototype.slice.call(document.querySelectorAll('.booster'));
  var hudScore = $('#hud-score');
  var hudSub = $('#hud-sub');
  var hudObjective = $('#hud-objective');
  var comboPop = $('#combo-pop');
  var overlay = $('#overlay');

  /* ===== Oändligt läge: svårighet och brädstorlek ===== */
  var DIFF_ORDER = ['latt', 'klassisk', 'svar'];
  var DIFFS = {
    latt: { label: '🌱 Lätt', ramp: { t2: 15, t3: 40 } },
    klassisk: { label: '🎯 Klassisk', ramp: { t2: 6, t3: 16 } },
    svar: { label: '🔥 Svår', ramp: null }
  };
  var SIZE_OPTS = [8, 10, 12];

  function getEndlessCfg() {
    try {
      var c = JSON.parse(localStorage.getItem('bloxis.endless.cfg'));
      if (c && SIZE_OPTS.indexOf(c.size) >= 0 && DIFFS[c.diff]) return c;
    } catch (e) { /* ok */ }
    return { size: 8, diff: 'klassisk' };
  }

  /* ===== Tillstånd ===== */
  var game = null;
  var mode = 'endless';
  var levelIndex = 0;
  var endlessCfg = getEndlessCfg();

  function bsize() { return game ? game.size : 8; }
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var boardRect = null;    // CSS-pixlar, cachas under drag/resize
  var cellCss = 0;         // cellstorlek i CSS-pixlar
  var drag = null;         // { slot, shape, w, h, lift, target, lines }
  var armedBooster = null; // 'hammer' | 'bomb' | null
  var clearAnims = [];     // [{r, c, cell, start}]
  var particles = [];      // [{x, y, vx, vy, size, color, life, born}]
  var animRunning = false;
  var CLEAR_MS = 300;
  var PARTICLE_MS = 700;
  var TOUCH_LIFT = 40;     // liten lyfthöjd vid pekskärm så fingret inte skymmer pjäsen

  /* ===== Skärmbyten ===== */
  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
    if (name === 'menu') {
      $('#menu-best').textContent = store.getBest();
      $('#menu-coins').textContent = store.getCoins();
    }
    if (name === 'levels') renderLevelMap();
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
    var color = opts.gem ? Shapes.GEM_COLOR
      : opts.ice ? (opts.ice > 1 ? '#bfe6ff' : '#8fd0f5')
      : Shapes.PALETTE[colorIdx % Shapes.PALETTE.length];
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
    if (opts.ice === 1) {
      // sprickor i spruckn is
      ctx.strokeStyle = 'rgba(30,80,120,0.55)';
      ctx.lineWidth = Math.max(1, size * 0.035);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.25, y + size * 0.3);
      ctx.lineTo(x + size * 0.5, y + size * 0.52);
      ctx.lineTo(x + size * 0.42, y + size * 0.75);
      ctx.moveTo(x + size * 0.5, y + size * 0.52);
      ctx.lineTo(x + size * 0.75, y + size * 0.42);
      ctx.stroke();
    } else if (opts.ice > 1) {
      // frostglans
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(x + size * 0.32, y + size * 0.32, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
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
    cellCss = rect.width / bsize();
    boardCanvas.width = Math.round(rect.width * dpr);
    boardCanvas.height = Math.round(rect.height * dpr);
    renderBoard();
    renderTray(false);
  }

  /* ===== Brädrendering ===== */
  function renderBoard() {
    if (!game) return;
    var ctx = boardCtx;
    var S = game.size;
    var cell = boardCanvas.width / S;
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

    roundRectPath(ctx, 0, 0, boardCanvas.width, boardCanvas.height, cell * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    var r, c;
    var hlRows = {}, hlCols = {};
    if (drag && drag.target && drag.target.valid && drag.lines) {
      drag.lines.rows.forEach(function (x) { hlRows[x] = true; });
      drag.lines.cols.forEach(function (x) { hlCols[x] = true; });
    }

    for (r = 0; r < S; r++) {
      for (c = 0; c < S; c++) {
        var x = c * cell, y = r * cell;
        var pad = cell * 0.06;
        roundRectPath(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.14);
        ctx.fillStyle = (hlRows[r] || hlCols[c]) ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.05)';
        ctx.fill();
        var cellData = game.board[r][c];
        if (cellData) drawBlock(ctx, x, y, cell, cellData.c, { gem: cellData.gem, ice: cellData.ice });
      }
    }

    // spökpjäs
    if (drag && drag.target && drag.target.valid) {
      var t = drag.target;
      drag.shape.cells.forEach(function (p) {
        drawBlock(ctx, (t.col + p[1]) * cell, (t.row + p[0]) * cell, cell, drag.shape.color, { alpha: 0.45 });
      });
    }

    var now = performance.now();

    // rensningsanimation
    clearAnims.forEach(function (a) {
      var tt = Math.min(1, (now - a.start) / CLEAR_MS);
      drawBlock(ctx, a.c * cell, a.r * cell, cell, a.cell.c, {
        gem: a.cell.gem,
        ice: a.cell.ice,
        alpha: 1 - tt,
        scale: 1 - tt * 0.7
      });
    });

    // partiklar
    particles.forEach(function (p) {
      var tt = (now - p.born) / PARTICLE_MS;
      if (tt >= 1) return;
      var px = p.x + p.vx * tt * cell * 3;
      var py = p.y + p.vy * tt * cell * 3 + 2.2 * cell * tt * tt; // gravitation
      ctx.globalAlpha = 1 - tt;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    });
  }

  function tickAnim() {
    var now = performance.now();
    clearAnims = clearAnims.filter(function (a) { return now - a.start < CLEAR_MS; });
    particles = particles.filter(function (p) { return now - p.born < PARTICLE_MS; });
    renderBoard();
    if (clearAnims.length || particles.length) {
      requestAnimationFrame(tickAnim);
    } else {
      animRunning = false;
    }
  }

  function ensureAnim() {
    if (!animRunning && (clearAnims.length || particles.length)) {
      animRunning = true;
      requestAnimationFrame(tickAnim);
    }
  }

  function spawnEffects(cleared) {
    var cell = boardCanvas.width / bsize();
    var now = performance.now();
    cleared.forEach(function (cc) {
      clearAnims.push({ r: cc.r, c: cc.c, cell: cc.cell, start: now });
      var color = cc.cell.gem ? Shapes.GEM_COLOR
        : cc.cell.ice ? '#bfe6ff'
        : Shapes.PALETTE[cc.cell.c % Shapes.PALETTE.length];
      for (var i = 0; i < 6; i++) {
        particles.push({
          x: (cc.c + 0.5) * cell,
          y: (cc.r + 0.5) * cell,
          vx: (Math.random() - 0.5) * 2,
          vy: -Math.random() * 1.6 - 0.2,
          size: cell * (0.08 + Math.random() * 0.1),
          color: color,
          born: now
        });
      }
    });
    ensureAnim();
  }

  function flyScore(points, cleared) {
    if (!cleared.length) return;
    var sumR = 0, sumC = 0;
    cleared.forEach(function (cc) { sumR += cc.r; sumC += cc.c; });
    var el = document.createElement('div');
    el.className = 'fly-score';
    el.textContent = '+' + points;
    el.style.left = ((sumC / cleared.length + 0.5) / bsize() * 100) + '%';
    el.style.top = ((sumR / cleared.length + 0.5) / bsize() * 100) + '%';
    boardWrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 950);
  }

  function shakeBoard() {
    boardWrap.classList.remove('shake');
    void boardWrap.offsetWidth;
    boardWrap.classList.add('shake');
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
        void cv.offsetWidth;
        cv.classList.add('appear');
      }
    });
  }

  /* ===== HUD ===== */
  function updateHud() {
    if (!game) return;
    hudScore.textContent = game.score;
    $('#game-coins').textContent = store.getCoins();
    updateBoosterBar();
    if (mode === 'endless') {
      hudSub.textContent = endlessCfg.size + '×' + endlessCfg.size + ' • Rekord: ' +
        Math.max(store.getBestFor(endlessCfg), game.score);
      hudObjective.classList.add('hidden');
      return;
    }
    hudSub.textContent = 'Bana ' + (levelIndex + 1);
    hudObjective.classList.remove('hidden');
    var left = game.movesLeft();
    var lv = game.level;
    if (lv.type === 'score') {
      hudObjective.innerHTML = '&#127919; M&aring;l: <b>' + lv.target + '</b> p &bull; ' + left + ' drag kvar';
    } else if (lv.type === 'gems') {
      hudObjective.innerHTML = '&#128142; <b>' + game.gemsLeft + '</b> kvar &bull; ' + left + ' drag kvar';
    } else if (lv.type === 'ice') {
      hudObjective.innerHTML = '&#129482; <b>' + game.iceLeft + '</b> kvar &bull; ' + left + ' drag kvar';
    } else {
      hudObjective.innerHTML =
        '<span class="collect-chip" style="background:' + Shapes.PALETTE[lv.color] + '"></span>' +
        '<b>' + game.collectLeft() + '</b> kvar &bull; ' + left + ' drag kvar';
    }
  }

  function updateBoosterBar() {
    var coins = store.getCoins();
    boosterEls.forEach(function (el) {
      var kind = el.getAttribute('data-booster');
      var affordable = coins >= BOOSTER_PRICES[kind];
      var usable = game && game.status === 'playing' &&
        (kind !== 'undo' || !!game._undo);
      el.disabled = !affordable || !usable;
      el.classList.toggle('armed', armedBooster === kind);
    });
  }

  function flashCoins() {
    var chip = $('#game-coins-chip');
    chip.classList.remove('flash');
    void chip.offsetWidth;
    chip.classList.add('flash');
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
        Sound.click();
        hideOverlay();
        b.fn();
      });
      btnWrap.appendChild(el);
    });
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  /* ===== Spelflöde ===== */
  function showEndlessChooser() {
    var cfg = getEndlessCfg();
    var html =
      '<p><b>Brädstorlek</b></p>' +
      '<div class="choice-row" data-group="size">' +
      SIZE_OPTS.map(function (s) {
        return '<button class="choice' + (s === cfg.size ? ' sel' : '') + '" data-v="' + s + '">' + s + '&times;' + s + '</button>';
      }).join('') +
      '</div>' +
      '<p style="margin-top:12px"><b>Svårighet</b></p>' +
      '<div class="choice-row" data-group="diff">' +
      DIFF_ORDER.map(function (d) {
        return '<button class="choice' + (d === cfg.diff ? ' sel' : '') + '" data-v="' + d + '">' + DIFFS[d].label + '</button>';
      }).join('') +
      '</div>' +
      '<p class="choice-hint">Större bräde ger mer plats. Lätt och Klassisk börjar med enkla former och släpper in svårare efter hand &ndash; Svår kör alla former direkt.</p>';
    showOverlay({
      title: 'Oändligt läge',
      html: html,
      buttons: [{
        label: 'Starta', primary: true,
        fn: function () {
          var size = +document.querySelector('#ov-text .choice-row[data-group="size"] .sel').getAttribute('data-v');
          var diff = document.querySelector('#ov-text .choice-row[data-group="diff"] .sel').getAttribute('data-v');
          endlessCfg = { size: size, diff: diff };
          localStorage.setItem('bloxis.endless.cfg', JSON.stringify(endlessCfg));
          startEndless(endlessCfg);
        }
      }]
    });
    document.querySelectorAll('#ov-text .choice-row').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        var b = ev.target.closest('.choice');
        if (!b) return;
        row.querySelectorAll('.choice').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        Sound.click();
      });
    });
  }

  function startEndless(cfg) {
    endlessCfg = cfg || endlessCfg;
    mode = 'endless';
    game = new Game({ mode: 'endless', size: endlessCfg.size, shapeRamp: DIFFS[endlessCfg.diff].ramp });
    armedBooster = null;
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
  }

  var COLOR_NAMES = ['röda', 'orange', 'gula', 'gröna', 'ljusblå', 'blå', 'lila', 'rosa'];

  function countChar(board, ch) {
    return board.join('').split('').filter(function (c) { return c === ch; }).length;
  }

  function objectiveHtml(lv) {
    if (lv.type === 'score') {
      return '<p style="font-size:1.05rem">&#127919; Nå <b>' + lv.target + ' poäng</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Rensa flera linjer samtidigt och kedja rensningar för kombobonus.</p>';
    }
    if (lv.type === 'gems') {
      return '<p style="font-size:1.05rem">&#128142; Rensa alla <b>' + countChar(lv.board, 'G') + ' ädelstenar</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>En ädelsten försvinner när dess rad eller kolumn blir full.</p>';
    }
    if (lv.type === 'ice') {
      return '<p style="font-size:1.05rem">&#129482; Rensa all is (<b>' + countChar(lv.board, 'I') + ' rutor</b>) på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Is kräver <b>två</b> rensningar: den första spräcker isen, den andra tar bort den.</p>';
    }
    var name = COLOR_NAMES[lv.color];
    return '<p style="font-size:1.05rem"><span class="collect-chip" style="background:' + Shapes.PALETTE[lv.color] + '"></span>' +
      'Samla <b>' + lv.count + ' ' + name + ' block</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
      '<p>Ett block räknas när det <b>rensas</b> i en full rad eller kolumn. Minst en ' + name.replace(/a$/, '') + ' pjäs finns alltid bland dina tre.</p>';
  }

  function showObjectiveIntro(idx, isStart) {
    showOverlay({
      title: 'Bana ' + (idx + 1),
      html: objectiveHtml(LEVELS[idx]),
      buttons: [{ label: isStart ? 'Kör!' : 'Fortsätt', primary: true, fn: function () {} }]
    });
  }

  function startLevel(idx) {
    mode = 'level';
    levelIndex = idx;
    game = new Game({ mode: 'level', level: LEVELS[idx] });
    armedBooster = null;
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
    showObjectiveIntro(idx, true);
  }

  function restartCurrent() {
    Sound.click();
    if (mode === 'endless') startEndless(endlessCfg);
    else startLevel(levelIndex);
  }

  function finishGame() {
    if (!game || game.status === 'playing') return;
    var g = game;
    setTimeout(function () {
      if (game !== g) return; // spelet har redan startats om
      if (mode === 'endless') {
        var isRecord = g.score > store.getBestFor(endlessCfg);
        if (isRecord) store.setBestFor(endlessCfg, g.score);
        var coins = Math.floor(g.score / 200);
        if (coins > 0) { store.addCoins(coins); Sound.coin(); }
        Sound.lose();
        showOverlay({
          title: 'Spelet är slut!',
          html: (isRecord ? '&#127881; Nytt rekord!' : 'Bra spelat!') +
            '<span class="score-big">' + g.score + ' p</span>' +
            endlessCfg.size + '×' + endlessCfg.size + ' ' + DIFFS[endlessCfg.diff].label +
            ' &bull; Rekord: ' + store.getBestFor(endlessCfg) +
            (coins > 0 ? ' &bull; +' + coins + ' &#128176;' : ''),
          buttons: [
            { label: 'Spela igen', primary: true, fn: function () { startEndless(endlessCfg); } },
            { label: 'Ändra läge', fn: showEndlessChooser },
            { label: 'Till menyn', fn: function () { showScreen('menu'); } }
          ]
        });
      } else if (g.status === 'won') {
        var stars = g.stars();
        store.setStars(levelIndex, stars);
        var coinsWon = 10 * stars;
        store.addCoins(coinsWon);
        Sound.win();
        buzz([30, 40, 30]);
        var buttons = [];
        if (levelIndex + 1 < LEVELS.length) {
          buttons.push({ label: 'Nästa bana', primary: true, fn: function () { startLevel(levelIndex + 1); } });
        }
        buttons.push({ label: 'Spela igen', fn: function () { startLevel(levelIndex); } });
        buttons.push({ label: 'Till kartan', fn: function () { showScreen('levels'); } });
        showOverlay({
          title: 'Bana ' + (levelIndex + 1) + ' klarad!',
          stars: stars,
          html: '<span class="score-big">' + g.score + ' p</span>+' + coinsWon + ' &#128176;',
          buttons: buttons
        });
      } else {
        Sound.lose();
        showOverlay({
          title: 'Det gick inte den här gången',
          html: g.lossReason === 'moves'
            ? 'Dragen tog slut innan målet nåddes.'
            : 'Ingen pjäs fick plats på brädet.',
          buttons: [
            { label: 'Försök igen', primary: true, fn: function () { startLevel(levelIndex); } },
            { label: 'Till kartan', fn: function () { showScreen('levels'); } }
          ]
        });
      }
    }, CLEAR_MS + 300);
  }

  function praiseText(res) {
    if (res.nLines >= 3) return 'MÄSTERLIGT!';
    if (res.nLines === 2) return 'FANTASTISKT!';
    if (res.combo >= 4) return 'Kombo x' + res.combo + '!';
    if (res.combo >= 2) return 'Kombo x' + res.combo + '!';
    return null;
  }

  function doPlace(slotIdx, row, col) {
    var res = game.place(slotIdx, row, col);
    if (!res) return false;
    var refilled = game.pieces.every(function (p) { return p !== null; });
    updateHud();
    renderTray(refilled);
    Sound.place();
    buzz(12);
    if (res.cleared.length || res.iceHits.length) {
      spawnEffects(res.cleared);
      flyScore(res.points, res.cleared.length ? res.cleared : res.iceHits);
      if (res.iceHits.length) Sound.ice();
      if (res.cleared.length) {
        Sound.clear(res.nLines);
        buzz(res.nLines >= 2 ? [40, 30, 40] : 35);
      }
      if (res.nLines >= 2) shakeBoard();
      var praise = praiseText(res);
      if (praise) showCombo(praise);
    }
    renderBoard();
    if (game.status !== 'playing') finishGame();
    return true;
  }

  /* ===== Boosters ===== */
  function useBooster(kind) {
    if (!game || game.status !== 'playing') return;
    var price = BOOSTER_PRICES[kind];
    if (store.getCoins() < price) { flashCoins(); return; }

    if (kind === 'hammer' || kind === 'bomb') {
      // beväpna/avväpna – betalas när den används på brädet
      armedBooster = armedBooster === kind ? null : kind;
      Sound.click();
      updateBoosterBar();
      return;
    }
    if (kind === 'swap') {
      store.spendCoins(price);
      game.swapPieces();
      Sound.click();
      renderTray(true);
      updateHud();
      renderBoard();
      if (game.status !== 'playing') finishGame();
      return;
    }
    if (kind === 'undo') {
      if (!game._undo) return;
      store.spendCoins(price);
      game.undo();
      Sound.click();
      renderTray(false);
      updateHud();
      renderBoard();
      return;
    }
  }

  function applyArmedBooster(ev) {
    if (!armedBooster || !game || game.status !== 'playing') return false;
    var rect = boardWrap.getBoundingClientRect();
    var S = game.size;
    var c = Math.floor((ev.clientX - rect.left) / (rect.width / S));
    var r = Math.floor((ev.clientY - rect.top) / (rect.height / S));
    if (r < 0 || c < 0 || r >= S || c >= S) return false;
    var kind = armedBooster;
    var removed = kind === 'hammer' ? game.hammer(r, c) : game.bomb(r, c);
    if (!removed || !removed.length) return true; // träffade tomt – behåll beväpning
    store.spendCoins(BOOSTER_PRICES[kind]);
    armedBooster = null;
    spawnEffects(removed);
    if (kind === 'bomb') { Sound.boom(); shakeBoard(); buzz([50, 30, 60]); }
    else { Sound.clear(1); buzz(25); }
    updateHud();
    renderBoard();
    if (game.status !== 'playing') finishGame();
    return true;
  }

  boosterEls.forEach(function (el) {
    el.addEventListener('click', function () {
      useBooster(el.getAttribute('data-booster'));
    });
  });

  boardCanvas.addEventListener('pointerdown', function (ev) {
    if (armedBooster) {
      ev.preventDefault();
      applyArmedBooster(ev);
    }
  });

  /* ===== Dra och släpp ===== */
  function startDrag(slotEl, slotIdx, ev) {
    if (!game || game.status !== 'playing' || drag || armedBooster) return;
    var shape = game.pieces[slotIdx];
    if (!shape) return;
    boardRect = boardWrap.getBoundingClientRect();
    cellCss = boardRect.width / game.size;

    var w = shape.w * cellCss, h = shape.h * cellCss;
    dragCanvas.width = Math.round(w * dpr);
    dragCanvas.height = Math.round(h * dpr);
    dragCanvas.style.width = w + 'px';
    dragCanvas.style.height = h + 'px';
    dragCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dragCtx.clearRect(0, 0, w, h);
    drawShapeOn(dragCtx, shape, cellCss);
    dragCanvas.classList.remove('hidden');

    drag = {
      slot: slotIdx, shape: shape, w: w, h: h, target: null, lines: null,
      lift: ev.pointerType === 'mouse' ? 0 : TOUCH_LIFT
    };
    slotEl.classList.add('dragging');
    try { slotEl.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    moveDrag(ev);
  }

  function moveDrag(ev) {
    if (!drag) return;
    var gx = ev.clientX - drag.w / 2;
    var gy = ev.clientY - drag.h / 2 - drag.lift;
    dragCanvas.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';

    var col = Math.round((gx - boardRect.left) / cellCss);
    var row = Math.round((gy - boardRect.top) / cellCss);
    var valid = row >= 0 && col >= 0 &&
      row + drag.shape.h <= game.size && col + drag.shape.w <= game.size &&
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
      Sound.unlock();
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

  /* ===== Bankarta ===== */
  var NODE_GAP = 108;
  var MAP_PAD = 70;
  var WORLD_GAP = 80;   // extra luft mellan världarna, där banderollen bor
  var WORLD_DECOR = [
    ['🌲', '🌳', '🌷', '🍄', '🦋'],
    ['🏔️', '❄️', '⛄', '🧊'],
    ['🌵', '☀️', '🪨', '🦂']
  ];
  var WORLD_EMOJI = ['🌿', '❄️', '🌵'];

  /* Deterministiskt "slump"-värde 0..1 per index, så kartan ser likadan ut varje gång. */
  function seeded(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* Mjuk kurva genom nodpunkterna (kvadratiska Bézier-segment via mittpunkter). */
  function smoothPathD(pts) {
    if (pts.length < 2) return '';
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2;
      var my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ' Q ' + pts[i][0] + ' ' + pts[i][1] + ' ' + mx + ' ' + my;
    }
    var last = pts[pts.length - 1];
    return d + ' L ' + last[0] + ' ' + last[1];
  }

  var SVGNS = 'http://www.w3.org/2000/svg';

  function svgPath(d, stroke, width, dash, cls) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', width);
    if (dash) p.setAttribute('stroke-dasharray', dash);
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (cls) p.setAttribute('class', cls);
    return p;
  }

  function svgFill(d, fill) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill);
    return p;
  }

  /* Mjuk böljande ås (kullar/dyner) som fylls ner till segmentets botten. */
  function ridgeD(yBase, amp, freq, phase, segH) {
    var d = 'M 0 ' + segH;
    for (var x = 0; x <= 100; x += 4) {
      var y = yBase + Math.sin((x / 100) * Math.PI * 2 * freq + phase) * amp;
      d += ' L ' + x + ' ' + y.toFixed(1);
    }
    return d + ' L 100 ' + segH + ' Z';
  }

  /* Taggig bergsås. Returnerar även topparnas positioner för snötäcken. */
  function peaksD(yBase, amp, n, segH) {
    var d = 'M 0 ' + segH + ' L 0 ' + yBase;
    var tops = [];
    for (var i = 1; i <= n * 2; i++) {
      var x = (i / (n * 2)) * 100;
      var peak = i % 2 === 1;
      var y = peak ? yBase - amp : yBase;
      if (peak) tops.push([x, y]);
      d += ' L ' + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return { d: d + ' L 100 ' + segH + ' Z', tops: tops };
  }

  /* Målad terräng för ett världssegment: kullar, berg med snö eller dyner med sol. */
  function terrainSVG(w, wi, segH) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 ' + segH);
    svg.setAttribute('preserveAspectRatio', 'none');

    if (wi === 2) { // öken: sol med glöd
      var sx = 20 + seeded(wi * 5 + 1) * 60;
      [[16, 60, 0.12], [10, 38, 0.2], [6, 22, 0.45]].forEach(function (ring) {
        var e = document.createElementNS(SVGNS, 'ellipse');
        e.setAttribute('cx', sx); e.setAttribute('cy', 120);
        e.setAttribute('rx', ring[0]); e.setAttribute('ry', ring[1]);
        e.setAttribute('fill', 'hsla(45, 90%, 65%, ' + ring[2] + ')');
        svg.appendChild(e);
      });
    }

    var bands = Math.max(3, Math.round(segH / 300));
    for (var b = 0; b < bands; b++) {
      var r = seeded(wi * 97 + b * 13);
      var yBase = segH - 50 - b * ((segH - 140) / bands) + (r - 0.5) * 50;
      var light = 26 + b * 5 + r * 6;
      var alpha = Math.max(0.08, 0.2 - b * 0.025);
      var fill = 'hsla(' + w.hue + ', 45%, ' + light + '%, ' + alpha + ')';
      if (wi === 1) { // berg med snötoppar
        var pk = peaksD(yBase, 90 + r * 70, 3 + Math.round(r * 2), segH);
        svg.appendChild(svgFill(pk.d, fill));
        pk.tops.forEach(function (t) {
          svg.appendChild(svgFill(
            'M ' + (t[0] - 2.2) + ' ' + (t[1] + 26) + ' L ' + t[0] + ' ' + t[1] +
            ' L ' + (t[0] + 2.2) + ' ' + (t[1] + 26) + ' Z',
            'rgba(255,255,255,' + (0.25 + alpha) + ')'));
        });
      } else { // kullar respektive dyner
        var amp = wi === 2 ? 34 + r * 26 : 22 + r * 18;
        var freq = wi === 2 ? 0.9 + r * 0.6 : 1.3 + r * 0.9;
        svg.appendChild(svgFill(ridgeD(yBase, amp, freq, r * 6.28, segH), fill));
      }
    }
    return svg;
  }

  function renderLevelMap() {
    $('#map-coins').textContent = store.getCoins();
    var stars = store.getStars();
    var totalStars = 0;
    LEVELS.forEach(function (lv, i) { totalStars += stars[i] || 0; });
    $('#map-stars').textContent = totalStars + '/' + LEVELS.length * 3;

    var wrap = $('#level-map');
    wrap.innerHTML = '';
    var inner = document.createElement('div');
    inner.className = 'map-inner';
    var n = LEVELS.length;
    var h = n * NODE_GAP + MAP_PAD * 2 + WORLDS.length * WORLD_GAP;
    inner.style.height = h + 'px';

    var currentIdx = -1;
    var points = [];

    // världsbakgrunder, banderoller (vid världens entré nertill), dekor och moln
    WORLDS.forEach(function (w, wi) {
      var topY = yForLevel(w.to, h) - NODE_GAP / 2 - WORLD_GAP / 2;
      var bottomY = yForLevel(w.from, h) + NODE_GAP / 2 + WORLD_GAP / 2;
      var bg = document.createElement('div');
      bg.className = 'map-world';
      bg.style.top = topY + 'px';
      bg.style.height = (bottomY - topY) + 'px';
      bg.style.background = 'linear-gradient(180deg, hsla(' + w.hue + ',60%,50%,0.16), hsla(' + w.hue + ',60%,40%,0.04))';
      bg.appendChild(terrainSVG(w, wi, bottomY - topY));
      inner.appendChild(bg);

      var banner = document.createElement('div');
      banner.className = 'world-banner';
      banner.textContent = WORLD_EMOJI[wi] + ' ' + w.name;
      banner.style.top = (bottomY - 52) + 'px';
      inner.appendChild(banner);

      for (var ci = 0; ci < 2; ci++) {
        var cloud = document.createElement('div');
        cloud.className = 'cloud';
        cloud.textContent = '☁️';
        var cr = seeded(wi * 31 + ci * 7);
        cloud.style.top = (topY + 80 + cr * Math.max(120, bottomY - topY - 240)) + 'px';
        cloud.style.fontSize = (26 + cr * 16) + 'px';
        cloud.style.setProperty('--dur', (48 + cr * 40) + 's');
        cloud.style.setProperty('--delay', (-cr * 60) + 's');
        inner.appendChild(cloud);
      }
    });

    LEVELS.forEach(function (lv, i) {
      var unlocked = i === 0 || (stars[i - 1] || 0) > 0;
      var done = (stars[i] || 0) > 0;
      if (unlocked && !done && currentIdx === -1) currentIdx = i;
      var x = 50 + Math.sin(i * 1.05) * 28; // procent
      var y = yForLevel(i, h);
      points.push([x, y]);

      // två temadekorationer per bana, på motsatt sida av stigen
      var world = Math.min(Math.floor(i / 10), WORLDS.length - 1);
      var decors = WORLD_DECOR[world];
      for (var di = 0; di < 2; di++) {
        var r1 = seeded(i * 13 + di * 5 + 1);
        var r2 = seeded(i * 17 + di * 3 + 2);
        var deco = document.createElement('div');
        var emoji = decors[Math.floor(r1 * decors.length)];
        deco.className = 'deco' + ((emoji === '❄️' || emoji === '☀️' || emoji === '🦋') ? ' twinkle' : '');
        deco.textContent = emoji;
        var side = di === 0 ? (x < 50 ? 1 : 0) : Math.round(r1);
        deco.style.left = (side ? 72 + r2 * 22 : 6 + r2 * 22) + '%';
        deco.style.top = (y - NODE_GAP / 2 + r1 * NODE_GAP) + 'px';
        deco.style.fontSize = (17 + r2 * 14) + 'px';
        deco.style.setProperty('--dur', (3.5 + r1 * 3) + 's');
        deco.style.setProperty('--delay', (-r2 * 4) + 's');
        inner.appendChild(deco);
      }

      var el = document.createElement('button');
      el.className = 'map-node' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
      el.style.setProperty('--hue', WORLDS[world].hue);
      el.style.setProperty('--d', ((i % 10) * 0.045) + 's');
      var starStr = '';
      for (var s = 1; s <= 3; s++) starStr += s <= (stars[i] || 0) ? '★' : '☆';
      el.innerHTML =
        '<span class="num">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        (done ? '<span class="stars">' + starStr + '</span>'
          : '<span class="stars">' + (lv.type === 'gems' ? '💎' : lv.type === 'ice' ? '🧊' : lv.type === 'collect' ? '🎨' : '🎯') + '</span>');
      el.style.left = x + '%';
      el.style.top = y + 'px';
      if (unlocked) el.addEventListener('click', function () { Sound.click(); startLevel(i); });
      inner.appendChild(el);
    });

    // markera aktuell bana med puls + studsande kartnål
    if (currentIdx === -1) currentIdx = n - 1;
    var nodes = inner.querySelectorAll('.map-node');
    if (nodes[currentIdx] && !nodes[currentIdx].classList.contains('locked')) {
      nodes[currentIdx].classList.add('current');
      var pin = document.createElement('div');
      pin.className = 'map-pin';
      pin.textContent = '📍';
      pin.style.left = points[currentIdx][0] + '%';
      pin.style.top = points[currentIdx][1] + 'px';
      inner.appendChild(pin);
    }

    // vägen: bred grusväg med kantlinje, guldbelagd avklarad sträcka
    // och vandrande mittlinje
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'map-path');
    svg.setAttribute('viewBox', '0 0 100 ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    var roadD = smoothPathD(points);
    svg.appendChild(svgPath(roadD, 'rgba(20,14,8,0.4)', '15', null, null));
    svg.appendChild(svgPath(roadD, 'rgba(225,203,160,0.32)', '10', null, null));
    if (currentIdx > 0) {
      svg.appendChild(svgPath(smoothPathD(points.slice(0, currentIdx + 1)), 'rgba(255,214,69,0.45)', '10', null, null));
    }
    svg.appendChild(svgPath(roadD, 'rgba(255,255,255,0.55)', '2', '5 9', 'trail'));
    inner.insertBefore(svg, inner.firstChild);

    wrap.appendChild(inner);

    // scrolla till aktuell bana
    var targetY = yForLevel(currentIdx, h) - wrap.clientHeight / 2;
    wrap.scrollTop = Math.max(0, Math.min(targetY, h - wrap.clientHeight));
  }

  /* Banorna löper nedifrån och upp, som i Candy Crush. */
  function yForLevel(i, totalH) {
    var world = Math.floor(i / 10);
    return totalH - MAP_PAD - i * NODE_GAP - world * WORLD_GAP - 40;
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
        '<li><b>&#129482; Is</b> kräver två rensningar. <b>&#128142; Ädelstenar</b> rensas med sin rad.</li>' +
        '<li><b>Boosters</b> köps med mynt: &#128296; ta bort ett block, &#128163; spräng 3&times;3, &#128260; byt pjäser, &#8617;&#65039; ångra.</li>' +
        '<li>Mynt tjänar du på klarade banor och i oändligt läge.</li>' +
        '</ul>',
      buttons: [{ label: 'Stäng', primary: true, fn: function () {} }]
    });
  }

  /* ===== Knappar ===== */
  $('#btn-endless').addEventListener('click', function () { Sound.unlock(); Sound.click(); showEndlessChooser(); });
  $('#btn-levels').addEventListener('click', function () { Sound.unlock(); Sound.click(); showScreen('levels'); });
  $('#btn-help').addEventListener('click', function () { Sound.click(); showHelp(); });
  $('#btn-restart').addEventListener('click', restartCurrent);
  document.querySelectorAll('.btn-back').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Sound.click();
      endDrag(false);
      armedBooster = null;
      hideOverlay();
      showScreen(mode === 'level' && screens.game.classList.contains('active') ? 'levels' : 'menu');
    });
  });

  hudObjective.addEventListener('click', function () {
    if (mode === 'level' && game) showObjectiveIntro(levelIndex, false);
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
