/* Dragrobusthet (Playwright + Chromium). Verifierar att pjäsdraget
   överlever mobila avbrott: pointercancel släpper tillbaka pjäsen,
   ett drag som dör utan up/cancel (Safari tappar pointer capture)
   självläker vid nästa tryck, blur städar, och ett andra finger
   varken avslutar eller stjäl pågående drag. */
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

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let fails = 0;
  const check = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
  const dragState = () => page.evaluate(() => ({
    canvasHidden: document.getElementById('drag-piece').classList.contains('hidden'),
    dimmed: document.querySelectorAll('#tray .slot.dragging').length
  }));

  await page.goto(base + '/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bloxis.tutorialDone', '1'); });
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('btn-endless').click());
  await page.waitForTimeout(400);
  const start = await page.$('#ov-buttons .btn.primary');
  if (start) { await start.click(); await page.waitForTimeout(500); }

  // 1. Normalt musdrag: slot -> bräde -> släpp = pjäsen placeras och allt städas
  const slotBox = await (await page.$('#tray .slot')).boundingBox();
  const boardBox = await (await page.$('#board')).boundingBox();
  await page.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(boardBox.x + boardBox.width * 0.3, boardBox.y + boardBox.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const s1 = await dragState();
  const placed = await page.evaluate(() => document.querySelector('#tray .slot').classList.contains('empty'));
  check(s1.canvasHidden && s1.dimmed === 0 && placed, 'musdrag placerar pjäsen och städar');

  // 2. pointercancel mitt i drag -> pjäsen tillbaka, inget låst
  await page.evaluate(() => {
    const slot = document.querySelectorAll('#tray .slot')[1];
    const r = slot.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 41, isPrimary: true, pointerType: 'touch',
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    slot.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, opts, { clientY: opts.clientY - 200 })));
    window.dispatchEvent(new PointerEvent('pointercancel', opts));
  });
  await page.waitForTimeout(200);
  const s2 = await dragState();
  const kept = await page.evaluate(() => !document.querySelectorAll('#tray .slot')[1].classList.contains('empty'));
  check(s2.canvasHidden && s2.dimmed === 0 && kept, 'pointercancel släpper tillbaka pjäsen');

  // 3. Drag som dör utan up/cancel (tappad capture) självläker vid nästa tryck
  await page.evaluate(() => {
    const slot = document.querySelectorAll('#tray .slot')[1];
    const r = slot.getBoundingClientRect();
    slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 41,
      isPrimary: true, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  });
  await page.waitForTimeout(200);
  const stuck = await dragState();
  check(!stuck.canvasHidden && stuck.dimmed === 1, 'fastnat läge uppnått (förutsättning)');
  await page.evaluate(() => {
    const slot = document.querySelectorAll('#tray .slot')[2];
    const r = slot.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 41, isPrimary: true, pointerType: 'touch',
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    slot.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointerup', opts));
  });
  await page.waitForTimeout(200);
  const s3 = await dragState();
  check(s3.canvasHidden && s3.dimmed === 0, 'nytt tryck självläker det fastnade draget');

  // 4. blur (samtal/notis/appbyte) avbryter draget
  await page.evaluate(() => {
    const slot = document.querySelectorAll('#tray .slot')[1];
    const r = slot.getBoundingClientRect();
    slot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 77,
      isPrimary: true, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(200);
  const s4 = await dragState();
  check(s4.canvasHidden && s4.dimmed === 0, 'blur avbryter draget');

  // 5. Ett andra finger varken avslutar eller stjäl pågående drag
  await page.evaluate(() => {
    const slots = document.querySelectorAll('#tray .slot');
    const r1 = slots[1].getBoundingClientRect(), r2 = slots[2].getBoundingClientRect();
    slots[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 5,
      isPrimary: true, pointerType: 'touch', clientX: r1.x + 20, clientY: r1.y + 20 }));
    const o2 = { bubbles: true, cancelable: true, pointerId: 6, isPrimary: false, pointerType: 'touch',
      clientX: r2.x + 20, clientY: r2.y + 20 };
    slots[2].dispatchEvent(new PointerEvent('pointerdown', o2));
    window.dispatchEvent(new PointerEvent('pointerup', o2));
  });
  await page.waitForTimeout(200);
  const s5 = await dragState();
  check(!s5.canvasHidden && s5.dimmed === 1, 'andra fingret avslutar inte draget');
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, pointerType: 'touch',
      clientX: 200, clientY: 400 }));
  });
  await page.waitForTimeout(200);
  const s6 = await dragState();
  check(s6.canvasHidden && s6.dimmed === 0, 'rätt finger avslutar draget');

  if (errors.length) { console.log('JS-FEL:\n' + errors.join('\n')); fails++; }
  else console.log('Inga JS-fel.');
  await browser.close();
  server.close();
  if (fails) { console.error(fails + ' kontroller föll.'); process.exit(1); }
  console.log('Dragtest grönt.');
})().catch(e => { console.error(e); process.exit(1); });
