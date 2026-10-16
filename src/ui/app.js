import { TAGS, TRIGGERS, RESOURCES, TIER_UNLOCK, TIER_NAMES, HYBRID_REQ } from '../data/tags.js';
import { CARDS, CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { tagCounts, cardCost, sellValue, REROLL_COST } from '../engine/shop.js';
import {
  createMatch, submitBan, pickCharacter, visibleCharacters, buy, sell, reroll, toggleLock,
  makeFight, resolveFight, finishRound, chooseSignature, loadout, income, interest, START_HP, SIGNATURE_ROUND,
} from '../engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../ai/bot.js';
import { createArena } from './arena.js';

const ME = 0, FOE = 1;
const root = document.getElementById('app');
let M = null;
let ui = { screen: 'title', speed: 2, banner: null, mobileTab: null, toast: null };
let arena = null;
let fighting = false;
let toastTimer = 0;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function chip(tag, withName = false) {
  const t = TAGS[tag];
  const tip = t.kind === 'trigger' ? `${t.name} (trigger): ${t.passive}` : `${t.name}: ${t.stack}`;
  return `<span class="chip ${t.kind}" style="--c:${t.color}" title="${esc(tip)}">${withName ? t.name : t.glyph}</span>`;
}

function cardTags(card) {
  if (card.tier === 'counter') return `<span class="chip" style="--c:#b9b2a6">Counter</span>${card.counters ? `<span class="arrow">vs</span>${chip(card.counters, true)}` : ''}`;
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  const res = cardResources(card);
  if (trig.length && res.length) return `${chip(trig[0], true)}<span class="arrow">&#9656;</span>${chip(res[0], true)}`;
  return card.tags.map((t) => chip(t, true)).join('');
}

function record() {
  try { return JSON.parse(localStorage.getItem('stack-arena-record') || '{"w":0,"l":0}'); } catch { return { w: 0, l: 0 }; }
}
function saveRecord(won) {
  try {
    const r = record();
    if (won) r.w++; else r.l++;
    localStorage.setItem('stack-arena-record', JSON.stringify(r));
  } catch { /* storage unavailable */ }
}

function toast(msg) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------------------------------------------------------- screens

function render() {
  if (ui.screen !== 'game' && arena) { arena.destroy(); arena = null; }
  if (ui.screen === 'title') return renderTitle();
  if (ui.screen === 'ban') return renderBan();
  if (ui.screen === 'pick') return renderPick();
  if (ui.screen === 'over') return renderOver();
  return renderGame();
}

function renderTitle() {
  const r = record();
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">A 1v1 auto-battler</div>
      <h1 class="brand">Stack <span>Arena</span></h1>
    </div>
    <p class="lede">Pick a gladiator, buy buff cards from the shop between rounds, and watch the fight play out by itself.
      Cards give you <b>stacks</b>. The more cards you own of one kind, the better the cards that show up.</p>
    <div class="row">
      <button class="btn primary" id="start" style="font-family:var(--display);font-size:26px;font-weight:400;padding:6px 28px">Enter the arena</button>
      ${r.w + r.l ? `<span class="eyebrow">Your record: ${r.w} won, ${r.l} lost</span>` : ''}
    </div>
    <div class="rules">
      <div class="rule"><h3>Triggers and resources</h3><p>Triggers decide <i>when</i> you gain stacks (Strike, Crit, Dodge, Pain, Spell). Resources decide <i>what</i> stacks do. A card like ${chip('precision', true)} <span class="arrow">&#9656;</span> ${chip('poison', true)} always fires. Cards with only a resource fire 30% of the time.</p></div>
      <div class="rule"><h3>Build up, unlock more</h3><p>Own ${TIER_UNLOCK[2]}, ${TIER_UNLOCK[3]} and ${TIER_UNLOCK[4]} cards of a tag to unlock its Uncommon, Rare and Mythic cards. Own ${HYBRID_REQ} of two resources to unlock their Hybrid card.</p></div>
      <div class="rule"><h3>Bans</h3><p>You and your rival each secretly ban one resource. Banned cards never appear, and gladiators who only use banned resources sit the match out.</p></div>
      <div class="rule"><h3>Focus, not luck</h3><p>Dodging builds Focus. Every hit you take adds to your dodge chance, and a dodge resets it, so you can never dodge twice in a row. Poison, Bleed and abilities can't be dodged.</p></div>
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:10px">The thirteen tags</div>
      <div class="tag-legend">
        ${Object.keys(TAGS).map((t) => `<div>${chip(t, true)}<span>${esc(TAGS[t].kind === 'trigger' ? TAGS[t].passive : TAGS[t].stack)}</span></div>`).join('')}
      </div>
    </div>
  </div></div>`;
  root.querySelector('#start').onclick = () => {
    M = createMatch({ seed: Math.floor(Math.random() * 1e9), players: [{ name: 'You' }, { name: 'Rival', isBot: true }] });
    ui.screen = 'ban';
    render();
  };
}

function renderBan() {
  const banned = M.phase !== 'ban';
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">Step 1 of 2</div>
      <h1 style="font-size:48px">${banned ? 'The bans are in' : 'Ban one resource'}</h1>
      <p class="lede">${banned
        ? 'Neither of you saw the other\'s choice. These resources are gone for the whole match.'
        : 'Your rival is choosing at the same time. Ban what you least want to fight.'}</p>
    </div>
    <div class="ban-grid">
      ${RESOURCES.map((r) => {
        const t = TAGS[r];
        const mine = M.players[ME].ban === r, theirs = M.players[FOE].ban === r;
        const isBanned = banned && (mine || theirs);
        const who = mine && theirs ? 'Banned by both of you' : mine ? 'Your ban' : theirs ? 'Rival\'s ban' : '';
        return `<button class="ban-tile ${isBanned ? 'banned' : ''}" style="--c:${t.color}" data-res="${r}" ${banned ? 'disabled' : ''}>
          <span class="name">${t.name}</span><p>${esc(t.stack)}</p>
          ${isBanned ? `<span class="stamp">Banned</span><span class="who">${who}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    ${banned ? `<div><button class="btn primary" id="next">Choose your gladiator</button></div>` : ''}
  </div></div>`;
  root.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => {
    botBan(M, FOE);
    submitBan(M, ME, b.dataset.res);
    render();
  });
  root.querySelector('#next')?.addEventListener('click', () => { ui.screen = 'pick'; render(); });
}

function charStats(c) {
  const s = { hp: 600, ad: 30, as: 1.0, crit: 0.05, manaMax: 100, ...c.stats };
  return `${s.hp} HP · ${s.ad} damage · ${s.as.toFixed(2)} attacks/s · ${Math.round(s.crit * 100)}% crit · ${s.manaMax} mana`;
}

function renderPick() {
  const vis = visibleCharacters(M.bans);
  const hidden = CHARACTERS.filter((c) => characterStatus(c, M.bans) === 'hidden');
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">Step 2 of 2 · Banned: ${M.bans.map((b) => chip(b, true)).join(' ')}</div>
      <h1 style="font-size:48px">Choose your gladiator</h1>
      <p class="lede">Each gladiator has a trigger and one or two resources. The shop offers their cards more often, and their ability grows with those stacks.</p>
    </div>
    <div class="char-grid">
      ${vis.map(({ char: c, status }) => `
        <button class="char" data-char="${c.id}">
          <div class="row" style="gap:6px">${chip(c.trigger, true)}<span class="arrow">&#9656;</span>${c.resources.map((r) => chip(r, true)).join('')}</div>
          <div><div class="nm">${esc(c.name)}</div><div class="ep">${esc(c.epithet)}</div></div>
          <div class="ab"><b>${esc(c.ability.name)}:</b> ${esc(c.ability.desc())}</div>
          <div class="inn">Innate: ${esc(c.innate.desc)}</div>
          <div class="stats num">${charStats(c)}</div>
          ${status === 'weakened' ? `<div class="warn">${c.resources.filter((r) => M.bans.includes(r)).map((r) => TAGS[r].name).join(', ')} is banned. This build is weaker.</div>` : ''}
        </button>`).join('')}
    </div>
    ${hidden.length ? `<p class="hidden-note">Sitting out (all their resources are banned): ${hidden.map((c) => esc(c.name)).join(', ')}.</p>` : ''}
  </div></div>`;
  root.querySelectorAll('[data-char]').forEach((b) => b.onclick = () => {
    botPick(M, FOE);
    pickCharacter(M, ME, b.dataset.char);
    afterRoundStart();
    ui.screen = 'game';
    render();
  });
}

function afterRoundStart() {
  if (M.phase === 'signature') botSignature(M, FOE);
  if (M.phase === 'shop') botShop(M, FOE);
}

// ---------------------------------------------------------------- game

function renderGame() {
  if (!root.querySelector('.game')) {
    root.innerHTML = `
    <div class="game" style="display:flex;flex-direction:column;height:100%">
      <header class="hud" id="hud"></header>
      <div class="mobile-tabs" id="mtabs"></div>
      <main class="stage">
        <aside class="side" id="mine" aria-label="Your build"></aside>
        <section class="arena-wrap" aria-label="Arena">
          <canvas id="arena" aria-label="Fight view"></canvas>
          <div class="speed" id="speed"></div>
          <div id="banner"></div>
        </section>
        <aside class="side foe" id="foe" aria-label="Rival build"></aside>
      </main>
      <footer class="tray" id="tray"></footer>
      <div id="modal"></div>
    </div>`;
    arena = createArena(root.querySelector('#arena'));
    arena.setSpeed(ui.speed);
  }
  if (!fighting) arena.setPreview(loadout(M.players[ME]), loadout(M.players[FOE]));
  updateGame();
}

function updateGame() {
  renderHud();
  renderSide('mine', M.players[ME], true);
  renderSide('foe', M.players[FOE], false);
  renderTray();
  renderSpeed();
  renderBanner();
  renderModal();
  renderTabs();
}

function renderHud() {
  const me = M.players[ME], foe = M.players[FOE];
  const life = (p, cls) => `
    <div class="life ${cls}">
      <div class="top"><span>${esc(p.name)} · ${esc(CHAR_BY_ID[p.charId].name)}</span><span class="num">${p.hp} / ${START_HP}</span></div>
      <div class="bar"><i style="width:${(p.hp / START_HP) * 100}%"></i></div>
    </div>`;
  root.querySelector('#hud').innerHTML = `
    <div class="logo">Stack <span>Arena</span></div>
    <div class="round"><span class="eyebrow">Round</span><b class="num">${M.round}</b></div>
    <div class="eyebrow">Bans: ${M.bans.map((b) => chip(b, true)).join(' ')}</div>
    <div class="vs">${life(me, 'me')}${life(foe, 'foe')}</div>
    <div class="tools"><button class="btn" id="codex" title="What every tag does">Tags</button></div>`;
  root.querySelector('#codex').onclick = () => { ui.modal = 'codex'; renderModal(); };
}

function tierProgress(counts) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="empty">No cards yet. Buy from the shop below.</p>';
  return entries.map(([t, n]) => {
    const next = [2, 3, 4].find((k) => n < TIER_UNLOCK[k]);
    const max = TIER_UNLOCK[4];
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'f' : ''} ${[TIER_UNLOCK[2], TIER_UNLOCK[3], TIER_UNLOCK[4]].includes(i + 1) ? 'mark' : ''}"></i>`).join('');
    return `<div class="prog" style="--c:${TAGS[t].color}">
      <span>${chip(t, true)} <span class="num">${n}</span></span>
      <span class="pips">${pips}</span>
      <span class="next">${next ? `${TIER_NAMES[next]} at ${TIER_UNLOCK[next]}` : 'All tiers'}</span>
    </div>`;
  }).join('');
}

