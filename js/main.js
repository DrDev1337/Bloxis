/* Bloxis – UI, rendering och pekstyrning. */
(function () {
  'use strict';

  var Shapes = window.BloxisShapes;
  var LEVELS = window.BloxisLevels;
  var WORLDS = window.BloxisWorlds;
  var Game = window.BloxisGame;
  var SIZE = 8;

  var BOOSTER_PRICES = { hammer: 30, bomb: 60, swap: 20, undo: 25 };

  /* ===== Karaktärer =====
     Flera karaktärer med varsin progression. Karaktären med id 0
     använder de ursprungliga nycklarna (bloxis.stars …) så befintlig
     progress automatiskt blir första karaktären; övriga får prefixet
     bloxis.c<id>. Inställningar och språk delas. */
  var PER_CHAR_RE = /^bloxis\.(stars|chests|coins|best|ach|stats|quests|daily|endless|avatar|tutorialDone)(\.|$)/;
  var profiles = (function () {
    try {
      var p = JSON.parse(localStorage.getItem('bloxis.profiles'));
      if (p && p.chars && p.chars.length) return p;
    } catch (e) { /* korrupt – börja om */ }
    return { chars: [{ id: 0, name: 'Karaktär 1' }], cur: 0, next: 1 };
  })();
  function saveProfiles() { localStorage.setItem('bloxis.profiles', JSON.stringify(profiles)); }
  function curChar() {
    var c = profiles.chars.filter(function (x) { return x.id === profiles.cur; })[0];
    return c || profiles.chars[0];
  }
  function charKey(id, key) {
    if (id === 0 || !PER_CHAR_RE.test(key)) return key;
    return 'bloxis.c' + id + '.' + key.slice(7);
  }
  var LS = {
    get: function (key) { return localStorage.getItem(charKey(curChar().id, key)); },
    set: function (key, v) {
      localStorage.setItem(charKey(curChar().id, key), v);
      cloudSyncSoon();
    },
    remove: function (key) {
      localStorage.removeItem(charKey(curChar().id, key));
      cloudSyncSoon();
    }
  };
  /* Läser en annan karaktärs sparade JSON-värde (för listan i väljaren). */
  function readCharJson(id, key, fallback) {
    try { return JSON.parse(localStorage.getItem(charKey(id, key))) || fallback; }
    catch (e) { return fallback; }
  }
  /* Alla sparade nycklar för en karaktär som { kortnyckel: råvärde },
     t.ex. { stars: '{"0":3}', coins: '245' }. Grunden för både
     export/import och molnsynk. */
  function charBlob(id) {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (id === 0 ? PER_CHAR_RE.test(k) : k.indexOf('bloxis.c' + id + '.') === 0) {
        out[id === 0 ? k.slice(7) : k.slice(('bloxis.c' + id + '.').length)] = localStorage.getItem(k);
      }
    }
    return out;
  }
  function writeCharBlob(id, keys) {
    Object.keys(keys).forEach(function (short) {
      if (!PER_CHAR_RE.test('bloxis.' + short)) return;  // släpp bara igenom kända nycklar
      localStorage.setItem(charKey(id, 'bloxis.' + short), String(keys[short]));
    });
  }

  /* ===== Premium och molnsynk =====
     Klientflaggan styr bara vad UI:t visar – den riktiga spärren för
     molnsparning är backendens säkerhetsregler (se js/cloud.js). */
  var Cloud = window.BloxisCloud || { id: 'local', ready: false };
  function isPremium() { return localStorage.getItem('bloxis.premium') === '1'; }
  var cloudTimer = null;
  function cloudSyncSoon() {
    if (!isPremium() || !Cloud.ready || !Cloud.user || !Cloud.user()) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(function () {
      var chars = profiles.chars.map(function (c) {
        return { id: c.id, name: c.name, updated: Date.now(), keys: charBlob(c.id) };
      });
      Cloud.push(chars, function () {});
    }, 3000);
  }

  /* ===== Export/import av spardata =====
     Formatet BLX1.<base64url-json>.<fnv1a-kontrollsumma> är en hel
     karaktär som textkod – manuell flytt mellan enheter i dag, och
     felsäkring/supportverktyg när molnsynken finns. */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function b64uEnc(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDec(str) {
    var b = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return decodeURIComponent(escape(atob(b)));
  }
  function exportChar(id) {
    var c = profiles.chars.filter(function (x) { return x.id === id; })[0];
    var payload = b64uEnc(JSON.stringify({ v: 1, name: c ? c.name : '?', keys: charBlob(id) }));
    return 'BLX1.' + payload + '.' + fnv1a(payload);
  }
  /* Skapar en NY karaktär från en kod. Returnerar { ok, name } eller { ok:false, err }. */
  function importChar(code) {
    var m = /^\s*BLX1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})\s*$/.exec(String(code));
    if (!m || fnv1a(m[1]) !== m[2]) return { ok: false, err: 'bad' };
    var data;
    try { data = JSON.parse(b64uDec(m[1])); } catch (e) { return { ok: false, err: 'bad' }; }
    if (!data || data.v !== 1 || !data.keys) return { ok: false, err: 'bad' };
    if (profiles.chars.length >= 4) return { ok: false, err: 'full' };
    var name = String(data.name || t('charDefault', { n: profiles.chars.length + 1 })).slice(0, 14);
    var c = { id: profiles.next, name: name };
    profiles.chars.push(c);
    profiles.next++;
    saveProfiles();
    writeCharBlob(c.id, data.keys);
    return { ok: true, id: c.id, name: name };
  }

  /* ===== Lagring ===== */
  var store = {
    getBest: function () { return +LS.get('bloxis.best') || 0; },
    setBest: function (v) { LS.set('bloxis.best', String(v)); },
    /* Rekord per oändligt-konfiguration (storlek + svårighet). */
    getBestFor: function (cfg) {
      var v = +LS.get('bloxis.best.' + cfg.size + '.' + cfg.diff) || 0;
      if (!v && cfg.size === 8 && cfg.diff === 'klassisk') v = this.getBest();
      return v;
    },
    setBestFor: function (cfg, v) {
      LS.set('bloxis.best.' + cfg.size + '.' + cfg.diff, String(v));
      if (v > this.getBest()) this.setBest(v); // totalrekordet på menyn
    },
    getCoins: function () { return +LS.get('bloxis.coins') || 0; },
    addCoins: function (n) { LS.set('bloxis.coins', String(this.getCoins() + n)); },
    spendCoins: function (n) {
      if (this.getCoins() < n) return false;
      LS.set('bloxis.coins', String(this.getCoins() - n));
      return true;
    },
    getStars: function () {
      try { return JSON.parse(LS.get('bloxis.stars')) || {}; }
      catch (e) { return {}; }
    },
    setStars: function (levelIdx, stars) {
      var all = this.getStars();
      all[levelIdx] = Math.max(all[levelIdx] || 0, stars);
      LS.set('bloxis.stars', JSON.stringify(all));
    },
    getJson: function (key, fallback) {
      try { return JSON.parse(LS.get(key)) || fallback; }
      catch (e) { return fallback; }
    },
    setJson: function (key, v) { LS.set(key, JSON.stringify(v)); }
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
    /* gammalt format kan bara finnas i de oprefixade nycklarna (id 0) */
    var old;
    try { old = JSON.parse(localStorage.getItem('bloxis.stars')) || {}; }
    catch (e) { old = {}; }
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
    var def = { sound: true, music: true, vibration: true, colorblind: false, language: 'sv' };
    var saved = store.getJson('bloxis.settings', {});
    for (var k in saved) def[k] = saved[k];
    return def;
  })();
  function saveSettings() { store.setJson('bloxis.settings', settings); }

  /* ===== Språk ===== */
  var LANGS = window.BloxisLang;
  function t(key, vars) {
    var s = (LANGS[settings.language] || {})[key];
    if (s == null) s = LANGS.sv[key];
    if (s == null) return key;
    if (vars) {
      for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    }
    return s;
  }
  /* Som t() men med inline-svenska som reserv (namn på föremål m.m.). */
  function tOpt(key, fallback) {
    var s = (LANGS[settings.language] || {})[key];
    return s != null ? s : fallback;
  }
  function itemName(it) { return tOpt('it_' + it.id, it.name); }
  function worldName(wi) { return tOpt('world_' + wi, WORLDS[wi].name); }
  function achName(a) { return tOpt('ach_' + a.id + '_n', a.name); }
  function achDesc(a) { return tOpt('ach_' + a.id + '_d', a.desc); }

  /* Uppdaterar statiska texter i index.html (märkta med data-l). */
  function applyStaticLang() {
    document.documentElement.lang = settings.language;
    document.querySelectorAll('[data-l]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-l'));
    });
  }

  /* ===== Ikoner: UI-kärnikonerna är våra egna SVG:er i sagostil
     (assets/icons). Twemoji (CC-BY 4.0) används bara som naturdekor
     på kartan och för enstaka listikoner. ===== */
  var ICONS = {
    '💰': 'coin', '⭐': 'star', '🌟': 'star-glow', '🔥': 'flame',
    '🔨': 'hammer', '💣': 'bomb', '🔄': 'swap', '↩': 'undo',
    '🎩': 'hat', '🏅': 'medal', '⚙': 'gear', '🧩': 'puzzle',
    '📅': 'calendar', '💎': 'gem', '🧊': 'ice', '🎨': 'palette',
    '🎯': 'target', '🔒': 'lock', '🎉': 'party', '🏆': 'trophy',
    '👁': 'eye', '🔊': 'sound', '🎵': 'note', '📳': 'vibrate',
    '👥': 'team'
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
  /* HTML-escape för användartext (karaktärsnamn m.m.). */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ===== Ljud: Kenney-samplingar (CC0) med syntetiserad reserv ===== */
  var Sound = (function () {
    var ctx = null;
    var buffers = {};
    var samplesRequested = false;
    var SAMPLE_FILES = ['click', 'place', 'confirm', 'coin', 'boom', 'swap',
      'jingle-win1', 'jingle-win2', 'jingle-win3', 'jingle-win4', 'jingle-win5', 'jingle-chest'];
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
    /* Brusbuffert för jubel och applåder (skapas vid behov). */
    var noiseBuf = null;
    function noise(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    /* Ett brussvall genom bandpass – låter som en jublande publik. */
    function crowdSwell(c, t, dur, freq, vol) {
      var src = c.createBufferSource();
      var bp = c.createBiquadFilter();
      var g = c.createGain();
      src.buffer = noise(c);
      src.loop = true;
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq, t);
      bp.frequency.linearRampToValueAtTime(freq * 1.5, t + dur * 0.4);
      bp.Q.value = 0.8;
      src.connect(bp); bp.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t); src.stop(t + dur + 0.05);
    }
    /* Korta brusknäppar i oregelbunden rytm – applåder. */
    function claps(c, t, count, vol) {
      for (var i = 0; i < count; i++) {
        var ct = t + i * 0.09 + Math.random() * 0.05;
        var src = c.createBufferSource();
        var hp = c.createBiquadFilter();
        var g = c.createGain();
        src.buffer = noise(c);
        hp.type = 'highpass';
        hp.frequency.value = 1800 + Math.random() * 800;
        src.connect(hp); hp.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(vol * (0.6 + Math.random() * 0.4), ct);
        g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.05);
        src.start(ct); src.stop(ct + 0.07);
      }
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
        // slumpad segersjingel (Kenney pizzicato) med syntfanfar som reserv
        var v = 1 + Math.floor(Math.random() * 5);
        if (!sample('jingle-win' + v, 0.6)) {
          sample('confirm', 0.6);
          [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.3]].forEach(function (n) {
            tone(n[0], 0.24, 'triangle', 0.22, n[1]);
          });
          tone(262, 0.6, 'sine', 0.14, 0.3);
          tone(1047, 0.75, 'triangle', 0.18, 0.46);
        }
        tone(1568, 0.6, 'sine', 0.08, 0.52);    // skimmer överst
      },
      /* Jubel: publiksvall + applåder, intensitet 1-3. */
      cheer: function (n) {
        if (!settings.sound) return;
        var c = ac();
        if (!c) return;
        var t = c.currentTime + 0.05;
        crowdSwell(c, t, 1.4 + n * 0.3, 900, 0.05 + n * 0.02);
        crowdSwell(c, t + 0.15, 1.2 + n * 0.3, 1600, 0.035 + n * 0.015);
        claps(c, t + 0.1, 8 + n * 5, 0.05);
        if (n >= 3) claps(c, t + 0.9, 10, 0.04);
      },
      /* Kistöppning: jingel + stigande glissando + myntkaskad. */
      chest: function () {
        if (!sample('jingle-chest', 0.55)) {
          [[523, 0], [659, 0.08], [784, 0.16], [988, 0.24], [1319, 0.34]].forEach(function (n) {
            tone(n[0], 0.2, 'triangle', 0.18, n[1]);
          });
        }
        for (var i = 0; i < 6; i++) {
          tone(900 + i * 180, 0.1, 'square', 0.035, 0.5 + i * 0.09);
        }
      },
      lose: function () { [330, 262, 196].forEach(function (f, i) { tone(f, 0.22, 'sawtooth', 0.06, i * 0.16); }); }
    };
  })();

  function buzz(ms) {
    if (!settings.vibration) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ok */ } }
  }

  /* ===== Bakgrundsmusik (genererad arpeggio-loop med teman) =====
     Fyra teman med egen skala, tempo och klangfärg. Menyn/kartan får det
     lugna temat, dagsvärldarna det ljusa, nattvärldarna det mystiska och
     Drakberget det mörka. */
  var Music = (function () {
    var timer = null, nextTime = 0, step = 0;
    var THEMES = {
      lugn: {
        scale: [262, 294, 330, 392, 440, 523, 587, 659, 784],
        chords: [0, 3, 4, 2], tempo: 0.26, wave: 'triangle', bassWave: 'sine',
        vol: 0.03, bassVol: 0.045
      },
      ljus: {
        scale: [294, 330, 370, 440, 494, 587, 659, 740, 880],
        chords: [0, 4, 2, 5], tempo: 0.22, wave: 'triangle', bassWave: 'triangle',
        vol: 0.032, bassVol: 0.04
      },
      mystisk: {
        scale: [220, 247, 262, 330, 349, 440, 494, 523, 659],
        chords: [0, 5, 3, 4], tempo: 0.32, wave: 'sine', bassWave: 'sine',
        vol: 0.03, bassVol: 0.05
      },
      eld: {
        scale: [165, 196, 220, 247, 294, 330, 392, 440, 494],
        chords: [0, 3, 5, 2], tempo: 0.2, wave: 'sawtooth', bassWave: 'sine',
        vol: 0.016, bassVol: 0.055
      }
    };
    var current = 'lugn';
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
      var th = THEMES[current];
      while (nextTime < c.currentTime + 0.6) {
        var chord = th.chords[Math.floor(step / 8) % th.chords.length];
        var idx = (chord + ARP[step % 8]) % th.scale.length;
        note(c, th.scale[idx], nextTime, th.tempo * 1.25, th.vol, th.wave);
        if (step % 8 === 0) note(c, th.scale[chord] / 2, nextTime, th.tempo * 7, th.bassVol, th.bassWave);
        nextTime += th.tempo;
        step++;
      }
    }
    return {
      setTheme: function (name) {
        if (!THEMES[name] || name === current) return;
        current = name;
        step = 0;
      },
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
    latt: { key: 'diffEasy', ramp: { t2: 15, t3: 40 } },
    klassisk: { key: 'diffClassic', ramp: { t2: 6, t3: 16 } },
    svar: { key: 'diffHard', ramp: null }
  };
  var SIZE_OPTS = [8, 10, 12];

  function getEndlessCfg() {
    try {
      var c = JSON.parse(LS.get('bloxis.endless.cfg'));
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

  /* ===== Veckouppdrag =====
     Tre deterministiska uppdrag per ISO-vecka (samma för alla spelare).
     Progressen uppdateras via spelhändelser och belöningen hämtas i
     uppdragsdialogen. */
  var QUEST_POOL = [
    { id: 'lines', target: [50, 80], coins: [40, 60] },
    { id: 'multi', target: [6, 10], coins: [45, 65] },
    { id: 'combo3', target: [3, 5], coins: [45, 65] },
    { id: 'wins', target: [4, 7], coins: [50, 70] },
    { id: 'stars', target: [9, 15], coins: [50, 75] },
    { id: 'daily', target: [2, 3], coins: [50, 70] },
    { id: 'boosters', target: [3, 5], coins: [40, 60] },
    { id: 'endless', target: [1500, 2500], coins: [45, 70] }
  ];

  function isoWeekStr(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day + 3);
    var firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var fday = (firstThu.getUTCDay() + 6) % 7;
    firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
    var week = 1 + Math.round((date - firstThu) / 604800000);
    return date.getUTCFullYear() + '-W' + (week < 10 ? '0' : '') + week;
  }

  function getQuests() {
    var week = isoWeekStr(new Date());
    var q = store.getJson('bloxis.quests', null);
    if (!q || q.week !== week) {
      var rng = mulberry32(dateSeed(week + '#uppdrag'));
      var picks = [];
      while (picks.length < 3) {
        var idx = Math.floor(rng() * QUEST_POOL.length);
        if (picks.indexOf(idx) < 0) picks.push(idx);
      }
      q = {
        week: week,
        defs: picks.map(function (pi) {
          var p = QUEST_POOL[pi];
          var tier = rng() < 0.55 ? 0 : 1;
          return { id: p.id, target: p.target[tier], coins: p.coins[tier] };
        }),
        prog: [0, 0, 0],
        claimed: [false, false, false]
      };
      store.setJson('bloxis.quests', q);
    }
    return q;
  }

  function questClaimable(q) {
    var n = 0;
    q.defs.forEach(function (d, i) {
      if (!q.claimed[i] && q.prog[i] >= d.target) n++;
    });
    return n;
  }

  function questEvent(type, amount) {
    var q = getQuests();
    var changed = false;
    q.defs.forEach(function (d, i) {
      if (d.id !== type || q.claimed[i]) return;
      var before = q.prog[i];
      if (type === 'endless') q.prog[i] = Math.max(before, amount);
      else q.prog[i] = Math.min(d.target, before + amount);
      if (q.prog[i] !== before) changed = true;
      if (before < d.target && q.prog[i] >= d.target) {
        setTimeout(function () {
          showToast('🗒️ ' + t('questDone') + ': ' + questText(d) + ' • ' + t('questClaimHint'));
          Sound.star(1);
        }, 600);
      }
    });
    if (changed) store.setJson('bloxis.quests', q);
  }

  function questText(d) {
    return t('quest_' + d.id, { n: d.target });
  }

  function updateQuestBadge() {
    var el = $('#quest-badge');
    if (el) el.classList.toggle('hidden', questClaimable(getQuests()) === 0);
  }

  function showQuests() {
    var q = getQuests();
    var html = '<p class="quest-week">' + t('questWeek') + ' ' + q.week.replace('-W', ' • ' + t('questWeekShort') + ' ') + '</p>' +
      q.defs.map(function (d, i) {
        var done = q.prog[i] >= d.target;
        var claimed = q.claimed[i];
        var pct = Math.min(100, Math.round(100 * q.prog[i] / d.target));
        return '<div class="quest-row' + (claimed ? ' claimed' : done ? ' done' : '') + '">' +
          '<div class="quest-info"><div class="quest-name">' + questText(d) + '</div>' +
          '<div class="q-bar"><div class="q-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="quest-prog">' + Math.min(q.prog[i], d.target) + ' / ' + d.target + '</div></div>' +
          (claimed
            ? '<span class="quest-check">✓</span>'
            : done
            ? '<button class="btn quest-claim" data-q="' + i + '">' + t('questClaim') + ' +' + d.coins + ' 💰</button>'
            : '<span class="quest-reward">+' + d.coins + ' 💰</span>') +
          '</div>';
      }).join('');
    showOverlay({
      title: '🗒️ ' + t('menuQuests'),
      html: html,
      buttons: [{ label: t('close'), primary: true, fn: function () { updateQuestBadge(); } }]
    });
    document.querySelectorAll('#ov-text .quest-claim').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-q');
        var qq = getQuests();
        if (qq.claimed[i] || qq.prog[i] < qq.defs[i].target) return;
        qq.claimed[i] = true;
        store.setJson('bloxis.quests', qq);
        store.addCoins(qq.defs[i].coins);
        Sound.coin();
        buzz([30, 40, 30]);
        showQuests();
        if ($('#menu-coins')) $('#menu-coins').textContent = store.getCoins();
      });
    });
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
          showToast('🏅 ' + achName(a) + '  +' + a.coins + ' 💰' +
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
        '<span><div class="ach-name">' + achName(a) + '</div><div class="ach-desc">' + achDesc(a) + gear + '</div></span>' +
        '<span class="ach-coins">' + (got ? '✓' : '+' + a.coins + ' 💰') + '</span></div>';
    }).join('');
    showOverlay({
      title: t('achTitle'),
      html: html,
      buttons: [{ label: t('close'), primary: true, fn: function () {} }]
    });
  }

  function showSettings() {
    var rows = [
      ['sound', t('setSound')],
      ['music', t('setMusic')],
      ['vibration', t('setVibration')],
      ['colorblind', t('setColorblind')]
    ];
    var html = rows.map(function (r) {
      /* aria-label måste vara ren text – twe() får inte expandera emoji
         inuti attributet, då spricker citattecknen. */
      var plain = String(r[1]).replace(TW_RE, '').trim();
      return '<div class="toggle-row"><span>' + r[1] + '</span>' +
        '<button class="toggle' + (settings[r[0]] ? ' on' : '') + '" data-k="' + r[0] + '" aria-label="' + plain + '"></button></div>';
    }).join('') +
      '<div class="toggle-row"><span>' + t('setLanguage') + '</span>' +
      '<span class="choice-row lang-row">' +
      '<button class="choice' + (settings.language === 'sv' ? ' sel' : '') + '" data-lang="sv">Svenska</button>' +
      '<button class="choice' + (settings.language === 'en' ? ' sel' : '') + '" data-lang="en">English</button>' +
      '</span></div>' +
      '<div class="toggle-row"><span>' + t('setChar') + '</span>' +
      '<button id="ov-chars" class="btn charbtn">' + esc(curChar().name) + '</button></div>' +
      '<div class="toggle-row"><span>' + t('setData') + '</span>' +
      '<span class="choice-row">' +
      '<button id="ov-export" class="btn charbtn">' + t('dataExport') + '</button>' +
      '<button id="ov-import" class="btn charbtn">' + t('dataImport') + '</button>' +
      '</span></div>' +
      '<div class="toggle-row"><span>' + t('setCloud') + '</span>' +
      '<button id="ov-cloud" class="btn charbtn">' +
      (isPremium() && Cloud.ready ? t('cloudOn') : '🔒 ' + t('cloudLocked')) + '</button></div>' +
      '<div class="toggle-row"><span>' + t('setReset') + '</span>' +
      '<button id="ov-reset" class="btn danger">' + t('resetBtn') + '</button></div>';
    showOverlay({
      title: t('settingsTitle'),
      html: html,
      buttons: [{ label: t('done'), primary: true, fn: function () {} }]
    });
    document.querySelectorAll('#ov-text .toggle').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-k');
        settings[k] = !settings[k];
        saveSettings();
        el.classList.toggle('on', settings[k]);
        Sound.click();
        if (k === 'music') Music.sync();
        if (k === 'colorblind' && game) { renderBoard(); renderTray(false); }
      });
    });
    document.querySelectorAll('#ov-text [data-lang]').forEach(function (el) {
      el.addEventListener('click', function () {
        var lang = el.getAttribute('data-lang');
        if (settings.language === lang) return;
        settings.language = lang;
        saveSettings();
        Sound.click();
        applyStaticLang();
        if (screens.levels.classList.contains('active')) renderLevelMap();
        if (game) updateHud();
        showSettings();
      });
    });
    var charsBtn = document.getElementById('ov-chars');
    if (charsBtn) charsBtn.addEventListener('click', function () {
      Sound.click();
      showCharacters();
    });
    document.getElementById('ov-export').addEventListener('click', function () {
      Sound.click();
      showExport();
    });
    document.getElementById('ov-import').addEventListener('click', function () {
      Sound.click();
      showImport();
    });
    document.getElementById('ov-cloud').addEventListener('click', function () {
      Sound.click();
      showCloudInfo();
    });
    var resetBtn = document.getElementById('ov-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      Sound.click();
      showOverlay({
        title: t('resetTitle'),
        html: '<p>' + t('resetBody') + '</p>',
        buttons: [
          { label: t('resetConfirm'), primary: true, fn: function () {
            LS.remove('bloxis.stars');
            LS.remove('bloxis.chests');
            showToast(t('resetDone'));
            if ($('#menu-stars')) $('#menu-stars').textContent = '0';
            if (screens.levels.classList.contains('active')) renderLevelMap();
            showSettings();
          } },
          { label: t('cancel'), fn: showSettings }
        ]
      });
    });
  }

  /* ===== Karaktärsväljaren ===== */
  function charStars(id) {
    var st = readCharJson(id, 'bloxis.stars', {}) || {};
    return Object.keys(st).reduce(function (s, k) { return s + st[k]; }, 0);
  }
  function charCoins(id) {
    return +localStorage.getItem(charKey(id, 'bloxis.coins')) || 0;
  }
  /* Raderar alla sparade nycklar som tillhör en karaktär. */
  function wipeChar(id) {
    var doomed = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (id === 0 ? PER_CHAR_RE.test(k) : k.indexOf('bloxis.c' + id + '.') === 0) doomed.push(k);
    }
    doomed.forEach(function (k) { localStorage.removeItem(k); });
  }
  function switchChar(id) {
    profiles.cur = id;
    saveProfiles();
    endlessCfg = getEndlessCfg();
    showToast(t('charSwitched', { name: esc(curChar().name) }));
    showScreen('menu');
  }
  function showCharacters() {
    var html = profiles.chars.map(function (c) {
      var av = readCharJson(c.id, 'bloxis.avatar', {}) || {};
      var cfg = {
        hat: av.hat || 'wizard', color: av.color || 'rosa', item: av.item || 'ingen',
        eyes: av.eyes || 'brun', back: av.back || 'ingen', face: av.face || 'ingen'
      };
      var active = c.id === profiles.cur;
      return '<div class="char-row' + (active ? ' active' : '') + '">' +
        '<span class="char-av">' + avatarSvg(cfg, 44) + '</span>' +
        '<span class="char-info"><b>' + esc(c.name) + '</b>' +
        '<span class="char-meta">⭐ ' + charStars(c.id) + ' &ensp; 💰 ' + charCoins(c.id) + '</span></span>' +
        (active
          ? '<span class="char-cur">' + t('charCurrent') + '</span>'
          : '<button class="btn char-play" data-cid="' + c.id + '">' + t('charPlay') + '</button>' +
            '<button class="btn icon danger char-del" data-cid="' + c.id + '" aria-label="' + t('charDelete') + '">&#10005;</button>');
    }).map(function (row) { return row + '</div>'; }).join('') +
      (profiles.chars.length < 4
        ? '<button id="char-new" class="btn row char-new"><span class="mb-ic ic-teal">👥</span>' +
          '<span class="mb-label">' + t('charNew') + '</span></button>'
        : '<p class="char-max">' + t('charMax') + '</p>');
    showOverlay({
      title: t('charTitle'),
      html: html,
      buttons: [{ label: t('back'), primary: true, fn: showSettings }]
    });
    document.querySelectorAll('#ov-text .char-play').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Sound.click();
        hideOverlay();
        switchChar(+btn.getAttribute('data-cid'));
      });
    });
    document.querySelectorAll('#ov-text .char-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Sound.click();
        hideOverlay();
        confirmDeleteChar(+btn.getAttribute('data-cid'));
      });
    });
    var newBtn = document.getElementById('char-new');
    if (newBtn) newBtn.addEventListener('click', function () {
      Sound.click();
      hideOverlay();
      showNewChar();
    });
  }
  function showNewChar() {
    var defName = t('charDefault', { n: profiles.chars.length + 1 });
    showOverlay({
      title: t('charNew'),
      html: '<p>' + t('charNameLabel') + '</p>' +
        '<input id="char-name" class="char-input" maxlength="14" value="' + esc(defName) + '">',
      buttons: [
        { label: t('charCreate'), primary: true, fn: function () {
          var name = (document.getElementById('char-name').value || '').trim().slice(0, 14) || defName;
          var c = { id: profiles.next, name: name };
          profiles.chars.push(c);
          profiles.next++;
          saveProfiles();
          switchChar(c.id);
        } },
        { label: t('cancel'), fn: showCharacters }
      ]
    });
    var inp = document.getElementById('char-name');
    if (inp) { inp.focus(); inp.select(); }
  }
  function confirmDeleteChar(id) {
    var c = profiles.chars.filter(function (x) { return x.id === id; })[0];
    if (!c) { showCharacters(); return; }
    showOverlay({
      title: t('charDelTitle', { name: esc(c.name) }),
      html: '<p>' + t('charDelBody') + '</p>',
      buttons: [
        { label: t('charDelConfirm'), primary: true, fn: function () {
          wipeChar(id);
          profiles.chars = profiles.chars.filter(function (x) { return x.id !== id; });
          saveProfiles();
          showToast(t('charDeleted', { name: esc(c.name) }));
          showCharacters();
        } },
        { label: t('cancel'), fn: showCharacters }
      ]
    });
  }

  /* ===== Export/import-dialoger och molninfo ===== */
  function showExport() {
    var code = exportChar(profiles.cur);
    showOverlay({
      title: t('exportTitle'),
      html: '<p>' + t('exportBody', { name: esc(curChar().name) }) + '</p>' +
        '<textarea id="save-code" class="char-input code-area" readonly>' + code + '</textarea>' +
        '<button id="copy-code" class="btn charbtn">' + t('copyBtn') + '</button>',
      buttons: [{ label: t('back'), primary: true, fn: showSettings }]
    });
    var area = document.getElementById('save-code');
    area.addEventListener('focus', function () { area.select(); });
    document.getElementById('copy-code').addEventListener('click', function () {
      Sound.click();
      area.select();
      var done = function () { showToast(t('copied')); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () {
          document.execCommand('copy'); done();
        });
      } else {
        document.execCommand('copy'); done();
      }
    });
  }
  function showImport() {
    showOverlay({
      title: t('importTitle'),
      html: '<p>' + t('importBody') + '</p>' +
        '<textarea id="import-code" class="char-input code-area" placeholder="BLX1.…"></textarea>',
      buttons: [
        { label: t('importBtn'), primary: true, fn: function () {
          var res = importChar(document.getElementById('import-code').value);
          if (res.ok) {
            showToast(t('importOk', { name: esc(res.name) }));
            showCharacters();
          } else {
            showToast(res.err === 'full' ? t('importFull') : t('importBad'));
            showSettings();
          }
        } },
        { label: t('cancel'), fn: showSettings }
      ]
    });
  }
  function showCloudInfo() {
    showOverlay({
      title: t('cloudTitle'),
      html: '<p>' + t('cloudBody') + '</p>' +
        (isPremium() && Cloud.ready
          ? '<p class="ward-coins">' + t('cloudStatusOn', { backend: Cloud.id }) + '</p>'
          : '<p class="ward-coins">' + t('cloudStatusOff') + '</p>'),
      buttons: [{ label: t('back'), primary: true, fn: showSettings }]
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
    ['hat', 'wardHats'], ['item', 'wardItems'], ['back', 'wardBack'],
    ['face', 'wardFace'], ['color', 'wardColors'], ['eyes', 'wardEyes']
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
        '<circle cx="23" cy="2.2" r="2" fill="#ffce6b" class="av-tw" style="animation-delay:.5s"/>' +
        '<path d="M20 12 l1 -2.2 1 2.2 2.2 0.3 -1.6 1.5 0.4 2.2 -2 -1.1 -2 1.1 0.4 -2.2 -1.6 -1.5 Z" fill="#ffce6b" class="av-tw"/>';
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
        '<circle cx="23" cy="7.6" r="1.4" fill="#ffce6b" class="av-tw"/>';
    } else if (hatId === 'mankrona') {
      hat =
        '<path d="M13 16.5 L13 10.5 L18 13 L23 8.5 L28 13 L33 10.5 L33 16.5 Z" fill="#d6dde8" stroke="#8fa0b8" stroke-width="1.2"/>' +
        '<path d="M23.5 1.5 A 4.4 4.4 0 1 0 27.3 8 A 3.4 3.4 0 1 1 23.5 1.5 Z" fill="#ffe9a8" class="av-glow"/>' +
        '<circle cx="17.5" cy="12.6" r="1.1" fill="#7d5cff"/>' +
        '<circle cx="28.5" cy="12.6" r="1.1" fill="#2fc2a5"/>' +
        '<rect x="13" y="14.4" width="20" height="2.2" fill="#b9c4d6"/>';
    } else if (hatId === 'gloria') {
      hat =
        '<path d="M14 11 Q17 4 21 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<path d="M32 11 Q29 4 25 9" stroke="' + col.body + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="23" cy="4.5" rx="9" ry="2.8" fill="none" stroke="rgba(255,233,168,0.45)" stroke-width="5.5" class="av-glow"/>' +
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
        '<path d="M43 22.5 l1.3 2.7 3 0.45 -2.2 2.1 0.55 3 -2.65 -1.45 -2.65 1.45 0.55 -3 -2.2 -2.1 3 -0.45 Z" fill="#ffce6b" class="av-tw"/>' +
        '<circle cx="38.6" cy="33.5" r="0.9" fill="#ffe9a8" class="av-tw" style="animation-delay:.3s"/>' +
        '<circle cx="44.6" cy="31" r="0.7" fill="#ffe9a8" class="av-tw" style="animation-delay:.7s"/>';
    } else if (itemId === 'svard') {
      item =
        '<path d="M42.3 19.5 L44.2 23 L43.3 36.5 L41.3 36.5 L40.4 23 Z" fill="#d6dde8" stroke="#8fa0b8" stroke-width="0.8"/>' +
        '<rect x="38.6" y="36.3" width="7.4" height="2.3" rx="1.1" fill="#c67c2e"/>' +
        '<rect x="41.2" y="38.4" width="2.3" height="5" rx="1.1" fill="#8a5a33"/>' +
        '<circle cx="42.35" cy="44.4" r="1.5" fill="#ffce6b"/>';
    } else if (itemId === 'skold') {
      item =
        '<path d="M2.5 26 Q9 23.5 15.5 26 Q15.5 36.5 9 41.5 Q2.5 36.5 2.5 26 Z" fill="#7d5cff" stroke="#c9b8ff" stroke-width="1.4"/>' +
        '<path d="M9 28 l1.15 2.35 2.6 0.4 -1.9 1.85 0.45 2.6 -2.3 -1.25 -2.3 1.25 0.45 -2.6 -1.9 -1.85 2.6 -0.4 Z" fill="#ffce6b" class="av-tw"/>';
    } else if (itemId === 'lykta') {
      item =
        '<circle cx="41" cy="31.5" r="5.5" fill="rgba(255,220,130,0.22)" class="av-glow"/>' +
        '<line x1="41" y1="23.5" x2="41" y2="26.6" stroke="#8a5a33" stroke-width="1.6"/>' +
        '<path d="M37.8 27 h6.4 l-0.9 -2.3 h-4.6 Z" fill="#4a4460"/>' +
        '<rect x="37.5" y="27" width="7" height="9.2" rx="2" fill="rgba(255,206,107,0.35)" stroke="#4a4460" stroke-width="1.4"/>' +
        '<g class="av-flick">' +
        '<path d="M41 28.4 Q43.4 31 41 34.4 Q38.6 31 41 28.4 Z" fill="#ffb84d"/>' +
        '<path d="M41 30.2 Q42.3 31.7 41 33.5 Q39.7 31.7 41 30.2 Z" fill="#ffe9a8"/>' +
        '</g>' +
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
        '<circle cx="41" cy="31" r="6.5" fill="rgba(160,220,255,0.25)" class="av-glow"/>' +
        '<circle cx="41" cy="31" r="4.6" fill="rgba(140,200,255,0.55)" stroke="#8fd2e8" stroke-width="1.2"/>' +
        '<path d="M38.8 29 Q40 27.4 42 28" stroke="#eaf7ff" stroke-width="1.3" fill="none" stroke-linecap="round" class="av-tw"/>' +
        '<path d="M37.6 36 h6.8 l-1.1 2.6 h-4.6 Z" fill="#8a5a33"/>';
    } else if (itemId === 'manstav') {
      item =
        '<line x1="37.5" y1="45" x2="42.5" y2="28" stroke="#6b5a8f" stroke-width="2.8" stroke-linecap="round"/>' +
        '<path d="M42 19.5 A 4.9 4.9 0 1 0 45.6 27.4 A 3.7 3.7 0 1 1 42 19.5 Z" fill="#dfe6ff" class="av-glow"/>' +
        '<circle cx="38.4" cy="31.5" r="0.9" fill="#dfe6ff" class="av-tw"/>' +
        '<circle cx="44.4" cy="30.5" r="0.7" fill="#dfe6ff" class="av-tw" style="animation-delay:.5s"/>';
    } else if (itemId === 'spira') {
      item =
        '<line x1="38" y1="45" x2="42.5" y2="30" stroke="#c67c2e" stroke-width="2.8" stroke-linecap="round"/>' +
        '<circle cx="43" cy="26.6" r="3.5" fill="#7d5cff" stroke="#ffce6b" stroke-width="1.4"/>' +
        '<path d="M43 18.5 l1 2.1 2.3 0.35 -1.7 1.6 0.4 2.3 -2 -1.1 -2 1.1 0.4 -2.3 -1.7 -1.6 2.3 -0.35 Z" fill="#ffce6b" class="av-tw"/>';
    } else if (itemId === 'bok') {
      item =
        '<g transform="rotate(8 40 36)">' +
        '<rect x="35.2" y="29.8" width="9.8" height="12.4" rx="1.6" fill="#5d3a8f" stroke="#3b2d73" stroke-width="1"/>' +
        '<rect x="36.6" y="31.2" width="7" height="9.6" rx="1" fill="#7d5cff"/>' +
        '<path d="M40.1 33.4 l0.9 1.85 2.05 0.3 -1.5 1.45 0.35 2.05 -1.8 -0.95 -1.8 0.95 0.35 -2.05 -1.5 -1.45 2.05 -0.3 Z" fill="#ffce6b" class="av-tw"/>' +
        '</g>';
    }
    /* Rygg ritas bakom kroppen. Mantlarna är bredare än kroppen (x 6–40)
       så sidorna och fållen alltid syns bakom silhuetten. */
    var back = '';
    if (cfg.back === 'cape') {
      back =
        '<path d="M8 20.5 Q-2 36 6.5 48.6 L39.5 48.6 Q48 36 38 20.5 Q23 13 8 20.5 Z" fill="#b93a4e"/>' +
        '<path d="M10.5 23 Q4.5 36 9.5 47 L15 47 Q10 35 13 23.5 Z" fill="#9c2c3f"/>' +
        '<path d="M35.5 23 Q41.5 36 36.5 47 L31 47 Q36 35 33 23.5 Z" fill="#9c2c3f"/>' +
        '<path d="M6.5 48.6 L39.5 48.6 Q42 44 42.3 40 L37.5 46.6 L8.5 46.6 L3.7 40 Q4 44 6.5 48.6 Z" fill="#8f2536"/>';
    } else if (cfg.back === 'stjarnmantel') {
      back =
        '<path d="M8 20.5 Q-2 36 6.5 48.6 L39.5 48.6 Q48 36 38 20.5 Q23 13 8 20.5 Z" fill="#3b2d73"/>' +
        '<path d="M10.5 23 Q4.5 36 9.5 47 L15 47 Q10 35 13 23.5 Z" fill="#2d2159"/>' +
        '<path d="M35.5 23 Q41.5 36 36.5 47 L31 47 Q36 35 33 23.5 Z" fill="#2d2159"/>' +
        '<path d="M4.6 30.5 l0.7 1.4 1.4 0.7 -1.4 0.7 -0.7 1.4 -0.7 -1.4 -1.4 -0.7 1.4 -0.7 Z" fill="#ffe9a8" class="av-tw"/>' +
        '<path d="M7 40 l0.6 1.2 1.2 0.6 -1.2 0.6 -0.6 1.2 -0.6 -1.2 -1.2 -0.6 1.2 -0.6 Z" fill="#ffe9a8" class="av-tw" style="animation-delay:.4s"/>' +
        '<path d="M41.4 30.5 l0.7 1.4 1.4 0.7 -1.4 0.7 -0.7 1.4 -0.7 -1.4 -1.4 -0.7 1.4 -0.7 Z" fill="#ffe9a8" class="av-tw" style="animation-delay:.8s"/>' +
        '<path d="M39 40 l0.6 1.2 1.2 0.6 -1.2 0.6 -0.6 1.2 -0.6 -1.2 -1.2 -0.6 1.2 -0.6 Z" fill="#ffe9a8" class="av-tw" style="animation-delay:1.2s"/>' +
        '<circle cx="11" cy="46" r="0.8" fill="#ffe9a8" class="av-tw" style="animation-delay:.2s"/>' +
        '<circle cx="35" cy="46" r="0.8" fill="#ffe9a8" class="av-tw" style="animation-delay:.6s"/>';
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
        '<path d="M16.4 22.3 l0.5 1 1 0.5 -1 0.5 -0.5 1 -0.5 -1 -1 -0.5 1 -0.5 Z" fill="#fff" class="av-tw"/>' +
        '<path d="M28.4 22.3 l0.5 1 1 0.5 -1 0.5 -0.5 1 -0.5 -1 -1 -0.5 1 -0.5 Z" fill="#fff" class="av-tw" style="animation-delay:.4s"/>';
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
      face = '<path d="M13 27.2 l0.8 1.6 1.8 0.25 -1.3 1.25 0.3 1.8 -1.6 -0.85 -1.6 0.85 0.3 -1.8 -1.3 -1.25 1.8 -0.25 Z" fill="#ffce6b" class="av-tw"/>' +
        '<circle cx="33" cy="29" r="0.7" fill="#ffe9a8" class="av-tw" style="animation-delay:.5s"/>';
    }
    /* Drakfjäll: riktigt fjällmönster klippt mot kroppen + bukplattor. */
    var scales = '', belly = '';
    if (col.id === 'drake') {
      avatarSvg._n = (avatarSvg._n || 0) + 1;
      var uid = 'avsc' + avatarSvg._n;
      var sc = '';
      for (var sy = 15; sy < 49; sy += 4.5) {
        var off = (Math.round(sy / 4.5) % 2) ? 3 : 0;
        for (var sx = 3 + off; sx < 43; sx += 6) {
          sc += '<path d="M' + sx + ' ' + sy + ' a3 3 0 0 1 6 0" fill="none" stroke="#2c8a74" stroke-width="1.1"/>';
        }
      }
      scales = '<clipPath id="' + uid + '"><ellipse cx="23" cy="30" rx="17" ry="18"/></clipPath>' +
        '<g clip-path="url(#' + uid + ')">' + sc + '</g>';
      belly = '<path d="M15.5 31.5 Q23 34 30.5 31.5 M14.5 35.5 Q23 38.2 31.5 35.5 M15.5 39.5 Q23 42 30.5 39.5" ' +
        'stroke="#9fd6bf" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
    }
    /* Eldröd: glödande gnistor som stiger längs kroppen. */
    var fx = '';
    if (col.id === 'eld') {
      fx = '<circle cx="8.5" cy="34" r="1.1" fill="#ffb84d" class="av-ember"/>' +
        '<circle cx="37.5" cy="36" r="0.9" fill="#ff8a5c" class="av-ember" style="animation-delay:.6s"/>' +
        '<circle cx="5.5" cy="26" r="0.8" fill="#ffe9a8" class="av-ember" style="animation-delay:1.2s"/>';
    }
    return '<svg viewBox="0 0 46 50" width="' + size + '" height="' + Math.round(size * 50 / 46) + '" aria-hidden="true">' +
      back +
      '<ellipse cx="23" cy="30" rx="17" ry="18" fill="' + col.body + '"/>' +
      scales +
      '<ellipse cx="23" cy="35" rx="10" ry="9" fill="' + col.belly + '"/>' +
      belly + eyes +
      '<path d="M19 31 Q23 34.5 27 31" stroke="' + eye + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      face + hat + item + fx + '</svg>';
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
    if ($('#menu-avatar')) $('#menu-avatar').innerHTML = avatarSvg(a, 40);
  }

  /* Köpdialog med förhandsvisning – köpet sker först när man bekräftar. */
  function showBuyDialog(type, it) {
    var av = getAvatar();
    var coins = store.getCoins();
    var afford = coins >= it.price;
    showOverlay({
      title: t('buyTitle', { name: itemName(it) }),
      html:
        '<div class="ward-preview buy-preview">' + avatarSvg(avatarWith(av, type, it.id), 120) + '</div>' +
        '<p class="buy-line">' + t('buyPreview') + '</p>' +
        '<p class="ward-coins">' + t('buyPrice', { price: it.price, coins: coins }) + '</p>' +
        (afford ? '' : '<p class="buy-warn">' + t('buyMissing', { n: it.price - coins }) + '</p>'),
      buttons: afford ? [
        { label: t('buyBtn', { n: it.price }), primary: true, fn: function () {
          var a = getAvatar();
          if (!store.spendCoins(it.price)) { showWardrobe(); return; }
          a.owned[type].push(it.id);
          saveAvatar(a);
          equipAvatar(type, it.id);
          Sound.coin();
          showToast(t('bought', { name: itemName(it) }));
          showWardrobe();
        } },
        { label: t('cancel'), fn: showWardrobe }
      ] : [
        { label: t('back'), primary: true, fn: showWardrobe }
      ]
    });
  }

  function showWardrobe() {
    var av = getAvatar();
    function itemHtml(type, it) {
      var owned = avatarOwns(av, type, it);
      var equipped = av[type] === it.id;
      var label = equipped ? t('wardChosen')
        : owned ? (it.price || it.ach ? t('wardSwap') : t('wardFree'))
        : it.ach ? t('achievementBadge')
        : it.price + ' 💰';
      return '<button class="ward-item' + (equipped ? ' equipped' : '') + (it.ach && !owned ? ' ach-locked' : '') + '"' +
        ' data-type="' + type + '" data-id="' + it.id + '">' +
        avatarSvg(avatarWith(av, type, it.id), 38) +
        '<span class="ward-name">' + itemName(it) + '</span>' +
        '<span class="ward-price">' + label + '</span>' +
        '</button>';
    }
    showOverlay({
      title: t('wardTitle'),
      html:
        '<div class="ward-preview">' + avatarSvg(av, 92) + '</div>' +
        '<p class="ward-coins">' + t('wardCoins') + ' <b>' + store.getCoins() + '</b> 💰</p>' +
        AVATAR_SECTIONS.map(function (sec) {
          return '<p class="ward-head">' + t(sec[1]) + '</p>' +
            '<div class="ward-row">' +
            AVATAR_LISTS[sec[0]].map(function (it) { return itemHtml(sec[0], it); }).join('') +
            '</div>';
        }).join(''),
      buttons: [{ label: t('done'), primary: true, fn: function () {} }]
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
            showToast(t('unlockReq', { name: achName(req), desc: achDesc(req) }));
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
  var hudGameRef = null;     // vilket parti mål-HUD:ens struktur byggdes för
  var objMax = 0;            // målets totalsumma (växer om sanden sprider sig)

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

  /* ===== Blocklogotyp =====
     BLOXIS byggs av spelets riktiga block: varje färg renderas en gång
     med drawBlock till en liten bild som blir bokstävernas "pixlar".
     Entrén fyller hela väggen rad för rad, sedan rensas utfyllnaden
     som en radrensning och bokstäverna blir kvar. */
  var LOGO_GLYPHS = {
    B: ['1110', '1001', '1110', '1001', '1110'],
    L: ['100', '100', '100', '100', '111'],
    O: ['0110', '1001', '1001', '1001', '0110'],
    X: ['10001', '01010', '00100', '01010', '10001'],
    I: ['111', '010', '010', '010', '111'],
    S: ['0111', '1000', '0110', '0001', '1110']
  };
  var LOGO_COLORS = { B: 2, L: 6, O: 3, X: 0, I: 4, S: 1 };
  var LOGO_CLEAR_MS = 1150;   // när radrensningen startar
  var logoBlockCache = {};
  function logoBlockUrl(colorIdx) {
    if (!logoBlockCache[colorIdx]) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      drawBlock(cv.getContext('2d'), 0, 0, 48, colorIdx);
      logoBlockCache[colorIdx] = cv.toDataURL();
    }
    return logoBlockCache[colorIdx];
  }
  function renderLogo() {
    var host = document.querySelector('.logo');
    if (!host) return;
    var letters = 'BLOXIS'.split('');
    var totalCols = letters.reduce(function (s, ch) { return s + LOGO_GLYPHS[ch][0].length; }, 0) +
      letters.length - 1;
    function cellHtml(row, col, ch) {
      var drop = (4 - row) * 55 + col * 14;
      var inner = ch
        ? '<span class="lg-b lb" style="background-image:url(' + logoBlockUrl(LOGO_COLORS[ch]) + ');' +
          'animation-delay:' + (LOGO_CLEAR_MS + 140 + col * 8) + 'ms"></span>'
        : '<span class="lg-b fill" style="animation-delay:' + (LOGO_CLEAR_MS + col * 10) + 'ms"></span>';
      return '<span class="lg-c" style="animation-delay:' + drop + 'ms">' + inner + '</span>';
    }
    var html = '<div class="logo-grid" style="grid-template-columns:repeat(' + totalCols + ', var(--lgc))" aria-hidden="true">';
    for (var row = 0; row < 5; row++) {
      var col = 0;
      letters.forEach(function (ch, li) {
        var g = LOGO_GLYPHS[ch];
        for (var c = 0; c < g[0].length; c++, col++) {
          html += cellHtml(row, col, g[row].charAt(c) === '1' ? ch : null);
        }
        if (li < letters.length - 1) { html += cellHtml(row, col, null); col++; }
      });
    }
    host.innerHTML = html + '</div>';
  }

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
      updateQuestBadge();
      var stars = store.getJson('bloxis.stars', {}) || {};
      $('#menu-stars').textContent = Object.keys(stars).reduce(function (s, k) { return s + stars[k]; }, 0);
      $('#menu-avatar').innerHTML = avatarSvg(getAvatar(), 40);
      renderLogo();
    }
    if (name === 'menu' || name === 'levels') Music.setTheme('lugn');
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
      hudSub.textContent = t('guide');
      hudObjective.classList.add('hidden');
      return;
    }
    if (mode === 'endless') {
      hudSub.textContent = endlessCfg.size + '×' + endlessCfg.size + ' • ' + t('record') + ' ' +
        Math.max(store.getBestFor(endlessCfg), game.score);
      hudObjective.classList.add('hidden');
      return;
    }
    hudSub.textContent = mode === 'daily' ? t('menuDaily') : t('levelN', { n: levelIndex + 1 });
    hudObjective.classList.remove('hidden');
    var lv = game.level;
    var left = objectiveLeft(lv);
    // sanden kan växa – låt maxvärdet följa med så baren aldrig ljuger
    if (lv.type !== 'score' && lv.type !== 'collect') objMax = Math.max(objMax, left);
    var total = lv.type === 'score' ? lv.target
      : lv.type === 'collect' ? lv.count
      : objMax;
    var done = lv.type === 'score' ? Math.min(game.score, lv.target)
      : lv.type === 'collect' ? lv.count - left
      : total - left;
    var pct = total > 0 ? Math.round(100 * Math.max(0, Math.min(1, done / total))) : 0;
    if (hudGameRef !== game) {
      hudGameRef = game;
      hudObjective.innerHTML =
        '<span class="hud-icon">' + twe(objectiveIcon(lv)) + '</span>' +
        '<span class="hud-bar"><span class="hud-fill" id="hud-fill"></span></span>' +
        '<b id="hud-count"></b>' +
        '<span class="hud-moves" id="hud-moves"></span>';
    }
    $('#hud-fill').style.width = pct + '%';
    $('#hud-count').textContent = done + '/' + total;
    var movesEl = $('#hud-moves');
    movesEl.textContent = '• ' + t('movesLeft', { n: game.movesLeft() });
    movesEl.classList.toggle('low', game.movesLeft() <= 5);
  }

  function objectiveLeft(lv) {
    if (lv.type === 'score') return Math.max(0, lv.target - game.score);
    if (lv.type === 'gems') return game.gemsLeft;
    if (lv.type === 'ice') return game.iceLeft;
    if (lv.type === 'sand') return game.sandLeft;
    if (lv.type === 'mist') return game.mistLeft;
    if (lv.type === 'eggs') return game.eggsLeft;
    if (lv.type === 'ghosts') return game.ghostsLeft;
    if (lv.type === 'keys') return game.keysLeft;
    return game.collectLeft();
  }

  function objectiveIcon(lv) {
    return lv.type === 'gems' ? '💎'
      : lv.type === 'ice' ? '🧊'
      : lv.type === 'sand' ? ic('sand')
      : lv.type === 'mist' ? ic('mist')
      : lv.type === 'eggs' ? ic('egg')
      : lv.type === 'ghosts' ? ic('ghost')
      : lv.type === 'keys' ? ic('key')
      : lv.type === 'collect'
      ? '<span class="collect-chip" style="background:' + Shapes.PALETTE[lv.color] + '"></span>'
      : '🎯';
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
      '<p><b>' + t('boardSize') + '</b></p>' +
      '<div class="choice-row" data-group="size">' +
      SIZE_OPTS.map(function (s) {
        return '<button class="choice' + (s === cfg.size ? ' sel' : '') + '" data-v="' + s + '">' + s + '&times;' + s + '</button>';
      }).join('') +
      '</div>' +
      '<p style="margin-top:12px"><b>' + t('difficulty') + '</b></p>' +
      '<div class="choice-row" data-group="diff">' +
      DIFF_ORDER.map(function (d) {
        return '<button class="choice' + (d === cfg.diff ? ' sel' : '') + '" data-v="' + d + '">' + t(DIFFS[d].key) + '</button>';
      }).join('') +
      '</div>' +
      '<p class="choice-hint">' + t('chooserHint') + '</p>';
    showOverlay({
      title: t('chooserTitle'),
      html: html,
      buttons: [{
        label: t('start'), primary: true,
        fn: function () {
          var size = +document.querySelector('#ov-text .choice-row[data-group="size"] .sel').getAttribute('data-v');
          var diff = document.querySelector('#ov-text .choice-row[data-group="diff"] .sel').getAttribute('data-v');
          endlessCfg = { size: size, diff: diff };
          LS.set('bloxis.endless.cfg', JSON.stringify(endlessCfg));
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
    Music.setTheme('ljus');
    setGameGlow(258);
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
  }

  function countChar(board, ch) {
    return board.join('').split('').filter(function (c) { return c === ch; }).length;
  }

  /* Egen ikon (assets/icons) som inline-bild i HTML-strängar. */
  function ic(name) {
    return '<img class="twe" draggable="false" alt="" src="assets/icons/' + name + '.svg">';
  }

  function objectiveHtml(lv) {
    var head, sub;
    if (lv.type === 'sand') {
      head = ic('sand') + ' ' + t('objSand', { n: countChar(lv.board, 'S'), moves: lv.moves });
      sub = t('objSandSub', { every: lv.sandEvery || 3 });
    } else if (lv.type === 'mist') {
      head = ic('mist') + ' ' + t('objMist', { n: countChar(lv.board, 'M'), moves: lv.moves });
      sub = t('objMistSub');
    } else if (lv.type === 'eggs') {
      head = ic('egg') + ' ' + t('objEggs', { n: countChar(lv.board, 'E') });
      sub = t('objEggsSub', { timer: lv.eggTimer || 12 });
    } else if (lv.type === 'ghosts') {
      head = ic('ghost') + ' ' + t('objGhosts', { n: countChar(lv.board, 'A'), moves: lv.moves });
      sub = t('objGhostsSub', { every: lv.ghostEvery || 2 });
    } else if (lv.type === 'keys') {
      head = ic('key') + ' ' + t('objKeys', { n: countChar(lv.board, 'K'), moves: lv.moves });
      sub = ic('lock') + ' ' + t('objKeysSub');
    } else if (lv.type === 'score') {
      head = t('objScore', { target: lv.target, moves: lv.moves });
      sub = t('objScoreSub');
    } else if (lv.type === 'gems') {
      head = t('objGems', { n: countChar(lv.board, 'G'), moves: lv.moves });
      sub = t('objGemsSub');
    } else if (lv.type === 'ice') {
      head = t('objIce', { n: countChar(lv.board, 'I'), moves: lv.moves });
      sub = t('objIceSub');
    } else {
      head = '<span class="collect-chip" style="background:' + Shapes.PALETTE[lv.color] + '"></span>' +
        t('objCollect', { n: lv.count, moves: lv.moves, color: t('colorName' + lv.color) });
      sub = t('objCollectSub');
    }
    return '<p style="font-size:1.05rem">' + head + '</p><p>' + sub + '</p>';
  }

  function showObjectiveIntro(idx, isStart) {
    showOverlay({
      title: t('levelN', { n: idx + 1 }),
      html: objectiveHtml(LEVELS[idx]),
      buttons: [{ label: isStart ? t('go') : t('goContinue'), primary: true, fn: function () {} }]
    });
  }

  function startLevel(idx) {
    mode = 'level';
    levelIndex = idx;
    game = new Game({ mode: 'level', level: LEVELS[idx] });
    armedBooster = null;
    hudGameRef = null;
    objMax = 0;
    var wIdx = worldOf(idx);
    Music.setTheme(wIdx <= 2 ? 'ljus' : wIdx === 4 ? 'eld' : 'mystisk');
    setGameGlow(WORLDS[wIdx].hue);
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
    Sound.cheer(starCount);
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
    hudGameRef = null;
    objMax = 0;
    Music.setTheme('mystisk');
    setGameGlow(45);
    $('#boosters').classList.remove('hidden');
    showScreen('game');
    updateHud();
    renderTray(true);
    renderBoard();
    var d = getDaily();
    showOverlay({
      title: '📅 ' + t('menuDaily'),
      html: '<p>' + t('dailySame', { date: dstr }) + '</p>' +
        objectiveHtml(lv) +
        '<p>' + t('streak', { n: effectiveStreak(d) }) + '</p>' + calendarHtml(),
      buttons: [{ label: t('go'), primary: true, fn: function () {} }]
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
      LS.set('bloxis.tutorialDone', '1');
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

  function tutorialDone() { return !!LS.get('bloxis.tutorialDone'); }

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
        questEvent('endless', g.score);
        Sound.lose();
        showOverlay({
          title: t('gameOverTitle'),
          html: (isRecord ? t('newRecord') : t('wellPlayed')) +
            '<span class="score-big">' + g.score + ' p</span>' +
            endlessCfg.size + '×' + endlessCfg.size + ' ' + t(DIFFS[endlessCfg.diff].key) +
            ' &bull; ' + t('record') + ' ' + store.getBestFor(endlessCfg) +
            (coins > 0 ? ' &bull; +' + coins + ' 💰' : ''),
          buttons: [
            { label: t('playAgain'), primary: true, fn: function () { startEndless(endlessCfg); } },
            { label: t('changeMode'), fn: showEndlessChooser },
            { label: t('toMenu'), fn: function () { showScreen('menu'); } }
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
          if (firstWinToday) questEvent('daily', 1);
          Sound.win();
          celebrate(g.stars(), t('dailyCleared'), null, function () {
            if (game !== g) return;
            showOverlay({
              title: t('dailyWonTitle'),
              stars: g.stars(),
              html: '<span class="score-big">' + g.score + ' p</span>' +
                t('streak', { n: d.streak }) +
                (dCoins ? ' &bull; +' + dCoins + ' 💰' : '') +
                calendarHtml(),
              buttons: [{ label: t('toMenu'), primary: true, fn: function () { showScreen('menu'); } }]
            });
          });
        } else {
          Sound.lose();
          showOverlay({
            title: t('loseTitle'),
            html: g.lossReason === 'moves' ? t('loseMovesDaily') : t('loseStuckDaily'),
            buttons: [
              { label: t('tryAgain'), primary: true, fn: startDaily },
              { label: t('toMenu'), fn: function () { showScreen('menu'); } }
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
        questEvent('wins', 1);
        questEvent('stars', stars);
        Sound.win();
        // firande → direkt tillbaka till kartan där progressionen spelas upp
        celebrate(stars, t('levelCleared', { n: levelIndex + 1 }),
          '<b>' + g.score + ' p</b> • +' + coinsWon + ' 💰',
          function () {
            if (game !== g || !screens.game.classList.contains('active')) return;
            pendingUnlock = { idx: levelIndex, first: prevStars === 0 };
            showScreen('levels');
          });
      } else {
        Sound.lose();
        showOverlay({
          title: t('loseTitle'),
          html: g.lossReason === 'moves' ? t('loseMoves')
            : g.lossReason === 'egg' ? ic('egg') + ' ' + t('loseEgg')
            : t('loseStuck'),
          buttons: [
            { label: t('tryAgain'), primary: true, fn: function () { startLevel(levelIndex); } },
            { label: t('toMap'), fn: function () { showScreen('levels'); } }
          ]
        });
      }
    }, CLEAR_MS + 300);
  }

  function praiseText(res) {
    if (res.nLines >= 3) return t('praise3');
    if (res.nLines === 2) return t('praise2');
    if (res.combo >= 2) return t('praiseCombo', { n: res.combo });
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
      questEvent('lines', res.nLines);
      if (res.nLines >= 2) questEvent('multi', 1);
      if (res.combo >= 3) questEvent('combo3', 1);
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
      questEvent('boosters', 1);
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
      questEvent('boosters', 1);
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
    questEvent('boosters', 1);
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
  /* Egen rekvisita (assets/props) per värld – ritad i samma stil som noderna. */
  var WORLD_DECOR = [
    ['tree', 'pine', 'flower', 'mushroom', 'butterfly'],
    ['peak', 'snowman', 'snowflake', 'pine'],
    ['cactus', 'rock', 'tumbleweed'],
    ['star-prop', 'moon', 'comet', 'planet'],
    ['volcano', 'lavarock', 'flameprop', 'rock'],
    ['deadtree', 'ghostprop', 'mushroom', 'bat', 'candle'],
    ['crystals', 'orb', 'rock', 'candle']
  ];
  var WORLD_BADGE = ['tree', 'snowflake', 'cactus', 'star-prop', 'volcano', 'ghostprop', 'crystals'];
  /* Markens grundljushet per värld: dagsljusa världar ljusa, nattvärldar djupare. */
  var WORLD_LIGHT = [48, 52, 50, 34, 38, 33, 38];
  /* Rekvisita som står på marken och ska ha slagskugga. */
  var GROUNDED = {
    tree: 1, pine: 1, flower: 1, mushroom: 1, peak: 1, snowman: 1, cactus: 1,
    rock: 1, tumbleweed: 1, volcano: 1, lavarock: 1, deadtree: 1, crystals: 1,
    orb: 1, candle: 1
  };
  var DECOR_TWINKLE = { snowflake: 1, 'star-prop': 1, comet: 1, flameprop: 1, candle: 1 };

  function propImg(name) {
    return '<img class="propimg" draggable="false" alt="" src="assets/props/' + name + '.svg">';
  }

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

  /* Punkt på kubisk Bézier för segment i→i+1 vid t (0..1). */
  function bezPoint(pts, i, t) {
    var c = crControls(pts, i);
    var p0 = pts[i], p1 = pts[i + 1];
    var u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * p1[1]
    ];
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

  /* Samma böljande ås som ridgeD men som öppen linje (för ljusa kammar). */
  function ridgeLineD(yBase, amp, freq, phase) {
    var d = '';
    for (var x = 0; x <= 100; x += 4) {
      var y = yBase + Math.sin((x / 100) * Math.PI * 2 * freq + phase) * amp;
      d += (x === 0 ? 'M ' : ' L ') + x + ' ' + y.toFixed(1);
    }
    return d;
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

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* Rad med gransiluetter för Viskande skogen. */
  function pinesD(yBase, hAmp, n, segH) {
    var d = 'M 0 ' + segH + ' L 0 ' + yBase;
    for (var i = 0; i < n; i++) {
      var x0 = (i / n) * 100;
      var x1 = ((i + 1) / n) * 100;
      var mid = (x0 + x1) / 2;
      var hgt = hAmp * (0.7 + seeded(i * 7 + n) * 0.6);
      d += ' L ' + x0.toFixed(1) + ' ' + yBase +
        ' L ' + mid.toFixed(1) + ' ' + (yBase - hgt).toFixed(1) +
        ' L ' + x1.toFixed(1) + ' ' + yBase;
    }
    return d + ' L 100 ' + segH + ' Z';
  }

  /* Kantiga kristallspiror för Kristallgrottan. */
  function crystalsD(yBase, amp, n, segH, seedBase) {
    var d = 'M 0 ' + segH + ' L 0 ' + yBase;
    for (var i = 0; i < n; i++) {
      var r = seeded(seedBase + i * 11);
      var x0 = (i / n) * 100 + r * 3;
      var x1 = ((i + 1) / n) * 100;
      var tip = x0 + (x1 - x0) * (0.3 + r * 0.4);
      d += ' L ' + x0.toFixed(1) + ' ' + yBase +
        ' L ' + tip.toFixed(1) + ' ' + (yBase - amp * (0.6 + r * 0.8)).toFixed(1) +
        ' L ' + x1.toFixed(1) + ' ' + (yBase - r * 14).toFixed(1);
    }
    return d + ' L 100 ' + yBase + ' L 100 ' + segH + ' Z';
  }

  /* Målad terräng för ett världssegment – varje värld har sitt eget sceneri. */
  function terrainSVG(w, wi, segH) {
    var svg = svgEl('svg', { viewBox: '0 0 100 ' + segH, preserveAspectRatio: 'none' });
    var si, sr, b, r, yBase, light, alpha, fill;

    // stora organiska "öar" av ljusare mark vid vägens sidor ger djup
    var nBlob = Math.max(3, Math.round(segH / 240));
    for (var bi = 0; bi < nBlob; bi++) {
      var br = seeded(wi * 61 + bi * 23 + 4);
      var side2 = bi % 2;
      var bx = side2 ? 74 + br * 18 : 8 + br * 18;
      var by = 90 + seeded(bi * 31 + wi * 7) * (segH - 180);
      var brx = 11 + br * 9;
      var bry = brx * 1.5;
      svg.appendChild(svgEl('ellipse', {
        cx: bx, cy: by + 7, rx: brx, ry: bry,
        fill: 'hsla(' + w.hue + ', 55%, 16%, 0.16)'
      }));
      svg.appendChild(svgEl('ellipse', {
        cx: bx, cy: by, rx: brx, ry: bry,
        fill: 'hsla(' + w.hue + ', 62%, 74%, 0.2)'
      }));
      svg.appendChild(svgEl('ellipse', {
        cx: bx - brx * 0.15, cy: by - bry * 0.2, rx: brx * 0.6, ry: bry * 0.5,
        fill: 'hsla(' + w.hue + ', 70%, 86%, 0.14)'
      }));
    }

    if (wi === 3 || wi === 6) { // stjärnor i rymden och gnistor i grottan
      var nStars = wi === 3 ? 26 : 14;
      for (si = 0; si < nStars; si++) {
        sr = seeded(wi * 71 + si * 3);
        svg.appendChild(svgEl('ellipse', {
          cx: (sr * 97 + 1.5).toFixed(1),
          cy: Math.round(seeded(si * 7 + 2) * (segH - 60) + 30),
          rx: (0.3 + sr * 0.5).toFixed(2),
          ry: (1.2 + sr * 2).toFixed(1),
          fill: wi === 3
            ? 'rgba(255,255,255,' + (0.2 + sr * 0.4).toFixed(2) + ')'
            : 'hsla(310, 90%, 80%, ' + (0.15 + sr * 0.35).toFixed(2) + ')'
        }));
      }
    }
    if (wi === 3) { // rymden: måne med kratrar och en ringplanet
      // x-skalan är ~4x y-skalan i segmentets viewBox, därav ry ≈ 4 * rx
      var mx = 24 + seeded(9) * 20, my = segH * 0.22;
      svg.appendChild(svgEl('ellipse', { cx: mx, cy: my, rx: 8, ry: 32, fill: 'rgba(255,233,168,0.06)' }));
      svg.appendChild(svgEl('ellipse', { cx: mx, cy: my, rx: 5.5, ry: 22, fill: 'rgba(245,238,214,0.5)' }));
      svg.appendChild(svgEl('ellipse', { cx: mx - 1.6, cy: my - 6, rx: 1.2, ry: 4.8, fill: 'rgba(180,170,140,0.4)' }));
      svg.appendChild(svgEl('ellipse', { cx: mx + 1.9, cy: my + 8, rx: 0.85, ry: 3.4, fill: 'rgba(180,170,140,0.35)' }));
      var px = 74, py = segH * 0.6;
      svg.appendChild(svgEl('ellipse', { cx: px, cy: py, rx: 3.4, ry: 13.5, fill: 'hsla(265, 55%, 62%, 0.5)' }));
      svg.appendChild(svgEl('ellipse', {
        cx: px, cy: py, rx: 7, ry: 8, fill: 'none',
        stroke: 'hsla(45, 80%, 70%, 0.45)', 'stroke-width': 1.1
      }));
    }
    if (wi === 2) { // öken: sol med glöd
      var sx = 20 + seeded(wi * 5 + 1) * 60;
      [[16, 60, 0.12], [10, 38, 0.2], [6, 22, 0.45]].forEach(function (ring) {
        svg.appendChild(svgEl('ellipse', {
          cx: sx, cy: 120, rx: ring[0], ry: ring[1],
          fill: 'hsla(45, 90%, 65%, ' + ring[2] + ')'
        }));
      });
    }
    if (wi === 4) { // Drakberget: mörk vulkankon med glödande topp
      var vx = 26 + seeded(41) * 48;
      var vTop = segH - 300;
      svg.appendChild(svgFill(
        'M ' + (vx - 40) + ' ' + segH + ' L ' + vx + ' ' + vTop +
        ' L ' + (vx + 40) + ' ' + segH + ' Z',
        'hsla(355, 30%, 12%, 0.6)'));
      // segmentets x-skala är ~4x y-skalan (preserveAspectRatio none),
      // så en rund glöd behöver ry ≈ 4 * rx
      svg.appendChild(svgEl('ellipse', { cx: vx, cy: vTop + 14, rx: 6, ry: 24, fill: 'hsla(25, 95%, 55%, 0.16)' }));
      svg.appendChild(svgEl('ellipse', { cx: vx, cy: vTop + 10, rx: 2.2, ry: 9, fill: 'hsla(25, 95%, 60%, 0.75)' }));
    }

    var bands = Math.max(3, Math.round(segH / 300));
    for (b = 0; b < bands; b++) {
      r = seeded(wi * 97 + b * 13);
      yBase = segH - 50 - b * ((segH - 140) / bands) + (r - 0.5) * 50;
      light = 26 + b * 5 + r * 6;
      alpha = Math.max(0.08, 0.2 - b * 0.025);
      fill = 'hsla(' + w.hue + ', 45%, ' + light + '%, ' + alpha + ')';
      if (wi === 1) { // berg med snötoppar
        var pk = peaksD(yBase, 90 + r * 70, 3 + Math.round(r * 2), segH);
        svg.appendChild(svgFill(pk.d, fill));
        pk.tops.forEach(function (t) {
          svg.appendChild(svgFill(
            'M ' + (t[0] - 2.2) + ' ' + (t[1] + 26) + ' L ' + t[0] + ' ' + t[1] +
            ' L ' + (t[0] + 2.2) + ' ' + (t[1] + 26) + ' Z',
            'rgba(255,255,255,' + (0.25 + alpha) + ')'));
        });
      } else if (wi === 5) { // granskog i lager med dis mellan
        svg.appendChild(svgFill(pinesD(yBase, 60 + r * 40, 7 + Math.round(r * 4), segH),
          'hsla(' + w.hue + ', 35%, ' + (14 + b * 5) + '%, ' + (alpha + 0.1).toFixed(2) + ')'));
        svg.appendChild(svgEl('ellipse', {
          cx: 25 + r * 50, cy: yBase + 14, rx: 42, ry: 9,
          fill: 'rgba(200,200,230,' + (0.05 + r * 0.04).toFixed(2) + ')'
        }));
      } else if (wi === 6) { // kristallspiror som glöder
        var cd = crystalsD(yBase, 70 + r * 50, 5 + Math.round(r * 3), segH, wi * 31 + b * 7);
        svg.appendChild(svgFill(cd, 'hsla(' + w.hue + ', 60%, ' + (light + 12) + '%, ' + (alpha + 0.08).toFixed(2) + ')'));
      } else if (wi === 4) { // kantiga lavaklippor
        var vk = peaksD(yBase, 60 + r * 40, 4 + Math.round(r * 2), segH);
        svg.appendChild(svgFill(vk.d, fill));
      } else { // kullar respektive dyner
        var amp = wi === 2 ? 34 + r * 26 : 22 + r * 18;
        var freq = wi === 2 ? 0.9 + r * 0.6 : 1.3 + r * 0.9;
        svg.appendChild(svgFill(ridgeD(yBase, amp, freq, r * 6.28, segH), fill));
        if (wi === 0) { // blomsterprickar på ängskullarna
          for (var fi = 0; fi < 4; fi++) {
            var fr = seeded(b * 17 + fi * 5 + 3);
            svg.appendChild(svgEl('ellipse', {
              cx: (fr * 94 + 3).toFixed(1),
              cy: (yBase + 8 + fr * 18).toFixed(1),
              rx: (0.35 + fr * 0.25).toFixed(2),
              ry: (1.4 + fr * 1).toFixed(2),
              fill: ['#ff6dc8', '#ffd645', '#f3ecdc'][fi % 3],
              opacity: (0.25 + fr * 0.3).toFixed(2)
            }));
          }
        }
        if (wi === 2) { // ljus dynkam
          svg.appendChild(svgPath(ridgeLineD(yBase, amp, freq, r * 6.28),
            'hsla(40, 70%, 70%, ' + (alpha * 0.9).toFixed(2) + ')', '1', null, null));
        }
      }
    }
    return svg;
  }

  /* Megaöppning av skattkista: skak, ljusexplosion, myntregn som flyger
     upp till myntsaldot (som tickar upp mynt för mynt) och en stigande
     belöningstext. Allt med WAAPI så det funkar i WebKit. */
  function chestBurst(chestEl, reward, after) {
    var rect = chestEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var target = $('#map-coins');
    var tRect = target ? target.getBoundingClientRect() : { left: cx, top: 40, width: 0, height: 0 };
    var tx = tRect.left + tRect.width / 2;
    var ty = tRect.top + tRect.height / 2;
    var startCoins = store.getCoins() - reward;
    if (target) target.textContent = startCoins;

    Sound.chest();
    buzz([40, 30, 60, 30, 40]);

    // 1. kistan skakar och poppar upp i öppnat läge
    chestEl.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg)' },
      { transform: 'translate(-50%, -52%) rotate(-7deg)' },
      { transform: 'translate(-50%, -50%) rotate(7deg)' },
      { transform: 'translate(-50%, -53%) rotate(-5deg)' },
      { transform: 'translate(-50%, -50%) rotate(0deg) scale(1.25)' },
      { transform: 'translate(-50%, -50%) scale(1)' }
    ], { duration: 620, easing: 'ease-in-out' });
    setTimeout(function () {
      chestEl.innerHTML = propImg('chest-open');
      chestEl.classList.remove('ready');
      chestEl.classList.add('opened');
    }, 450);

    // 2. roterande ljusstrålar + blixt bakom kistan
    var rays = document.createElement('div');
    rays.className = 'chest-rays';
    rays.style.left = cx + 'px';
    rays.style.top = cy + 'px';
    document.body.appendChild(rays);
    rays.animate([
      { transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.15) rotate(60deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(1.5) rotate(140deg)', opacity: 0 }
    ], { duration: 1500, delay: 380, easing: 'ease-out', fill: 'both' });
    var flash = document.createElement('div');
    flash.className = 'chest-flash';
    flash.style.left = cx + 'px';
    flash.style.top = cy + 'px';
    document.body.appendChild(flash);
    flash.animate([
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.4)', opacity: 0.9, offset: 0.4 },
      { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 }
    ], { duration: 700, delay: 400, easing: 'ease-out', fill: 'both' });

    // 3. myntregn: spruta upp, ligg kvar ett ögonblick, flyg till saldot
    var nCoins = Math.min(16, 8 + Math.round(reward / 10));
    var landed = 0;
    for (var i = 0; i < nCoins; i++) {
      (function (i) {
        var coin = document.createElement('img');
        coin.src = 'assets/icons/coin.svg';
        coin.className = 'fly-coin';
        coin.style.left = cx + 'px';
        coin.style.top = cy + 'px';
        document.body.appendChild(coin);
        var ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        var burst = 60 + Math.random() * 70;
        var bx = Math.cos(ang) * burst;
        var by = Math.sin(ang) * burst;
        var dx = tx - cx;
        var dy = ty - cy;
        var anim = coin.animate([
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + bx + 'px), calc(-50% + ' + by + 'px)) scale(1.15) rotate(' + ((Math.random() - 0.5) * 300) + 'deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(calc(-50% + ' + bx + 'px), calc(-50% + ' + (by + 14) + 'px)) scale(1.05)', opacity: 1, offset: 0.45 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.5)', opacity: 0.9 }
        ], {
          duration: 1150,
          delay: 480 + i * 55,
          easing: 'cubic-bezier(0.5, 0, 0.6, 1)',
          fill: 'both'
        });
        anim.onfinish = function () {
          coin.remove();
          landed++;
          if (target) target.textContent = Math.round(startCoins + reward * landed / nCoins);
          if (landed % 3 === 1) Sound.coin();
          if (landed === nCoins) {
            if (target) {
              target.textContent = startCoins + reward;
              target.parentElement.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.35)' },
                { transform: 'scale(1)' }
              ], { duration: 320, easing: 'ease-out' });
            }
            setTimeout(function () {
              rays.remove();
              flash.remove();
              if (after) after();
            }, 250);
          }
        };
      })(i);
    }

    // 4. stigande belöningstext
    var label = document.createElement('div');
    label.className = 'chest-label';
    label.innerHTML = twe('+' + reward + ' 💰');
    label.style.left = cx + 'px';
    label.style.top = (cy - 40) + 'px';
    document.body.appendChild(label);
    label.animate([
      { transform: 'translate(-50%, 0) scale(0.5)', opacity: 0 },
      { transform: 'translate(-50%, -30px) scale(1.25)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -85px) scale(1)', opacity: 0 }
    ], { duration: 1600, delay: 430, easing: 'ease-out', fill: 'both' });
    setTimeout(function () { label.remove(); }, 2200);
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
      // ljus, mättad mark med solglöd, schackrutigt gräs och mjuk vinjett
      var L0 = WORLD_LIGHT[wi] || 45;
      bg.style.background =
        'radial-gradient(130% 90% at 50% 50%, transparent 55%, hsla(' + w.hue + ', 60%, 10%, 0.22) 100%), ' +
        'radial-gradient(150% 46% at 50% 0%, hsla(' + w.hue + ', 80%, 88%, 0.22), transparent 70%), ' +
        'repeating-conic-gradient(hsla(' + w.hue + ', 65%, 90%, 0.07) 0% 25%, transparent 0% 50%) 0 0/96px 96px, ' +
        'linear-gradient(180deg, hsl(' + w.hue + ', 54%, ' + (L0 + 6) + '%), hsl(' + w.hue + ', 60%, ' + (L0 - 9) + '%))';
      bg.appendChild(terrainSVG(w, wi, bottomY - topY));
      inner.appendChild(bg);

      var wStars = 0, wMax = (w.to - w.from + 1) * 3;
      for (var li = w.from; li <= w.to; li++) wStars += stars[li] || 0;
      var banner = document.createElement('div');
      banner.className = 'world-banner';
      banner.innerHTML = '<span class="wb-icon">' + propImg(WORLD_BADGE[wi]) + '</span>' + worldName(wi) +
        '<span class="wb-stars">' + twe('⭐') + ' ' + wStars + '/' + wMax + '</span>';
      banner.style.top = (bottomY - 58) + 'px';
      inner.appendChild(banner);

      // moln bara i världar med himmel (inte rymden, lavan eller grottan)
      if (wi === 0 || wi === 1 || wi === 2 || wi === 5) {
        for (var ci = 0; ci < 2; ci++) {
          var cloud = document.createElement('div');
          cloud.className = 'cloud';
          cloud.innerHTML = propImg('cloud');
          var cr = seeded(wi * 31 + ci * 7);
          cloud.style.top = (topY + 80 + cr * Math.max(120, bottomY - topY - 240)) + 'px';
          cloud.style.width = (44 + cr * 26) + 'px';
          cloud.style.setProperty('--dur', (48 + cr * 40) + 's');
          cloud.style.setProperty('--delay', (-cr * 60) + 's');
          inner.appendChild(cloud);
        }
      }

      // ambient väder per värld
      var segTop = topY, segH2 = bottomY - topY;
      function ambient(cls, count, maker) {
        for (var ai = 0; ai < count; ai++) {
          var ar = seeded(wi * 53 + ai * 19 + 5);
          var ar2 = seeded(wi * 29 + ai * 7 + 11);
          var el2 = document.createElement('span');
          el2.className = cls;
          el2.style.left = (3 + ar * 92) + '%';
          el2.style.top = (segTop + 40 + ar2 * (segH2 - 90)) + 'px';
          el2.style.setProperty('--dur', maker.dur(ar) + 's');
          el2.style.setProperty('--delay', (-ar2 * maker.dur(ar)) + 's');
          if (maker.size) el2.style.fontSize = maker.size(ar) + 'px';
          inner.appendChild(el2);
        }
      }
      if (wi === 1) ambient('snowflake', 9, { dur: function (r2) { return 7 + r2 * 6; } });
      if (wi === 4) ambient('ember', 7, { dur: function (r2) { return 4.5 + r2 * 3; } });
      if (wi === 5) ambient('fogband', 3, { dur: function (r2) { return 30 + r2 * 20; } });
      if (wi === 6) ambient('glint', 8, { dur: function (r2) { return 2.2 + r2 * 2; } });
    });

    // platshållare: vägen ritas ovanpå marken men under dekor och noder
    var roadSlot = document.createElement('div');
    inner.appendChild(roadSlot);

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
      for (var di = 0; di < 3; di++) {
        var r1 = seeded(i * 13 + di * 5 + 1);
        var r2 = seeded(i * 17 + di * 3 + 2);
        var deco = document.createElement('div');
        var prop = decors[Math.floor(r1 * decors.length)];
        deco.className = 'deco' +
          (DECOR_TWINKLE[prop] ? ' twinkle' : '') +
          (GROUNDED[prop] ? ' grounded' : '');
        deco.innerHTML = propImg(prop);
        var side = di === 0 ? (x < 50 ? 1 : 0) : (di === 1 ? Math.round(r1) : (x < 50 ? 0 : 1));
        deco.style.left = (side ? 70 + r2 * 24 : 4 + r2 * 24) + '%';
        deco.style.top = (y - NODE_GAP / 2 + ((di + r1) / 3) * NODE_GAP) + 'px';
        deco.style.width = (30 + r2 * 28 - di * 5) + 'px';
        deco.style.setProperty('--dur', (3.5 + r1 * 3) + 's');
        deco.style.setProperty('--delay', (-r2 * 4) + 's');
        inner.appendChild(deco);
      }

      var el = document.createElement('button');
      el.className = 'map-node' + (done ? ' done' : '') + (unlocked ? '' : ' locked');
      el.style.setProperty('--hue', WORLDS[world].hue);
      el.style.setProperty('--d', ((i - WORLDS[world].from) * 0.045) + 's');
      var fan = '';
      if (done) {
        fan = '<span class="starfan">';
        for (var s = 1; s <= 3; s++) {
          fan += '<span class="sf sf' + s + (s <= (stars[i] || 0) ? ' on' : '') + '">★</span>';
        }
        fan += '</span>';
      }
      var typeIcon = lv.type === 'gems' ? '💎'
        : lv.type === 'ice' ? '🧊'
        : lv.type === 'collect' ? '🎨'
        : lv.type === 'sand' ? ic('sand')
        : lv.type === 'mist' ? ic('mist')
        : lv.type === 'eggs' ? ic('egg')
        : lv.type === 'ghosts' ? ic('ghost')
        : lv.type === 'keys' ? ic('key')
        : '🎯';
      el.innerHTML = twe(fan +
        (unlocked
          ? '<span class="num">' + (i + 1) + '</span>' +
            (done ? '' : '<span class="ntype">' + typeIcon + '</span>')
          : '<span class="nlock">🔒</span>'));
      el.style.left = x + '%';
      el.style.top = y + 'px';
      if (unlocked) el.addEventListener('click', function () { Sound.click(); startLevel(i); });
      inner.appendChild(el);
    });

    // stort landmärke per värld vid vägkanten (svampstuga, isslott, pyramid …)
    var LANDMARKS = ['lm-mushroomhouse', 'lm-icecastle', 'lm-pyramid',
      'lm-wizardtower', 'lm-dragoncave', 'lm-treehouse', 'lm-crystalgate'];
    var firstNode = inner.querySelector('.map-node');
    WORLDS.forEach(function (w, wi) {
      var a = w.from + 8;
      if (a + 1 >= points.length || !LANDMARKS[wi]) return;
      var mid = bezPoint(points, a, 0.5);
      var cxPct = Math.max(17, Math.min(83, mid[0] + (mid[0] < 50 ? 27 : -27)));
      var lm = document.createElement('div');
      lm.className = 'map-landmark';
      lm.innerHTML = propImg(LANDMARKS[wi]);
      lm.style.left = cxPct + '%';
      lm.style.top = mid[1] + 'px';
      lm.style.width = Math.round(102 + seeded(wi * 3 + 1) * 16) + 'px';
      inner.insertBefore(lm, firstNode);
    });

    // skattkistor: en per värld vid vägkanten halvvägs in – öppnas
    // (en gång) när banan intill är klarad och ger mynt
    var chestsOpen = store.getJson('bloxis.chests', {});
    WORLDS.forEach(function (w, wi) {
      var a = w.from + 5;
      if (a + 1 >= points.length) return;
      var mid = bezPoint(points, a, 0.5);
      var cxPct = mid[0] + (mid[0] < 50 ? 17 : -17);
      var reward = 30 + wi * 10;
      var claimed = !!chestsOpen[wi];
      var ready = !claimed && (stars[a] || 0) > 0;
      var chest = document.createElement('button');
      chest.className = 'map-chest' + (claimed ? ' opened' : ready ? ' ready' : ' waiting');
      chest.setAttribute('aria-label', claimed ? 'Öppnad kista' : 'Skattkista');
      chest.innerHTML = propImg(claimed ? 'chest-open' : 'chest') +
        (ready ? '<span class="chest-coins">+' + reward + ' ' + twe('💰') + '</span>' : '');
      chest.style.left = cxPct + '%';
      chest.style.top = mid[1] + 'px';
      if (ready) {
        chest.addEventListener('click', function () {
          var co = store.getJson('bloxis.chests', {});
          if (co[wi]) return;
          co[wi] = true;
          store.setJson('bloxis.chests', co);
          store.addCoins(reward);
          chestBurst(chest, reward, function () { renderLevelMap(); });
        });
      }
      inner.appendChild(chest);
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
    svg.appendChild(svgPath(roadD, 'rgba(58,40,22,0.55)', '24', null, null));   // mörk kant
    svg.appendChild(svgPath(roadD, 'rgba(214,186,138,0.85)', '17', null, null)); // ljus grusväg
    var goldTo = animateUnlock ? pu.idx : currentIdx;
    if (goldTo > 0) {
      var goldD = smoothPathD(points.slice(0, goldTo + 1));
      svg.appendChild(svgPath(goldD, 'rgba(255,214,69,0.2)', '26', null, null)); // mjuk glöd
      svg.appendChild(svgPath(goldD, 'rgba(255,206,107,0.75)', '17', null, null));
    }
    var segEl = null;
    if (animateUnlock) {
      segEl = svgPath(segmentD(points, pu.idx), 'rgba(255,206,107,0.75)', '17', null, null);
      svg.appendChild(segEl);
    }
    svg.appendChild(svgPath(roadD, 'rgba(255,255,255,0.6)', '2.5', '6 10', 'trail'));
    inner.replaceChild(svg, roadSlot);

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
      // 3. avataren vandrar dit längs vägen, med gung och små skutt
      setTimeout(function () {
        if (!pin || !pin.animate) { finishUnlock(); return; }
        var w = wrap.clientWidth;
        var kf = [];
        var N = 22;
        for (var k = 0; k <= N; k++) {
          var t = k / N;
          var p = bezPoint(points, pu.idx, t);
          var dx = (p[0] - points[pu.idx][0]) / 100 * w;
          var dy = p[1] - points[pu.idx][1];
          var bob = Math.abs(Math.sin(t * Math.PI * 5)) * 9;      // fem små skutt
          var tilt = Math.sin(t * Math.PI * 10) * 5;               // gungar i takt
          kf.push({ transform: 'translate(' + dx.toFixed(1) + 'px, ' + (dy - bob).toFixed(1) + 'px) rotate(' + tilt.toFixed(1) + 'deg)' });
        }
        var anim = pin.animate(kf, { duration: 1050, easing: 'linear' });
        var stepSounds = [0, 210, 420, 630, 840];
        stepSounds.forEach(function (ms, si) {
          setTimeout(function () { Sound.click(); buzz(8); }, ms);
        });
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
    var icons5 = { sand: ic('sand'), mist: ic('mist'), egg: ic('egg') };
    var icons6 = { ghost: ic('ghost'), key: ic('key'), lock: ic('lock') };
    showOverlay({
      title: t('helpTitle'),
      html:
        '<ul>' +
        '<li>' + t('help1') + '</li>' +
        '<li>' + t('help2') + '</li>' +
        '<li>' + t('help3') + '</li>' +
        '<li>' + t('help4') + '</li>' +
        '<li>' + t('help5', icons5) + '</li>' +
        '<li>' + t('help6', icons6) + '</li>' +
        '<li>' + t('help7') + '</li>' +
        '<li>' + t('help8') + '</li>' +
        '</ul>' +
        '<p style="font-size:0.72rem;opacity:0.7;margin-top:10px">Ikoner: Twemoji (CC-BY 4.0) &bull; Ljud: Kenney.nl (CC0) &bull; Typsnitt: Grenze Gotisch &amp; Averia Serif Libre (OFL)</p>',
      buttons: [
        { label: t('playGuide'), fn: function () { startTutorial(function () { showScreen('menu'); }); } },
        { label: t('close'), primary: true, fn: function () {} }
      ]
    });
  }

  /* ===== Knappar ===== */
  function boot() { Sound.unlock(); Sound.click(); Music.sync(); }
  $('#btn-endless').addEventListener('click', function () { boot(); withTutorial(showEndlessChooser); });
  $('#btn-levels').addEventListener('click', function () { boot(); withTutorial(function () { showScreen('levels'); }); });
  $('#btn-daily').addEventListener('click', function () { boot(); withTutorial(startDaily); });
  $('#btn-quests').addEventListener('click', function () { boot(); showQuests(); });
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

  applyStaticLang();
  showScreen('menu');
})();
