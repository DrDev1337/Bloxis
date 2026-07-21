/* E2E i webbläsare (Playwright + Chromium). Startar en inbyggd statisk
   server för repo-roten, laddar spelet och verifierar huvudflödena:
   meny, karta, banstart, HUD, garderob, veckouppdrag och språkbyte.
   Lokalt används CHROMIUM_PATH (eller /opt/pw-browsers/chromium) om den
   finns; i CI används Playwrights egen chromium. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;

  const exe = process.env.CHROMIUM_PATH ||
    (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  const errors = [], missing = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  let fails = 0;
  const check = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };

  await page.goto(base + '/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('bloxis.tutorialDone', '1');
    localStorage.setItem('bloxis.coins', '200');
    const st = {};
    for (let i = 0; i < 84; i++) st[i] = 1;
    localStorage.setItem('bloxis.stars', JSON.stringify(st));
  });
  await page.reload();
  await page.waitForTimeout(600);

  // Meny med egna ikoner
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('#screen-menu img.twe')].map(i => i.getAttribute('src')));
  check(icons.length > 0 && icons.every(s => s.startsWith('assets/icons/')), 'menyns ikoner är egna');

  // Kartan: 84 noder, 7 banderoller, kistor och landmärken
  await page.click('#btn-levels');
  await page.waitForTimeout(900);
  const map = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.map-node').length,
    banners: document.querySelectorAll('.world-banner').length,
    chests: document.querySelectorAll('.map-chest').length,
    landmarks: document.querySelectorAll('.map-landmark').length
  }));
  check(map.nodes === 84 && map.banners === 7 && map.chests === 7 && map.landmarks === 7,
    'kartan: 84 noder, 7 banderoller, 7 kistor, 7 landmärken (' + JSON.stringify(map) + ')');

  // Starta en bana och kontrollera HUD
  await page.evaluate(() => {
    document.querySelectorAll('.map-node')[0].dispatchEvent(new Event('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#ov-buttons .btn.primary').click());
  await page.waitForTimeout(400);
  const hud = await page.evaluate(() => document.getElementById('hud-objective').textContent);
  check(/drag kvar/.test(hud), 'HUD visar mål (' + hud.trim() + ')');
  await page.click('#screen-game .btn-back');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#screen-levels .btn-back').click());
  await page.waitForTimeout(300);

  // Garderoben
  await page.click('#btn-wardrobe');
  await page.waitForTimeout(400);
  const ward = await page.evaluate(() => document.querySelectorAll('.ward-item').length);
  check(ward === 62, 'garderoben har 62 föremål (' + ward + ')');
  await page.evaluate(() => document.querySelector('#ov-buttons .btn').click());
  await page.waitForTimeout(200);

  // Veckouppdrag
  await page.click('#btn-quests');
  await page.waitForTimeout(400);
  const quests = await page.evaluate(() => document.querySelectorAll('.quest-row').length);
  check(quests === 3, 'tre veckouppdrag (' + quests + ')');
  await page.evaluate(() => document.querySelector('#ov-buttons .btn').click());
  await page.waitForTimeout(200);

  // Språkbyte sv -> en -> sv
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-lang="en"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#ov-buttons .btn').click());
  await page.waitForTimeout(200);
  const en = await page.evaluate(() => document.querySelector('[data-l="menuEndless"]').textContent);
  check(en === 'Endless mode', 'engelska aktiv (' + en + ')');
  await page.click('#btn-settings');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-lang="sv"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#ov-buttons .btn').click());

  check(missing.length === 0, 'inga 404 (' + (missing.join(', ') || 'rent') + ')');
  check(errors.length === 0, 'inga JS-fel' + (errors.length ? ':\n' + errors.join('\n') : ''));

  await browser.close();
  server.close();
  console.log(fails ? fails + ' FEL' : 'E2E grön.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