function renderSide(id, p, mine) {
  const el = root.querySelector('#' + id);
  const c = CHAR_BY_ID[p.charId];
  const counts = tagCounts(p.cards);
  const owned = Object.entries(p.cards).sort((a, b) => CARD_BY_ID[a[0]].name.localeCompare(CARD_BY_ID[b[0]].name));
  const sig = p.sig && c.signatures.find((s) => s.id === p.sig);
  const hybrids = mine ? CARDS.filter((h) => h.tier === 'hybrid' && !h.tags.some((t) => M.bans.includes(t)) && h.tags.every((t) => (counts[t] || 0) >= 2) && !h.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ)) : [];
  el.innerHTML = `
    <div>
      <div class="eyebrow">${mine ? 'Your gladiator' : 'Rival'}</div>
      <h2>${esc(c.name)}</h2>
      <div class="sub">${chip(c.trigger, true)} ${c.resources.map((r) => chip(r, true)).join(' ')}</div>
    </div>
    <div class="sub"><b style="color:var(--bronze)">${esc(c.ability.name)}</b>: ${esc(c.ability.desc())}${sig ? `<br><b style="color:var(--bronze)">${esc(sig.name)}</b>: ${esc(sig.desc)}` : ''}</div>
    <div><div class="eyebrow" style="margin-bottom:6px">Tag progress</div><div class="progress">${tierProgress(counts)}</div></div>
    ${hybrids.length ? `<div class="sub">Close to a Hybrid: ${hybrids.map((h) => `${esc(h.name)} (${h.tags.map((t) => `${TAGS[t].name} ${counts[t] || 0}/${HYBRID_REQ}`).join(', ')})`).join('; ')}</div>` : ''}
    <div><div class="eyebrow" style="margin-bottom:6px">Cards (${owned.reduce((s, [, n]) => s + n, 0)})</div>
      <div class="owned">${owned.length ? owned.map(([cid, n]) => {
        const card = CARD_BY_ID[cid];
        return `<div class="own" title="${esc(card.desc(n))}"><span>${esc(card.name)}</span><span class="n num">x${n}</span>${mine && !fighting ? `<button class="sellb" data-sell="${cid}" title="Sell one copy">Sell +${sellValue(card)}</button>` : '<span></span>'}</div>`;
      }).join('') : '<p class="empty">Nothing yet.</p>'}</div>
    </div>`;
  el.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => {
    sell(M, ME, b.dataset.sell);
    arena.setPreview(loadout(M.players[ME]), loadout(M.players[FOE]));
    updateGame();
  });
}

