// Drives a full match in headless Chromium: ban, pick, then buy/fight until
// the match ends. Reports console errors and saves screenshots.
//   NODE_PATH=$(npm root -g) node tools/playtest.cjs <outdir> [width] [height] [players=2]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.';
const W = Number(process.argv[3] || 1360), H = Number(process.argv[4] || 860);
const PLAYERS = Number(process.argv[5] || 2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.waitForTimeout(400);
  const tag = `${W}x${H}-p${PLAYERS}`;
  // Fresh lobby: one rival, then add more.
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await page.screenshot({ path: `${out}/${tag}-1-title.png`, fullPage: false });
  for (let i = 2; i < PLAYERS; i++) await page.click('#add-bot');
  await page.click('[data-slot="0"][data-slot-level="hard"]');
  await page.screenshot({ path: `${out}/${tag}-1b-level.png` });
  await page.click('#start');
  await page.click('[data-res="regen"]');
  await page.screenshot({ path: `${out}/${tag}-2-bans.png` });
  await page.click('#next');
  await page.screenshot({ path: `${out}/${tag}-3-pick.png` });
  await page.click('.char >> nth=0');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${tag}-4-shop.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) errors.push(`page scrolls sideways by ${overflow}px`);
  let rounds = 0;
  for (; rounds < 40; rounds++) {
    if (await page.$('[data-sig]')) await page.click('[data-sig] >> nth=0');
    // buy affordable cards left to right
    for (let i = 0; i < 6; i++) {
      const btn = await page.$('.card[data-slot]:not([disabled])');
      if (!btn) break;
      await btn.click();
    }
    if (rounds === 5) await page.screenshot({ path: `${out}/${tag}-5-midgame.png` });
    await page.click('#fight');
    await page.waitForTimeout(rounds === 5 ? 2500 : 200);
    if (rounds === 5) await page.screenshot({ path: `${out}/${tag}-6-fighting.png` });
    if (await page.$('#skip')) await page.click('#skip').catch(() => {});
    await page.waitForSelector('#cont', { timeout: 15000 });
    if (rounds === 5) await page.screenshot({ path: `${out}/${tag}-7-result.png` });
    const label = await page.textContent('#cont');
    await page.click('#cont');
    if (label.includes('See the result') || label.includes('Finish the match')) break;
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/${tag}-8-over.png` });
  const heading = await page.textContent('h1');
  const placesOk = PLAYERS === 2 || (await page.$$('.final tbody tr')).length === PLAYERS;
  if (!placesOk) errors.push('final standings table has the wrong number of rows');
  console.log(JSON.stringify({ rounds: rounds + 1, result: heading, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
