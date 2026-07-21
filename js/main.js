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

  /* Vilken värld hör bana i till? */
  function worldOf(i) {
    for (var w = 0; w < WORLDS.length; w++) {
      if (i <= WORLDS[w].to) return w;
    }
    return WORLDS.length - 1;
  }

  /* Engångsmigrering: banlistan växte från 5 världar à 10 banor till
     7 världar à 12 – flytta sparade stjärnor till de nya indexen
     (position 0-8 behålls, gamla finalen på plats 9 blir plats 11). */
  (function migrateStars() {
    if ((+localStorage.getItem('bloxis.levelsVer') || 1) >= 2) return;
    var old = store.getStars();
    var moved = {};
    Object.keys(old).forEach(function (k) {
      var i = +k;
      if (isNaN(i)) return;
      var w = Math.floor(i / 10), p = i % 10;
      moved[w * 12 + (p < 9 ? p : 11)] = old[k];
    });
    localStorage.setItem('bloxis.stars', JSON.stringify(moved));
    localStorage.setItem('bloxis.levelsVer', '2');
  })();

  /* ===== Inställningar ===== */
  var settings = (function () {
    var def = { sound: true, music: true, vibration: true, colorblind: false };
    var saved = store.getJson('bloxis.settings', {});
    for (var k in saved) def[k] = saved[k];
    return def;
  })();
  function saveSettings() { store.setJson('bloxis.settings', settings); }

  /* ===== Ikoner: UI-kärnikonerna är våra egna SVG:er i sagostil
     (assets/icons). Twemoji (CC-BY 4.0) används bara som naturdekor
     på kartan och för enstaka listikoner. ===== */
  var ICONS = {
    '💰': 'coin', '⭐': 'star', '🌟': 'star-glow', '🔥': 'flame',
    '🔨': 'hammer', '💣': 'bomb', '🔄': 'swap', '↩': 'undo',
    '🎩': 'hat', '🏅': 'medal', '⚙': 'gear', '🧩': 'puzzle',
    '📅': 'calendar', '💎': 'gem', '🧊': 'ice', '🎨': 'palette',
    '🎯': 'target', '🔒': 'lock', '🎉': 'party', '🏆': 'trophy',
    '👁': 'eye', '🔊': 'sound', '🎵': 'note', '📳': 'vibrate'
  };
  var TWEMOJI = {
    '📍': '1f4cd', '☁': '2601', '🌲': '1f332', '🌳': '1f333', '🌷': '1f337',
    '🍄': '1f344', '🦋': '1f98b', '🏔': '1f3d4', '❄': '2744', '⛄': '26c4',
    '🌵': '1f335', '☀': '2600', '🪨': '1faa8', '🦂': '1f982',
    '🌙': '1f319', '☄': '2604', '🪐': '1fa90', '🌿': '1f33f',
    '👆': '1f446', '🌱': '1f331', '🧹': '1f9f9', '💥': '1f4a5',
    '🌋': '1f30b', '⚡': '26a1', '🗺': '1f5fa', '🧰': '1f9f0',
    '👻': '1f47b', '🔮': '1f52e', '🦇': '1f987', '🕯': '1f56f'
  };
  var TW_RE = new RegExp('(' + Object.keys(ICONS).concat(Object.keys(TWEMOJI)).join('|') + ')\\uFE0F?', 'g');
  function twe(html) {
    return String(html).replace(TW_RE, function (_, ch) {
      var src = ICONS[ch] ? 'assets/icons/' + ICONS[ch] + '.svg'
        : 'assets/twemoji/' + TWEMOJI[ch] + '.svg';
      return '<img class="twe" draggable="false" alt="' + ch + '" src="' + src + '">';
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
      star: function (i) { tone(700 + i * 200, 0.24, 'triangle', 0.22); tone(1400 + i * 400, 0.18, 'sine', 0.08, 0.03); },
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
      win: function () {
        sample('confirm', 0.6);
        [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.3]].forEach(function (n) {
          tone(n[0], 0.24, 'triangle', 0.22, n[1]);
        });
        tone(262, 0.6, 'sine', 0.14, 0.3);      // bas under fanfaren
        tone(1047, 0.75, 'triangle', 0.18, 0.46);
        tone(1568, 0.6, 'sine', 0.1, 0.52);     // skimmer överst
      },
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
      for (var i = WORLDS[0].from; i <= WORLDS[0].to; i++) if ((st[i] || 0) < 3) return false;
      return true;
    } },
    { id: 'boosters', icon: '🧰', name: 'Verktygslådan', desc: 'Använd alla fyra boosters', coins: 20, test: function (s) { return Object.keys(s.boosters || {}).length >= 4; } },
    { id: 'daily1', icon: '📅', name: 'Dagens hjälte', desc: 'Klara en daglig utmaning', coins: 20, test: function (s) { return s.dailyWins >= 1; } },
    { id: 'streak3', icon: '🔥', name: 'På rad', desc: '3 dagars streak i dagliga utmaningen', coins: 40, test: function (s) { return s.maxStreak >= 3; } }
  ];

  var ACH_BY_ID = {};
  ACH.forEach(function (a) { ACH_BY_ID[a.id] = a; });

  /* Garderobsföremål som låses upp av utmärkelser (kan inte köpas). */
  var ACH_GEAR = {
    world1: 'Lagerkrans',
    streak3: 'Månkrona',
    combo5: 'Månstav',
    score5k: 'Stjärnspira',
    levels10: 'Drakfjäll-färgen',
    score1k: 'Stjärnögon',
    triple: 'Drakvingar',
    combo3: 'Stjärnkind'
  };

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
          showToast('🏅 ' + a.name + '  +' + a.coins + ' 💰' +
            (ACH_GEAR[a.id] ? ' • 🎁 ' + ACH_GEAR[a.id] + '!' : ''));
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
      var gear = ACH_GEAR[a.id] ? ' • 🎁 ' + ACH_GEAR[a.id] : '';
      return '<div class="ach-row' + (got ? '' : ' locked') + '">' +
        '<span class="ach-icon">' + a.icon + '</span>' +
        '<span><div class="ach-name">' + a.name + '</div><div class="ach-desc">' + a.desc + gear + '</div></span>' +
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

  /* ===== Avatar och garderob =====
     price 0 = gratis (de fyra första färgerna/ögonfärgerna är basutbudet),
     ach = exklusiv utmärkelsebelöning som inte kan köpas. */
  var AVATAR_COLORS = [
    { id: 'rosa', name: 'Rosa', body: '#ff6dc8', belly: '#ffd2ec', price: 0 },
    { id: 'gron', name: 'Älvgrön', body: '#4ddb9a', belly: '#c9f5e2', price: 0 },
    { id: 'bla', name: 'Himmelsblå', body: '#5aa8f0', belly: '#cfe6fb', price: 0 },
    { id: 'gul', name: 'Solgul', body: '#ffc84d', belly: '#ffedc2', price: 0 },
    { id: 'lila', name: 'Skymningslila', body: '#a06df0', belly: '#e2d2fb', price: 60 },
    { id: 'eld', name: 'Eldröd', body: '#ff6b5d', belly: '#ffd9d2', price: 60 },
    { id: 'hav', name: 'Havsblå', body: '#38b6d9', belly: '#c9edf8', price: 70 },
    { id: 'smaragd', name: 'Smaragd', body: '#2fae6b', belly: '#c3ecd4', price: 90 },
    { id: 'korall', name: 'Korall', body: '#ff8f66', belly: '#ffdccc', price: 90 },
    { id: 'korsbar', name: 'Körsbär', body: '#d9506e', belly: '#f7ccd8', price: 100 },
    { id: 'frost', name: 'Frostvit', body: '#dde5f2', belly: '#ffffff', price: 80 },
    { id: 'natt', name: 'Nattsvart', body: '#4a4460', belly: '#b9b2d0', price: 80 },
    { id: 'guld', name: 'Gyllene', body: '#ffd27a', belly: '#fff3d6', price: 150 },
    { id: 'drake', name: 'Drakfjäll', body: '#3aa88f', belly: '#c2ead9', ach: 'levels10' }
  ];
  var AVATAR_EYES = [
    { id: 'brun', name: 'Brun', iris: '#5b3a24', price: 0 },
    { id: 'blaogon', name: 'Blå', iris: '#3d6fd9', price: 0 },
    { id: 'gronogon', name: 'Grön', iris: '#2e8f5b', price: 0 },
    { id: 'gra', name: 'Grå', iris: '#6e7787', price: 0 },
    { id: 'barnsten', name: 'Bärnsten', iris: '#c9862e', price: 50 },
    { id: 'violett', name: 'Violett', iris: '#8a5cd9', price: 60 },
    { id: 'turkos', name: 'Turkos', iris: '#2fb6b0', price: 60 },
    { id: 'rubin', name: 'Rubin', iris: '#c93a4e', price: 80 },
    { id: 'is', name: 'Isblå', iris: '#8fd2e8', price: 80 },
    { id: 'guldogon', name: 'Guldögon', iris: '#d9a72e', price: 120 },
    { id: 'stjarnogon', name: 'Stjärnögon', iris: '#e8b93a', star: true, ach: 'score1k' }
  ];
  var AVATAR_HATS = [
    { id: 'ingen', name: 'Bara öron', price: 0 },
    { id: 'wizard', name: 'Trollkarlshatt', price: 0 },
    { id: 'blomster', name: 'Blomsterkrans', price: 80 },
    { id: 'svamp', name: 'Svamphatt', price: 90 },
    { id: 'tomte', name: 'Tomteluva', price: 100 },
    { id: 'pirat', name: 'Piratbandana', price: 100 },
    { id: 'viking', name: 'Vikingahjälm', price: 110 },
    { id: 'haxa', name: 'Häxhatt', price: 120 },
    { id: 'riddare', name: 'Riddarhjälm', price: 120 },
    { id: 'gloria', name: 'Gloria', price: 140 },
    { id: 'krona', name: 'Guldkrona', price: 150 },
    { id: 'lagerkrans', name: 'Lagerkrans', ach: 'world1' },
    { id: 'mankrona', name: 'Månkrona', ach: 'streak3' }
  ];
  var AVATAR_ITEMS = [
    { id: 'ingen', name: 'Inget', price: 0 },
    { id: 'fana', name: 'Äventyrsvimpel', price: 80 },
    { id: 'stav', name: 'Trollstav', price: 90 },
    { id: 'skold', name: 'Sköld', price: 100 },
    { id: 'lykta', name: 'Lykta', price: 110 },
    { id: 'yxa', name: 'Yxa', price: 110 },
    { id: 'kristall', name: 'Kristallkula', price: 120 },
    { id: 'svard', name: 'Svärd', price: 120 },
    { id: 'bok', name: 'Trollbok', price: 130 },
    { id: 'manstav', name: 'Månstav', ach: 'combo5' },
    { id: 'spira', name: 'Stjärnspira', ach: 'score5k' }
  ];
  var AVATAR_BACKS = [
    { id: 'ingen', name: 'Inget', price: 0 },
    { id: 'cape', name: 'Röd mantel', price: 110 },
    { id: 'alvvingar', name: 'Älvvingar', price: 130 },
    { id: 'fjaril', name: 'Fjärilsvingar', price: 150 },
    { id: 'stjarnmantel', name: 'Stjärnmantel', price: 170 },
    { id: 'drakvingar', name: 'Drakvingar', ach: 'triple' }
  ];
  var AVATAR_FACES = [
    { id: 'ingen', name: 'Inget', price: 0 },
    { id: 'kinder', name: 'Rosiga kinder', price: 40 },
    { id: 'fraknar', name: 'Fräknar', price: 50 },
    { id: 'glasogon', name: 'Glasögon', price: 90 },
    { id: 'ogonlapp', name: 'Ögonlapp', price: 100 },
    { id: 'monokel', name: 'Monokel', price: 110 },
    { id: 'stjarnkind', name: 'Stjärnkind', ach: 'combo3' }
  ];
  var AVATAR_LISTS = {
    hat: AVATAR_HATS, color: AVATAR_COLORS, item: AVATAR_ITEMS,
    eyes: AVATAR_EYES, back: AVATAR_BACKS, face: AVATAR_FACES
  };
  var AVATAR_SECTIONS = [
    ['hat', 'Hattar'], ['item', 'Föremål'], ['back', 'Rygg'],
    ['face', 'Ansikte'], ['color', 'Färger'], ['eyes', 'Ögonfärg']
  ];

  function getAvatar() {
    var a = store.getJson('bloxis.avatar', {}) || {};
    if (!a.hat) a.hat = 'wizard';
    if (!a.color) a.color = 'rosa';
    if (!a.item) a.item = 'ingen';
    if (!a.eyes) a.eyes = 'brun';
    if (!a.back) a.back = 'ingen';
    if (!a.face) a.face = 'ingen';
    if (!a.owned) a.owned = {};
    Object.keys(AVATAR_LISTS).forEach(function (k) {
      if (!a.owned[k]) a.owned[k] = [];
    });
    return a;
  }
  function saveAvatar(a) { store.setJson('bloxis.avatar', a); }

  /* Ritar avataren som SVG-sträng. cfg = { hat, color, item, eyes, back, face }. */
  function avatarSvg(cfg, size) {
    var hatId = cfg.hat, colorId = cfg.color, itemId = cfg.item;
    var col = AVATAR_COLORS.filter(function (c) { return c.id === colorId; })[0] || AVATAR_COLORS[0];
    var eyec = AVATAR_EYES.filter(function (e) { return e.id === cfg.eyes; })[0] || AVATAR_EYES[0];
    var eye = '#2b2144';
    var hat = '';
    if (hatId === 'wizard') {
      hat =
        '<path d="M23 1 L33.5 15.5 Q23 19.5 12.5 15.5 Z" fill="#4b3a8f"/>' +
        '<path d="M23 1 L28 8.5 Q23 10.5 18.5 8.3 Z" fill="#5d49a8"/>' +
        '<ellipse cx="23" cy="16" rx="14" ry="3.6" fill="#3b2d73"/>' +
        '<circle cx="23" cy="2.2" r="2" fill="#ffce6b"/>' +
        '<path d="M20 12 l1 -2.2 1 2.2 2.2 0.3 -1.6 1.5 0.4 2.2 -2 -1.1 -2 1.1 0.4 -2.2 -1.6 -1.5 Z" fill="#ffce6b"/>';
    } else if (hatId === 'krona') {
      hat =
        '<path d="M12.5 16.5 L12.5 8 L17.5 12 L23 4.5 L28.5 12 L33.5 8 L33.5 16.5 Z" fill="#ffce6b" stroke="#c67c2e" stroke-width="1.3"/>' +
        '<circle cx="23" cy="5" r="1.8" fill="#ff6dc8"/>' +
        '<circle cx="13" cy="8.4" r="1.5" fill="#2fc2a5"/>' +
        '<circle cx="33" cy="8.4" r="1.5" fill="#7d5cff"/>' +
        '<rect x="12.5" y="14.2" width="21" height="2.6" fill="#e8a94b"/>';
    } else if (hatId === 'blomster') {
      hat =
        '<circle cx="14" cy="13.5" r="3.4" fill="#ff6dc8"/><circle cx="14" cy="13.5" r="1.5" fill="#ffce6b"/>' +
        '<circle cx="23" cy="10" r="3.8" fill="#7d5cff"/><circle cx="23" cy="10" r="1.6" fill="#ffce6b"/>' +
        '<circle cx="32" cy="13.5" r="3.4" fill="#2fc2a5"/><circle cx="32" cy="13.5" r="1.5" fill="#ffce6b"/>' +
        '<path d="M17 15 Q20 12.5 20.5 12 M26 12.5 Q28.5 14 29 14.5" stroke="#2a5745" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    } else if (hatId === 'riddare') {
      hat =
        '<path d="M23 0.5 Q28 1.5 27 5.5 L19 5.5 Q18 1.5 23 0.5 Z" fill="#ff5d6c"/>' +
        '<path d="M11.5 16.5 Q11.5 5.5 23 5.5 Q34.5 5.5 34.5 16.5 Z" fill="#c3cede" stroke="#7e8ba3" stroke-width="1.3"/>' +
        '<rect x="21.5" y="5" width="3" height="7" rx="1.3" fill="#8fa0b8"/>' +
        '<path d="M13 13 Q23 10 33 13" stroke="#9dabc0" stroke-width="1.4" fill="none"/>';
    } else if (hatId === 'tomte') {
      hat =
        '<path d="M13 15 Q13.5 4 23 3 Q30.5 3.5 31.5 10 Q32 13 30 14.5 Z" fill="#d84a5f"/>' +
        '<circle cx="31.8" cy="12" r="2.7" fill="#fff"/>' +
        '<path d="M11.5 16.5 Q23 12.5 34.5 16.5 L34.5 19 Q23 15 11.5 19 Z" fill="#fff"/>';
    } else if (hatId === 'viking') {
      hat =
        '<path d="M12.5 14 Q7 12 6.5 5 Q11.5 7 14 12 Z" fill="#f2e8d0" stroke="#c9b89a" stroke-width="1"/>' +
        '<path d="M33.5 14 Q39 12 39.5 5 Q34.5 7 32 12 Z" fill="#f2e8d0" stroke="#c9b89a" stroke-width="1"/>' +
        '<path d="M12 16.5 Q12 7 23 7 Q34 7 34 16.5 Z" fill="#9aa8bc" stroke="#6e7c92" stroke-width="1.2"/>' +
        '<rect x="12" y="13.8" width="22" height="2.7" fill="#c67c2e"/>';
    } else if (hatId === 'haxa') {
      hat =
        '<path d="M23 0.5 Q33 2 29.5 7 L33.5 15.5 Q23 19.5 12.5 15.5 L18 6 Q20 2 23 0.5 Z" fill="#2e4a3a"/>' +
        '<path d="M23 0.5 Q28.5 1.5 27.5 4.5 Q24.5 3 22 4.5 Q22 2 23 0.5 Z" fill="#3d5f4b"/>' +
        '<ellipse cx="23" cy="16" rx="14.5" ry="3.6" fill="#233a2d"/>' +
        '<rect x="18.5" y="12.3" width="9" height="3" fill="#8a5a33"/>' +
        '<rect x="21" y="12" width="4" height="3.6" fill="none" stroke="#ffce6b" stroke-width="1.1"/>';
    } else if (hatId === 'svamp') {
      hat =
        '<path d="M10.5 15.5 Q10.5 3.5 23 3.5 Q35.5 3.5 35.5 15.5 Q23 18.5 10.5 15.5 Z" fill="#d84a4a"/>' +
        '<circle cx="16" cy="9.5" r="2.3" fill="#fff"/>' +
        '<circle cx="24.5" cy="6.8" r="1.8" fill="#fff"/>' +
        '<circle cx="30.5" cy="11" r="2" fill="#fff"/>' +
        '<path d="M11 15.2 Q23 18.2 35 15.2 L35 17 Q23 20 11 17 Z" fill="#f2e3d0"/>';
    } else if (hatId === 'pirat') {
      hat =
        '<path d="M12 16.5 Q12.5 6.5 23 6 Q33.5 6.5 34 16.5 Q23 13.5 12 16.5 Z" fill="#b93a4e"/>' +
        '<path d="M33 12 Q39 12.5 40.5 17.5 Q36 17 33.5 15 Z" fill="#b93a4e"/>' +
        '<circle cx="18" cy="10.5" r="1" fill="#fff"/>' +
        '<circle cx="24" cy="8.8" r="1" fill="#fff"/>' +
        '<circle cx="29" cy="11" r="1" fill="#fff"/>' +
        '<path d="M12 16.5 Q23 13.5 34 16.5 L34 18 Q23 15.2 12 18 Z" fill="#8f2536"/>';
    } else if (hatId === 'lagerkrans') {
      hat =
        '<ellipse cx="13.5" cy="14" rx="3.1" ry="1.7" fill="#c9b23d" transform="rotate(-42 13.5 14)"/>' +
        '<ellipse cx="16" cy="10.5" rx="3.1" ry="1.7" fill="#b8a13d" transform="rotate(-22 16 10.5)"/>' +
        '<ellipse cx="19.5" cy="8.3" rx="3.1" ry="1.7" fill="#c9b23d" transform="rotate(-8 19.5 8.3)"/>' +
        '<ellipse cx="32.5" cy="14" rx="3.1" ry="1.7" fill="#c9b23d" transform="rotate(42 32.5 14)"/>' +
        '<ellipse cx="30" cy="10.5" rx="3.1" ry="1.7" fill="#b8a13d" transform="rotate(22 30 10.5)"/>' +
        '<ellipse cx="26.5" cy="8.3" rx="3.1" ry="1.7" fill="#c9b23d" transform="rotate(8 26.5 8.3)"/>' +
        '<circle cx="23" cy="7.6" r="1.4" fill="#ffce6b"/>';
    } else if (hatId === 'mankrona') {
      hat =
        '<path d="M13 16.5 L13 10.5 L18 13 L23 8.5 L28 13 L33 10.5 L33 16.5 Z" fill="#d6dde8" stroke="#8fa0b8" stroke-width="1.2"/>' +
        '<path d="M23.5 1.5 A 4.4 4.4 0 1 0 27.3 8 A 3.4 3.4 0 1 1 23.5 1.5 Z" fill="#ffe9a8"/>' +
        '<circle cx="17.5" cy="12.6" r="1.1" fill="#7d5cff"/>' +
        '<circle cx="28.5" cy="12.6" r="1.1" fill="#2fc2a5"/>' +
        '<rect x="13" y="14.4" width="20" height="2.2" fill="#b9c4d6"/>';
    } else if (hatId === 'gloria') {
      hat =
        '<path d="M14 11 Q17 4 21 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<path d="M32 11 Q29 4 25 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="23" cy="4.5" rx="9" ry="2.8" fill="none" stroke="rgba(255,233,168,0.45)" stroke-width="5.5"/>' +
        '<ellipse cx="23" cy="4.5" rx="9" ry="2.8" fill="none" stroke="#ffce6b" stroke-width="2.4"/>';
    } else {
      hat =
        '<path d="M14 11 Q17 4 21 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<path d="M32 11 Q29 4 25 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    }
    var item = '';
    if (itemId === 'stav') {
      item =
        '<line x1="37.5" y1="45" x2="43" y2="29" stroke="#8a5a33" stroke-width="2.8" stroke-linecap="round"/>' +
        '<path d="M43 22.5 l1.3 2.7 3 0.45 -2.2 2.1 0.55 3 -2.65 -1.45 -2.65 1.45 0.55 -3 -2.2 -2.1 3 -0.45 Z" fill="#ffce6b"/>' +
        '<circle cx="38.6" cy="33.5" r="0.9" fill="#ffe9a8"/>' +
        '<circle cx="44.6" cy="31" r="0.7" fill="#ffe9a8"/>';
    } else if (itemId === 'svard') {
      item =
        '<path d="M42.3 19.5 L44.2 23 L43.3 36.5 L41.3 36.5 L40.4 23 Z" fill="#d6dde8" stroke="#8fa0b8" stroke-width="0.8"/>' +
        '<rect x="38.6" y="36.3" width="7.4" height="2.3" rx="1.1" fill="#c67c2e"/>' +
        '<rect x="41.2" y="38.4" width="2.3" height="5" rx="1.1" fill="#8a5a33"/>' +
        '<circle cx="42.35" cy="44.4" r="1.5" fill="#ffce6b"/>';
    } else if (itemId === 'skold') {
      item =
        '<path d="M2.5 26 Q9 23.5 15.5 26 Q15.5 36.5 9 41.5 Q2.5 36.5 2.5 26 Z" fill="#7d5cff" stroke="#c9b8ff" stroke-width="1.4"/>' +
        '<path d="M9 28 l1.15 2.35 2.6 0.4 -1.9 1.85 0.45 2.6 -2.3 -1.25 -2.3 1.25 0.45 -2.6 -1.9 -1.85 2.6 -0.4 Z" fill="#ffce6b"/>';
    } else if (itemId === 'lykta') {
      item =
        '<circle cx="41" cy="31.5" r="5.5" fill="rgba(255,220,130,0.22)"/>' +
        '<line x1="41" y1="23.5" x2="41" y2="26.6" stroke="#8a5a33" stroke-width="1.6"/>' +
        '<path d="M37.8 27 h6.4 l-0.9 -2.3 h-4.6 Z" fill="#4a4460"/>' +
        '<rect x="37.5" y="27" width="7" height="9.2" rx="2" fill="rgba(255,206,107,0.35)" stroke="#4a4460" stroke-width="1.4"/>' +
        '<circle cx="41" cy="31.6" r="2.1" fill="#ffe9a8"/>' +
        '<rect x="39.1" y="36" width="3.8" height="1.7" rx="0.8" fill="#4a4460"/>';
    } else if (itemId === 'fana') {
      item =
        '<line x1="39" y1="45" x2="42" y2="19" stroke="#8a5a33" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M42.2 19.5 L33.5 21.8 L41.7 24.8 Z" fill="#2fc2a5"/>' +
        '<path d="M42.2 19.5 L37.5 20.8 L41.9 22.4 Z" fill="#5fd8bf"/>' +
        '<circle cx="42.1" cy="18.4" r="1.4" fill="#ffce6b"/>';
    } else if (itemId === 'yxa') {
      item =
        '<line x1="38" y1="45" x2="42.5" y2="26" stroke="#8a5a33" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path d="M42.7 25.5 Q36.5 24 35 18.5 Q41 17.5 44.8 21 Q45.5 24 42.7 25.5 Z" fill="#c3cede" stroke="#7e8ba3" stroke-width="1"/>' +
        '<rect x="41" y="24.4" width="3.4" height="3" rx="1.2" fill="#6b7a91"/>';
    } else if (itemId === 'kristall') {
      item =
        '<circle cx="41" cy="31" r="6.5" fill="rgba(160,220,255,0.25)"/>' +
        '<circle cx="41" cy="31" r="4.6" fill="rgba(140,200,255,0.55)" stroke="#8fd2e8" stroke-width="1.2"/>' +
        '<path d="M38.8 29 Q40 27.4 42 28" stroke="#eaf7ff" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        '<path d="M37.6 36 h6.8 l-1.1 2.6 h-4.6 Z" fill="#8a5a33"/>';
    } else if (itemId === 'manstav') {
      item =
        '<line x1="37.5" y1="45" x2="42.5" y2="28" stroke="#6b5a8f" stroke-width="2.8" stroke-linecap="round"/>' +
        '<path d="M42 19.5 A 4.9 4.9 0 1 0 45.6 27.4 A 3.7 3.7 0 1 1 42 19.5 Z" fill="#dfe6ff"/>' +
        '<circle cx="38.4" cy="31.5" r="0.9" fill="#dfe6ff"/>' +
        '<circle cx="44.4" cy="30.5" r="0.7" fill="#dfe6ff"/>';
    } else if (itemId === 'spira') {
      item =
        '<line x1="38" y1="45" x2="42.5" y2="30" stroke="#c67c2e" stroke-width="2.8" stroke-linecap="round"/>' +
        '<circle cx="43" cy="26.6" r="3.5" fill="#7d5cff" stroke="#ffce6b" stroke-width="1.4"/>' +
        '<path d="M43 18.5 l1 2.1 2.3 0.35 -1.7 1.6 0.4 2.3 -2 -1.1 -2 1.1 0.4 -2.3 -1.7 -1.6 2.3 -0.35 Z" fill="#ffce6b"/>';
    } else if (itemId === 'bok') {
      item =
        '<g transform="rotate(8 40 36)">' +
        '<rect x="35.2" y="29.8" width="9.8" height="12.4" rx="1.6" fill="#5d3a8f" stroke="#3b2d73" stroke-width="1"/>' +
        '<rect x="36.6" y="31.2" width="7" height="9.6" rx="1" fill="#7d5cff"/>' +
        '<path d="M40.1 33.4 l0.9 1.85 2.05 0.3 -1.5 1.45 0.35 2.05 -1.8 -0.95 -1.8 0.95 0.35 -2.05 -1.5 -1.45 2.05 -0.3 Z" fill="#ffce6b"/>' +
        '</g>';
    }
    /* Rygg ritas bakom kroppen. */
    var back = '';
    if (cfg.back === 'cape') {
      back =
        '<path d="M10 22 Q4 38 11 47 L35 47 Q42 38 36 22 Q23 15 10 22 Z" fill="#b93a4e"/>' +
        '<path d="M13 24 Q9 37 13.5 45 L18 45 Q13.5 35 15.5 24.5 Z" fill="#9c2c3f"/>' +
        '<path d="M33 24 Q37 37 32.5 45 L28 45 Q32.5 35 30.5 24.5 Z" fill="#9c2c3f"/>';
    } else if (cfg.back === 'stjarnmantel') {
      back =
        '<path d="M10 22 Q4 38 11 47 L35 47 Q42 38 36 22 Q23 15 10 22 Z" fill="#3b2d73"/>' +
        '<path d="M13 24 Q9 37 13.5 45 L18 45 Q13.5 35 15.5 24.5 Z" fill="#2d2159"/>' +
        '<path d="M33 24 Q37 37 32.5 45 L28 45 Q32.5 35 30.5 24.5 Z" fill="#2d2159"/>' +
        '<circle cx="12.5" cy="30" r="1" fill="#ffe9a8"/>' +
        '<circle cx="14" cy="40" r="0.8" fill="#ffe9a8"/>' +
        '<circle cx="32" cy="33" r="1" fill="#ffe9a8"/>' +
        '<circle cx="34" cy="42" r="0.8" fill="#ffe9a8"/>';
    } else if (cfg.back === 'alvvingar') {
      back =
        '<path d="M8 26 Q-1 15 3.5 6.5 Q13 11 12 24 Z" fill="rgba(175,240,255,0.5)" stroke="rgba(130,205,235,0.9)" stroke-width="1.1"/>' +
        '<path d="M8.5 30 Q1 28 0.5 20 Q8 21.5 10.5 28 Z" fill="rgba(175,240,255,0.4)" stroke="rgba(130,205,235,0.8)" stroke-width="1"/>' +
        '<path d="M38 26 Q47 15 42.5 6.5 Q33 11 34 24 Z" fill="rgba(175,240,255,0.5)" stroke="rgba(130,205,235,0.9)" stroke-width="1.1"/>' +
        '<path d="M37.5 30 Q45 28 45.5 20 Q38 21.5 35.5 28 Z" fill="rgba(175,240,255,0.4)" stroke="rgba(130,205,235,0.8)" stroke-width="1"/>';
    } else if (cfg.back === 'fjaril') {
      back =
        '<path d="M9 25 Q-1 13 4 5.5 Q14 9.5 12.5 23 Z" fill="#c46df0" stroke="#8a4ab8" stroke-width="1.1"/>' +
        '<path d="M9 29 Q1.5 28.5 0.5 20.5 Q9 21 11 27.5 Z" fill="#ff9d5c" stroke="#c9702e" stroke-width="1"/>' +
        '<circle cx="6.5" cy="13" r="1.7" fill="#ffe9a8"/>' +
        '<path d="M37 25 Q47 13 42 5.5 Q32 9.5 33.5 23 Z" fill="#c46df0" stroke="#8a4ab8" stroke-width="1.1"/>' +
        '<path d="M37 29 Q44.5 28.5 45.5 20.5 Q37 21 35 27.5 Z" fill="#ff9d5c" stroke="#c9702e" stroke-width="1"/>' +
        '<circle cx="39.5" cy="13" r="1.7" fill="#ffe9a8"/>';
    } else if (cfg.back === 'drakvingar') {
      back =
        '<path d="M11 27 L1 9 L7 14.5 L8 6 L12 13.5 L16.5 8 L14.5 24 Z" fill="#3aa88f" stroke="#237a64" stroke-width="1.2"/>' +
        '<path d="M35 27 L45 9 L39 14.5 L38 6 L34 13.5 L29.5 8 L31.5 24 Z" fill="#3aa88f" stroke="#237a64" stroke-width="1.2"/>';
    }
    /* Ögon med vald irisfärg. */
    var eyes =
      '<circle cx="17" cy="24" r="3.1" fill="#fff"/><circle cx="29" cy="24" r="3.1" fill="#fff"/>' +
      '<circle cx="17.6" cy="24.5" r="1.9" fill="' + eyec.iris + '"/><circle cx="29.6" cy="24.5" r="1.9" fill="' + eyec.iris + '"/>' +
      '<circle cx="17.8" cy="24.7" r="0.95" fill="' + eye + '"/><circle cx="29.8" cy="24.7" r="0.95" fill="' + eye + '"/>';
    if (eyec.star) {
      eyes +=
        '<path d="M16.4 22.3 l0.5 1 1 0.5 -1 0.5 -0.5 1 -0.5 -1 -1 -0.5 1 -0.5 Z" fill="#fff"/>' +
        '<path d="M28.4 22.3 l0.5 1 1 0.5 -1 0.5 -0.5 1 -0.5 -1 -1 -0.5 1 -0.5 Z" fill="#fff"/>';
    } else {
      eyes += '<circle cx="16.4" cy="23.4" r="0.55" fill="#fff"/><circle cx="28.4" cy="23.4" r="0.55" fill="#fff"/>';
    }
    /* Ansikte ritas ovanpå ögonen. */
    var face = '';
    if (cfg.face === 'kinder') {
      face = '<ellipse cx="13" cy="28.8" rx="2.4" ry="1.5" fill="rgba(255,100,140,0.4)"/>' +
        '<ellipse cx="33" cy="28.8" rx="2.4" ry="1.5" fill="rgba(255,100,140,0.4)"/>';
    } else if (cfg.face === 'fraknar') {
      face = '<circle cx="12.5" cy="28.4" r="0.6" fill="rgba(90,50,30,0.55)"/>' +
        '<circle cx="14.5" cy="29.6" r="0.6" fill="rgba(90,50,30,0.55)"/>' +
        '<circle cx="12" cy="30.6" r="0.55" fill="rgba(90,50,30,0.55)"/>' +
        '<circle cx="33.5" cy="28.4" r="0.6" fill="rgba(90,50,30,0.55)"/>' +
        '<circle cx="31.5" cy="29.6" r="0.6" fill="rgba(90,50,30,0.55)"/>' +
        '<circle cx="34" cy="30.6" r="0.55" fill="rgba(90,50,30,0.55)"/>';
    } else if (cfg.face === 'glasogon') {
      face = '<circle cx="17" cy="24" r="4.5" fill="none" stroke="#3b2d73" stroke-width="1.5"/>' +
        '<circle cx="29" cy="24" r="4.5" fill="none" stroke="#3b2d73" stroke-width="1.5"/>' +
        '<path d="M21.5 23.5 Q23 22.5 24.5 23.5" stroke="#3b2d73" stroke-width="1.5" fill="none"/>' +
        '<line x1="12.5" y1="23.5" x2="9" y2="22.5" stroke="#3b2d73" stroke-width="1.4"/>' +
        '<line x1="33.5" y1="23.5" x2="37" y2="22.5" stroke="#3b2d73" stroke-width="1.4"/>';
    } else if (cfg.face === 'monokel') {
      face = '<circle cx="29" cy="24" r="4.4" fill="rgba(200,230,255,0.18)" stroke="#c9a24b" stroke-width="1.5"/>' +
        '<path d="M31 28 Q33 33 30.5 36.5" stroke="#c9a24b" stroke-width="1.1" fill="none"/>';
    } else if (cfg.face === 'ogonlapp') {
      face = '<path d="M8 20.5 Q23 15.5 38.5 24" stroke="#2b2144" stroke-width="1.7" fill="none"/>' +
        '<circle cx="29" cy="24" r="4" fill="#2b2144"/>' +
        '<path d="M27 23.2 Q29 22 31 23.2" stroke="#4a4460" stroke-width="0.9" fill="none"/>';
    } else if (cfg.face === 'stjarnkind') {
      face = '<path d="M13 27.2 l0.8 1.6 1.8 0.25 -1.3 1.25 0.3 1.8 -1.6 -0.85 -1.6 0.85 0.3 -1.8 -1.3 -1.25 1.8 -0.25 Z" fill="#ffce6b"/>' +
        '<circle cx="33" cy="29" r="0.7" fill="#ffe9a8"/>';
    }
    return '<svg viewBox="0 0 46 50" width="' + size + '" height="' + Math.round(size * 50 / 46) + '" aria-hidden="true">' +
      back +
      '<ellipse cx="23" cy="30" rx="17" ry="18" fill="' + col.body + '"/>' +
      '<ellipse cx="23" cy="35" rx="10" ry="9" fill="' + col.belly + '"/>' +
      eyes +
      '<path d="M19 31 Q23 34.5 27 31" stroke="' + eye + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      face + hat + item + '</svg>';
  }

  /* Ägs föremålet? Gratisföremål (pris 0) ägs alltid,
     utmärkelseföremål ägs via sin upplåsta achievement. */
  function avatarOwns(av, type, it) {
    if (it.ach) return !!store.getJson('bloxis.ach', {})[it.ach];
    if (!it.price) return true;
    return av.owned[type].indexOf(it.id) >= 0;
  }

  /* Avatarens utseende med ett föremål utbytt – för förhandsvisningar. */
  function avatarWith(av, type, id) {
    var cfg = { hat: av.hat, color: av.color, item: av.item, eyes: av.eyes, back: av.back, face: av.face };
    cfg[type] = id;
    return cfg;
  }

  function equipAvatar(type, id) {
    var a = getAvatar();
    a[type] = id;
    saveAvatar(a);
    if (screens.levels.classList.contains('active')) renderLevelMap();
  }

  /* Köpdialog med förhandsvisning – köpet sker först när man bekräftar. */
  function showBuyDialog(type, it) {
    var av = getAvatar();
    var coins = store.getCoins();
    var afford = coins >= it.price;
    showOverlay({
      title: 'Köpa ' + it.name + '?',
      html:
        '<div class="ward-preview buy-preview">' + avatarSvg(avatarWith(av, type, it.id), 120) + '</div>' +
        '<p class="buy-line">Så här skulle det se ut!</p>' +
        '<p class="ward-coins">Pris: <b>' + it.price + '</b> 💰 &ensp;•&ensp; Du har: <b>' + coins + '</b> 💰</p>' +
        (afford ? '' : '<p class="buy-warn">Du behöver ' + (it.price - coins) + ' 💰 till – spela banor och utmaningar!</p>'),
      buttons: afford ? [
        { label: 'Köp – ' + it.price + ' mynt', primary: true, fn: function () {
          var a = getAvatar();
          if (!store.spendCoins(it.price)) { showWardrobe(); return; }
          a.owned[type].push(it.id);
          saveAvatar(a);
          equipAvatar(type, it.id);
          Sound.coin();
          showToast('🎉 ' + it.name + ' köpt!');
          showWardrobe();
        } },
        { label: 'Avbryt', fn: showWardrobe }
      ] : [
        { label: 'Tillbaka', primary: true, fn: showWardrobe }
      ]
    });
  }

  function showWardrobe() {
    var av = getAvatar();
    function itemHtml(type, it) {
      var owned = avatarOwns(av, type, it);
      var equipped = av[type] === it.id;
      var label = equipped ? '✓ Vald'
        : owned ? (it.price || it.ach ? 'Byt' : 'Gratis')
        : it.ach ? '🏅 Utmärkelse'
        : it.price + ' 💰';
      return '<button class="ward-item' + (equipped ? ' equipped' : '') + (it.ach && !owned ? ' ach-locked' : '') + '"' +
        ' data-type="' + type + '" data-id="' + it.id + '">' +
        avatarSvg(avatarWith(av, type, it.id), 38) +
        '<span class="ward-name">' + it.name + '</span>' +
        '<span class="ward-price">' + label + '</span>' +
        '</button>';
    }
    showOverlay({
      title: '🎩 Garderob',
      html:
        '<div class="ward-preview">' + avatarSvg(av, 92) + '</div>' +
        '<p class="ward-coins">Dina mynt: <b>' + store.getCoins() + '</b> 💰</p>' +
        AVATAR_SECTIONS.map(function (sec) {
          return '<p class="ward-head">' + sec[1] + '</p>' +
            '<div class="ward-row">' +
            AVATAR_LISTS[sec[0]].map(function (it) { return itemHtml(sec[0], it); }).join('') +
            '</div>';
        }).join(''),
      buttons: [{ label: 'Klart', primary: true, fn: function () {} }]
    });
    document.querySelectorAll('#ov-text .ward-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-type');
        var id = btn.getAttribute('data-id');
        var it = AVATAR_LISTS[type].filter(function (x) { return x.id === id; })[0];
        var a = getAvatar();
        if (!avatarOwns(a, type, it)) {
          if (it.ach) {
            var req = ACH_BY_ID[it.ach];
            showToast('🏅 Lås upp "' + req.name + '": ' + req.desc);
            return;
          }
          hideOverlay();
          showBuyDialog(type, it);
          return;
        }
        Sound.click();
        equipAvatar(type, id);
        showWardrobe();
      });
    });
  }

  /* ===== Tillstånd ===== */
  var game = null;
  var mode = 'endless';      // 'endless' | 'level' | 'daily' | 'tutorial'
  var levelIndex = 0;
  var endlessCfg = getEndlessCfg();
  var tutor = null;          // { step, after }
  var pendingUnlock = null;  // { idx, first } – spelas upp på kartan efter banvinst

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

  /* Ljusar/mörkar en #rrggbb-färg med amt (-255..255). */
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.max(0, (n >> 16) + amt));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
    var b = Math.min(255, Math.max(0, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
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
      : opts.sand ? '#e0aa52'
      : opts.egg ? '#5a4d80'
      : opts.ghost ? '#8b84ad'
      : opts.key ? '#e8a94b'
      : opts.lock ? '#6e7787'
      : Shapes.PALETTE[colorIdx % Shapes.PALETTE.length];
    // bas med djup: ljus topp -> mörkare botten
    var base = ctx.createLinearGradient(0, y + pad, 0, y + pad + s);
    base.addColorStop(0, shade(color, 42));
    base.addColorStop(0.5, color);
    base.addColorStop(1, shade(color, -34));
    roundRectPath(ctx, x + pad, y + pad, s, s, rad);
    ctx.fillStyle = base;
    ctx.fill();
    // kantlinje i mörkare nyans håller ihop blocket
    ctx.strokeStyle = shade(color, -62);
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    // glansband upptill
    roundRectPath(ctx, x + pad + s * 0.1, y + pad + s * 0.07, s * 0.8, s * 0.3, rad * 0.7);
    var gloss = ctx.createLinearGradient(0, y + pad, 0, y + pad + s * 0.42);
    gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
    gloss.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = gloss;
    ctx.fill();
    // liten glanspunkt
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x + pad + s * 0.2, y + pad + s * 0.2, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    if (opts.gem) {
      // fasetterad ädelsten
      var cx2 = x + size / 2, cy2 = y + size / 2, d = s * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - d);
      ctx.lineTo(cx2 + d, cy2);
      ctx.lineTo(cx2, cy2 + d);
      ctx.lineTo(cx2 - d, cy2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - d);
      ctx.lineTo(cx2 + d, cy2);
      ctx.lineTo(cx2, cy2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,235,215,0.75)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 + d);
      ctx.lineTo(cx2 - d, cy2);
      ctx.lineTo(cx2, cy2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,150,130,0.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx2, cy2 - d);
      ctx.lineTo(cx2 + d, cy2);
      ctx.lineTo(cx2, cy2 + d);
      ctx.lineTo(cx2 - d, cy2);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,110,100,0.6)';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
      // gnista i övre facetten
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(cx2 - d * 0.3, cy2 - d * 0.35, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    if (opts.sand) {
      // sandkorn
      ctx.fillStyle = 'rgba(120,80,30,0.5)';
      [[0.28, 0.55, 0.05], [0.55, 0.35, 0.045], [0.72, 0.62, 0.05], [0.42, 0.76, 0.04]].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(x + size * p[0], y + size * p[1], size * p[2], 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.strokeStyle = 'rgba(120,80,30,0.35)';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.2, y + size * 0.45);
      ctx.quadraticCurveTo(x + size * 0.5, y + size * 0.36, x + size * 0.8, y + size * 0.45);
      ctx.stroke();
    }
    if (opts.egg > 0) {
      // drakägg med nedräkning
      var ecx = x + size / 2, ecy = y + size * 0.46;
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, size * 0.24, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e8e2f5';
      ctx.fill();
      ctx.strokeStyle = '#3d3359';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
      ctx.fillStyle = 'rgba(125,92,255,0.55)';
      ctx.beginPath();
      ctx.arc(ecx - size * 0.08, ecy - size * 0.05, size * 0.06, 0, Math.PI * 2);
      ctx.arc(ecx + size * 0.08, ecy + size * 0.08, size * 0.05, 0, Math.PI * 2);
      ctx.fill();
      var label = String(opts.egg);
      ctx.font = 'bold ' + Math.round(size * 0.3) + 'px "Averia Serif Libre", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.strokeStyle = '#2b2144';
      ctx.strokeText(label, x + size * 0.68, y + size * 0.78);
      ctx.fillStyle = opts.egg <= 4 ? '#ffb3a8' : '#ffe9a8';
      ctx.fillText(label, x + size * 0.68, y + size * 0.78);
    }
    if (opts.ghost) {
      // liten ande som svävar i blocket
      var gx = x + size / 2, gy = y + size * 0.5;
      var gw = size * 0.24;
      ctx.beginPath();
      ctx.moveTo(gx - gw, gy + gw * 1.1);
      ctx.lineTo(gx - gw, gy - gw * 0.2);
      ctx.arc(gx, gy - gw * 0.2, gw, Math.PI, 0);
      ctx.lineTo(gx + gw, gy + gw * 1.1);
      ctx.quadraticCurveTo(gx + gw * 0.55, gy + gw * 0.55, gx + gw * 0.33, gy + gw * 1.1);
      ctx.quadraticCurveTo(gx, gy + gw * 0.55, gx - gw * 0.33, gy + gw * 1.1);
      ctx.quadraticCurveTo(gx - gw * 0.55, gy + gw * 0.55, gx - gw, gy + gw * 1.1);
      ctx.closePath();
      ctx.fillStyle = 'rgba(235,232,250,0.95)';
      ctx.fill();
      ctx.fillStyle = '#3d3359';
      ctx.beginPath();
      ctx.arc(gx - gw * 0.4, gy - gw * 0.15, size * 0.045, 0, Math.PI * 2);
      ctx.arc(gx + gw * 0.4, gy - gw * 0.15, size * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    if (opts.key) {
      // nyckel
      var kx = x + size * 0.42, ky = y + size * 0.4;
      ctx.strokeStyle = '#fff3d6';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.arc(kx, ky, size * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(kx + size * 0.1, ky + size * 0.1);
      ctx.lineTo(kx + size * 0.3, ky + size * 0.3);
      ctx.moveTo(kx + size * 0.22, ky + size * 0.28);
      ctx.lineTo(kx + size * 0.3, ky + size * 0.2);
      ctx.stroke();
    }
    if (opts.lock) {
      // hänglås på stenblock
      var lx = x + size / 2, ly = y + size * 0.58;
      ctx.strokeStyle = '#454f5e';
      ctx.lineWidth = Math.max(1.5, size * 0.055);
      ctx.beginPath();
      ctx.arc(lx, ly - size * 0.14, size * 0.11, Math.PI, 0);
      ctx.stroke();
      var lw = size * 0.32, lh = size * 0.26;
      roundRectPath(ctx, lx - lw / 2, ly - size * 0.14, lw, lh, size * 0.05);
      ctx.fillStyle = '#c9b23d';
      ctx.fill();
      ctx.strokeStyle = '#8f7c22';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
      ctx.fillStyle = '#5a4d20';
      ctx.beginPath();
      ctx.arc(lx, ly - size * 0.02, size * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    if (settings.colorblind && !opts.gem && !opts.ice && !opts.sand && !opts.egg && !opts.ghost && !opts.key && !opts.lock) {
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
      // frostgnistor och ljus innerkant
      roundRectPath(ctx, x + pad + size * 0.05, y + pad + size * 0.05, s - size * 0.1, s - size * 0.1, rad * 0.7);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, size * 0.03);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      [[0.35, 0.4, 0.06], [0.68, 0.6, 0.045], [0.5, 0.75, 0.035]].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(x + size * p[0], y + size * p[1], size * p[2], 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  /* Stjärndimma: mjuk dis-slöja på tomma rutor som inte går att bygga på. */
  function drawMist(ctx, x, y, size, seed) {
    var pad = size * 0.06;
    var s = size - pad * 2;
    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, s, s, size * 0.14);
    ctx.fillStyle = 'rgba(170,160,215,0.3)';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(210,200,245,0.4)';
    var t = seeded(seed) * Math.PI * 2;
    [[0.3 + 0.06 * Math.sin(t), 0.42, 0.26], [0.62, 0.36 + 0.05 * Math.cos(t), 0.22], [0.5, 0.68, 0.24]].forEach(function (p) {
      ctx.beginPath();
      ctx.arc(x + size * p[0], y + size * p[1], size * p[2], 0, Math.PI * 2);
      ctx.fill();
    });
    // liten stjärna som blinkar i diset
    ctx.fillStyle = 'rgba(255,233,168,0.8)';
    var sx = x + size * (0.3 + 0.4 * seeded(seed + 7));
    var sy = y + size * (0.3 + 0.4 * seeded(seed + 13));
    ctx.beginPath();
    ctx.arc(sx, sy, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
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
        if (cellData) {
          drawBlock(ctx, x, y, cell, cellData.c, {
            gem: cellData.gem, ice: cellData.ice, sand: cellData.sand, egg: cellData.egg,
            ghost: cellData.ghost, key: cellData.key, lock: cellData.lock
          });
        } else if (game.mist && game.mist[r][c]) {
          drawMist(ctx, x, y, cell, r * S + c);
        }
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
        sand: a.cell.sand,
        egg: a.cell.egg,
        ghost: a.cell.ghost,
        key: a.cell.key,
        lock: a.cell.lock,
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

  /* Ljusa dis-puffar när stjärndimma lyfter. */
  function spawnMistPoof(lifted) {
    var cell = boardCanvas.width / bsize();
    var now = performance.now();
    lifted.forEach(function (m) {
      for (var i = 0; i < 5; i++) {
        particles.push({
          x: (m.c + 0.5) * cell,
          y: (m.r + 0.5) * cell,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -Math.random() * 1.2 - 0.3,
          size: cell * (0.1 + Math.random() * 0.12),
          color: 'rgba(210,200,245,0.9)',
          sprite: PARTICLE_SPRITES[i % PARTICLE_SPRITES.length],
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 2,
          born: now
        });
      }
    });
    ensureAnim();
  }

  function spawnEffects(cleared) {
    var cell = boardCanvas.width / bsize();
    var now = performance.now();
    cleared.forEach(function (cc) {
      clearAnims.push({ r: cc.r, c: cc.c, cell: cc.cell, start: now });
      var color = cc.cell.gem ? Shapes.GEM_COLOR
        : cc.cell.ice ? '#bfe6ff'
        : cc.cell.sand ? '#e0aa52'
        : cc.cell.egg ? '#c9b8ff'
        : cc.cell.ghost ? '#dcd7f5'
        : cc.cell.key ? '#ffce6b'
        : cc.cell.lock ? '#c9b23d'
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
    } else if (lv.type === 'sand') {
      hudObjective.innerHTML = ic('sand') + ' <b>' + game.sandLeft + '</b> kvar • ' + left + ' drag kvar';
    } else if (lv.type === 'mist') {
      hudObjective.innerHTML = ic('mist') + ' <b>' + game.mistLeft + '</b> kvar • ' + left + ' drag kvar';
    } else if (lv.type === 'eggs') {
      hudObjective.innerHTML = ic('egg') + ' <b>' + game.eggsLeft + '</b> kvar • ' + left + ' drag kvar';
    } else if (lv.type === 'ghosts') {
      hudObjective.innerHTML = ic('ghost') + ' <b>' + game.ghostsLeft + '</b> kvar • ' + left + ' drag kvar';
    } else if (lv.type === 'keys') {
      hudObjective.innerHTML = ic('key') + ' <b>' + game.keysLeft + '</b> kvar • ' + left + ' drag kvar';
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

  /* Tonar spelskärmens glöd efter världen (banläge) eller läget. */
  function setGameGlow(hue) {
    screens.game.style.setProperty('--world-hue', hue);
  }

  function startEndless(cfg) {
    endlessCfg = cfg || endlessCfg;
    mode = 'endless';
    game = new Game({ mode: 'endless', size: endlessCfg.size, shapeRamp: DIFFS[endlessCfg.diff].ramp });
    armedBooster = null;
    setGameGlow(258);
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
  }

  var COLOR_NAMES = ['röda', 'orange', 'gula', 'gröna', 'ljusblå', 'blå', 'lila', 'rosa'];

  function countChar(board, ch) {
    return board.join('').split('').filter(function (c) { return c === ch; }).length;
  }

  /* Egen ikon (assets/icons) som inline-bild i HTML-strängar. */
  function ic(name) {
    return '<img class="twe" draggable="false" alt="" src="assets/icons/' + name + '.svg">';
  }

  function objectiveHtml(lv) {
    if (lv.type === 'sand') {
      return '<p style="font-size:1.05rem">' + ic('sand') + ' Rensa all <b>sand</b> (' + countChar(lv.board, 'S') + ' rutor) på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Sanden <b>sprider sig</b> till en tom granne var ' + (lv.sandEvery || 3) + ':e drag – rensa den snabbare än den växer!</p>';
    }
    if (lv.type === 'mist') {
      return '<p style="font-size:1.05rem">' + ic('mist') + ' Lyft all <b>stjärndimma</b> (' + countChar(lv.board, 'M') + ' rutor) på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Det går inte att bygga i dimman – men en <b>rensning i rutan intill</b> blåser bort den.</p>';
    }
    if (lv.type === 'eggs') {
      return '<p style="font-size:1.05rem">' + ic('egg') + ' Rädda alla <b>' + countChar(lv.board, 'E') + ' drakägg</b> innan de kläcks!</p>' +
        '<p>Varje ägg har en <b>nedräkning</b> (' + (lv.eggTimer || 12) + ' drag). Rensa äggets rad eller kolumn i tid – kläcks ett ägg är banan förlorad.</p>';
    }
    if (lv.type === 'ghosts') {
      return '<p style="font-size:1.05rem">' + ic('ghost') + ' Fånga alla <b>' + countChar(lv.board, 'A') + ' andar</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>Andarna <b>svävar</b> till en ny ruta var ' + (lv.ghostEvery || 2) + ':e drag – rensa raden eller kolumnen där en ande står innan den smiter!</p>';
    }
    if (lv.type === 'keys') {
      return '<p style="font-size:1.05rem">' + ic('key') + ' Samla alla <b>' + countChar(lv.board, 'K') + ' nycklar</b> på högst <b>' + lv.moves + ' drag</b>.</p>' +
        '<p>' + ic('lock') + ' Låsen kan <b>inte rensas</b> och står i vägen tills alla nycklar är samlade – då krossas de på en gång.</p>';
    }
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
    setGameGlow(WORLDS[worldOf(idx)].hue);
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
    showObjectiveIntro(idx, true);
  }

  function playStarSounds(n, base, step) {
    base = base || 250; step = step || 400;
    for (var i = 0; i < n; i++) {
      (function (idx) {
        setTimeout(function () { Sound.star(idx); }, base + idx * step);
      })(i);
    }
  }

  /* Fullskärmsfirande: konfettiregn, titel, stjärnor som flyger in och
     en inforad (poäng/mynt). Konfettin drivs med Web Animations API –
     CSS-variabler i keyframes fungerar inte i Safari/WebKit. */
  function celebrate(starCount, title, infoHtml, after) {
    var cel = document.getElementById('celebrate');
    if (!cel) {
      cel = document.createElement('div');
      cel.id = 'celebrate';
      document.getElementById('app').appendChild(cel);
    }
    cel.innerHTML = '';
    cel.classList.remove('hidden');

    var t = document.createElement('div');
    t.className = 'cel-title';
    t.textContent = title;
    cel.appendChild(t);

    var row = document.createElement('div');
    row.className = 'cel-stars';
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('span');
      s.className = 'cel-star' + (i < starCount ? ' earned' : '');
      s.textContent = '★';
      if (i < starCount) s.style.animationDelay = (0.45 + i * 0.45) + 's';
      row.appendChild(s);
    }
    cel.appendChild(row);

    if (infoHtml) {
      var info = document.createElement('div');
      info.className = 'cel-info';
      info.innerHTML = twe(infoHtml);
      cel.appendChild(info);
    }

    var fallH = window.innerHeight + 80;
    for (var c = 0; c < 56; c++) {
      var p = document.createElement('span');
      p.className = 'confetti';
      var r1 = seeded(c * 7 + 1), r2 = seeded(c * 3 + 2), r3 = seeded(c * 5 + 3);
      p.style.left = (2 + r1 * 96) + '%';
      p.style.width = (6 + r2 * 6) + 'px';
      p.style.height = (10 + r3 * 8) + 'px';
      if (c % 5 === 0) p.style.borderRadius = '50%';
      p.style.background = ['#ffce6b', '#7d5cff', '#2fc2a5', '#ff6dc8'][c % 4];
      cel.appendChild(p);
      if (p.animate) {
        p.animate([
          { transform: 'translate3d(0, -30px, 0) rotate(0deg)', opacity: 1 },
          { transform: 'translate3d(' + ((r1 - 0.5) * 220) + 'px, ' + fallH + 'px, 0) rotate(' + (360 + r3 * 540) + 'deg)', opacity: 0.9 }
        ], {
          duration: 1700 + r3 * 1500,
          delay: r2 * 650,
          easing: 'cubic-bezier(0.25, 0.1, 0.6, 1)',
          fill: 'both'
        });
      } else {
        p.style.opacity = '0';
      }
    }

    playStarSounds(starCount, 450, 450);
    buzz([40, 60, 40]);
    setTimeout(function () {
      cel.classList.add('hidden');
      if (after) after();
    }, 1700 + starCount * 450);
  }

  function startDaily() {
    var dstr = todayStr();
    var lv = dailyLevel(dstr);
    mode = 'daily';
    // nivå 1-2-former: de största klossarna (3x3, femradingar) skulle göra
    // slumpade dagliga bräden för nyckfulla
    game = new Game({ mode: 'level', level: lv, rng: mulberry32(lv.pieceSeed), shapeRamp: { t2: 0, t3: 9999 } });
    armedBooster = null;
    setGameGlow(45);
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
          celebrate(g.stars(), 'Utmaning klarad!', null, function () {
            if (game !== g) return;
            showOverlay({
              title: 'Dagens utmaning klarad!',
              stars: g.stars(),
              html: '<span class="score-big">' + g.score + ' p</span>' +
                '🔥 Streak: <b>' + d.streak + '</b> dagar' +
                (dCoins ? ' &bull; +' + dCoins + ' 💰' : '') +
                calendarHtml(),
              buttons: [{ label: 'Till menyn', primary: true, fn: function () { showScreen('menu'); } }]
            });
          });
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
        var prevStars = store.getStars()[levelIndex] || 0;
        store.setStars(levelIndex, stars);
        var coinsWon = 10 * stars;
        store.addCoins(coinsWon);
        stats.levelsWon++;
        saveStats();
        Sound.win();
        // firande → direkt tillbaka till kartan där progressionen spelas upp
        celebrate(stars, 'Bana ' + (levelIndex + 1) + ' klarad!',
          '<b>' + g.score + ' p</b> • +' + coinsWon + ' 💰',
          function () {
            if (game !== g || !screens.game.classList.contains('active')) return;
            pendingUnlock = { idx: levelIndex, first: prevStars === 0 };
            showScreen('levels');
          });
      } else {
        Sound.lose();
        showOverlay({
          title: 'Det gick inte den här gången',
          html: g.lossReason === 'moves'
            ? 'Dragen tog slut innan målet nåddes.'
            : g.lossReason === 'egg'
            ? ic('egg') + ' Ett drakägg kläcktes! Rensa äggens rader eller kolumner innan nedräkningen når noll.'
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
    if (res.mistLifted && res.mistLifted.length) spawnMistPoof(res.mistLifted);
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
    ['⭐', '🌙', '☄️', '🪐'],
    ['🌋', '🪨', '🔥', '☄️'],
    ['🌲', '👻', '🍄', '🦇', '🕯️'],
    ['💎', '🔮', '🪨', '🕯️']
  ];
  var WORLD_EMOJI = ['🌿', '❄️', '🌵', '🌟', '🌋', '👻', '🔮'];

  /* Deterministiskt "slump"-värde 0..1 per index, så kartan ser likadan ut varje gång. */
  function seeded(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  /* Mjuk kurva som går exakt genom varje nodpunkt (Catmull-Rom → Bézier). */
  function crControls(pts, i) {
    var at = function (k) { return pts[Math.max(0, Math.min(pts.length - 1, k))]; };
    var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    return [
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6
    ];
  }

  function smoothPathD(pts) {
    if (pts.length < 2) return '';
    var d = 'M ' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    for (var i = 0; i < pts.length - 1; i++) {
      var c = crControls(pts, i);
      d += ' C ' + c[0].toFixed(2) + ' ' + c[1].toFixed(2) + ' ' + c[2].toFixed(2) + ' ' + c[3].toFixed(2) +
        ' ' + pts[i + 1][0].toFixed(2) + ' ' + pts[i + 1][1].toFixed(2);
    }
    return d;
  }

  /* Ett enskilt vägsegment i→i+1, för upplåsningsanimationen. */
  function segmentD(pts, i) {
    var c = crControls(pts, i);
    return 'M ' + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2) +
      ' C ' + c[0].toFixed(2) + ' ' + c[1].toFixed(2) + ' ' + c[2].toFixed(2) + ' ' + c[3].toFixed(2) +
      ' ' + pts[i + 1][0].toFixed(2) + ' ' + pts[i + 1][1].toFixed(2);
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
      var world = worldOf(i);
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
      el.style.setProperty('--d', ((i - WORLDS[world].from) * 0.045) + 's');
      var starStr = '';
      for (var s = 1; s <= 3; s++) starStr += s <= (stars[i] || 0) ? '★' : '☆';
      el.innerHTML = twe(
        '<span class="num">' + (unlocked ? (i + 1) : '🔒') + '</span>' +
        (done ? '<span class="stars">' + starStr + '</span>'
          : '<span class="stars">' + (
            lv.type === 'gems' ? '💎'
            : lv.type === 'ice' ? '🧊'
            : lv.type === 'collect' ? '🎨'
            : lv.type === 'sand' ? ic('sand')
            : lv.type === 'mist' ? ic('mist')
            : lv.type === 'eggs' ? ic('egg')
            : lv.type === 'ghosts' ? ic('ghost')
            : lv.type === 'keys' ? ic('key')
            : '🎯') + '</span>'));
      el.style.left = x + '%';
      el.style.top = y + 'px';
      if (unlocked) el.addEventListener('click', function () { Sound.click(); startLevel(i); });
      inner.appendChild(el);
    });

    // markera aktuell bana med puls + studsande kartnål
    if (currentIdx === -1) currentIdx = n - 1;
    var nodes = inner.querySelectorAll('.map-node');

    // upplåsningssekvens efter banvinst?
    var pu = pendingUnlock;
    pendingUnlock = null;
    var animateUnlock = !!(pu && pu.first && currentIdx === pu.idx + 1 &&
      nodes[currentIdx] && !nodes[currentIdx].classList.contains('locked'));

    var pin = null;
    if (nodes[currentIdx] && !nodes[currentIdx].classList.contains('locked')) {
      if (!animateUnlock) nodes[currentIdx].classList.add('current');
      var av = getAvatar();
      pin = document.createElement('div');
      pin.className = 'map-pin map-avatar';
      pin.innerHTML = avatarSvg(av, 46);
      pin.style.pointerEvents = 'auto';
      pin.style.cursor = 'pointer';
      pin.setAttribute('aria-label', 'Din avatar – öppna garderoben');
      pin.addEventListener('click', function () { Sound.click(); showWardrobe(); });
      var pinIdx = animateUnlock ? pu.idx : currentIdx;
      pin.style.left = points[pinIdx][0] + '%';
      pin.style.top = points[pinIdx][1] + 'px';
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
    var goldTo = animateUnlock ? pu.idx : currentIdx;
    if (goldTo > 0) {
      svg.appendChild(svgPath(smoothPathD(points.slice(0, goldTo + 1)), 'rgba(255,214,69,0.45)', '10', null, null));
    }
    var segEl = null;
    if (animateUnlock) {
      segEl = svgPath(segmentD(points, pu.idx), 'rgba(255,214,69,0.45)', '10', null, null);
      svg.appendChild(segEl);
    }
    svg.appendChild(svgPath(roadD, 'rgba(255,255,255,0.55)', '2', '5 9', 'trail'));
    inner.insertBefore(svg, inner.firstChild);

    wrap.appendChild(inner);

    // scrolla till aktuell bana (vid sekvens: börja vid den klarade)
    var focusIdx = animateUnlock ? pu.idx : currentIdx;
    var targetY = yForLevel(focusIdx, h) - wrap.clientHeight / 2;
    wrap.scrollTop = Math.max(0, Math.min(targetY, h - wrap.clientHeight));

    // liten guldblixt på den klarade noden även vid omspel
    if (pu && !animateUnlock && nodes[pu.idx]) {
      setTimeout(function () { nodes[pu.idx].classList.add('unlock-flash'); Sound.star(1); }, 300);
    }

    if (animateUnlock) {
      var clearedNode = nodes[pu.idx];
      var nextNode = nodes[currentIdx];
      // 1. den klarade noden blixtrar guld
      setTimeout(function () {
        if (clearedNode) clearedNode.classList.add('unlock-flash');
        Sound.star(0);
      }, 350);
      // 2. guldstigen ritar sig fram till nästa nod
      var segLen = segEl.getTotalLength();
      segEl.setAttribute('stroke-dasharray', segLen + ' ' + segLen);
      segEl.setAttribute('stroke-dashoffset', segLen);
      setTimeout(function () {
        segEl.style.transition = 'stroke-dashoffset 0.7s ease';
        segEl.setAttribute('stroke-dashoffset', '0');
      }, 850);
      // 3. kartnålen hoppar dit i en båge
      setTimeout(function () {
        if (!pin || !pin.animate) { finishUnlock(); return; }
        var w = wrap.clientWidth;
        var dx = (points[currentIdx][0] - points[pu.idx][0]) / 100 * w;
        var dy = points[currentIdx][1] - points[pu.idx][1];
        var anim = pin.animate([
          { transform: 'translate(0, 0)' },
          { transform: 'translate(' + dx / 2 + 'px, ' + (dy - 85) + 'px)' },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px)' }
        ], { duration: 750, easing: 'ease-in-out' });
        anim.onfinish = finishUnlock;
      }, 950);
      // scrolla med
      setTimeout(function () {
        var ty = yForLevel(currentIdx, h) - wrap.clientHeight / 2;
        wrap.scrollTo({ top: Math.max(0, Math.min(ty, h - wrap.clientHeight)), behavior: 'smooth' });
      }, 950);
      // 4. nästa nod poppar upplåst
      var finishUnlock = function () {
        if (pin) {
          pin.style.left = points[currentIdx][0] + '%';
          pin.style.top = points[currentIdx][1] + 'px';
          pin.style.transform = '';
        }
        if (nextNode) {
          nextNode.style.setProperty('--d', '0s');
          nextNode.classList.add('current', 'repop');
        }
        Sound.coin();
        buzz(30);
      };
    }
  }

  /* Banorna löper nedifrån och upp, som i Candy Crush. */
  function yForLevel(i, totalH) {
    return totalH - MAP_PAD - i * NODE_GAP - worldOf(i) * WORLD_GAP - 40;
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
        '<li>' + ic('sand') + ' <b>Sand</b> sprider sig om den får stå. ' + ic('mist') + ' <b>Stjärndimma</b> lyfts av en rensning intill. ' + ic('egg') + ' <b>Drakägg</b> måste rensas innan nedräkningen når noll.</li>' +
        '<li>' + ic('ghost') + ' <b>Andar</b> svävar till en ny ruta med jämna mellanrum. ' + ic('key') + ' <b>Nycklar</b> öppnar ' + ic('lock') + ' <b>låsen</b> – lås kan inte rensas förrän alla nycklar är samlade.</li>' +
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
  $('#btn-wardrobe').addEventListener('click', function () { boot(); showWardrobe(); });
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

  /* Testkrok för automatiserade UI-tester (används inte av spelet). */
  window.__bloxisTest = {
    forceWin: function () {
      if (game && game.status === 'playing') { game.status = 'won'; finishGame(); }
    },
    avatarSvg: avatarSvg
  };

  showScreen('menu');
})();
