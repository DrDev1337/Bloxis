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

  /* ===== Tillstånd ===== */
  var game = null;
  var mode = 'endless';
  var levelIndex = 0;
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

    roundRectPath(ctx, 0, 0, boardCanvas.width, boardCanvas.height, cell * 0.25);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    var r, c;
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
    var cell = boardCanvas.width / SIZE;
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
    el.style.left = ((sumC / cleared.length + 0.5) / SIZE * 100) + '%';
    el.style.top = ((sumR / cleared.length + 0.5) / SIZE * 100) + '%';
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
      hudSub.textContent = 'Rekord: ' + Math.max(store.getBest(), game.score);
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
  function startEndless() {
    mode = 'endless';
    game = new Game({ mode: 'endless' });
    armedBooster = null;
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
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
  }

  function restartCurrent() {
    Sound.click();
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
        var coins = Math.floor(g.score / 200);
        if (coins > 0) { store.addCoins(coins); Sound.coin(); }
        Sound.lose();
        showOverlay({
          title: 'Spelet är slut!',
          html: (isRecord ? '&#127881; Nytt rekord!' : 'Bra spelat!') +
            '<span class="score-big">' + g.score + ' p</span>' +
            'Rekord: ' + store.getBest() +
            (coins > 0 ? ' &bull; +' + coins + ' &#128176;' : ''),
          buttons: [
            { label: 'Spela igen', primary: true, fn: startEndless },
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
    var c = Math.floor((ev.clientX - rect.left) / (rect.width / SIZE));
    var r = Math.floor((ev.clientY - rect.top) / (rect.height / SIZE));
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
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

  function renderLevelMap() {
    $('#map-coins').textContent = store.getCoins();
    var wrap = $('#level-map');
    wrap.innerHTML = '';
    var inner = document.createElement('div');
    inner.className = 'map-inner';
    var n = LEVELS.length;
    var h = n * NODE_GAP + MAP_PAD * 2 + WORLDS.length * 50;
    inner.style.height = h + 'px';

    var stars = store.getStars();
    var currentIdx = -1;
    var points = [];

    // världsbakgrunder och banderoller
    WORLDS.forEach(function (w) {
      var topY = yForLevel(w.to, h) - NODE_GAP / 2 - 50;
      var bottomY = yForLevel(w.from, h) + NODE_GAP / 2;
      var bg = document.createElement('div');
      bg.className = 'map-world';
      bg.style.top = topY + 'px';
      bg.style.height = (bottomY - topY) + 'px';
      bg.style.background = 'linear-gradient(180deg, hsla(' + w.hue + ',60%,50%,0.14), hsla(' + w.hue + ',60%,40%,0.05))';
      inner.appendChild(bg);
      var banner = document.createElement('div');
      banner.className = 'world-banner';
      banner.textContent = w.name;
      banner.style.top = (topY + 12) + 'px';
      inner.appendChild(banner);
    });

    LEVELS.forEach(function (lv, i) {
      var unlocked = i === 0 || (stars[i - 1] || 0) > 0;
      var done = (stars[i] || 0) > 0;
      if (unlocked && !done && currentIdx === -1) currentIdx = i;
      var x = 50 + Math.sin(i * 1.05) * 28; // procent
      var y = yForLevel(i, h);
      points.push([x, y]);

      var el = document.createElement('button');
      el.className = 'map-node' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
      var starStr = '';
      for (var s = 1; s <= 3; s++) starStr += s <= (stars[i] || 0) ? '★' : '☆';
      el.innerHTML =
        '<span class="num">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        (done ? '<span class="stars">' + starStr + '</span>'
          : '<span class="stars">' + (LEVELS[i].type === 'gems' ? '💎' : LEVELS[i].type === 'ice' ? '🧊' : LEVELS[i].type === 'collect' ? '🎨' : '🎯') + '</span>');
      el.style.left = x + '%';
      el.style.top = y + 'px';
      if (unlocked) el.addEventListener('click', function () { Sound.click(); startLevel(i); });
      inner.appendChild(el);
    });

    // markera aktuell bana
    if (currentIdx === -1) currentIdx = n - 1;
    var nodes = inner.querySelectorAll('.map-node');
    if (nodes[currentIdx] && !nodes[currentIdx].classList.contains('locked')) {
      nodes[currentIdx].classList.add('current');
    }

    // stig mellan noderna
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'map-path');
    svg.setAttribute('viewBox', '0 0 100 ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');
    var d = '';
    points.forEach(function (p, i) {
      d += (i === 0 ? 'M' : ' L') + p[0] + ' ' + p[1];
    });
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(255,255,255,0.25)');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-dasharray', '1 7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    inner.insertBefore(svg, inner.firstChild);

    wrap.appendChild(inner);

    // scrolla till aktuell bana
    var targetY = yForLevel(currentIdx, h) - wrap.clientHeight / 2;
    wrap.scrollTop = Math.max(0, Math.min(targetY, h - wrap.clientHeight));
  }

  /* Banorna löper nedifrån och upp, som i Candy Crush. */
  function yForLevel(i, totalH) {
    var world = Math.floor(i / 10);
    return totalH - MAP_PAD - i * NODE_GAP - world * 50 - 40;
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
  $('#btn-endless').addEventListener('click', function () { Sound.unlock(); Sound.click(); startEndless(); });
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