function renderTray() {
  const p = M.players[ME];
  const el = root.querySelector('#tray');
  const locked = fighting || M.phase !== 'shop' || !!ui.banner;
  el.innerHTML = `
    <div class="purse">
      <div class="gold"><b class="num">${p.gold}</b><span>gold<br>+${income(M.round + 1) + interest(p.gold)} next round</span></div>
      <div class="row">
        <button class="btn" id="reroll" ${locked || p.gold < REROLL_COST ? 'disabled' : ''} title="New cards (R)">Reroll ${REROLL_COST}</button>
        <button class="btn ${p.locked ? 'on' : ''}" id="lock" ${locked ? 'disabled' : ''} title="Keep these cards for next round">${p.locked ? 'Locked' : 'Lock'}</button>
      </div>
    </div>
    <div class="cards" role="list">
      ${p.shop.map((cid, i) => {
        if (!cid) return `<div class="card sold t-1" aria-hidden="true"></div>`;
        const card = CARD_BY_ID[cid];
        const have = p.cards[cid] || 0;
        const cost = cardCost(card);
        const poor = cost > p.gold;
        return `<button class="card t-${card.tier} ${poor ? 'poor' : ''}" role="listitem" data-slot="${i}" ${locked || poor || have >= card.max ? 'disabled' : ''} title="Buy (${i + 1})">
          <span class="cost num">${cost}</span>
          <div class="top">${cardTags(card)}</div>
          <div class="nm">${esc(card.name)}</div>
          <div class="ds">${esc(card.desc(have + 1))}</div>
          <div class="ft"><span>${TIER_NAMES[card.tier]}</span><span class="num">${have ? `Owned ${have}/${card.max}` : `Max ${card.max}`}</span></div>
        </button>`;
      }).join('')}
    </div>
    <div class="go">
      <button class="btn primary" id="fight" ${locked ? 'disabled' : ''}>Fight</button>
      <div class="hint">Keys: 1-5 buy · R reroll · F fight</div>
    </div>`;
  el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => doBuy(Number(b.dataset.slot)));
  el.querySelector('#reroll').onclick = () => { reroll(M, ME); updateGame(); };
  el.querySelector('#lock').onclick = () => { toggleLock(M, ME); renderTray(); };
  el.querySelector('#fight').onclick = startFight;
}

