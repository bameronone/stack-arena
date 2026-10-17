// Two-player online match in headless Chromium using the same-browser
// transport (?net=local): one page hosts, one joins, plus a bot. Both play to
// the end; optionally the guest leaves mid-match to check the bot takeover.
//   NODE_PATH=$(npm root -g) node tools/mptest.cjs <outdir> [leave|rejoin]
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const out = process.argv[2] || '.';
const LEAVE = process.argv[3] === 'leave';
const REJOIN = process.argv[3] === 'rejoin';
const html = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'));

(async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const errors = [];
  const open = async (label) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${label} console: ${m.text()}`); });
    return p;
  };
  const host = await open('host');
  await host.goto(url + '?net=local');
  await host.click('[data-tab="online"]');
  await host.fill('#name', 'Alpha');
  await host.click('#host');
  await host.waitForSelector('.room-code');
  const code = (await host.textContent('.room-code')).trim();

  const guest = await open('guest');
  await guest.goto(`${url}?net=local&room=${code}`);
  await guest.fill('#name', 'Beta');
  await guest.click('#join-form button[type=submit]');
  await guest.waitForSelector('.room-code');
  await host.waitForSelector('text=Beta');
  await host.click('#add-slot');
  await host.click('[data-kind="bot"] >> nth=0');
  await host.screenshot({ path: `${out}/mp-room-host.png` });
  await guest.screenshot({ path: `${out}/mp-room-guest.png` });
  await host.click('#start');

  for (const p of [host, guest]) { await p.waitForSelector('[data-res]'); }
  await host.click('[data-res="regen"]');
  await guest.screenshot({ path: `${out}/mp-ban-guest.png` });
  await guest.click('[data-res="poison"]');
  for (const p of [host, guest]) { await p.waitForSelector('[data-char]:not([disabled])'); }
  await host.click('.char:not([disabled]) >> nth=0');
  await guest.click('.char:not([disabled]) >> nth=1');

  const players = [host, guest];
  const done = new Set();
  let rounds = 0;
  for (; rounds < 60 && done.size < players.length; rounds++) {
    for (const [i, p] of players.entries()) {
      if (done.has(i)) continue;
      if (LEAVE && i === 1 && rounds === 3) { await p.close(); done.add(i); continue; }
      if (REJOIN && i === 1 && rounds === 3) {
        // Leave mid-match, then join the same code again and carry on.
        await p.close();
        await host.waitForTimeout(500);
        const back = await open('guest2');
        await back.goto(`${url}?net=local&room=${code}`);
        await back.fill('#name', 'Beta');
        await back.click('#join-form button[type=submit]');
        await back.waitForSelector('.game, .final', { timeout: 20000 });
        await back.screenshot({ path: `${out}/mp-rejoined.png` });
        players[1] = back;
        continue;
      }
      // Wait for this page's shop (or the end).
      await p.waitForSelector('#fight:not([disabled]), .final, .spectate, [data-sig]', { timeout: 60000 }).catch(async (e) => { await p.screenshot({ path: `${out}/mp-stuck-${i}.png` }); throw e; });
      if (await p.$('[data-sig]')) { await p.click('[data-sig] >> nth=0'); await p.waitForSelector('#fight:not([disabled]), .final, .spectate', { timeout: 60000 }); }
      if (await p.$('.final')) { done.add(i); continue; }
      if (await p.$('.spectate')) continue;
      for (let k = 0; k < 4; k++) { const c = await p.$('.card[data-slot]:not([disabled])'); if (!c) break; await c.click(); await p.waitForTimeout(30); }
      await p.click('#fight');
    }
    if (rounds === 2) { await host.waitForTimeout(400); await host.screenshot({ path: `${out}/mp-fight-host.png` }); }
    // Each live player watches their fight, then continues.
    for (const [i, p] of players.entries()) {
      if (done.has(i) || p.isClosed()) continue;
      const el = await p.waitForSelector('#skip, #cont, .final, .spectate, .banner .waiting', { timeout: 60000 }).catch(() => null);
      if (!el) continue;
      if (await p.$('#skip')) await p.click('#skip').catch(() => {});
      const cont = await p.waitForSelector('#cont, .final, .spectate', { timeout: 30000 }).catch(() => null);
      if (await p.$('#cont')) await p.click('#cont').catch(() => {});
      if (await p.$('.final')) done.add(i);
    }
    if (rounds === 2) await guest.screenshot({ path: `${out}/mp-after-guest.png` });
  }
  for (const [i, p] of players.entries()) if (!p.isClosed()) await p.waitForSelector('.final', { timeout: 120000 }).catch(() => errors.push(`page ${i} never reached the final standings`));
  await host.screenshot({ path: `${out}/mp-over-host.png` });
  const hostRows = await host.$$eval('.final tbody tr', (rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ')));
  const guestRows = players[1].isClosed() ? null : await players[1].$$eval('.final tbody tr', (rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ')));
  console.log(JSON.stringify({ rounds, hostRows, guestRows, errors }, null, 1));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
