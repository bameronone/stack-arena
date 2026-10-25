import { TAGS, TRIGGERS, RESOURCES, TIER_UNLOCK, TIER_NAMES, HYBRID_REQ } from '../data/tags.js';
import { CARDS, CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { tagCounts, cardCost, REROLL_COST, SHOP_SIZE } from '../engine/shop.js';
import {
  visibleCharacters, makeFight, loadout, income, interest, INTEREST_STEP, INTEREST_MAX, START_HP, SIGNATURE_ROUND,
  opponentOf, standings, ownedCount, MAX_PLAYERS, BAN_COUNT,
} from '../engine/match.js';
import { SHOP_TIMES, ROUND_PACE } from '../game/host.js';
import { soloSession, hostSession, clientSession, BOT_NAMES, cleanName } from '../game/session.js';
import { cleanCode } from '../net/transport.js';
import { accountsAvailable, currentAccount, loadAccount, signIn, signOut, setLeaderboardName, submitResult, leaderboard, PROVIDERS, NAME_RULE, nameTaken } from '../net/accounts.js';
import { createArena } from './arena.js';
import { DT } from '../engine/combat.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);
const NET_KIND = params.get('net') === 'local' ? 'local' : 'peer';
// Inside a Claude artifact the page is framed and peer connections are blocked.
const FRAMED = (() => { try { return window.self !== window.top; } catch { return true; } })();
const PAGES_URL = 'https://bameronone.github.io/stack-arena/';

const DIFFICULTY = {
  easy: { name: 'Squire', desc: 'Buys on impulse. Good for learning the cards.' },
  normal: { name: 'Gladiator', desc: 'Plans a build, manages gold and counters your main resource.' },
  hard: { name: 'Champion', desc: 'Also test-fights cards against your build before buying them.' },
};
const DIFFICULTY_IDS = Object.keys(DIFFICULTY);

const store = {
  get(key, fallback) { try { const v = localStorage.getItem('stack-arena-' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('stack-arena-' + key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

let S = null; // the session: solo game, hosted room or joined room
let arena = null;
let toastTimer = 0;
let lastCounts = null;
let shownSeed = null; // the match whose fights the UI is showing
let savedResultFor = null;
// Cards you bought stay in the tray as invisible copies, so the row keeps its
// height instead of shrinking when the tallest card is bought.
const shopGhost = [];
const ui = {
  tab: params.get('room') ? 'online' : 'solo',
  speed: 2, mobileTab: null, modal: null, board: { which: 'online', rows: null, error: null }, submitState: null, nameError: null,
  lobby: (() => { const l = store.get('lobby', ['normal']); return Array.isArray(l) && l.length && l.every((x) => DIFFICULTY_IDS.includes(x)) ? l.slice(0, MAX_PLAYERS - 1) : ['normal']; })(),
  soloTime: SHOP_TIMES.includes(store.get('solo-time', 30)) ? store.get('solo-time', 30) : 30,
  name: store.get('name', ''),
  joinCode: cleanCode(params.get('room') || ''),
  error: null, busy: false,
  fightStats: null, animRound: null, fighting: false, watching: null, savedStats: null,
};

const M = () => S?.M;
const ME = () => S?.me ?? 0;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const isDuel = () => M().players.length === 2;
const humansAlive = () => M().players.filter((p) => !p.isBot && p.hp > 0);
const nameOf = (p) => (p.id === ME() ? 'You' : p.name);
function playerLabel(p) {
  if (p.id === ME()) return 'You';
  return p.isBot ? `${p.name} (${DIFFICULTY[p.level || 'normal'].name})` : `${p.name} (player)`;
}
// While your fight animates, HP shows as it was before the round's results.
const hpOf = (p) => Math.max(0, ui.fighting && M().hpBefore ? M().hpBefore[p.id] ?? p.hp : p.hp);

function foe() {
  const o = M() && opponentOf(M(), ME());
  return o ? { p: M().players[o.id], ghost: o.ghost } : null;
}
// In a free-for-all your opponent stays hidden until the fight starts.
const foeRevealed = () => isDuel() || M().phase === 'fight';
function foeLoadout() {
  const f = foe();
  return loadout(f ? f.p : M().players.find((p) => p.id !== ME()), M().round);
}
const myLoadout = () => loadout(M().players[ME()], M().round);
// You can shop while the round's fights play out too; those cards are queued
// and join your build when the round ends.
const shopOpen = () => (M().phase === 'shop' || M().phase === 'fight') && M().players[ME()].hp > 0;
const queuedList = (p) => Object.entries(p.queued || {}).filter(([, n]) => n > 0);

// ---------------------------------------------------------------- card text

function tagTip(tag) {
  const t = TAGS[tag];
  return `<b style="color:${t.color}">${t.name}</b> <span class="tip-kind">${t.kind}</span><br>${esc(t.kind === 'trigger' ? t.passive : t.stack)}`;
}

function chip(tag, withName = false) {
  const t = TAGS[tag];
  return `<span class="chip ${t.kind}" style="--c:${t.color}" data-tip="${esc(tagTip(tag))}">${withName ? t.name : t.glyph}</span>`;
}

// Keywords in card text get their tag's color and a hover explanation.
const KEYWORDS = /\b(On attack|On crit|On dodge|On cast|On heal|When hurt|Fire|Frost|Toxin|Bleed|Shield|Regen|Arcane|Lightning|Armor|Focus|Grit)\b/g;
const KEYWORD_TAG = { 'On attack': 'strike', 'On crit': 'precision', 'On dodge': 'evasion', 'On cast': 'spell', 'On heal': 'regen', 'When hurt': 'pain', Toxin: 'poison', Focus: 'evasion' };
const GRIT_TIP = '<b style="color:#d6a24e">Grit</b> <span class="tip-kind">everyone</span><br>Lose 30% of your max HP within 2s and you take 50% less damage for 1.5s. Once every 6s.';
function richText(text) {
  return esc(text).replace(KEYWORDS, (w) => {
    if (w === 'Grit') return `<span class="kw" style="--c:#d6a24e" data-tip="${esc(GRIT_TIP)}">${w}</span>`;
    const tag = KEYWORD_TAG[w] || w.toLowerCase();
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

function cardTags(card) {
  if (card.tier === 'counter') return `<span class="chip" style="--c:#b9b2a6">Counter</span>${card.counters ? `<span class="arrow">vs</span>${chip(card.counters, true)}` : ''}`;
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  const res = cardResources(card);
  if (trig.length && res.length) return `${chip(trig[0], true)}<span class="arrow">&#9656;</span>${chip(res[0], true)}`;
  return card.tags.map((t) => chip(t, true)).join('');
}

// ---------------------------------------------------------------- fight stats

const SOURCE_COLOR = {
  Attacks: '#c9b79c', Toxin: TAGS.poison.color, 'Bloom Burst': TAGS.regen.color, Bleed: TAGS.bleed.color, Thorns: TAGS.armor.color, 'Molten Armor': TAGS.fire.color,
  Shatter: TAGS.frost.color, Pandemic: TAGS.poison.color, 'Reflective Plating': TAGS.shield.color, 'Undying Spite': TAGS.pain.color,
  Regen: TAGS.regen.color, 'Bleed lifesteal': TAGS.bleed.color, 'Bleed out': TAGS.bleed.color, 'Plague Lord': TAGS.poison.color, 'Phoenix Core': TAGS.fire.color,
  Armor: TAGS.armor.color, Shield: TAGS.shield.color, Dodge: TAGS.evasion.color, Resistances: '#b9b2a6', Immunity: '#e9dcc0',
  'Living Mountain': TAGS.armor.color, 'Mana Shield': TAGS.arcane.color, 'Arena burn': '#d6a24e',
  Lightning: TAGS.lightning.color, 'Chain Lightning': TAGS.lightning.color, Tempest: TAGS.lightning.color, Grit: '#d6a24e',
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
  return `<div class="eyebrow">${fs.watched ? 'Watched fight' : fs.live ? 'This fight' : `Last fight · round ${fs.round}`}</div>
    ${statGroup('Damage dealt', s.dmg)}${statGroup('Healing', s.heal)}${statGroup('Damage prevented', s.mit)}`;
}
function refreshStats() {
  for (const [id, side] of [['stats-mine', 0], ['stats-foe', 1]]) {
    const el = root.querySelector('#' + id);
    if (el) el.innerHTML = statsPanel(side);
  }
}

// ---------------------------------------------------------------- records

function record(level) { return store.get('record-' + level, { w: 0, l: 0 }); }
function ffaRecord() { return store.get('ffa', { games: 0, wins: 0, places: 0 }); }
function saveResult() {
  if (S.mode !== 'solo' || savedResultFor === M()) return;
  savedResultFor = M();
  const me = M().players[ME()];
  if (isDuel()) {
    const lv = M().players[1].level || 'normal';
    const r = record(lv);
    if (me.placement === 1) r.w++; else r.l++;
    store.set('record-' + lv, r);
  } else {
    const r = ffaRecord();
    r.games++; r.places += me.placement; if (me.placement === 1) r.wins++;
    store.set('ffa', r);
  }
}

// Signed in: every finished match goes to the leaderboard once, except
// matches with a Squire bot in them (Squires are for learning the cards).
let submittedSeed = null;
function submitToLeaderboard() {
  const m = M(), me = m.players[ME()];
  if (!currentAccount() || submittedSeed === m.seed || !me.placement) return;
  submittedSeed = m.seed;
  if (m.players.some((p) => p.isBot && p.level === 'easy')) { ui.submitState = 'squire'; return; }
  const levels = m.players.filter((p) => p.isBot).map((p) => DIFFICULTY_IDS.indexOf(p.level || 'normal'));
  const level = S.mode === 'solo' ? DIFFICULTY_IDS[Math.max(0, ...levels)] : null;
  ui.submitState = 'saving';
  submitResult({ mode: S.mode === 'solo' ? 'bots' : 'online', level, players: m.players.length, placement: me.placement, charId: me.charId, seed: m.seed, rounds: m.round })
    .then(() => { ui.submitState = 'saved'; }, () => { ui.submitState = 'failed'; })
    .then(() => { if (screenFor() === 'over') render(); });
}

function toast(msg) {
  clearTimeout(toastTimer);
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------------------------------------------------------- sessions

function useSession(session) {
  S?.close?.();
  S = session;
  resetFightState();
  ui.error = null; ui.trayH = 0;
  lastCounts = null; shownSeed = null;
  S.onChange(onSessionChange);
  render();
}

function leave() {
  S?.close?.();
  S = null;
  render();
}

function startSolo() {
  store.set('lobby', ui.lobby);
  store.set('solo-time', ui.soloTime);
  useSession(soloSession({ bots: ui.lobby, shopTime: ui.soloTime, name: currentAccount()?.name }));
}

async function startOnline(kind) {
  // Signed in, you play under your leaderboard name.
  const name = currentAccount()?.name || cleanName(root.querySelector('#name')?.value || ui.name);
  if (!currentAccount()?.name) { ui.name = name; store.set('name', name); }
  ui.busy = true; ui.error = null; render();
  try {
    // A guest can't use a name a signed-in player has.
    if (!currentAccount()?.name && accountsAvailable() && await nameTaken(name)) throw new Error(`"${name}" belongs to a player on the leaderboard. Pick another name, or sign in.`);
    if (kind === 'host') useSession(await hostSession({ name, kind: NET_KIND }));
    else {
      const code = cleanCode(root.querySelector('#code')?.value || ui.joinCode);
      ui.joinCode = code;
      if (code.length !== 5) throw new Error('Room codes are 5 letters.');
      useSession(await clientSession({ code, name, kind: NET_KIND }));
    }
  } catch (e) {
    ui.error = e.message || String(e);
  }
  ui.busy = false;
  render();
}

// Fight state that belongs to one match. A new match (Replay, or a room
// that went back to its lobby and started again) must not show the last
// one's fight stats or held fight.
function resetFightState() {
  ui.fightStats = null; ui.savedStats = null; ui.animRound = null; ui.lastFight = null; ui.fighting = false; ui.watching = null;
}

function onSessionChange() {
  const m = M();
  if (m && m.seed !== shownSeed) { shownSeed = m.seed; resetFightState(); }
  if (m && S.stage === 'game') {
    // Toast tier and hybrid unlocks after your purchases land.
    const me = m.players[ME()];
    const counts = me ? tagCounts(me.cards) : {};
    if (lastCounts && m.phase === 'shop') {
      for (const t of Object.keys(counts)) for (const k of [2, 3, 4]) {
        if ((lastCounts[t] || 0) < TIER_UNLOCK[k] && counts[t] >= TIER_UNLOCK[k]) toast(`${TAGS[t].name} ${TIER_NAMES[k]} cards unlocked`);
      }
      for (const h of CARDS.filter((c) => c.tier === 'hybrid')) {
        if (!h.tags.some((t) => m.bans.includes(t)) && h.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ) && !h.tags.every((t) => (lastCounts[t] || 0) >= HYBRID_REQ)) toast(`Hybrid unlocked: ${h.name}`);
      }
    }
    lastCounts = counts;
    if (m.phase !== 'fight' && (ui.fighting || ui.watching)) arena?.skip();
    if (m.phase !== 'fight' && ui.watching) { ui.watching = null; ui.fightStats = ui.savedStats; }
  }
  render();
  if (m && S.stage === 'game' && m.phase === 'fight' && ui.animRound !== m.fightRound) {
    ui.animRound = m.fightRound;
    ui.fightSeenAt = performance.now();
    if ((m.watchers || []).includes(ME()) || (m.players[ME()].hp > 0 && opponentOf(m, ME()))) startFightAnimation();
    else {
      updateGame();
      // Knocked out (or sitting this round out): watch the leader's fight
      // live. Eyes on the standings switch to another fight.
      if (m.lastResults.length) watchFight(leaderFight(m));
    }
  }
}

// The fight of whoever is in first place (most HP going into the round).
function leaderFight(m) {
  const hp = (p) => m.hpBefore?.[p.id] ?? p.hp;
  const order = m.players.filter((p) => p.id !== ME()).sort((a, b) => hp(b) - hp(a) || b.wins - a.wins);
  for (const p of order) {
    const i = m.lastResults.findIndex((r) => r.a === p.id || (!r.ghost && r.b === p.id));
    if (i >= 0) return i;
  }
  return 0;
}

// ---------------------------------------------------------------- screens

function screenFor() {
  if (!S || S.stage === 'connecting') return 'title';
  if (S.stage === 'closed') return 'closed';
  if (S.stage === 'lobby') return 'room';
  const m = M();
  if (!m) return 'waiting';
  if (m.phase === 'ban') return 'ban';
  if (m.phase === 'pick') return 'pick';
  if (m.phase === 'over') return 'over';
  return 'game';
}

function render() {
  const screen = screenFor();
  if (screen !== 'game' && arena) { arena.destroy(); arena = null; }
  if (screen !== 'game') { const t = document.querySelector('.toast'); if (t) t.hidden = true; }
  if (screen === 'title') return renderTitle();
  if (screen === 'room') return renderRoom();
  if (screen === 'closed') return renderClosed();
  if (screen === 'waiting') return renderWaiting('Starting the match...');
  if (screen === 'ban') return renderBan();
  if (screen === 'pick') return renderPick();
  if (screen === 'over') return renderOver();
  return renderGame();
}

const fmtTime = (r) => { const s = Math.ceil(r); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function timerHtml() {
  const r = S?.remaining?.();
  if (r == null) return '';
  return `<span class="timer ${r <= 5 ? 'urgent' : ''}" data-timer>${fmtTime(r)}</span>`;
}
setInterval(() => {
  const r = S?.remaining?.();
  for (const el of root.querySelectorAll('[data-timer]')) {
    if (r == null) { el.textContent = ''; continue; }
    el.textContent = fmtTime(r);
    el.classList.toggle('urgent', r <= 5);
  }
}, 250);

const RULES = () => `
  <div class="rules">
    <div class="rule"><h3>Triggers and resources</h3><p>Triggers decide <i>when</i> you gain stacks (Strike, Crit, Dodge, Health, Spell). Resources decide <i>what</i> stacks do. A card like ${chip('precision', true)} <span class="arrow">&#9656;</span> ${chip('poison', true)} always fires. Cards with only a resource fire 30% of the time.</p></div>
    <div class="rule"><h3>Build up, unlock more</h3><p>Own ${TIER_UNLOCK[2]}, ${TIER_UNLOCK[3]} and ${TIER_UNLOCK[4]} cards of a tag to unlock its Uncommon, Rare and Mythic cards. Own ${HYBRID_REQ} of two resources to unlock their Hybrid card.</p></div>
    <div class="rule"><h3>Bans</h3><p>Every gladiator secretly votes to ban one resource, and the ${BAN_COUNT} with the most votes are banned. Banned cards never appear, and a gladiator sits the match out if any of its resources is banned.</p></div>
    <div class="rule"><h3>Focus, not luck</h3><p>Dodging builds Focus. Every hit you take adds to your dodge chance, and a dodge resets it, so you can never dodge twice in a row. Toxin, Bleed and abilities can't be dodged.</p></div>
    <div class="rule"><h3>Grit</h3><p>Anyone who loses 30% of their max HP within 2 seconds takes half damage for the next 1.5 seconds, at most once every 6 seconds. Freezes also get harder: each one needs 10 more Frost than the last.</p></div>
  </div>
  <div>
    <div class="eyebrow" style="margin-bottom:10px">The ${Object.keys(TAGS).length} tags</div>
    <div class="tag-legend">${Object.keys(TAGS).map((t) => `<div>${chip(t, true)}<span>${esc(TAGS[t].kind === 'trigger' ? TAGS[t].passive : TAGS[t].stack)}</span></div>`).join('')}</div>
  </div>`;

function timeSeg(id, value, options) {
  return `<div class="seg" role="radiogroup" aria-label="Shop timer" id="${id}">
    ${options.map((t) => `<button class="${value === t ? 'on' : ''}" role="radio" aria-checked="${value === t}" data-time="${t}">${t ? `${t}s` : 'Off'}</button>`).join('')}
  </div>`;
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
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${ui.tab === 'solo'}" class="${ui.tab === 'solo' ? 'on' : ''}" data-tab="solo">Play against bots</button>
      <button role="tab" aria-selected="${ui.tab === 'online'}" class="${ui.tab === 'online' ? 'on' : ''}" data-tab="online">Play online</button>
      ${accountsAvailable() ? `<button role="tab" aria-selected="${ui.tab === 'board'}" class="${ui.tab === 'board' ? 'on' : ''}" data-tab="board">Leaderboard</button>` : ''}
    </div>
    ${accountBar()}
    ${ui.tab === 'solo' ? soloLobby() : ui.tab === 'board' ? leaderboardView() : onlineLobby()}
    ${RULES()}
    <div>
      <div class="eyebrow" style="margin-bottom:10px">The ${CHARACTERS.length} gladiators</div>
      <div class="char-grid">${CHARACTERS.map((c) => `<div class="char">${charInfo(c)}</div>`).join('')}</div>
    </div>
  </div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; ui.error = null; if (ui.tab === 'board') loadBoard(); render(); });
  wireAccount();
  if (ui.tab === 'solo') {
    root.querySelectorAll('[data-slot-level]').forEach((b) => b.onclick = () => { ui.lobby[Number(b.dataset.slot)] = b.dataset.slotLevel; render(); });
    root.querySelectorAll('[data-remove]').forEach((b) => b.onclick = () => { ui.lobby.splice(Number(b.dataset.remove), 1); render(); });
    root.querySelector('#add-bot')?.addEventListener('click', () => { ui.lobby.push(ui.lobby[ui.lobby.length - 1] || 'normal'); render(); });
    root.querySelectorAll('#solo-time [data-time]').forEach((b) => b.onclick = () => { ui.soloTime = Number(b.dataset.time); render(); });
    root.querySelector('#start').onclick = startSolo;
  } else {
    const name = root.querySelector('#name'), code = root.querySelector('#code');
    name?.addEventListener('input', () => { ui.name = name.value; });
    code?.addEventListener('input', () => { code.value = cleanCode(code.value); ui.joinCode = code.value; });
    root.querySelector('#host')?.addEventListener('click', () => startOnline('host'));
    root.querySelector('#join-form')?.addEventListener('submit', (e) => { e.preventDefault(); startOnline('join'); });
  }
}

function soloLobby() {
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
          ${levelSeg(i, lv, BOT_NAMES[i])}
          ${ui.lobby.length > 1 ? `<button class="slot-x" data-remove="${i}" aria-label="Remove ${BOT_NAMES[i]}">Remove</button>` : '<span></span>'}
        </div>`).join('')}
      ${ui.lobby.length < MAX_PLAYERS - 1 ? `<button class="slot add" id="add-bot"><span class="slot-n">+</span><b>Add a rival</b><span class="slot-note">Bot</span></button>` : ''}
    </div>
    <div class="row"><span class="eyebrow">Shop timer</span>${timeSeg('solo-time', ui.soloTime, SHOP_TIMES)}
      <span class="slot-note">${ui.soloTime ? 'When time runs out, the fight starts.' : 'No time limits. The fight starts when you press Fight.'}</span></div>
    <div class="row"><button class="btn primary big" id="start">Enter the arena</button></div>
  </div>`;
}

// ---------------------------------------------------------------- leaderboard

const BOARDS = { online: 'Online', hard: 'vs Champion', normal: 'vs Gladiator' };
function accountBar() {
  if (!accountsAvailable()) return '';
  const a = currentAccount();
  if (!a) {
    return `<div class="account"><span class="slot-note">Sign in to put your wins on the leaderboard.</span>
      ${Object.entries(PROVIDERS).map(([id, name]) => `<button class="btn" data-signin="${id}">Sign in with ${name}</button>`).join('')}
      <a class="slot-note" href="privacy.html" target="_blank" rel="noopener">Privacy</a></div>`;
  }
  if (!a.name) {
    return `<form class="account pick" id="pick-name"><span><b>Pick your leaderboard name.</b> It has to be unique, and you can't change it later.</span>
      <input id="board-name" maxlength="20" required pattern="${NAME_RULE.source.slice(1, -1)}" title="2 to 20 letters, numbers, spaces, _ or -" placeholder="2-20 letters or numbers" value="${esc(ui.nameDraft || '')}" aria-label="Leaderboard name">
      <button class="btn primary" type="submit">Save name</button>
      <button class="btn" type="button" id="signout">Sign out</button>
      ${ui.nameError ? `<span class="slot-note">${esc(ui.nameError)}</span>` : ''}</form>`;
  }
  return `<div class="account"><span class="slot-note">Signed in as <b>${esc(a.name)}</b>.</span>
    <button class="btn" id="signout">Sign out</button></div>`;
}
function wireAccount() {
  root.querySelectorAll('[data-signin]').forEach((b) => b.onclick = () => signIn(b.dataset.signin));
  root.querySelector('#signout')?.addEventListener('click', () => { signOut(); render(); });
  root.querySelector('#pick-name')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('#board-name');
    ui.nameDraft = input.value;
    setLeaderboardName(input.value).then(() => { ui.nameError = null; toast('Leaderboard name saved'); if (ui.tab === 'board') loadBoard(); render(); }, (err) => {
      ui.nameError = err.message === 'taken' ? `Someone already has "${input.value.trim()}".` : err.message === 'invalid' ? 'Use 2 to 20 letters, numbers, spaces, _ or -.' : 'Could not save that name. Try again.';
      render();
    });
  });
  root.querySelectorAll('[data-board]').forEach((b) => b.onclick = () => { ui.board.which = b.dataset.board; loadBoard(); });
}
function loadBoard() {
  const which = ui.board.which;
  ui.board = { which, rows: null, error: null };
  leaderboard(which === 'online' ? 'online' : 'bots', which)
    .then((rows) => { if (ui.board.which === which) ui.board.rows = rows; }, () => { ui.board.error = 'The leaderboard could not be loaded.'; })
    .then(() => { if (screenFor() === 'title') render(); });
  render();
}
function leaderboardView() {
  const b = ui.board;
  const me = currentAccount()?.name;
  const rows = b.rows || [];
  return `<div class="lobby">
    <div class="seg" role="radiogroup" aria-label="Board">${Object.entries(BOARDS).map(([id, name]) => `<button class="${b.which === id ? 'on' : ''}" role="radio" aria-checked="${b.which === id}" data-board="${id}">${name}</button>`).join('')}</div>
    <p class="slot-note">Ranked by wins (finishing 1st). Ties go to the better average place. Matches with a Squire bot don't count.${b.which === 'online' ? '' : ' Bot games count on the board of the hardest bot in the lobby.'}</p>
    ${b.error ? `<p class="warn" role="alert">${esc(b.error)}</p>` : !b.rows ? '<p class="slot-note waiting">Loading...</p>' : !rows.length ? '<p class="empty">No results on this board yet.</p>' : `
    <table class="final">
      <thead><tr><th>Rank</th><th>Player</th><th class="num">Wins</th><th class="num">Games</th><th class="num">Win %</th><th class="num">Avg place</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${r.name === me ? 'me' : ''}"><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.wins}</td><td class="num">${r.games}</td><td class="num">${Math.round(100 * r.wins / r.games)}%</td><td class="num">${Number(r.avg_place).toFixed(1)}</td></tr>`).join('')}</tbody>
    </table>`}
  </div>`;
}

function levelSeg(i, lv, label, attr = 'data-slot') {
  return `<div class="seg" role="radiogroup" aria-label="${label} difficulty">
    ${DIFFICULTY_IDS.map((id) => `<button class="${lv === id ? 'on' : ''}" role="radio" aria-checked="${lv === id}" ${attr}="${i}" data-slot-level="${id}" data-tip="${esc(`<b>${DIFFICULTY[id].name}</b><br>${DIFFICULTY[id].desc}`)}">${DIFFICULTY[id].name}</button>`).join('')}
  </div>`;
}

function onlineLobby() {
  if (FRAMED) {
    return `<div class="lobby"><div class="notice">
      <b>Online play runs on the GitHub Pages version.</b> This preview blocks the direct browser-to-browser connections it needs.
      Open <a href="${PAGES_URL}" target="_blank" rel="noopener">${PAGES_URL.replace('https://', '')}</a> to host or join a room.
    </div></div>`;
  }
  return `<div class="lobby">
    ${currentAccount()?.name ? '' : `<label class="field"><span class="eyebrow">Your name</span>
      <input id="name" maxlength="20" autocomplete="nickname" value="${esc(ui.name)}" placeholder="Gladiator"></label>`}
    <div class="online-grid">
      <div class="rule"><h3>Host a room</h3><p>You get a 5-letter code to share. Fill the other slots with friends or bots, then start.</p>
        <div><button class="btn primary" id="host" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Opening...' : 'Create a room'}</button></div></div>
      <form class="rule" id="join-form"><h3>Join a room</h3><p>Enter the code your host shared.</p>
        <div class="row"><input id="code" class="code-input" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(ui.joinCode)}" placeholder="ABCDE" aria-label="Room code">
        <button class="btn primary" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Joining...' : 'Join'}</button></div></form>
    </div>
    ${ui.error ? `<p class="warn" role="alert">${esc(ui.error)}</p>` : ''}
    <p class="slot-note">Games connect browser to browser. The host's tab must stay open for the whole match, and if a player leaves, a bot takes over their gladiator.</p>
  </div>`;
}

function renderRoom() {
  const hosting = S.mode === 'host';
  const lobby = hosting ? { code: S.code, shopTime: S.shopTime, slots: S.slots } : S.lobby;
  const link = `${location.origin}${location.pathname}?room=${lobby.code}${NET_KIND === 'local' ? '&net=local' : ''}`;
  const filled = lobby.slots.filter((x) => x.kind !== 'open').length;
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">${hosting ? 'You are hosting' : 'You joined'} · ${filled} of ${lobby.slots.length} slots filled</div>
      <h1 style="font-size:48px">Room <span class="room-code num">${esc(lobby.code)}</span></h1>
      <div class="row"><input class="link" id="link" readonly value="${esc(link)}" aria-label="Invite link"><button class="btn" id="copy">Copy invite link</button></div>
    </div>
    <div class="lobby">
      <div class="slots">
        ${lobby.slots.map((x, i) => roomSlot(x, i, hosting)).join('')}
        ${hosting && lobby.slots.length < MAX_PLAYERS ? `<button class="slot add" id="add-slot"><span class="slot-n">+</span><b>Add a slot</b><span class="slot-note">Open for a player</span></button>` : ''}
      </div>
      <div class="row"><span class="eyebrow">Shop timer</span>
        ${hosting ? timeSeg('room-time', lobby.shopTime, SHOP_TIMES.filter(Boolean)) : `<b class="num">${lobby.shopTime}s</b>`}</div>
      <div class="row">
        ${hosting ? `<button class="btn primary big" id="start" ${S.canStart() ? '' : 'disabled'}>Start the match</button>
          <span class="slot-note">${S.canStart() ? 'Slots still marked Open are dropped when the match starts.' : 'You need at least one rival: a player or a bot.'}</span>`
          : '<span class="slot-note waiting">Waiting for the host to start the match...</span>'}
        <button class="btn" id="leave">${hosting ? 'Close the room' : 'Leave the room'}</button>
      </div>
    </div>
  </div></div>`;
  root.querySelector('#copy').onclick = () => {
    const input = root.querySelector('#link');
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('Invite link copied.'), () => { input.select(); toast('Press Ctrl+C to copy.'); });
    else input.select();
  };
  root.querySelector('#leave').onclick = leave;
  if (!hosting) return;
  root.querySelector('#start').onclick = () => S.start();
  root.querySelector('#add-slot')?.addEventListener('click', () => S.addSlot());
  root.querySelectorAll('#room-time [data-time]').forEach((b) => b.onclick = () => S.setShopTime(Number(b.dataset.time)));
  root.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.i);
    S.setSlot(i, b.dataset.kind === 'bot' ? { kind: 'bot', level: 'normal' } : { kind: 'open' });
  });
  root.querySelectorAll('[data-room-slot]').forEach((b) => b.onclick = () => S.setSlot(Number(b.dataset.roomSlot), { kind: 'bot', level: b.dataset.slotLevel }));
  root.querySelectorAll('[data-remove-slot]').forEach((b) => b.onclick = () => S.removeSlot(Number(b.dataset.removeSlot)));
}

function roomSlot(x, i, hosting) {
  const you = hosting ? x.kind === 'host' : S.slot === i;
  let body;
  if (x.kind === 'host') body = `<b>${esc(x.name)}</b><span class="slot-note">Host${you ? ' (you)' : ''}</span>`;
  else if (x.kind === 'human') body = `<b>${esc(x.name)}</b><span class="slot-note">Player${you ? ' (you)' : ''}</span>`;
  else if (x.kind === 'bot') body = `<b>Bot</b>${hosting ? levelSeg(i, x.level, 'Bot', 'data-room-slot') : `<span class="slot-note">${DIFFICULTY[x.level].name}</span>`}`;
  else body = `<b class="open">Open</b><span class="slot-note">Waiting for a player to join</span>`;
  const controls = hosting && x.kind !== 'host' ? `<span class="slot-ctl">
      ${x.kind === 'open' ? `<button class="slot-x" data-kind="bot" data-i="${i}">Fill with a bot</button>` : ''}
      ${x.kind === 'bot' ? `<button class="slot-x" data-kind="open" data-i="${i}">Open for a player</button>` : ''}
      ${S.slots.length > 2 ? `<button class="slot-x" data-remove-slot="${i}" aria-label="Remove slot ${i + 1}">${x.kind === 'human' ? 'Kick' : 'Remove'}</button>` : ''}
    </span>` : '<span></span>';
  return `<div class="slot ${you ? 'you' : ''} room"><span class="slot-n num">${i + 1}</span>${body}${controls}</div>`;
}

function renderClosed() {
  root.innerHTML = `<div class="screen"><div class="screen-inner">
    <h1 style="font-size:48px">The room closed</h1>
    <p class="lede">${esc(S.closedReason || 'The connection to the host was lost.')}</p>
    <div class="row"><button class="btn primary" id="home">Back to the title screen</button></div>
  </div></div>`;
  root.querySelector('#home').onclick = leave;
}

function renderWaiting(msg) {
  root.innerHTML = `<div class="screen"><div class="screen-inner"><p class="lede waiting">${esc(msg)}</p></div></div>`;
}

function phaseHeader(step, title, lede) {
  return `<div>
    <div class="row" style="justify-content:space-between"><div class="eyebrow">${step}</div>${timerHtml()}</div>
    <h1 style="font-size:48px">${title}</h1>
    <p class="lede">${lede}</p>
  </div>`;
}

function renderBan() {
  const m = M();
  const mine = m.players[ME()].ban;
  const waiting = m.players.filter((p) => !p.isBot && !p.ban).length;
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    ${phaseHeader('Step 1 of 2', mine ? 'Vote cast' : 'Ban one resource', mine
      ? `You voted to ban ${TAGS[mine].name}. Waiting for ${plural(waiting, 'more player')}...`
      : isDuel()
        ? 'Your rival is choosing at the same time. Ban what you least want to fight.'
        : `Every gladiator votes at the same time. The ${BAN_COUNT} resources with the most votes are banned (ties are broken at random).`)}
    <div class="ban-grid">
      ${RESOURCES.map((r) => {
        const t = TAGS[r];
        return `<button class="ban-tile ${mine === r ? 'banned' : ''}" style="--c:${t.color}" data-res="${r}" ${mine ? 'disabled' : ''}>
          <span class="name">${t.name}</span><p>${esc(t.stack)}</p>${mine === r ? '<span class="who">Your vote</span>' : ''}
        </button>`;
      }).join('')}
    </div>
  </div></div>`;
  root.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => S.act('ban', b.dataset.res));
}

function charStats(c) {
  const s = { hp: 1800, ad: 30, as: 1.0, crit: 0.05, manaMax: 100, ...c.stats };
  return `${s.hp} HP · ${s.ad} damage · ${s.as.toFixed(2)} attacks/s · ${Math.round(s.crit * 100)}% crit · ${s.manaMax} mana${s.ap && s.ap !== 1 ? ` · ${Math.round(s.ap * 100)}% ability power` : ''}${s.focusGain ? ` · +${+(s.focusGain * 100).toFixed(1)}% Focus per hit taken` : ''}`;
}

function charInfo(c) {
  return `<div class="row" style="gap:6px">${chip(c.trigger, true)}<span class="arrow">&#9656;</span>${c.resources.map((r) => chip(r, true)).join('')}</div>
    <div><div class="nm">${esc(c.name)}</div><div class="ep">${esc(c.epithet)}</div></div>
    <div class="ab"><b>${esc(c.ability.name)}:</b> ${esc(c.ability.desc())}</div>
    <div class="inn">Innate: ${esc(c.innate.desc)}</div>
    <div class="stats num">${charStats(c)}</div>
    <div class="inn">Signatures (round ${SIGNATURE_ROUND}): ${c.signatures.map((s) => `<b>${esc(s.name)}</b> ${esc(s.desc)}`).join(' · ')}</div>`;
}

function renderPick() {
  const m = M();
  const vis = visibleCharacters(m.bans);
  const hidden = CHARACTERS.filter((c) => characterStatus(c, m.bans) === 'hidden');
  const mine = m.players[ME()].charId;
  const waiting = m.players.filter((p) => !p.isBot && !p.charId).length;
  const votes = m.banVotes || {};
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    ${phaseHeader(`Step 2 of 2 · Banned: ${m.bans.map((b) => `${chip(b, true)} <span class="slot-note">${plural(votes[b] || 0, 'vote')}</span>`).join(' ')}`,
      mine ? `You chose ${esc(CHAR_BY_ID[mine].name)}` : 'Choose your gladiator',
      mine ? `Waiting for ${plural(waiting, 'more player')}...` : 'Each gladiator has a trigger and one or two resources. The shop offers their cards more often, and their ability grows with those stacks.')}
    <div class="char-grid">
      ${vis.map(({ char: c }) => `
        <button class="char ${mine === c.id ? 'chosen' : ''}" data-char="${c.id}" ${mine ? 'disabled' : ''}>
          ${charInfo(c)}
        </button>`).join('')}
    </div>
    ${hidden.length ? `<p class="hidden-note">Sitting out (one of their resources is banned): ${hidden.map((c) => esc(c.name)).join(', ')}.</p>` : ''}
  </div></div>`;
  root.querySelectorAll('[data-char]').forEach((b) => b.onclick = () => S.act('pick', b.dataset.char));
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
          <div id="preview"></div>
        </section>
        <aside class="side foe" id="foe" aria-label="Opponent"></aside>
      </main>
      <footer class="tray" id="tray"></footer>
      <div id="modal"></div>
    </div>`;
    arena = createArena(root.querySelector('#arena'));
    arena.setSpeed(ui.speed);
    if (holding()) showHeld();
  }
  if (!ui.fighting && !ui.watching && !holding()) showPreview();
  updateGame();
}

function updateGame() {
  if (!root.querySelector('.game')) return;
  const m = M();
  renderHud();
  const w = ui.watching;
  if (w) {
    renderSide('mine', m.players[w.a], false, 'Watching');
    renderSide('foe', m.players[w.b], false, w.ghost ? 'Watching · a ghost copy of' : 'Watching');
  } else {
    renderSide('mine', m.players[ME()], true);
    if (foe() && !foeRevealed()) renderShroud('foe');
    else renderSide('foe', (foe() || { p: m.players.find((p) => p.id !== ME()) }).p, false);
  }
  renderBoard();
  renderTray();
  renderSpeed();
  renderPreview();
  renderModal();
  renderTabs();
}

function renderHud() {
  const m = M();
  const me = m.players[ME()], f = foe();
  const life = (p, cls, ghost) => `
    <div class="life ${cls}">
      <div class="top"><span>${ghost ? 'Ghost of ' : ''}${esc(nameOf(p))} · ${esc(CHAR_BY_ID[p.charId].name)}</span><span class="num">${hpOf(p)} / ${START_HP}</span></div>
      <div class="bar hp-dashes"><i style="width:${(hpOf(p) / START_HP) * 100}%"></i></div>
    </div>`;
  // Three columns, so the rounds strip sits in the middle of the screen
  // whatever is on either side of it.
  root.querySelector('#hud').innerHTML = `
    <div class="hud-l">
      <div class="logo">Stack <span>Arena</span></div>
      <div class="eyebrow">Bans: ${m.bans.map((b) => chip(b, true)).join(' ')}</div>
    </div>
    ${roundsStrip()}
    <div class="hud-r">
      <div class="vs">${life(me, 'me')}${f ? (foeRevealed() ? life(f.p, 'foe', f.ghost) : `
      <div class="life foe shrouded">
        <div class="top"><span>Next opponent · ???</span><span class="num">? / ${START_HP}</span></div>
        <div class="bar hp-dashes"><i style="width:0"></i></div>
      </div>`) : ''}</div>
      <div class="tools"><button class="btn" id="codex">Tags</button><button class="btn" id="quit">${S.mode === 'solo' ? 'Quit' : 'Leave'}</button></div>
    </div>`;
  root.querySelector('#codex').onclick = () => { ui.modal = 'codex'; renderModal(); };
  root.querySelector('#quit').onclick = () => { ui.modal = 'quit'; renderModal(); };
}

// The road through the match, TFT style: one node per fight (won, lost, or
// still to come) plus milestone nodes such as the signature pick. Item
// choices can be added later as another milestone kind in stages().
function stages(upTo) {
  const out = [];
  for (let r = 1; r <= upTo; r++) {
    if (r === SIGNATURE_ROUND) out.push({ kind: 'signature', round: r });
    out.push({ kind: 'fight', round: r });
  }
  return out;
}
const glyphOf = (charId) => CHAR_BY_ID[charId].name.replace(/^The /, '').slice(0, 2);

function roundsStrip() {
  const m = M(), me = ME(), p = m.players[me];
  const mine = {};
  for (const r of m.history) if (r.a === me || (!r.ghost && r.b === me)) mine[r.round] = r;
  const now = m.round;
  // Your fight this round is a mystery in a free-for-all until it starts.
  const reveal = isDuel() || m.phase === 'fight';
  const nodes = stages(now + 3).filter((s) => s.round >= now - 6).map((s) => {
    if (s.kind === 'signature') {
      const sig = p.sig && CHAR_BY_ID[p.charId].signatures.find((x) => x.id === p.sig);
      const state = sig ? 'done' : s.round === now ? 'now' : 'later';
      return `<li class="node milestone ${state}" data-tip="${esc(`<b>Round ${s.round} milestone</b><br>${sig ? `Signature: ${esc(sig.name)}` : 'Choose a signature upgrade'}`)}"><small>Sig</small><b>&#9733;</b></li>`;
    }
    const res = mine[s.round];
    const finished = s.round < now || (s.round === now && m.phase === 'fight' && !ui.fighting);
    if (finished && res) {
      const oppId = res.a === me ? res.b : res.a;
      const opp = m.players[oppId];
      const out = res.winner === null ? 'draw' : res.winner === me ? 'win' : 'loss';
      const word = { win: 'Won', loss: 'Lost', draw: 'Drew' }[out];
      const dmg = out === 'win' ? (res.ghost ? 'ghosts lose no HP' : `they lost ${res.damage} HP`) : out === 'loss' ? `you lost ${res.damage} HP` : `-${res.damage} HP`;
      return `<li class="node ${out}" data-tip="${esc(`<b>Round ${s.round}: ${word}</b><br>vs ${res.ghost ? 'a ghost of ' : ''}${esc(nameOf(opp))} (${esc(CHAR_BY_ID[opp.charId].name)}), ${dmg}`)}"><small>${s.round}</small><b>${esc(glyphOf(opp.charId))}</b></li>`;
    }
    if (s.round < now || (finished && !res)) return `<li class="node bye" data-tip="${esc(`<b>Round ${s.round}</b><br>No fight`)}"><small>${s.round}</small><b>&ndash;</b></li>`;
    if (s.round === now) {
      const f = foe();
      const known = f && reveal;
      return `<li class="node now ${m.phase === 'fight' ? 'live' : ''}" data-tip="${esc(`<b>Round ${s.round}: next fight</b><br>${known ? `vs ${f.ghost ? 'a ghost of ' : ''}${esc(nameOf(f.p))} (${esc(CHAR_BY_ID[f.p.charId].name)})` : 'Your opponent is revealed when the fight starts'}`)}"><small>${s.round}</small><b>${known ? esc(glyphOf(f.p.charId)) : '?'}</b></li>`;
    }
    return `<li class="node later"><small>${s.round}</small><b></b></li>`;
  });
  return `<div class="rounds" aria-label="Rounds"><span class="eyebrow">Round <b class="num">${now}</b></span><ol class="strip">${nodes.join('')}</ol></div>`;
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

function renderSide(id, p, mine, watchLabel = null) {
  const m = M();
  const el = root.querySelector('#' + id);
  const c = CHAR_BY_ID[p.charId];
  const counts = tagCounts(p.cards);
  const sig = p.sig && c.signatures.find((s) => s.id === p.sig);
  const f = foe();
  const ghost = !mine && f && f.ghost;
  const hybrids = mine ? CARDS.filter((h) => h.tier === 'hybrid' && !h.tags.some((t) => m.bans.includes(t)) && h.tags.every((t) => (counts[t] || 0) >= 2) && !h.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ)) : [];
  const label = watchLabel ? `${watchLabel} · ${esc(playerLabel(p))}` : mine ? 'Your gladiator' : `${isDuel() ? 'Rival' : ghost ? 'Opponent: a ghost copy of' : f ? 'This round\'s opponent' : 'Gladiator'} · ${esc(playerLabel(p))}`;
  el.innerHTML = `
    <div>
      <div class="eyebrow">${label}</div>
      <h2>${esc(c.name)}</h2>
      <div class="sub">${chip(c.trigger, true)} ${c.resources.map((r) => chip(r, true)).join(' ')}</div>
    </div>
    <div class="sub"><b style="color:var(--bronze)">${esc(c.ability.name)}</b>: ${esc(c.ability.desc())}<br><b style="color:var(--bronze)">Innate</b>: ${esc(c.innate.desc)}${sig ? `<br><b style="color:var(--bronze)">${esc(sig.name)}</b>: ${esc(sig.desc)}` : ''}</div>
    <div><div class="eyebrow" style="margin-bottom:6px">Tag progress</div><div class="progress">${tierProgress(counts)}</div></div>
    ${mine && queuedList(p).length ? `<div class="sub"><b style="color:var(--bronze)">Queued</b> (joins after this round): ${queuedList(p).map(([cid, n]) => esc(CARD_BY_ID[cid].name) + (n > 1 ? ` x${n}` : '')).join(', ')}</div>` : ''}
    ${hybrids.length ? `<div class="sub">Close to a Hybrid: ${hybrids.map((h) => `${esc(h.name)} (${h.tags.map((t) => `${TAGS[t].name} ${counts[t] || 0}/${HYBRID_REQ}`).join(', ')})`).join('; ')}</div>` : ''}
    <div class="stats-panel" id="stats-${id}">${statsPanel(mine ? 0 : 1)}</div>`;
}

function renderShroud(id) {
  root.querySelector('#' + id).innerHTML = `
    <div>
      <div class="eyebrow">Next opponent</div>
      <h2 class="shroud-name">? ? ?</h2>
      <div class="sub">Shrouded in mystery until the fight starts.</div>
    </div>
    <div><div class="eyebrow" style="margin-bottom:6px">Tag progress</div><div class="progress shroud">${Array.from({ length: 5 }, () => '<div class="prog"><span class="chip">??</span><span class="pips"></span><span class="next"></span></div>').join('')}</div></div>`;
}

// "Bram the Thornroot" once a signature is chosen.
function sigTitle(p) {
  const ch = CHAR_BY_ID[p.charId], sig = p.sig && ch.signatures.find((s) => s.id === p.sig);
  return sig ? `${ch.name} the ${sig.name}` : ch.name;
}

// The standings plaques on the arena's back wall.
function renderBoard() {
  if (!arena) return;
  const m = M();
  const f = foe();
  const results = m.phase === 'fight' ? m.lastResults || [] : [];
  const seen = ui.fightSeenAt || 0;
  const until = {};
  results.forEach((r) => {
    // Your own fight is over once you've seen it end (or skipped it).
    const mine = r.a === ME() || (!r.ghost && r.b === ME());
    if (mine && !ui.fighting) return;
    const end = seen + (r.time * 1000) / ROUND_PACE;
    until[r.a] = Math.max(until[r.a] || 0, end);
    if (!r.ghost) until[r.b] = Math.max(until[r.b] || 0, end);
  });
  const order = m.players.slice().sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || hpOf(b) - hpOf(a) || b.wins - a.wins);
  const w = ui.watching;
  const list = order.map((p) => ({
    id: p.id, name: nameOf(p), char: sigTitle(p), glyph: glyphOf(p.charId),
    tags: [CHAR_BY_ID[p.charId].trigger, ...CHAR_BY_ID[p.charId].resources],
    hp: hpOf(p), max: START_HP, place: p.placement, out: p.hp <= 0 && !ui.fighting,
    me: p.id === ME(), foe: !!(f && foeRevealed() && f.p.id === p.id),
    until: until[p.id] || 0, ready: m.phase === 'shop' && !p.isBot && !!m.ready?.[p.id],
    watchable: !ui.fighting && p.id !== ME() && !(f && f.p.id === p.id) && results.some((r) => r.a === p.id || r.b === p.id),
    watched: !!(w && (w.a === p.id || (!w.ghost && w.b === p.id))),
  }));
  arena.setStandings(isDuel() ? [] : list, (id) => {
    const i = M().lastResults.findIndex((r) => r.a === id || (!r.ghost && r.b === id));
    if (i < 0 || ui.fighting) return;
    if (ui.watching) { ui.fightStats = ui.savedStats; ui.watching = null; }
    watchFight(i);
  });
}

function renderTray() {
  const m = M();
  const p = m.players[ME()];
  const el = root.querySelector('#tray');
  const out = p.hp <= 0 && !ui.fighting;
  const locked = !shopOpen();
  const queued = queuedList(p);
  const ready = !!m.ready?.[p.id];
  const others = humansAlive().filter((h) => h.id !== ME());
  const notReady = others.filter((h) => !m.ready?.[h.id]).length;
  const goLabel = others.length === 0 ? 'Fight' : ready ? 'Ready' : 'Ready up';
  if (out) {
    el.style.minHeight = '';
    el.innerHTML = `<div class="spectate">You're out of the match${p.placement ? ` in ${ordinal(p.placement)} place` : ''}. You watch the leader's fight each round. Click a plaque with an eye to watch someone else.</div>
      <div class="go"><button class="btn" id="skip-rest" ${m.skipped?.[p.id] ? 'disabled' : ''}>${m.skipped?.[p.id] ? 'Waiting for others' : 'Skip to results'}</button></div>`;
    el.querySelector('#skip-rest').onclick = () => S.act('skip');
    return;
  }
  el.innerHTML = `
    <div class="purse">
      ${purseHtml(p, m)}
      <div class="row">
        <button class="btn" id="reroll" ${locked || p.gold < REROLL_COST ? 'disabled' : ''} title="New cards (R)">Reroll ${REROLL_COST}</button>
        <button class="btn ${p.locked ? 'on' : ''}" id="lock" ${locked ? 'disabled' : ''} title="Keep these cards for next round">${p.locked ? 'Locked' : 'Lock'}</button>
      </div>
    </div>
    <div class="cards" role="list" style="--n:${SHOP_SIZE}">
      ${p.shop.map((cid, i) => {
        if (cid) shopGhost[i] = cid;
        if (!cid) return shopGhost[i] ? `<div class="card sold t-${CARD_BY_ID[shopGhost[i]].tier}" aria-hidden="true">${cardBody(CARD_BY_ID[shopGhost[i]], 0)}</div>` : '<div class="card sold t-1" aria-hidden="true"></div>';
        const card = CARD_BY_ID[cid];
        const have = ownedCount(p, cid);
        const cost = cardCost(card);
        const poor = cost > p.gold;
        return `<button class="card t-${card.tier} ${poor ? 'poor' : ''}" role="listitem" data-slot="${i}" ${locked || poor || have >= card.max ? 'disabled' : ''} title="Buy (${i + 1})">
          ${cardBody(card, have)}
        </button>`;
      }).join('')}
    </div>
    <div class="go">
      <button class="btn primary ${ready ? 'is-ready' : ''}" id="fight" ${m.phase !== 'shop' || locked ? 'disabled' : ''} aria-pressed="${ready}">${goLabel}</button>
      <div class="hint" data-hint>${m.phase !== 'shop' ? (queued.length ? `Queued for next round: ${queued.map(([id, n]) => esc(CARD_BY_ID[id].name) + (n > 1 ? ` x${n}` : '')).join(', ')}` : 'Fight in progress. Cards you buy now join your build after the round.') : others.length && ready ? `Waiting for ${plural(notReady, 'player')}` : others.length ? 'The fight starts when everyone is ready' : 'Keys: 1-5 buy · R reroll · F fight'}</div>
    </div>`;
  const hint = el.querySelector('[data-hint]');
  hint.title = hint.textContent;
  // The tray only ever grows during a match (a card's text can wrap onto
  // another line once you own a copy), so the arena above it never jumps.
  el.style.minHeight = '';
  ui.trayH = Math.max(ui.trayH || 0, el.offsetHeight);
  el.style.minHeight = `${ui.trayH}px`;
  el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => doBuy(Number(b.dataset.slot)));
  el.querySelector('#reroll').onclick = () => S.act('reroll');
  el.querySelector('#lock').onclick = () => S.act('lock');
  el.querySelector('#fight').onclick = toggleReady;
}

// Gold and what saving it earns: income plus interest on what you keep.
function purseHtml(p, m) {
  const inc = income(m.round + 1), bonus = interest(p.gold);
  const cap = INTEREST_STEP * INTEREST_MAX;
  const next = bonus < INTEREST_MAX ? (bonus + 1) * INTEREST_STEP : null;
  const hint = next ? `Keep ${next - p.gold} more for +${bonus + 1} interest` : `Max interest. Gold over ${cap} earns nothing more`;
  const rule = `1 per ${INTEREST_STEP} kept, max ${INTEREST_MAX}`;
  const tip = `<b>Next round you get ${inc + bonus} gold</b><div class="tip-rows" style="grid-template-columns:1fr"><span>Income (4 + round, max 10)<b class="num">+${inc}</b></span><span>Interest (${rule})<b class="num">+${bonus}</b></span></div>Interest counts the gold you have left when the next round starts.`;
  const marks = Array.from({ length: INTEREST_MAX - 1 }, (_, k) => `<em style="left:${((k + 1) / INTEREST_MAX) * 100}%"></em>`).join('');
  return `<div class="gold"><b class="num">${p.gold}</b><span>gold</span></div>
    <div class="eco" data-tip="${esc(tip)}" tabindex="0">
      <div class="eco-line">Next round <b class="num">+${inc + bonus}</b></div>
      <div class="eco-sub num">${inc} income + ${bonus} interest</div>
      <div class="eco-bar" aria-hidden="true"><i style="width:${Math.min(1, p.gold / cap) * 100}%"></i>${marks}</div>
      <div class="eco-hint ${next ? '' : 'max'}">${hint}</div>
    </div>`;
}

function cardBody(card, have) {
  return `<span class="cost num">${cardCost(card)}</span>
    <div class="top">${cardTags(card)}</div>
    <div class="nm">${esc(card.name)}</div>
    <div class="ds">${richDesc(card, Math.min(card.max, have + 1))}</div>
    <div class="ft"><span class="tier">${TIER_NAMES[card.tier]}</span><span class="num">${have ? `Owned ${have}/${card.max}` : `Max ${card.max}`}</span></div>`;
}

function doBuy(slot) {
  const m = M();
  if (!shopOpen()) return;
  const p = m.players[ME()];
  const card = CARD_BY_ID[p.shop[slot]];
  if (!card) return;
  if (cardCost(card) > p.gold) { toast('Not enough gold.'); return; }
  S.act('buy', slot);
}

function toggleReady() {
  const m = M();
  if (m.phase !== 'shop' || ui.fighting) return;
  S.act('ready', !m.ready?.[ME()]);
}

// Over the arena between fights: when the next fight starts, big.
function renderPreview() {
  const el = root.querySelector('#preview');
  const m = M();
  const me = m.players[ME()];
  if (m.phase === 'fight' && !ui.fighting && !ui.watching) { el.innerHTML = roundWaitHtml(); return; }
  if (m.phase !== 'shop' || ui.fighting || me.hp <= 0) { el.innerHTML = ''; return; }
  const timed = S.remaining?.() != null;
  el.innerHTML = `<div class="preview">
    <span class="eyebrow">Fight preview · starting stats</span>
    ${timed ? `<div class="countdown"><span>Next fight in</span>${timerHtml()}</div>` : '<div class="countdown"><span>Press Fight when you are ready</span></div>'}
  </div>`;
}

// After your fight, while the rest of the round plays out: no popup, just a
// line saying how your fight went and what is still going.
function roundWaitHtml() {
  const m = M(), me = ME();
  const mine = m.lastResults.find((r) => r.a === me || (!r.ghost && r.b === me));
  const elapsed = (performance.now() - (ui.fightSeenAt || performance.now())) / 1000 * ROUND_PACE;
  const going = m.lastResults.filter((r) => r !== mine && r.time > elapsed).length;
  let head = '';
  if (mine) {
    const out = mine.winner === null ? 'Draw' : mine.winner === me ? 'Won' : 'Lost';
    const hp = mine.winner === me ? (mine.ghost ? '' : `, they lost ${mine.damage} HP`) : `, you lost ${mine.winner === null ? Math.ceil(mine.damage) : mine.damage} HP`;
    head = `<span class="result ${out.toLowerCase()}">Round ${m.fightRound}: ${out}</span><span class="hp-note">${hp.slice(2)}</span>`;
  }
  const line = going ? `${plural(going, 'fight')} still going. Click a plaque with an eye to watch.` : 'Next round starting...';
  return `<div class="preview wait">${head}<span class="slot-note">${line}</span></div>`;
}
// Refresh the "still going" count while the round plays out.
setInterval(() => { if (M()?.phase === 'fight' && !ui.fighting && !ui.watching && root.querySelector('#preview')) renderPreview(); }, 500);

function renderSpeed() {
  const el = root.querySelector('#speed');
  el.innerHTML = [1, 2, 4].map((s) => `<button class="btn ${ui.speed === s ? 'on' : ''}" data-speed="${s}">${s}x</button>`).join('') +
    (ui.fighting || ui.watching ? `<button class="btn" id="skip">${ui.watching ? 'Stop watching' : 'Skip'}</button>` : '');
  el.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { ui.speed = Number(b.dataset.speed); arena.setSpeed(ui.speed); renderSpeed(); });
  el.querySelector('#skip')?.addEventListener('click', () => { const w = ui.watching; arena.skip(); if (w) stopWatching(); });
}

const fighterName = (p, ghost = false) => (ghost ? `Ghost of ${p.name}` : p.id === ME() ? (p.name === 'You' ? 'You' : `${p.name} (you)`) : p.name);
function showPreview() {
  const f = foe();
  const other = f ? f.p : M().players.find((p) => p.id !== ME());
  arena.setPreview(myLoadout(), foeLoadout(), [fighterName(M().players[ME()]), fighterName(other, f?.ghost)], { mystery: !foeRevealed() });
}

// After your fight the arena keeps its last moment (the loser lying where they
// fell) until the round ends, instead of standing both gladiators back up.
const holding = () => M().phase === 'fight' && ui.lastFight?.round === M().fightRound;
function showHeld() {
  const h = ui.lastFight;
  arena.play(h.fight, () => {}, h.labels, { flip: h.flip, settled: true });
}

// Your fight replays locally from the shared seed; the host has already
// computed the same result.
function startFightAnimation() {
  const m = M();
  const opp = opponentOf(m, ME());
  if (!opp || !arena) return;
  const round = m.fightRound;
  ui.fighting = true;
  // Replay in the host's pair order (it sets the seed and who acts first),
  // so the result matches the one the host already applied.
  const second = m.pairs.some(([a, b, g]) => !g && b === ME());
  const f = second ? makeFight(m, opp.id, ME()) : makeFight(m, ME(), opp.id);
  const mine = (pair) => (second ? [pair[1], pair[0]] : pair);
  ui.fightStats = { live: true, round, stats: mine([f.units[0].stats, f.units[1].stats]) };
  const statsTimer = setInterval(refreshStats, 250);
  const labels = [fighterName(m.players[ME()]), fighterName(m.players[opp.id], opp.ghost)];
  arena.play(f, (raw) => {
    clearInterval(statsTimer);
    ui.fighting = false;
    const result = { ...raw, stats: mine(raw.stats) };
    ui.fightStats = { live: false, round, stats: JSON.parse(JSON.stringify(result.stats)) };
    // No results popup: say you're done, and the round moves on by itself
    // once every other fight has played out too.
    ui.lastFight = { round, fight: f, labels: mine(labels), flip: second };
    if (M()?.phase === 'fight' && M().fightRound === round && !M().watched?.[ME()]) S.act('watched');
    if (screenFor() === 'game' && arena) { if (!holding()) showPreview(); updateGame(); }
  }, mine(labels), { flip: second });
  updateGame();
}

// Spectating: replay any other fight of this round from the shared seed.
let watchTimer = 0;
function watchFight(i) {
  const m = M();
  const r = m.lastResults[i];
  if (!r || !arena || ui.fighting || m.phase !== 'fight') return;
  const round = m.fightRound;
  if (!ui.watching) ui.savedStats = ui.fightStats;
  ui.watching = { a: r.a, b: r.b, ghost: r.ghost, round };
  const f = makeFight(m, r.a, r.b);
  // Join in progress: every fight started when the round did, so skip ahead
  // to where it is now (or near its end, if it already finished).
  const elapsed = ((performance.now() - (ui.fightSeenAt || performance.now())) / 1000) * ROUND_PACE;
  const target = Math.min(elapsed, Math.max(0, r.time - 3));
  while (f.t + DT <= target && !f.over) f.step(DT);
  ui.fightStats = { live: true, round, watched: true, stats: [f.units[0].stats, f.units[1].stats] };
  clearInterval(watchTimer);
  watchTimer = setInterval(refreshStats, 250);
  arena.play(f, () => {
    // Stay on the end of the fight until "Stop watching" or the round ends.
    clearInterval(watchTimer);
    refreshStats();
  }, [fighterName(m.players[r.a]), fighterName(m.players[r.b], r.ghost)]);
  updateGame();
}
function stopWatching() {
  if (!ui.watching) return;
  clearInterval(watchTimer);
  ui.watching = null;
  ui.fightStats = ui.savedStats;
  if (screenFor() === 'game' && arena) { if (holding()) showHeld(); else showPreview(); updateGame(); }
}

function renderModal() {
  const el = root.querySelector('#modal');
  const m = M();
  const me = m.players[ME()];
  if (ui.modal === 'quit') {
    el.innerHTML = `<div class="modal-back" id="mb"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="qt">
      <h2 id="qt">${S.mode === 'host' ? 'Close the room?' : 'Leave the match?'}</h2>
      <p style="margin:0;color:var(--dust)">${S.mode === 'host' ? 'You are the host. Leaving ends the match for everyone.' : S.mode === 'client' ? 'A bot takes over your gladiator.' : 'This match will be lost.'}</p>
      <div class="row"><button class="btn primary" id="yes">${S.mode === 'host' ? 'Close the room' : 'Leave'}</button><button class="btn" id="no">Keep playing</button></div>
    </div></div>`;
    el.querySelector('#yes').onclick = () => { ui.modal = null; leave(); };
    el.querySelector('#no').onclick = () => { ui.modal = null; renderModal(); };
    return;
  }
  if (m.phase === 'signature' && me.hp > 0 && !me.sig) {
    const c = CHAR_BY_ID[me.charId];
    el.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="sigt">
      <div class="row" style="justify-content:space-between"><div class="eyebrow">Round ${SIGNATURE_ROUND} milestone</div>${timerHtml()}</div>
      <h2 id="sigt">Choose a signature for ${esc(c.name)}</h2>
      <p style="margin:0;color:var(--dust)">This upgrade lasts for the rest of the match.</p>
      <div class="sig-grid">${c.signatures.map((s) => `<button class="sig" data-sig="${s.id}"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></button>`).join('')}</div>
    </div></div>`;
    el.querySelectorAll('[data-sig]').forEach((b) => b.onclick = () => S.act('sig', b.dataset.sig));
    return;
  }
  if (m.phase === 'signature' && me.hp > 0) {
    el.innerHTML = `<div class="modal-back"><div class="modal"><p class="waiting" style="margin:0">Waiting for other players to choose their signatures... ${timerHtml()}</p></div></div>`;
    return;
  }
  if (ui.modal === 'codex') {
    el.innerHTML = `<div class="modal-back" id="mb"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="cdx">
      <div class="row" style="justify-content:space-between"><h2 id="cdx">The thirteen tags</h2><button class="btn" id="close">Close</button></div>
      <p style="margin:0;color:var(--dust)">Dashed chips are triggers: owning cards of a trigger makes it happen more. Solid chips are resources. Resources marked "on the enemy" show dashed in the arena.</p>
      <div class="tag-legend">${Object.keys(TAGS).map((t) => `<div>${chip(t, true)}<span>${esc(TAGS[t].kind === 'trigger' ? TAGS[t].passive : TAGS[t].stack)}</span></div>`).join('')}</div>
      <p style="margin:0;color:var(--dust)">Tiers unlock per tag at ${TIER_UNLOCK[2]} / ${TIER_UNLOCK[3]} / ${TIER_UNLOCK[4]} cards. Hybrids need ${HYBRID_REQ} cards in both of their resources. Overtime: after 30s of a fight, damage rises 8% per second while healing and shields shrink 3% per second; after 60s the arena burns both fighters until someone falls.</p>
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
  el.innerHTML = `<button class="btn ${ui.mobileTab === 'mine' ? 'on' : ''}" data-tab="mine">Your build</button><button class="btn ${ui.mobileTab === 'foe' ? 'on' : ''}" data-tab="foe">${isDuel() ? 'Rival' : 'Opponent'}</button>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.mobileTab = ui.mobileTab === b.dataset.tab ? null : b.dataset.tab; renderTabs(); });
  root.querySelector('#mine').classList.toggle('show', ui.mobileTab === 'mine');
  root.querySelector('#foe').classList.toggle('show', ui.mobileTab === 'foe');
}

function renderOver() {
  saveResult();
  submitToLeaderboard();
  const m = M();
  const me = m.players[ME()];
  const won = me.placement === 1;
  const list = (p) => Object.entries(p.cards).map(([id, n]) => `${esc(CARD_BY_ID[id].name)} x${n}`).join(', ') || 'No cards';
  const winner = m.players.find((p) => p.placement === 1);
  // Replay starts the same lobby again straight away; Back to lobby lets you
  // change it first.
  const actions = S.mode === 'solo'
    ? '<button class="btn primary" id="again">Replay</button><button class="btn" id="lobby">Back to lobby</button>'
    : S.mode === 'host'
      ? `<button class="btn primary" id="again" ${S.canStart() ? '' : 'disabled'}>Replay</button><button class="btn" id="lobby">Back to lobby</button><button class="btn" id="home">Close the room</button>`
      : '<span class="slot-note waiting">Waiting for the host to replay or reopen the lobby...</span><button class="btn" id="lobby">Back to lobby</button><button class="btn" id="home">Leave the room</button>';
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">After ${m.round} rounds · you won ${plural(me.wins, 'fight')}</div>
      <h1 class="brand" style="color:${won ? 'var(--bronze)' : 'var(--blood)'}">${won ? 'Champion' : isDuel() ? 'Fallen' : `${ordinal(me.placement)} of ${m.players.length}`}</h1>
    </div>
    <div class="row">${actions}</div>
    ${accountsAvailable() ? `<p class="slot-note">${!currentAccount() ? 'Sign in on the title screen to put your results on the leaderboard.'
      : ui.submitState === 'squire' ? 'Matches with Squire bots don\'t count for the leaderboard.'
      : ui.submitState === 'saved' ? 'Saved to the leaderboard.' : ui.submitState === 'failed' ? 'This result could not be saved to the leaderboard.' : 'Saving to the leaderboard...'}</p>` : ''}
    <table class="final">
      <thead><tr><th>Place</th><th>Gladiator</th><th>Player</th><th class="num">Fights won</th></tr></thead>
      <tbody>${standings(m).map((p) => `<tr class="${p.id === ME() ? 'me' : ''}"><td class="num">${ordinal(p.placement)}</td><td>${esc(CHAR_BY_ID[p.charId].name)}</td><td>${esc(playerLabel(p))}</td><td class="num">${p.wins}</td></tr>`).join('')}</tbody>
    </table>
    <div class="rules">
      <div class="rule"><h3>${esc(CHAR_BY_ID[me.charId].name)} (you)</h3><div class="progress">${tierProgress(tagCounts(me.cards))}</div><p>${list(me)}</p></div>
      ${winner && winner.id !== ME() ? `<div class="rule"><h3>${esc(CHAR_BY_ID[winner.charId].name)} (${esc(winner.name)}, winner)</h3><div class="progress">${tierProgress(tagCounts(winner.cards))}</div><p>${list(winner)}</p></div>` : ''}
    </div>
  </div></div>`;
  root.querySelector('#again')?.addEventListener('click', () => (S.mode === 'solo' ? startSolo() : S.start()));
  root.querySelector('#lobby')?.addEventListener('click', () => (S.mode === 'solo' ? leave() : S.backToLobby()));
  root.querySelector('#home')?.addEventListener('click', leave);
}

// ---------------------------------------------------------------- tooltips

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
  if (screenFor() !== 'game' || e.target.closest?.('input,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && ui.modal) { ui.modal = null; renderModal(); return; }
  if (!shopOpen()) return;
  if (e.key >= '1' && e.key <= '5') doBuy(Number(e.key) - 1);
  else if (e.key === 'r' || e.key === 'R') S.act('reroll');
  else if ((e.key === 'f' || e.key === 'F') && !ui.fighting) toggleReady();
});

window.addEventListener('resize', () => { ui.trayH = 0; });
document.fonts?.ready.then(() => { ui.trayH = 0; });

window.addEventListener('beforeunload', (e) => {
  if (S && S.mode === 'host' && S.stage !== 'closed') { e.preventDefault(); e.returnValue = ''; }
});

render();
// Who is signed in, if anyone; the title screen shows it once known.
if (accountsAvailable()) loadAccount().then(() => { if (screenFor() === 'title') render(); });
