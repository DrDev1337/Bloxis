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
    },
    getJson: function (key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; }
      catch (e) { return fallback; }
    },
    setJson: function (key, v) { localStorage.setItem(key, JSON.stringify(v)); }
  };

  /* ===== Inställningar ===== */
  var settings = (function () {
    var def = { sound: true, music: true, vibration: true, colorblind: false };
    var saved = store.getJson('bloxis.settings', {});
    for (var k in saved) def[k] = saved[k];
    return def;
  })();
  function saveSettings() { store.setJson('bloxis.settings', settings); }

  /* ===== Twemoji: byter emojitecken mot lokala SVG:er (CC-BY 4.0) så
     ikonerna ser likadana ut på alla plattformar. ===== */
  var TWEMOJI = {
    '🏅': '1f3c5', '⚙': '2699', '📅': '1f4c5', '🧩': '1f9e9', '💰': '1f4b0',
    '🔥': '1f525', '🔨': '1f528', '💣': '1f4a3', '🔄': '1f504', '↩': '21a9',
    '🔒': '1f512', '💎': '1f48e', '🧊': '1f9ca', '🎨': '1f3a8', '🎯': '1f3af',
    '📍': '1f4cd', '☁': '2601', '🌲': '1f332', '🌳': '1f333', '🌷': '1f337',
    '🍄': '1f344', '🦋': '1f98b', '🏔': '1f3d4', '❄': '2744', '⛄': '26c4',
    '🌵': '1f335', '☀': '2600', '🪨': '1faa8', '🦂': '1f982', '⭐': '2b50',
    '🌙': '1f319', '☄': '2604', '🪐': '1fa90', '🌿': '1f33f', '🌟': '1f31f',
    '🎉': '1f389', '🏆': '1f3c6', '👆': '1f446', '🔊': '1f50a', '🎵': '1f3b5',
    '📳': '1f4f3', '👁': '1f441', '🌱': '1f331', '🧹': '1f9f9', '💥': '1f4a5',
    '🌋': '1f30b', '⚡': '26a1', '🗺': '1f5fa', '🧰': '1f9f0'
  };
  var TW_RE = new RegExp('(' + Object.keys(TWEMOJI).join('|') + ')\\uFE0F?', 'g');
  function twe(html) {
    return String(html).replace(TW_RE, function (_, ch) {
      return '<img class="twe" draggable="false" alt="' + ch + '" src="assets/twemoji/' + TWEMOJI[ch] + '.svg">';
    });
  }

  /* ===== Ljud: Kenney-samplingar (CC0) med syntetiserad reserv ===== */
  var Sound = (function () {
    var ctx = null;
    var buffers = {};
    var samplesRequested = false;
    var SAMPLE_FILES = ['click', 'place', 'confirm', 'coin', 'boom', 'swap'];
    function ac() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function loadSamples() {
      if (samplesRequested || !window.fetch) return;
      var c = ac();
      if (!c) return;
      samplesRequested = true;
      SAMPLE_FILES.forEach(function (name) {
        fetch('assets/kenney/audio/' + name + '.ogg')
          .then(function (r) { return r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status)); })
          .then(function (ab) { return c.decodeAudioData(ab); })
          .then(function (buf) { buffers[name] = buf; })
          .catch(function () { /* synth-reserven tar över */ });
      });
    }
    /* Spelar en sampling. Returnerar false om synth-reserven ska användas. */
    function sample(name, vol) {
      if (!settings.sound) return true;
      var c = ac();
      var buf = buffers[name];
      if (!c || !buf) return false;
      var src = c.createBufferSource();
      var g = c.createGain();
      src.buffer = buf;
      g.gain.value = vol || 0.5;
      src.connect(g);
      g.connect(c.destination);
      src.start();
      return true;
    }
    function tone(freq, dur, type, vol, delay) {
      if (!settings.sound) return;
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
      unlock: function () { ac(); loadSamples(); },
      ctx: ac,
      star: function (i) { tone(700 + i * 200, 0.22, 'triangle', 0.16); },
      click: function () { if (!sample('click', 0.4)) tone(600, 0.05, 'sine', 0.06); },
      place: function () {
        if (!sample('place', 0.55)) { tone(300, 0.07, 'triangle', 0.1); tone(420, 0.06, 'triangle', 0.07, 0.03); }
      },
      clear: function (n) {
        sample('confirm', Math.min(0.3 + n * 0.12, 0.65));
        for (var i = 0; i < Math.min(n + 1, 5); i++) {
          tone(440 * Math.pow(1.26, i), 0.13, 'triangle', 0.13, i * 0.055);
        }
      },
      ice: function () { tone(1200, 0.08, 'square', 0.05); tone(900, 0.1, 'square', 0.04, 0.04); },
      boom: function () {
        if (!sample('boom', 0.65)) { tone(90, 0.35, 'sawtooth', 0.2); tone(60, 0.4, 'sawtooth', 0.15, 0.05); }
      },
      swap: function () { if (!sample('swap', 0.45)) this.click(); },
      coin: function () {
        if (!sample('coin', 0.4)) { tone(988, 0.07, 'square', 0.05); tone(1319, 0.14, 'square', 0.05, 0.07); }
      },
      win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.14, i * 0.12); }); },
      lose: function () { [330, 262, 196].forEach(function (f, i) { tone(f, 0.22, 'sawtooth', 0.06, i * 0.16); }); }
    };
  })();

  function buzz(ms) {
    if (!settings.vibration) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ok */ } }
  }

  /* ===== Bakgrundsmusik (genererad, lugn arpeggio-loop) ===== */
  var Music = (function () {
    var timer = null, nextTime = 0, step = 0;
    var SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784];
    var CHORDS = [0, 3, 4, 2];
    var ARP = [0, 2, 4, 7, 4, 2, 5, 2];
    function note(c, freq, t, dur, vol, type) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function schedule() {
      var c = Sound.ctx();
      if (!c) return;
      while (nextTime < c.currentTime + 0.6) {
        var chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
        var idx = (chord + ARP[step % 8]) % SCALE.length;
        note(c, SCALE[idx], nextTime, 0.32, 0.03, 'triangle');
        if (step % 8 === 0) note(c, SCALE[chord] / 2, nextTime, 1.8, 0.045, 'sine');
        nextTime += 0.26;
        step++;
      }
    }
    return {
      start: function () {
        if (timer || !settings.music) return;
        var c = Sound.ctx();
        if (!c) return;
        nextTime = c.currentTime + 0.1;
        timer = setInterval(schedule, 200);
      },
      stop: function () { if (timer) { clearInterval(timer); timer = null; } },
      sync: function () { if (settings.music && !document.hidden) this.start(); else this.stop(); }
    };
  })();
  document.addEventListener('visibilitychange', function () { Music.sync(); });

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

  /* ===== Daglig utmaning: datum-seedad slump ===== */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function dateStr(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function todayStr() { return dateStr(new Date()); }
  function daysAgoStr(n) { return dateStr(new Date(Date.now() - n * 86400000)); }
  function dateSeed(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  /* Genererar dagens bana: spegelsymmetriskt bräde, rensa alla ädelstenar.
     Ädelstensparen läggs på skilda rader så 2-3 radrensningar räcker. */
  function dailyLevel(dstr) {
    var rng = mulberry32(dateSeed(dstr));
    var rows = [];
    for (var r = 0; r < 8; r++) rows.push('........'.split(''));
    var blocks = 3 + Math.floor(rng() * 3);
    for (var i = 0; i < blocks; i++) {
      var br = Math.floor(rng() * 8), bc = Math.floor(rng() * 4);
      rows[br][bc] = '#'; rows[br][7 - bc] = '#';
    }
    var gems = 2 + Math.floor(rng() * 2), placed = 0, guard = 0;
    var usedRows = {};
    while (placed < gems && guard++ < 60) {
      var gr = Math.floor(rng() * 8), gc = Math.floor(rng() * 4);
      if (usedRows[gr] || rows[gr][gc] !== '.') continue;
      rows[gr][gc] = 'G'; rows[gr][7 - gc] = 'G';
      usedRows[gr] = true;
      placed++;
    }
    return {
      type: 'gems',
      moves: 34 + Math.floor(rng() * 6),
      board: rows.map(function (rw) { return rw.join(''); }),
      daily: dstr,
      pieceSeed: dateSeed(dstr + '#pjaser')
    };
  }

  function getDaily() { return store.getJson('bloxis.daily', { streak: 0, lastWin: '', history: {} }); }
  function effectiveStreak(d) {
    return (d.lastWin === todayStr() || d.lastWin === daysAgoStr(1)) ? d.streak : 0;
  }
  function calendarHtml() {
    var d = getDaily();
    var html = '<div class="cal-row">';
    for (var i = 6; i >= 0; i--) {
      var ds = daysAgoStr(i);
      var won = d.history[ds];
      html += '<div class="cal-day' + (won ? ' won' : '') + (i === 0 ? ' today' : '') + '">' +
        '<span class="mark">' + (won ? '✓' : i === 0 ? '?' : '·') + '</span>' +
        '<span>' + ds.slice(8) + '/' + (+ds.slice(5, 7)) + '</span></div>';
    }
    return html + '</div>';
  }

  /* ===== Statistik och utmärkelser ===== */
  function getStats() {
    return store.getJson('bloxis.stats', {
      linesTotal: 0, maxLines: 0, maxCombo: 0, bestEndless: 0,
      levelsWon: 0, dailyWins: 0, maxStreak: 0, boosters: {}
    });
  }
  var stats = getStats();
  function saveStats() { store.setJson('bloxis.stats', stats); checkAchievements(); }

  var ACH = [
    { id: 'first_clear', icon: '🧹', name: 'Första rensningen', desc: 'Rensa din första linje', coins: 10, test: function (s) { return s.linesTotal >= 1; } },
    { id: 'double', icon: '💥', name: 'Dubbelsmäll', desc: 'Rensa 2 linjer i ett drag', coins: 15, test: function (s) { return s.maxLines >= 2; } },
    { id: 'triple', icon: '🌋', name: 'Trippelknall', desc: 'Rensa 3+ linjer i ett drag', coins: 30, test: function (s) { return s.maxLines >= 3; } },
    { id: 'combo3', icon: '⚡', name: 'Kombokung', desc: 'Nå kombo x3', coins: 15, test: function (s) { return s.maxCombo >= 3; } },
    { id: 'combo5', icon: '🌟', name: 'Kombomästare', desc: 'Nå kombo x5', coins: 40, test: function (s) { return s.maxCombo >= 5; } },
    { id: 'score1k', icon: '🎯', name: 'Tusenklubban', desc: '1000 p i ett oändligt parti', coins: 20, test: function (s) { return s.bestEndless >= 1000; } },
    { id: 'score5k', icon: '🏔️', name: 'Höjdaren', desc: '5000 p i ett oändligt parti', coins: 50, test: function (s) { return s.bestEndless >= 5000; } },
    { id: 'levels10', icon: '🗺️', name: 'Vandraren', desc: 'Klara 10 banor', coins: 30, test: function (s) { return s.levelsWon >= 10; } },
    { id: 'world1', icon: '🌿', name: 'Ängarnas mästare', desc: 'Tre stjärnor på alla banor i värld 1', coins: 60, test: function () {
      var st = store.getStars();
      for (var i = 0; i < 10; i++) if ((st[i] || 0) < 3) return false;
      return true;
    } },
    { id: 'boosters', icon: '🧰', name: 'Verktygslådan', desc: 'Använd alla fyra boosters', coins: 20, test: function (s) { return Object.keys(s.boosters || {}).length >= 4; } },
    { id: 'daily1', icon: '📅', name: 'Dagens hjälte', desc: 'Klara en daglig utmaning', coins: 20, test: function (s) { return s.dailyWins >= 1; } },
    { id: 'streak3', icon: '🔥', name: 'På rad', desc: '3 dagars streak i dagliga utmaningen', coins: 40, test: function (s) { return s.maxStreak >= 3; } }
  ];

  function checkAchievements() {
    var unlocked = store.getJson('bloxis.ach', {});
    var newOnes = [];
    ACH.forEach(function (a) {
      if (!unlocked[a.id] && a.test(stats)) {
        unlocked[a.id] = true;
        store.addCoins(a.coins);
        newOnes.push(a);
      }
    });
    if (newOnes.length) {
      store.setJson('bloxis.ach', unlocked);
      newOnes.forEach(function (a, i) {
        setTimeout(function () {
          showToast('🏅 ' + a.name + '  +' + a.coins + ' 💰');
          Sound.coin();
        }, i * 3200);
      });
      if (game) updateHud();
    }
  }

  var toastTimer = null;
  function showToast(msg) {
    var el = $('#toast');
    el.innerHTML = twe(msg);
    el.classList.remove('hidden');
    void el.offsetWidth;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 3100);
  }

  function showAchievements() {
    var unlocked = store.getJson('bloxis.ach', {});
    var html = ACH.map(function (a) {
      var got = unlocked[a.id];
      return '<div class="ach-row' + (got ? '' : ' locked') + '">' +
        '<span class="ach-icon">' + a.icon + '</span>' +
        '<span><div class="ach-name">' + a.name + '</div><div class="ach-desc">' + a.desc + '</div></span>' +
        '<span class="ach-coins">' + (got ? '✓' : '+' + a.coins + ' 💰') + '</span></div>';
    }).join('');
    showOverlay({
      title: '🏅 Utmärkelser',
      html: html,
      buttons: [{ label: 'Stäng', primary: true, fn: function () {} }]
    });
  }

  function showSettings() {
    var rows = [
      ['sound', '🔊 Ljudeffekter'],
      ['music', '🎵 Musik'],
      ['vibration', '📳 Vibration'],
      ['colorblind', '👁️ Färgblindläge']
    ];
    var html = rows.map(function (r) {
      return '<div class="toggle-row"><span>' + r[1] + '</span>' +
        '<button class="toggle' + (settings[r[0]] ? ' on' : '') + '" data-k="' + r[0] + '" aria-label="' + r[1] + '"></button></div>';
    }).join('');
    showOverlay({
      title: '⚙️ Inställningar',
      html: html,
      buttons: [{ label: 'Klart', primary: true, fn: function () {} }]
    });
    document.querySelectorAll('#ov-text .toggle').forEach(function (t) {
      t.addEventListener('click', function () {
        var k = t.getAttribute('data-k');
        settings[k] = !settings[k];
        saveSettings();
        t.classList.toggle('on', settings[k]);
        Sound.click();
        if (k === 'music') Music.sync();
        if (k === 'colorblind' && game) { renderBoard(); renderTray(false); }
      });
    });
  }

  /* ===== Tillstånd ===== */
  var game = null;
  var mode = 'endless';      // 'endless' | 'level' | 'daily' | 'tutorial'
  var levelIndex = 0;
  var endlessCfg = getEndlessCfg();
  var tutor = null;          // { step, after }

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

  /* Kenney-partikelsprites (CC0) för gnistrande rensningar. */
  var PARTICLE_SPRITES = ['star_06', 'star_09', 'spark_04'].map(function (n) {
    var img = new Image();
    img.src = 'assets/kenney/particles/' + n + '.png';
    return img;
  });

  /* ===== Skärmbyten ===== */
  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
    if (name === 'menu') {
      $('#menu-best').textContent = store.getBest();
      $('#menu-coins').textContent = store.getCoins();
      var d = getDaily();
      $('#menu-streak').textContent = effectiveStreak(d);
      $('#daily-badge').classList.toggle('hidden', !!d.history[todayStr()]);
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
    if (settings.colorblind && !opts.gem && !opts.ice) {
      drawCbSymbol(ctx, x, y, size, colorIdx % 8);
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

  /* Färgblindläge: unik symbol per blockfärg. */
  function drawCbSymbol(ctx, x, y, size, idx) {
    var cx = x + size / 2, cy = y + size / 2, r = size * 0.17;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.beginPath();
    switch (idx) {
      case 0: ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke(); break;
      case 1: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r); ctx.closePath(); ctx.stroke(); break;
      case 2: ctx.strokeRect(cx - r, cy - r, r * 2, r * 2); break;
      case 3: ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); break;
      case 4: ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.stroke(); break;
      case 5: ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); break;
      case 6: ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); break;
      default: ctx.arc(cx, cy, r * 0.65, 0, 6.283); ctx.fill(); break;
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
      if (p.sprite && p.sprite.complete && p.sprite.naturalWidth) {
        var s = p.size * (1 + tt * 0.5);
        ctx.save();
        ctx.globalAlpha = 1 - tt;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(px, py);
        ctx.rotate(p.rot + p.spin * tt);
        ctx.drawImage(p.sprite, -s / 2, -s / 2, s, s);
        ctx.restore();
      } else {
        ctx.globalAlpha = 1 - tt;
        ctx.fillStyle = p.color;
        ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
      }
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
      // två gnistrande stjärnsprites ovanpå de färgade fyrkanterna
      for (var j = 0; j < 2; j++) {
        particles.push({
          x: (cc.c + 0.5) * cell,
          y: (cc.r + 0.5) * cell,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -Math.random() * 1.4 - 0.3,
          size: cell * (0.3 + Math.random() * 0.3),
          sprite: PARTICLE_SPRITES[Math.floor(Math.random() * PARTICLE_SPRITES.length)],
          rot: Math.random() * 6.28,
          spin: (Math.random() - 0.5) * 5,
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
    if (mode === 'tutorial') {
      hudSub.textContent = 'Guide';
      hudObjective.classList.add('hidden');
      return;
    }
    if (mode === 'endless') {
      hudSub.textContent = endlessCfg.size + '×' + endlessCfg.size + ' • Rekord: ' +
        Math.max(store.getBestFor(endlessCfg), game.score);
      hudObjective.classList.add('hidden');
      return;
    }
    hudSub.textContent = mode === 'daily' ? 'Dagens utmaning' : 'Bana ' + (levelIndex + 1);
    hudObjective.classList.remove('hidden');
    var left = game.movesLeft();
    var lv = game.level;
    if (lv.type === 'score') {
      hudObjective.innerHTML = twe('🎯 Mål: <b>' + lv.target + '</b> p • ' + left + ' drag kvar');
    } else if (lv.type === 'gems') {
      hudObjective.innerHTML = twe('💎 <b>' + game.gemsLeft + '</b> kvar • ' + left + ' drag kvar');
    } else if (lv.type === 'ice') {
      hudObjective.innerHTML = twe('🧊 <b>' + game.iceLeft + '</b> kvar • ' + left + ' drag kvar');
    } else {
      hudObjective.innerHTML = twe(
        '<span class="collect-chip" style="background:' + Shapes.PALETTE[lv.color] + '"></span>' +
        '<b>' + game.collectLeft() + '</b> kvar • ' + left + ' drag kvar');
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
    $('#ov-title').innerHTML = twe(cfg.title);
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
    $('#ov-text').innerHTML = twe(cfg.html || '');
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
      return '<p style="font-size:1.05rem">🎯 Nå <b>' + lv.target + ' poäng</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Rensa flera linjer samtidigt och kedja rensningar för kombobonus.</p>';
    }
    if (lv.type === 'gems') {
      return '<p style="font-size:1.05rem">💎 Rensa alla <b>' + countChar(lv.board, 'G') + ' ädelstenar</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>En ädelsten försvinner när dess rad eller kolumn blir full.</p>';
    }
    if (lv.type === 'ice') {
      return '<p style="font-size:1.05rem">🧊 Rensa all is (<b>' + countChar(lv.board, 'I') + ' rutor</b>) på högst <b>' + lv.moves + ' drag</b>.</p>' +
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

  function playStarSounds(n) {
    for (var i = 0; i < n; i++) {
      (function (idx) {
        setTimeout(function () { Sound.star(idx); }, 250 + idx * 400);
      })(i);
    }
  }

  function startDaily() {
    var dstr = todayStr();
    var lv = dailyLevel(dstr);
    mode = 'daily';
    // nivå 1-2-former: de största klossarna (3x3, femradingar) skulle göra
    // slumpade dagliga bräden för nyckfulla
    game = new Game({ mode: 'level', level: lv, rng: mulberry32(lv.pieceSeed), shapeRamp: { t2: 0, t3: 9999 } });
    armedBooster = null;
    $('#boosters').classList.remove('hidden');
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
    var d = getDaily();
    showOverlay({
      title: '📅 Dagens utmaning',
      html: '<p><b>' + dstr + '</b> &ndash; samma bana för alla, ny varje dag!</p>' +
        objectiveHtml(lv) +
        '<p>🔥 Streak: <b>' + effectiveStreak(d) + '</b> dagar</p>' + calendarHtml(),
      buttons: [{ label: 'Kör!', primary: true, fn: function () {} }]
    });
  }

  /* ===== Interaktiv guide ===== */
  function findShape(w, h, cells) {
    return Shapes.SHAPES.filter(function (s) {
      return s.w === w && s.h === h && s.cells.length === cells;
    })[0];
  }

  function pointHandAtSlot() {
    var hand = $('#tutor-hand');
    var rect = slotEls[0].getBoundingClientRect();
    hand.style.left = (rect.x + rect.width / 2) + 'px';
    hand.style.top = (rect.y + rect.height / 2 - 8) + 'px';
    hand.classList.remove('hidden');
  }

  function tutorSay(text) {
    $('#tutor-text').innerHTML = text;
    $('#tutor-bubble').classList.remove('hidden');
  }

  function startTutorial(afterFn) {
    mode = 'tutorial';
    tutor = { step: 1, after: afterFn || function () { showScreen('menu'); } };
    game = new Game({ mode: 'endless', size: 8 });
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) game.board[r][c] = null;
    for (var c2 = 0; c2 < 5; c2++) game.board[7][c2] = { c: 3, gem: false, ice: 0 };
    game.pieces = [findShape(3, 1, 3), null, null];
    armedBooster = null;
    $('#boosters').classList.add('hidden');
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
    requestAnimationFrame(function () {
      tutorSay('Dra pjäsen till <b>nedersta raden</b> så att den blir helt full &ndash; då rensas den! 💥');
      pointHandAtSlot();
    });
  }

  function endTutorial(completed) {
    $('#tutor-bubble').classList.add('hidden');
    $('#tutor-hand').classList.add('hidden');
    $('#boosters').classList.remove('hidden');
    var after = tutor && tutor.after;
    tutor = null;
    if (completed) {
      localStorage.setItem('bloxis.tutorialDone', '1');
      mode = 'endless';
      showOverlay({
        title: 'Klart! 🎉',
        html: '<p>Du kan det viktigaste! Kom ihåg:</p><ul>' +
          '<li>Flera linjer samtidigt och kedjade rensningar ger <b>kombopoäng</b>.</li>' +
          '<li><b>Boosters</b> under pjäslådan hjälper när det kör ihop sig.</li>' +
          '<li>Prova <b>banorna</b> och <b>dagens utmaning</b> för mynt och stjärnor!</li></ul>',
        buttons: [{ label: 'Nu kör vi!', primary: true, fn: after || function () {} }]
      });
    } else {
      mode = 'endless';
    }
  }

  function tutorOnPlace(res) {
    Sound.place();
    updateHud();
    if (res.nLines > 0) {
      spawnEffects(res.cleared);
      Sound.clear(res.nLines);
      renderBoard();
      if (tutor.step === 1) {
        tutor.step = 2;
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) game.board[r][c] = null;
        for (var r2 = 2; r2 < 8; r2++) game.board[r2][3] = { c: 5, gem: false, ice: 0 };
        game.pieces = [findShape(1, 2, 2), null, null];
        setTimeout(function () {
          renderBoard();
          renderTray(true);
          tutorSay('Snyggt! 🎉 Även <b>kolumner</b> rensas när de blir fulla. Fyll kolumnen!');
          pointHandAtSlot();
        }, 500);
      } else {
        setTimeout(function () { endTutorial(true); }, 500);
      }
    } else {
      game.undo();
      renderBoard();
      renderTray(false);
      tutorSay('Nästan! Lägg pjäsen så att den <b>markerade linjen blir helt full</b>.');
      pointHandAtSlot();
    }
    return true;
  }

  function tutorialDone() { return !!localStorage.getItem('bloxis.tutorialDone'); }

  /* Kör guiden först för helt nya spelare, sedan den valda handlingen. */
  function withTutorial(fn) {
    if (tutorialDone()) fn();
    else startTutorial(fn);
  }

  function restartCurrent() {
    Sound.click();
    if (mode === 'tutorial') return;
    if (mode === 'endless') startEndless(endlessCfg);
    else if (mode === 'daily') startDaily();
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
        stats.bestEndless = Math.max(stats.bestEndless, g.score);
        saveStats();
        var coins = Math.floor(g.score / 200);
        if (coins > 0) { store.addCoins(coins); Sound.coin(); }
        Sound.lose();
        showOverlay({
          title: 'Spelet är slut!',
          html: (isRecord ? '🎉 Nytt rekord!' : 'Bra spelat!') +
            '<span class="score-big">' + g.score + ' p</span>' +
            endlessCfg.size + '×' + endlessCfg.size + ' ' + DIFFS[endlessCfg.diff].label +
            ' &bull; Rekord: ' + store.getBestFor(endlessCfg) +
            (coins > 0 ? ' &bull; +' + coins + ' 💰' : ''),
          buttons: [
            { label: 'Spela igen', primary: true, fn: function () { startEndless(endlessCfg); } },
            { label: 'Ändra läge', fn: showEndlessChooser },
            { label: 'Till menyn', fn: function () { showScreen('menu'); } }
          ]
        });
      } else if (mode === 'daily') {
        if (g.status === 'won') {
          var d = getDaily();
          var today = todayStr();
          var firstWinToday = !d.history[today];
          if (firstWinToday) {
            d.streak = d.lastWin === daysAgoStr(1) ? d.streak + 1 : 1;
            d.lastWin = today;
            d.history[today] = true;
            store.setJson('bloxis.daily', d);
            stats.dailyWins++;
            stats.maxStreak = Math.max(stats.maxStreak, d.streak);
            saveStats();
          }
          var dCoins = firstWinToday ? 30 + 5 * Math.min(d.streak, 10) : 0;
          if (dCoins) store.addCoins(dCoins);
          Sound.win();
          buzz([30, 40, 30]);
          showOverlay({
            title: 'Dagens utmaning klarad!',
            stars: g.stars(),
            html: '<span class="score-big">' + g.score + ' p</span>' +
              '🔥 Streak: <b>' + d.streak + '</b> dagar' +
              (dCoins ? ' &bull; +' + dCoins + ' 💰' : '') +
              calendarHtml(),
            buttons: [{ label: 'Till menyn', primary: true, fn: function () { showScreen('menu'); } }]
          });
          playStarSounds(g.stars());
        } else {
          Sound.lose();
          showOverlay({
            title: 'Det gick inte den här gången',
            html: g.lossReason === 'moves'
              ? 'Dragen tog slut. Du kan försöka igen så många gånger du vill!'
              : 'Ingen pjäs fick plats på brädet. Försök igen!',
            buttons: [
              { label: 'Försök igen', primary: true, fn: startDaily },
              { label: 'Till menyn', fn: function () { showScreen('menu'); } }
            ]
          });
        }
      } else if (g.status === 'won') {
        var stars = g.stars();
        store.setStars(levelIndex, stars);
        var coinsWon = 10 * stars;
        store.addCoins(coinsWon);
        stats.levelsWon++;
        saveStats();
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
          html: '<span class="score-big">' + g.score + ' p</span>+' + coinsWon + ' 💰',
          buttons: buttons
        });
        playStarSounds(stars);
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
    if (mode === 'tutorial') return tutorOnPlace(res);
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
    if (res.nLines > 0) {
      stats.linesTotal += res.nLines;
      stats.maxLines = Math.max(stats.maxLines, res.nLines);
      stats.maxCombo = Math.max(stats.maxCombo, res.combo);
      saveStats();
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
      Sound.swap();
      stats.boosters.swap = true;
      saveStats();
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
      stats.boosters.undo = true;
      saveStats();
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
    stats.boosters[kind] = true;
    saveStats();
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
    ['🌵', '☀️', '🪨', '🦂'],
    ['⭐', '🌙', '☄️', '🪐']
  ];
  var WORLD_EMOJI = ['🌿', '❄️', '🌵', '🌟'];

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

    if (wi === 3) { // rymden: gnistrande stjärnor
      for (var si = 0; si < 26; si++) {
        var sr = seeded(wi * 71 + si * 3);
        var e2 = document.createElementNS(SVGNS, 'ellipse');
        e2.setAttribute('cx', (sr * 97 + 1.5).toFixed(1));
        e2.setAttribute('cy', Math.round(seeded(si * 7 + 2) * (segH - 60) + 30));
        e2.setAttribute('rx', (0.3 + sr * 0.5).toFixed(2));
        e2.setAttribute('ry', (1.2 + sr * 2).toFixed(1));
        e2.setAttribute('fill', 'rgba(255,255,255,' + (0.2 + sr * 0.4).toFixed(2) + ')');
        svg.appendChild(e2);
      }
    }
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
      banner.innerHTML = twe(WORLD_EMOJI[wi] + ' ' + w.name);
      banner.style.top = (bottomY - 52) + 'px';
      inner.appendChild(banner);

      for (var ci = 0; ci < 2; ci++) {
        var cloud = document.createElement('div');
        cloud.className = 'cloud';
        cloud.innerHTML = twe('☁️');
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
        deco.innerHTML = twe(emoji);
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
      el.innerHTML = twe(
        '<span class="num">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        (done ? '<span class="stars">' + starStr + '</span>'
          : '<span class="stars">' + (lv.type === 'gems' ? '💎' : lv.type === 'ice' ? '🧊' : lv.type === 'collect' ? '🎨' : '🎯') + '</span>'));
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
      pin.innerHTML = twe('📍');
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
        '<li><b>🧊 Is</b> kräver två rensningar. <b>💎 Ädelstenar</b> rensas med sin rad.</li>' +
        '<li><b>Boosters</b> köps med mynt: 🔨 ta bort ett block, 💣 spräng 3&times;3, 🔄 byt pjäser, ↩️ ångra.</li>' +
        '<li>Mynt tjänar du på banor, dagliga utmaningar och utmärkelser.</li>' +
        '</ul>' +
        '<p style="font-size:0.72rem;opacity:0.7;margin-top:10px">Ikoner: Twemoji (CC-BY 4.0) &bull; Ljud: Kenney.nl (CC0) &bull; Typsnitt: Grenze Gotisch &amp; Averia Serif Libre (OFL)</p>',
      buttons: [
        { label: 'Spela guiden', fn: function () { startTutorial(function () { showScreen('menu'); }); } },
        { label: 'Stäng', primary: true, fn: function () {} }
      ]
    });
  }

  /* ===== Knappar ===== */
  function boot() { Sound.unlock(); Sound.click(); Music.sync(); }
  $('#btn-endless').addEventListener('click', function () { boot(); withTutorial(showEndlessChooser); });
  $('#btn-levels').addEventListener('click', function () { boot(); withTutorial(function () { showScreen('levels'); }); });
  $('#btn-daily').addEventListener('click', function () { boot(); withTutorial(startDaily); });
  $('#btn-help').addEventListener('click', function () { boot(); showHelp(); });
  $('#btn-settings').addEventListener('click', function () { boot(); showSettings(); });
  $('#btn-achievements').addEventListener('click', function () { boot(); showAchievements(); });
  $('#btn-restart').addEventListener('click', restartCurrent);
  document.querySelectorAll('.btn-back').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Sound.click();
      endDrag(false);
      armedBooster = null;
      hideOverlay();
      if (mode === 'tutorial') {
        endTutorial(false);
        showScreen('menu');
        return;
      }
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

  /* ===== Eldflugor som svävar över skärmarna ===== */
  (function () {
    var wrap = document.createElement('div');
    wrap.className = 'fireflies';
    for (var i = 0; i < 12; i++) {
      var f = document.createElement('span');
      f.className = 'firefly';
      f.style.left = (5 + seeded(i * 3 + 1) * 90) + '%';
      f.style.top = (8 + seeded(i * 7 + 2) * 84) + '%';
      f.style.setProperty('--fdx', ((seeded(i * 11 + 3) - 0.5) * 90) + 'px');
      f.style.setProperty('--fdy', ((seeded(i * 5 + 4) - 0.5) * 110) + 'px');
      f.style.setProperty('--fdur', (7 + seeded(i * 13 + 5) * 8) + 's');
      f.style.setProperty('--fdelay', (-seeded(i * 17 + 6) * 10) + 's');
      wrap.appendChild(f);
    }
    var app = document.getElementById('app');
    app.insertBefore(wrap, app.firstChild);
  })();

  showScreen('menu');
})();