function doBuy(slot) {
  if (fighting || M.phase !== 'shop' || ui.banner) return;
  const p = M.players[ME];
  const before = tagCounts(p.cards);
  if (!buy(M, ME, slot)) { toast('Not enough gold.'); return; }
  const after = tagCounts(p.cards);
  for (const t of Object.keys(after)) {
    for (const k of [2, 3, 4]) {
      if ((before[t] || 0) < TIER_UNLOCK[k] && after[t] >= TIER_UNLOCK[k]) toast(`${TAGS[t].name} ${TIER_NAMES[k]} cards unlocked`);
    }
  }
  for (const h of CARDS.filter((c) => c.tier === 'hybrid')) {
    if (h.tags.every((t) => (after[t] || 0) >= HYBRID_REQ) && !h.tags.every((t) => (before[t] || 0) >= HYBRID_REQ) && !h.tags.some((t) => M.bans.includes(t))) toast(`Hybrid unlocked: ${h.name}`);
  }
  arena.setPreview(loadout(M.players[ME]), loadout(M.players[FOE]));
  updateGame();
}

function renderSpeed() {
  const el = root.querySelector('#speed');
  el.innerHTML = [1, 2, 4].map((s) => `<button class="btn ${ui.speed === s ? 'on' : ''}" data-speed="${s}">${s}x</button>`).join('') +
    (fighting ? `<button class="btn" id="skip">Skip</button>` : '');
  el.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { ui.speed = Number(b.dataset.speed); arena.setSpeed(ui.speed); renderSpeed(); });
  el.querySelector('#skip')?.addEventListener('click', () => arena.skip());
}

