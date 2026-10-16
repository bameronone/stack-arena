import { TAGS, TRIGGERS, RESOURCES, TIER_UNLOCK, TIER_NAMES, HYBRID_REQ } from '../data/tags.js';
import { CARDS, CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { tagCounts, cardCost, REROLL_COST } from '../engine/shop.js';
import {
  createMatch, submitBan, pickCharacter, visibleCharacters, buy, reroll, toggleLock,
  makeFight, resolveFight, resolveOtherFights, finishRound, chooseSignature, loadout, income, interest, START_HP, SIGNATURE_ROUND,
  opponentOf, standings, MAX_PLAYERS, BAN_COUNT,
} from '../engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../ai/bot.js';
import { createArena } from './arena.js';

const ME = 0;
const root = document.getElementById('app');
let M = null;
let ui = { screen: 'title', speed: 2, banner: null, mobileTab: null, toast: null, lobby: loadLobby() };
const BOT_NAMES = ['Varro', 'Lucia', 'Crixus', 'Flamma', 'Priscus', 'Verus', 'Tetraites'];

// This round's opponent as { p, ghost }, or null if you're out.
function foe() {
  const o = M && opponentOf(M, ME);
  return o ? { p: M.players[o.id], ghost: o.ghost } : null;
}
function foeLoadout() {
  const f = foe();
  return f ? loadout(f.p) : loadout(M.players.find((p) => p.id !== ME));
}
function playerLabel(p) {
  return p.isBot ? `${p.name} (${DIFFICULTY[p.level || 'normal'].name})` : p.name;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const isDuel = () => M.players.length === 2;

const DIFFICULTY = {
  easy: { name: 'Squire', desc: 'Buys on impulse. Good for learning the cards.' },
  normal: { name: 'Gladiator', desc: 'Plans a build, manages gold and counters your main resource.' },
  hard: { name: 'Champion', desc: 'Also test-fights cards against your build before buying them.' },
};
const DIFFICULTY_IDS = Object.keys(DIFFICULTY);
// The lobby is the list of bot rivals' difficulty levels (1 to 7 of them).
function loadLobby() {
  try {
    const saved = JSON.parse(localStorage.getItem('stack-arena-lobby'));
    if (Array.isArray(saved) && saved.length && saved.every((l) => DIFFICULTY_IDS.includes(l))) return saved.slice(0, MAX_PLAYERS - 1);
  } catch { /* storage unavailable */ }
  return ['normal'];
}
function newMatch() {
  try { localStorage.setItem('stack-arena-lobby', JSON.stringify(ui.lobby)); } catch { /* storage unavailable */ }
  M = createMatch({
    seed: Math.floor(Math.random() * 1e9),
    players: [{ name: 'You' }, ...ui.lobby.map((level, i) => ({ name: BOT_NAMES[i], isBot: true, level }))],
  });
  ui.fightStats = null;
  ui.screen = 'ban';
  render();
}
let arena = null;
let fighting = false;
let toastTimer = 0;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tagTip(tag) {
  const t = TAGS[tag];
  return `<b style="color:${t.color}">${t.name}</b> <span class="tip-kind">${t.kind}</span><br>${esc(t.kind === 'trigger' ? t.passive : t.stack)}`;
}

function chip(tag, withName = false) {
  const t = TAGS[tag];
  return `<span class="chip ${t.kind}" style="--c:${t.color}" data-tip="${esc(tagTip(tag))}">${withName ? t.name : t.glyph}</span>`;
}

// Keywords in card text get their tag's color and a hover explanation.
const KEYWORDS = /\b(On attack|On crit|On dodge|On cast|Wounded|Fire|Frost|Poison|Bleed|Shield|Regen|Mana stacks?|Armor|Focus)\b/g;
const KEYWORD_TAG = { 'On attack': 'strike', 'On crit': 'precision', 'On dodge': 'evasion', 'On cast': 'spell', Wounded: 'pain', Focus: 'evasion' };
function richText(text) {
  return esc(text).replace(KEYWORDS, (w) => {
    const tag = KEYWORD_TAG[w] || (w.startsWith('Mana') ? 'arcane' : w.toLowerCase());
    return `<span class="kw" style="--c:${TAGS[tag].color}" data-tip="${esc(tagTip(tag))}">${w}</span>`;
  });
}

// Card text with every number that changes with copies underlined. Hovering
// one shows its value at each copy count.
function richDesc(card, n) {
  const split = (s) => s.split(/(\d+(?:\.\d+)?)/);
  const cur = split(card.desc(n));
  const variants = card.max > 1 ? Array.from({ length: card.max }, (_, k) => split(card.desc(k + 1)).filter((_, i) => i % 2)) : [];
  const aligned = variants.length && variants.every((v) => v.length === (cur.length - 1) / 2);
  return cur.map((part, i) => {
    if (i % 2 === 0) return richText(part);
    const vals = aligned ? variants.map((v) => v[(i - 1) / 2]) : [];
    if (new Set(vals).size < 2) return esc(part);
    const tip = `<b>Scales with copies</b><div class="tip-rows">${vals.map((v, k) =>
      `<span class="${k + 1 === n ? 'cur' : ''}">${k + 1} ${k ? 'copies' : 'copy'}<b class="num">${v}</b></span>`).join('')}</div>`;
    return `<span class="scale" data-tip="${esc(tip)}">${part}</span>`;
  }).join('');
}

// Fight stats: damage dealt, healing, and damage prevented, by source.
const SOURCE_COLOR = {
  Attacks: '#c9b79c', Poison: TAGS.poison.color, Bleed: TAGS.bleed.color, Thorns: TAGS.armor.color, 'Molten Armor': TAGS.fire.color,
  Shatter: TAGS.frost.color, Pandemic: TAGS.poison.color, 'Reflective Plating': TAGS.shield.color, 'Undying Spite': TAGS.pain.color,
  Regen: TAGS.regen.color, 'Bleed lifesteal': TAGS.bleed.color, 'Plague Lord': TAGS.poison.color, 'Phoenix Core': TAGS.fire.color,
  Armor: TAGS.armor.color, Shield: TAGS.shield.color, Dodge: TAGS.evasion.color, Resistances: '#b9b2a6', Immunity: '#e9dcc0',
  'Living Mountain': TAGS.armor.color, 'Mana Shield': TAGS.arcane.color,
};
function statGroup(title, table) {
  const rows = Object.entries(table || {}).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const max = rows.length ? rows[0][1] : 1;
  return `<div class="sg">
    <div class="sg-h"><span>${title}</span><span class="num">${Math.round(total)}</span></div>
    ${rows.length ? rows.map(([k, v]) => `<div class="sr"><span class="sn">${esc(k)}</span><span class="sb"><i style="width:${(v / max) * 100}%;background:${SOURCE_COLOR[k] || TAGS.spell.color}"></i></span><span class="sv num">${Math.round(v)}</span></div>`).join('') : '<div class="sr none">None</div>'}
  </div>`;
}
function statsPanel(side) {
  const fs = ui.fightStats;
  if (!fs) return `<div class="eyebrow">Fight stats</div><p class="empty">Damage, healing and damage prevented, by source, show here once a fight starts.</p>`;
  const s = fs.stats[side];
  return `<div class="eyebrow">${fs.live ? 'This fight' : `Last fight · round ${fs.round}`}</div>
    ${statGroup('Damage dealt', s.dmg)}${statGroup('Healing', s.heal)}${statGroup('Damage prevented', s.mit)}`;
}
function refreshStats() {
  for (const [id, side] of [['stats-mine', 0], ['stats-foe', 1]]) {
    const el = root.querySelector('#' + id);
    if (el) el.innerHTML = statsPanel(side);
  }
}

function cardTags(card) {
  if (card.tier === 'counter') return `<span class="chip" style="--c:#b9b2a6">Counter</span>${card.counters ? `<span class="arrow">vs</span>${chip(card.counters, true)}` : ''}`;
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  const res = cardResources(card);
  if (trig.length && res.length) return `${chip(trig[0], true)}<span class="arrow">&#9656;</span>${chip(res[0], true)}`;
  return card.tags.map((t) => chip(t, true)).join('');
}

function ffaRecord() {
  try { return JSON.parse(localStorage.getItem('stack-arena-ffa') || '{"games":0,"wins":0,"places":0}'); } catch { return { games: 0, wins: 0, places: 0 }; }
}
function saveResult() {
  const me = M.players[ME];
  if (isDuel()) return saveRecord(M.players[1].level || 'normal', me.placement === 1);
  try {
    const r = ffaRecord();
    r.games++; r.places += me.placement; if (me.placement === 1) r.wins++;
    localStorage.setItem('stack-arena-ffa', JSON.stringify(r));
  } catch { /* storage unavailable */ }
}
function record(level) {
  try { return JSON.parse(localStorage.getItem('stack-arena-record-' + level) || '{"w":0,"l":0}'); } catch { return { w: 0, l: 0 }; }
}
function saveRecord(level, won) {
  try {
    const r = record(level);
    if (won) r.w++; else r.l++;
    localStorage.setItem('stack-arena-record-' + level, JSON.stringify(r));
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
  const t = document.querySelector('.toast');
  if (t) t.hidden = true;
  if (ui.screen === 'title') return renderTitle();
  if (ui.screen === 'ban') return renderBan();
  if (ui.screen === 'pick') return renderPick();
  if (ui.screen === 'over') return renderOver();
  return renderGame();
}

function renderTitle() {
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">An auto-battler for 2 to 8 gladiators</div>
      <h1 class="brand">Stack <span>Arena</span></h1>
    </div>
    <p class="lede">Pick a gladiator, buy buff cards from the shop between rounds, and watch the fight play out by itself.
      Cards give you <b>stacks</b>. The more cards you own of one kind, the better the cards that show up.</p>
    ${renderLobby()}
    <div class="row">
      <button class="btn primary" id="start" style="font-family:var(--display);font-size:26px;font-weight:400;padding:6px 28px">Enter the arena</button>
    </div>
    <div class="rules">
      <div class="rule"><h3>Triggers and resources</h3><p>Triggers decide <i>when</i> you gain stacks (Strike, Crit, Dodge, Wounded, Spell). Resources decide <i>what</i> stacks do. A card like ${chip('precision', true)} <span class="arrow">&#9656;</span> ${chip('poison', true)} always fires. Cards with only a resource fire 30% of the time.</p></div>
      <div class="rule"><h3>Build up, unlock more</h3><p>Own ${TIER_UNLOCK[2]}, ${TIER_UNLOCK[3]} and ${TIER_UNLOCK[4]} cards of a tag to unlock its Uncommon, Rare and Mythic cards. Own ${HYBRID_REQ} of two resources to unlock their Hybrid card.</p></div>
      <div class="rule"><h3>Bans</h3><p>Every gladiator secretly votes to ban one resource, and the two with the most votes are banned. Banned cards never appear, and gladiators who only use banned resources sit the match out.</p></div>
      <div class="rule"><h3>Focus, not luck</h3><p>Dodging builds Focus. Every hit you take adds to your dodge chance, and a dodge resets it, so you can never dodge twice in a row. Poison, Bleed and abilities can't be dodged.</p></div>
    </div>
    <div>
      <div class="eyebrow" style="margin-bottom:10px">The thirteen tags</div>
      <div class="tag-legend">
        ${Object.keys(TAGS).map((t) => `<div>${chip(t, true)}<span>${esc(TAGS[t].kind === 'trigger' ? TAGS[t].passive : TAGS[t].stack)}</span></div>`).join('')}
      </div>
    </div>
  </div></div>`;
  root.querySelectorAll('[data-slot-level]').forEach((b) => b.onclick = () => {
    ui.lobby[Number(b.dataset.slot)] = b.dataset.slotLevel;
    renderTitle();
  });
  root.querySelectorAll('[data-remove]').forEach((b) => b.onclick = () => { ui.lobby.splice(Number(b.dataset.remove), 1); renderTitle(); });
  root.querySelector('#add-bot')?.addEventListener('click', () => { ui.lobby.push(ui.lobby[ui.lobby.length - 1] || 'normal'); renderTitle(); });
  root.querySelector('#start').onclick = newMatch;
}

function renderLobby() {
  const duel = ui.lobby.length === 1;
  const ffa = ffaRecord();
  const r = duel ? record(ui.lobby[0]) : null;
  const recLine = duel
    ? (r.w + r.l ? `Your record against ${DIFFICULTY[ui.lobby[0]].name}: ${r.w}-${r.l}` : '')
    : (ffa.games ? `Free-for-all: ${ffa.games} played, ${ffa.wins} won, average place ${(ffa.places / ffa.games).toFixed(1)}` : '');
  return `<div class="lobby">
    <div class="row" style="justify-content:space-between">
      <div class="eyebrow">Lobby · ${ui.lobby.length + 1} of ${MAX_PLAYERS} slots · ${duel ? '1v1 duel' : 'free-for-all'}</div>
      ${recLine ? `<span class="eyebrow rec">${recLine}</span>` : ''}
    </div>
    <div class="slots">
      <div class="slot you"><span class="slot-n num">1</span><b>You</b><span class="slot-note">Human</span></div>
      ${ui.lobby.map((lv, i) => `
        <div class="slot"><span class="slot-n num">${i + 2}</span><b>${BOT_NAMES[i]}</b>
          <div class="seg" role="radiogroup" aria-label="${BOT_NAMES[i]} difficulty">
            ${DIFFICULTY_IDS.map((id) => `<button class="${lv === id ? 'on' : ''}" role="radio" aria-checked="${lv === id}" data-slot="${i}" data-slot-level="${id}" data-tip="${esc(`<b>${DIFFICULTY[id].name}</b><br>${DIFFICULTY[id].desc}`)}">${DIFFICULTY[id].name}</button>`).join('')}
          </div>
          ${ui.lobby.length > 1 ? `<button class="slot-x" data-remove="${i}" aria-label="Remove ${BOT_NAMES[i]}">Remove</button>` : '<span></span>'}
        </div>`).join('')}
      ${ui.lobby.length < MAX_PLAYERS - 1 ? `<button class="slot add" id="add-bot"><span class="slot-n">+</span><b>Add a rival</b><span class="slot-note">Bot</span></button>` : ''}
    </div>
  </div>`;
}

function renderBan() {
  const banned = M.phase !== 'ban';
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">Step 1 of 2</div>
      <h1 style="font-size:48px">${banned ? 'The bans are in' : 'Ban one resource'}</h1>
      <p class="lede">${banned
        ? 'Nobody saw anyone else\'s vote. These resources are gone for the whole match.'
        : isDuel()
          ? 'Your rival is choosing at the same time. Ban what you least want to fight.'
          : `Every gladiator votes at the same time. The ${BAN_COUNT} resources with the most votes are banned (ties are broken at random).`}</p>
    </div>
    <div class="ban-grid">
      ${RESOURCES.map((r) => {
        const t = TAGS[r];
        const mine = M.players[ME].ban === r;
        const votes = (M.banVotes || {})[r] || 0;
        const isBanned = banned && M.bans.includes(r);
        const who = !banned ? '' : `${plural(votes, 'vote')}${mine ? ', including yours' : ''}`;
        return `<button class="ban-tile ${isBanned ? 'banned' : ''}" style="--c:${t.color}" data-res="${r}" ${banned ? 'disabled' : ''}>
          <span class="name">${t.name}</span><p>${esc(t.stack)}</p>
          ${isBanned ? '<span class="stamp">Banned</span>' : ''}${banned && votes ? `<span class="who">${who}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    ${banned ? `<div><button class="btn primary" id="next">Choose your gladiator</button></div>` : ''}
  </div></div>`;
  root.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => {
    for (const p of M.players) if (p.isBot) botBan(M, p.id);
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
    for (const p of M.players) if (p.isBot) botPick(M, p.id);
    pickCharacter(M, ME, b.dataset.char);
    afterRoundStart();
    ui.screen = 'game';
    render();
  });
}

function afterRoundStart() {
  const bots = M.players.filter((p) => p.isBot && p.hp > 0);
  if (M.phase === 'signature') for (const p of bots) botSignature(M, p.id);
  if (M.phase === 'shop') for (const p of bots) botShop(M, p.id);
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
  if (!fighting) arena.setPreview(loadout(M.players[ME]), foeLoadout());
  updateGame();
}

function updateGame() {
  renderHud();
  renderSide('mine', M.players[ME], true);
  renderSide('foe', (foe() || { p: M.players[1] }).p, false);
  renderTray();
  renderSpeed();
  renderBanner();
  renderModal();
  renderTabs();
}

function renderHud() {
  const me = M.players[ME], f = foe();
  const life = (p, cls, ghost) => `
    <div class="life ${cls}">
      <div class="top"><span>${ghost ? 'Ghost of ' : ''}${esc(p.isBot ? p.name : 'You')} · ${esc(CHAR_BY_ID[p.charId].name)}</span><span class="num">${Math.max(0, p.hp)} / ${START_HP}</span></div>
      <div class="bar"><i style="width:${(Math.max(0, p.hp) / START_HP) * 100}%"></i></div>
    </div>`;
  root.querySelector('#hud').innerHTML = `
    <div class="logo">Stack <span>Arena</span></div>
    <div class="round"><span class="eyebrow">Round</span><b class="num">${M.round}</b></div>
    <div class="eyebrow">Bans: ${M.bans.map((b) => chip(b, true)).join(' ')}</div>
    <div class="vs">${life(me, 'me')}${f ? life(f.p, 'foe', f.ghost) : ''}</div>
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
  const sig = p.sig && c.signatures.find((s) => s.id === p.sig);
  const f = foe();
  const ghost = !mine && f && f.ghost;
  const hybrids = mine ? CARDS.filter((h) => h.tier === 'hybrid' && !h.tags.some((t) => M.bans.includes(t)) && h.tags.every((t) => (counts[t] || 0) >= 2) && !h.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ)) : [];
  el.innerHTML = `${mine || isDuel() ? '' : standingsPanel()}
    <div>
      <div class="eyebrow">${mine ? 'Your gladiator' : `${isDuel() ? 'Rival' : ghost ? 'Opponent: a ghost copy of' : 'This round\'s opponent'} · ${esc(playerLabel(p))}`}</div>
      <h2>${esc(c.name)}</h2>
      <div class="sub">${chip(c.trigger, true)} ${c.resources.map((r) => chip(r, true)).join(' ')}</div>
    </div>
    <div class="sub"><b style="color:var(--bronze)">${esc(c.ability.name)}</b>: ${esc(c.ability.desc())}${sig ? `<br><b style="color:var(--bronze)">${esc(sig.name)}</b>: ${esc(sig.desc)}` : ''}</div>
    <div><div class="eyebrow" style="margin-bottom:6px">Tag progress</div><div class="progress">${tierProgress(counts)}</div></div>
    ${hybrids.length ? `<div class="sub">Close to a Hybrid: ${hybrids.map((h) => `${esc(h.name)} (${h.tags.map((t) => `${TAGS[t].name} ${counts[t] || 0}/${HYBRID_REQ}`).join(', ')})`).join('; ')}</div>` : ''}
    <div class="stats-panel" id="stats-${id}">${statsPanel(mine ? 0 : 1)}</div>`;
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
          <div class="ds">${richDesc(card, Math.min(card.max, have + 1))}</div>
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
  arena.setPreview(loadout(M.players[ME]), foeLoadout());
  updateGame();
}

function standingsPanel() {
  const f = foe();
  return `<div class="standings">
    <div class="eyebrow">Standings · ${M.players.filter((p) => p.hp > 0).length} of ${M.players.length} alive</div>
    ${standings(M).map((p) => `
      <div class="st ${p.id === ME ? 'me' : ''} ${p.hp <= 0 ? 'out' : ''} ${f && f.p.id === p.id ? 'opp' : ''}">
        <span class="st-n">${p.placement ? ordinal(p.placement) : ''}</span>
        <span class="st-name">${esc(p.id === ME ? 'You' : p.name)}<small>${esc(CHAR_BY_ID[p.charId].name)}</small></span>
        <span class="st-bar"><i style="width:${(Math.max(0, p.hp) / START_HP) * 100}%"></i></span>
        <span class="st-hp num">${Math.max(0, p.hp)}</span>
      </div>`).join('')}
  </div>`;
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
  const opp = opponentOf(M, ME);
  if (!opp) return;
  fighting = true;
  const f = makeFight(M, ME, opp.id);
  ui.fightStats = { live: true, round: M.round, stats: [f.units[0].stats, f.units[1].stats] };
  const statsTimer = setInterval(refreshStats, 250);
  arena.play(f, (result) => {
    fighting = false;
    clearInterval(statsTimer);
    ui.fightStats = { live: false, round: M.round, stats: JSON.parse(JSON.stringify(result.stats)) };
    const summary = resolveFight(M, ME, opp.id, result, opp.ghost);
    const others = resolveOtherFights(M, [ME]);
    const s = result.stats[0], o = result.stats[1];
    const name = (id) => (id === ME ? 'You' : M.players[id].name);
    ui.banner = {
      ghost: opp.ghost,
      others: others.map((r) => r.winner === null
        ? `${name(r.a)} and ${name(r.b)}${r.ghost ? ' (ghost)' : ''} drew`
        : `${name(r.winner)}${r.ghost && r.winner === r.b ? ' (ghost)' : ''} beat ${name(r.loser)}${r.ghost && r.loser === r.b ? ' (ghost)' : ''}${r.ghost && r.loser === r.b ? '' : `, -${r.damage} HP`}`),
      outcome: summary.winner === ME ? 'win' : summary.winner === opp.id ? 'loss' : 'draw',
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
  const meOut = M.players[ME].hp <= 0;
  const over = meOut || M.players.filter((p) => p.hp > 0).length <= 1;
  const title = meOut && !isDuel() ? 'Knocked out' : b.outcome === 'win' ? 'Victory' : b.outcome === 'loss' ? 'Defeat' : 'Draw';
  const sub = b.outcome === 'win'
    ? (b.ghost ? 'You beat the ghost. Ghosts lose no HP.' : `Your opponent loses ${b.damage} HP.`)
    : b.outcome === 'loss' ? `You lose ${b.damage} HP.` : `You ${b.ghost ? '' : 'both '}lose ${Math.ceil(b.damage)} HP.`;
  el.innerHTML = `<div class="banner ${b.outcome}" role="status">
    <span class="eyebrow">Round ${M.round} · ${b.time.toFixed(1)}s</span>
    <h2>${title}</h2><p>${sub}</p><p style="font-size:13px">${esc(b.line)}</p>
    ${b.others?.length ? `<ul class="others">${b.others.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
    <button class="btn primary" id="cont">${over ? (meOut && !isDuel() && M.players.filter((p) => p.hp > 0).length > 1 ? 'Finish the match' : 'See the result') : 'Next round'}</button>
  </div>`;
  el.querySelector('#cont').onclick = nextRound;
  el.querySelector('#cont').focus({ preventScroll: true });
}

function nextRound() {
  ui.banner = null;
  finishRound(M);
  // Once you're out, the bots play out the rest of the match instantly.
  while (M.phase !== 'over' && M.players[ME].hp <= 0 && M.round < 80) {
    afterRoundStart();
    resolveOtherFights(M, []);
    finishRound(M);
  }
  if (M.phase === 'over') {
    saveResult();
    ui.screen = 'over';
    render();
    return;
  }
  afterRoundStart();
  arena.setPreview(loadout(M.players[ME]), foeLoadout());
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
      if (M.phase === 'shop') for (const p of M.players) if (p.isBot && p.hp > 0) botShop(M, p.id);
      arena.setPreview(loadout(M.players[ME]), foeLoadout());
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
  el.innerHTML = `<button class="btn ${ui.mobileTab === 'mine' ? 'on' : ''}" data-tab="mine">Your build</button><button class="btn ${ui.mobileTab === 'foe' ? 'on' : ''}" data-tab="foe">${isDuel() ? 'Rival' : 'Opponent and standings'}</button>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.mobileTab = ui.mobileTab === b.dataset.tab ? null : b.dataset.tab; renderTabs(); });
  root.querySelector('#mine').classList.toggle('show', ui.mobileTab === 'mine');
  root.querySelector('#foe').classList.toggle('show', ui.mobileTab === 'foe');
}

function renderOver() {
  const me = M.players[ME];
  const won = me.placement === 1;
  const list = (p) => Object.entries(p.cards).map(([id, n]) => `${esc(CARD_BY_ID[id].name)} x${n}`).join(', ') || 'No cards';
  const winner = M.players.find((p) => p.placement === 1);
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">After ${M.round} rounds · you won ${plural(me.wins, 'fight')}</div>
      <h1 class="brand" style="color:${won ? 'var(--bronze)' : 'var(--blood)'}">${won ? 'Champion' : isDuel() ? 'Fallen' : `${ordinal(me.placement)} of ${M.players.length}`}</h1>
    </div>
    <table class="final">
      <thead><tr><th>Place</th><th>Gladiator</th><th>Player</th><th class="num">Fights won</th></tr></thead>
      <tbody>${standings(M).map((p) => `<tr class="${p.id === ME ? 'me' : ''}"><td class="num">${ordinal(p.placement)}</td><td>${esc(CHAR_BY_ID[p.charId].name)}</td><td>${esc(playerLabel(p))}</td><td class="num">${p.wins}</td></tr>`).join('')}</tbody>
    </table>
    <div class="rules">
      <div class="rule"><h3>${esc(CHAR_BY_ID[me.charId].name)} (you)</h3><div class="progress">${tierProgress(tagCounts(me.cards))}</div><p>${list(me)}</p></div>
      ${winner && winner.id !== ME ? `<div class="rule"><h3>${esc(CHAR_BY_ID[winner.charId].name)} (${esc(winner.name)}, winner)</h3><div class="progress">${tierProgress(tagCounts(winner.cards))}</div><p>${list(winner)}</p></div>` : ''}
    </div>
    <div class="row"><button class="btn primary" id="again">Play again</button><button class="btn" id="home">Back to title</button></div>
  </div></div>`;
  root.querySelector('#again').onclick = newMatch;
  root.querySelector('#home').onclick = () => { ui.screen = 'title'; render(); };
}

// One floating tooltip for every [data-tip] element (fixed, so scrolling
// containers like the shop tray can't clip it).
const tipEl = document.createElement('div');
tipEl.className = 'tip';
tipEl.setAttribute('role', 'tooltip');
tipEl.hidden = true;
document.body.appendChild(tipEl);
let tipFor = null;
function showTip(target) {
  if (tipFor === target) return;
  tipFor = target;
  tipEl.innerHTML = target.dataset.tip;
  tipEl.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const y = r.top - t.height - 8 >= 8 ? r.top - t.height - 8 : r.bottom + 8;
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${y}px`;
}
function hideTip() { tipFor = null; tipEl.hidden = true; }
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t); else if (tipFor) hideTip();
});
document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); else hideTip(); });
document.addEventListener('scroll', hideTip, true);
document.addEventListener('click', hideTip);

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
    ui = { ...ui, ...data.ui, banner: data.ui?.banner || null, modal: null, lobby: data.ui?.lobby || ui.lobby };
  }
  render();
}
window.claude?.hot?.snapshot?.(() => ({ M, ui: { screen: ui.screen, speed: ui.speed, banner: ui.banner, lobby: ui.lobby, fightStats: ui.fightStats && !ui.fightStats.live ? ui.fightStats : null } }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