function startFight() {
  if (fighting || M.phase !== 'shop' || ui.banner) return;
  fighting = true;
  const f = makeFight(M, ME, FOE);
  arena.play(f, (result) => {
    fighting = false;
    const summary = resolveFight(M, ME, FOE, result);
    const s = result.stats[ME], o = result.stats[FOE];
    ui.banner = {
      outcome: summary.winner === ME ? 'win' : summary.winner === FOE ? 'loss' : 'draw',
      damage: summary.damage,
      time: result.time,
      line: `You dealt ${Math.round(s.dealt)} damage and took ${Math.round(s.taken)}.` +
        (s.dodges ? ` ${plural(s.dodges, 'dodge')}.` : '') + (s.crits ? ` ${plural(s.crits, 'crit')}.` : '') + (s.freezes ? ` ${plural(s.freezes, 'freeze')}.` : '') +
        (o.dodges ? ` Your rival dodged ${plural(o.dodges, 'time')}.` : ''),
    };
    updateGame();
  });
  updateGame();
}

function renderBanner() {
  const el = root.querySelector('#banner');
  const b = ui.banner;
  if (!b) { el.innerHTML = ''; return; }
  const over = M.players.some((p) => p.hp <= 0);
  const title = b.outcome === 'win' ? 'Victory' : b.outcome === 'loss' ? 'Defeat' : 'Draw';
  const sub = b.outcome === 'win' ? `Your rival loses ${b.damage} HP.` : b.outcome === 'loss' ? `You lose ${b.damage} HP.` : `You both lose ${Math.ceil(b.damage)} HP.`;
  el.innerHTML = `<div class="banner ${b.outcome}" role="status">
    <span class="eyebrow">Round ${M.round} · ${b.time.toFixed(1)}s</span>
    <h2>${title}</h2><p>${sub}</p><p style="font-size:13px">${esc(b.line)}</p>
    <button class="btn primary" id="cont">${over ? 'See the result' : 'Next round'}</button>
  </div>`;
  el.querySelector('#cont').onclick = nextRound;
  el.querySelector('#cont').focus({ preventScroll: true });
}

function nextRound() {
  ui.banner = null;
  finishRound(M);
  if (M.phase === 'over') {
    saveRecord(M.players[ME].hp > 0);
    ui.screen = 'over';
    render();
    return;
  }
  afterRoundStart();
  arena.setPreview(loadout(M.players[ME]), loadout(M.players[FOE]));
  updateGame();
}

function renderModal() {
  const el = root.querySelector('#modal');
  if (M.phase === 'signature' && !M.players[ME].sig) {
    const c = CHAR_BY_ID[M.players[ME].charId];
    el.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="sigt">
      <div class="eyebrow">Round ${SIGNATURE_ROUND} milestone</div>
      <h2 id="sigt">Choose a signature for ${esc(c.name)}</h2>
      <p style="margin:0;color:var(--dust)">This upgrade lasts for the rest of the match.</p>
      <div class="sig-grid">${c.signatures.map((s) => `<button class="sig" data-sig="${s.id}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></button>`).join('')}</div>
    </div></div>`;
    el.querySelectorAll('[data-sig]').forEach((b) => b.onclick = () => {
      chooseSignature(M, ME, b.dataset.sig);
      if (M.phase === 'shop') botShop(M, FOE);
      arena.setPreview(loadout(M.players[ME]), loadout(M.players[FOE]));
      updateGame();
    });
    return;
  }
  if (ui.modal === 'codex') {
    el.innerHTML = `<div class="modal-back" id="mb"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cdx">
      <div class="row" style="justify-content:space-between"><h2 id="cdx">The thirteen tags</h2><button class="btn" id="close">Close</button></div>
      <p style="margin:0;color:var(--dust)">Dashed chips are triggers: owning cards of a trigger makes it happen more. Solid chips are resources. Resources marked "on the enemy" show dashed in the arena.</p>
      <div class="tag-legend">${Object.keys(TAGS).map((t) => `<div>${chip(t, true)}<span>${esc(TAGS[t].kind === 'trigger' ? TAGS[t].passive : TAGS[t].stack)}</span></div>`).join('')}</div>
      <p style="margin:0;color:var(--dust)">Tiers unlock per tag at ${TIER_UNLOCK[2]} / ${TIER_UNLOCK[3]} / ${TIER_UNLOCK[4]} cards. Hybrids need ${HYBRID_REQ} cards in both of their resources. After ${30}s of a fight, all damage ramps up by 8% per second.</p>
    </div></div>`;
    const close = () => { ui.modal = null; renderModal(); };
    el.querySelector('#close').onclick = close;
    el.querySelector('#mb').onclick = (e) => { if (e.target.id === 'mb') close(); };
    return;
  }
  el.innerHTML = '';
}

function renderTabs() {
  const el = root.querySelector('#mtabs');
  el.innerHTML = `<button class="btn ${ui.mobileTab === 'mine' ? 'on' : ''}" data-tab="mine">Your build</button><button class="btn ${ui.mobileTab === 'foe' ? 'on' : ''}" data-tab="foe">Rival</button>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.mobileTab = ui.mobileTab === b.dataset.tab ? null : b.dataset.tab; renderTabs(); });
  root.querySelector('#mine').classList.toggle('show', ui.mobileTab === 'mine');
  root.querySelector('#foe').classList.toggle('show', ui.mobileTab === 'foe');
}

function renderOver() {
  const me = M.players[ME], foe = M.players[FOE];
  const won = me.hp > 0;
  const list = (p) => Object.entries(p.cards).map(([id, n]) => `${esc(CARD_BY_ID[id].name)} x${n}`).join(', ') || 'No cards';
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">After ${M.round} rounds · ${me.wins} fights won, ${foe.wins} lost</div>
      <h1 class="brand" style="color:${won ? 'var(--bronze)' : 'var(--blood)'}">${won ? 'Champion' : 'Fallen'}</h1>
    </div>
    <div class="rules">
      <div class="rule"><h3>${esc(CHAR_BY_ID[me.charId].name)} (you)</h3><div class="progress">${tierProgress(tagCounts(me.cards))}</div><p>${list(me)}</p></div>
      <div class="rule"><h3>${esc(CHAR_BY_ID[foe.charId].name)} (rival)</h3><div class="progress">${tierProgress(tagCounts(foe.cards))}</div><p>${list(foe)}</p></div>
    </div>
    <div class="row"><button class="btn primary" id="again">Play again</button><button class="btn" id="home">Back to title</button></div>
  </div></div>`;
  root.querySelector('#again').onclick = () => {
    M = createMatch({ seed: Math.floor(Math.random() * 1e9), players: [{ name: 'You' }, { name: 'Rival', isBot: true }] });
    ui.screen = 'ban';
    render();
  };
  root.querySelector('#home').onclick = () => { ui.screen = 'title'; render(); };
}

document.addEventListener('keydown', (e) => {
  if (ui.screen !== 'game' || e.target.closest?.('input,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && ui.modal) { ui.modal = null; renderModal(); return; }
  if (M.phase !== 'shop' || fighting || ui.banner) {
    if ((e.key === 'Enter' || e.key === ' ') && ui.banner && document.activeElement?.id !== 'cont') { e.preventDefault(); nextRound(); }
    return;
  }
  if (e.key >= '1' && e.key <= '5') doBuy(Number(e.key) - 1);
  else if (e.key === 'r' || e.key === 'R') { if (reroll(M, ME)) updateGame(); }
  else if (e.key === 'f' || e.key === 'F') startFight();
});

// Keep the match across live updates of the page.
function start(data) {
  if (data && data.M) {
    M = data.M;
    ui = { ...ui, ...data.ui, banner: data.ui?.banner || null, modal: null };
  }
  render();
}
window.claude?.hot?.snapshot?.(() => ({ M, ui: { screen: ui.screen, speed: ui.speed, banner: ui.banner } }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
