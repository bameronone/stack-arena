import { TAGS, TRIGGERS, RESOURCES, TIER_UNLOCK, TIER_NAMES, HYBRID_REQ } from '../data/tags.js';
import { CARDS, CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { tagCounts, cardCost, REROLL_COST } from '../engine/shop.js';
import {
  visibleCharacters, makeFight, loadout, income, interest, START_HP, SIGNATURE_ROUND,
  opponentOf, standings, MAX_PLAYERS, BAN_COUNT,
} from '../engine/match.js';
import { SHOP_TIMES } from '../game/host.js';
import { soloSession, hostSession, clientSession, BOT_NAMES, cleanName } from '../game/session.js';
import { cleanCode } from '../net/transport.js';
import { createArena } from './arena.js';

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
let savedResultFor = null;
const ui = {
  tab: params.get('room') ? 'online' : 'solo',
  speed: 2, banner: null, mobileTab: null, modal: null,
  lobby: (() => { const l = store.get('lobby', ['normal']); return Array.isArray(l) && l.length && l.every((x) => DIFFICULTY_IDS.includes(x)) ? l.slice(0, MAX_PLAYERS - 1) : ['normal']; })(),
  soloTime: SHOP_TIMES.includes(store.get('solo-time', 30)) ? store.get('solo-time', 30) : 30,
  name: store.get('name', ''),
  joinCode: cleanCode(params.get('room') || ''),
  error: null, busy: false,
  fightStats: null, animRound: null, fighting: false,
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
function foeLoadout() {
  const f = foe();
  return f ? loadout(f.p) : loadout(M().players.find((p) => p.id !== ME()));
}

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

function cardTags(card) {
  if (card.tier === 'counter') return `<span class="chip" style="--c:#b9b2a6">Counter</span>${card.counters ? `<span class="arrow">vs</span>${chip(card.counters, true)}` : ''}`;
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  const res = cardResources(card);
  if (trig.length && res.length) return `${chip(trig[0], true)}<span class="arrow">&#9656;</span>${chip(res[0], true)}`;
  return card.tags.map((t) => chip(t, true)).join('');
}

// ---------------------------------------------------------------- fight stats

const SOURCE_COLOR = {
  Attacks: '#c9b79c', Poison: TAGS.poison.color, Bleed: TAGS.bleed.color, Thorns: TAGS.armor.color, 'Molten Armor': TAGS.fire.color,
  Shatter: TAGS.frost.color, Pandemic: TAGS.poison.color, 'Reflective Plating': TAGS.shield.color, 'Undying Spite': TAGS.pain.color,
  Regen: TAGS.regen.color, 'Bleed lifesteal': TAGS.bleed.color, 'Plague Lord': TAGS.poison.color, 'Phoenix Core': TAGS.fire.color,
  Armor: TAGS.armor.color, Shield: TAGS.shield.color, Dodge: TAGS.evasion.color, Resistances: '#b9b2a6', Immunity: '#e9dcc0',
  'Living Mountain': TAGS.armor.color, 'Mana Shield': TAGS.arcane.color, 'Arena burn': '#d6a24e',
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
  ui.banner = null; ui.fightStats = null; ui.animRound = null; ui.fighting = false; ui.error = null;
  lastCounts = null;
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
  useSession(soloSession({ bots: ui.lobby, shopTime: ui.soloTime }));
}

async function startOnline(kind) {
  const name = cleanName(root.querySelector('#name')?.value || ui.name);
  ui.name = name;
  store.set('name', name);
  ui.busy = true; ui.error = null; render();
  try {
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

function onSessionChange() {
  const m = M();
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
    if (m.phase !== 'fight' && ui.banner) ui.banner = null;
    if (m.phase !== 'fight' && ui.fighting) arena?.skip();
  }
  render();
  if (m && S.stage === 'game' && m.phase === 'fight' && ui.animRound !== m.fightRound) {
    ui.animRound = m.fightRound;
    if ((m.watchers || []).includes(ME())) startFightAnimation();
    else { ui.banner = resultsBanner(null); updateGame(); }
  }
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
    <div class="rule"><h3>Triggers and resources</h3><p>Triggers decide <i>when</i> you gain stacks (Strike, Crit, Dodge, Wounded, Spell). Resources decide <i>what</i> stacks do. A card like ${chip('precision', true)} <span class="arrow">&#9656;</span> ${chip('poison', true)} always fires. Cards with only a resource fire 30% of the time.</p></div>
    <div class="rule"><h3>Build up, unlock more</h3><p>Own ${TIER_UNLOCK[2]}, ${TIER_UNLOCK[3]} and ${TIER_UNLOCK[4]} cards of a tag to unlock its Uncommon, Rare and Mythic cards. Own ${HYBRID_REQ} of two resources to unlock their Hybrid card.</p></div>
    <div class="rule"><h3>Bans</h3><p>Every gladiator secretly votes to ban one resource, and the ${BAN_COUNT} with the most votes are banned. Banned cards never appear, and gladiators who only use banned resources sit the match out.</p></div>
    <div class="rule"><h3>Focus, not luck</h3><p>Dodging builds Focus. Every hit you take adds to your dodge chance, and a dodge resets it, so you can never dodge twice in a row. Poison, Bleed and abilities can't be dodged.</p></div>
  </div>
  <div>
    <div class="eyebrow" style="margin-bottom:10px">The thirteen tags</div>
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
    </div>
    ${ui.tab === 'solo' ? soloLobby() : onlineLobby()}
    ${RULES()}
  </div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; ui.error = null; render(); });
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
    <label class="field"><span class="eyebrow">Your name</span>
      <input id="name" maxlength="16" autocomplete="nickname" value="${esc(ui.name)}" placeholder="Gladiator"></label>
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
          <span class="slot-note">${S.canStart() ? 'Open slots nobody joined are left out.' : 'You need at least one rival: a player or a bot.'}</span>`
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
  const s = { hp: 600, ad: 30, as: 1.0, crit: 0.05, manaMax: 100, ...c.stats };
  return `${s.hp} HP · ${s.ad} damage · ${s.as.toFixed(2)} attacks/s · ${Math.round(s.crit * 100)}% crit · ${s.manaMax} mana`;
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
      ${vis.map(({ char: c, status }) => `
        <button class="char ${mine === c.id ? 'chosen' : ''}" data-char="${c.id}" ${mine ? 'disabled' : ''}>
          <div class="row" style="gap:6px">${chip(c.trigger, true)}<span class="arrow">&#9656;</span>${c.resources.map((r) => chip(r, true)).join('')}</div>
          <div><div class="nm">${esc(c.name)}</div><div class="ep">${esc(c.epithet)}</div></div>
          <div class="ab"><b>${esc(c.ability.name)}:</b> ${esc(c.ability.desc())}</div>
          <div class="inn">Innate: ${esc(c.innate.desc)}</div>
          <div class="stats num">${charStats(c)}</div>
          ${status === 'weakened' ? `<div class="warn">${c.resources.filter((r) => m.bans.includes(r)).map((r) => TAGS[r].name).join(', ')} is banned. This build is weaker.</div>` : ''}
        </button>`).join('')}
    </div>
    ${hidden.length ? `<p class="hidden-note">Sitting out (all their resources are banned): ${hidden.map((c) => esc(c.name)).join(', ')}.</p>` : ''}
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
          <div id="banner"></div>
        </section>
        <aside class="side foe" id="foe" aria-label="Opponent"></aside>
      </main>
      <footer class="tray" id="tray"></footer>
      <div id="modal"></div>
    </div>`;
    arena = createArena(root.querySelector('#arena'));
    arena.setSpeed(ui.speed);
  }
  if (!ui.fighting) arena.setPreview(loadout(M().players[ME()]), foeLoadout());
  updateGame();
}

function updateGame() {
  if (!root.querySelector('.game')) return;
  const m = M();
  renderHud();
  renderSide('mine', m.players[ME()], true);
  renderSide('foe', (foe() || { p: m.players.find((p) => p.id !== ME()) }).p, false);
  renderTray();
  renderSpeed();
  renderBanner();
  renderModal();
  renderTabs();
}

function renderHud() {
  const m = M();
  const me = m.players[ME()], f = foe();
  const life = (p, cls, ghost) => `
    <div class="life ${cls}">
      <div class="top"><span>${ghost ? 'Ghost of ' : ''}${esc(nameOf(p))} · ${esc(CHAR_BY_ID[p.charId].name)}</span><span class="num">${hpOf(p)} / ${START_HP}</span></div>
      <div class="bar"><i style="width:${(hpOf(p) / START_HP) * 100}%"></i></div>
    </div>`;
  root.querySelector('#hud').innerHTML = `
    <div class="logo">Stack <span>Arena</span></div>
    <div class="round"><span class="eyebrow">Round</span><b class="num">${m.round}</b></div>
    <div class="clock">${m.phase === 'shop' || m.phase === 'signature' ? timerHtml() : ''}</div>
    <div class="eyebrow">Bans: ${m.bans.map((b) => chip(b, true)).join(' ')}</div>
    <div class="vs">${life(me, 'me')}${f ? life(f.p, 'foe', f.ghost) : ''}</div>
    <div class="tools"><button class="btn" id="codex">Tags</button><button class="btn" id="quit">${S.mode === 'solo' ? 'Quit' : 'Leave'}</button></div>`;
  root.querySelector('#codex').onclick = () => { ui.modal = 'codex'; renderModal(); };
  root.querySelector('#quit').onclick = () => { ui.modal = 'quit'; renderModal(); };
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
  const m = M();
  const el = root.querySelector('#' + id);
  const c = CHAR_BY_ID[p.charId];
  const counts = tagCounts(p.cards);
  const sig = p.sig && c.signatures.find((s) => s.id === p.sig);
  const f = foe();
  const ghost = !mine && f && f.ghost;
  const hybrids = mine ? CARDS.filter((h) => h.tier === 'hybrid' && !h.tags.some((t) => m.bans.includes(t)) && h.tags.every((t) => (counts[t] || 0) >= 2) && !h.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ)) : [];
  const label = mine ? 'Your gladiator' : `${isDuel() ? 'Rival' : ghost ? 'Opponent: a ghost copy of' : f ? 'This round\'s opponent' : 'Gladiator'} · ${esc(playerLabel(p))}`;
  el.innerHTML = `${mine || isDuel() ? '' : standingsPanel()}
    <div>
      <div class="eyebrow">${label}</div>
      <h2>${esc(c.name)}</h2>
      <div class="sub">${chip(c.trigger, true)} ${c.resources.map((r) => chip(r, true)).join(' ')}</div>
    </div>
    <div class="sub"><b style="color:var(--bronze)">${esc(c.ability.name)}</b>: ${esc(c.ability.desc())}${sig ? `<br><b style="color:var(--bronze)">${esc(sig.name)}</b>: ${esc(sig.desc)}` : ''}</div>
    <div><div class="eyebrow" style="margin-bottom:6px">Tag progress</div><div class="progress">${tierProgress(counts)}</div></div>
    ${hybrids.length ? `<div class="sub">Close to a Hybrid: ${hybrids.map((h) => `${esc(h.name)} (${h.tags.map((t) => `${TAGS[t].name} ${counts[t] || 0}/${HYBRID_REQ}`).join(', ')})`).join('; ')}</div>` : ''}
    <div class="stats-panel" id="stats-${id}">${statsPanel(mine ? 0 : 1)}</div>`;
}

function standingsPanel() {
  const m = M();
  const f = foe();
  return `<div class="standings">
    <div class="eyebrow">Standings · ${m.players.filter((p) => p.hp > 0).length} of ${m.players.length} alive</div>
    ${standings(m).map((p) => `
      <div class="st ${p.id === ME() ? 'me' : ''} ${p.hp <= 0 && !ui.fighting ? 'out' : ''} ${f && f.p.id === p.id ? 'opp' : ''}">
        <span class="st-n">${p.placement ? ordinal(p.placement) : m.phase === 'shop' && !p.isBot && m.ready?.[p.id] ? '&#10003;' : ''}</span>
        <span class="st-name">${esc(nameOf(p))}${!p.isBot && p.id !== ME() ? ' <em>player</em>' : ''}<small>${esc(CHAR_BY_ID[p.charId].name)}</small></span>
        <span class="st-bar"><i style="width:${(hpOf(p) / START_HP) * 100}%"></i></span>
        <span class="st-hp num">${hpOf(p)}</span>
      </div>`).join('')}
  </div>`;
}

function renderTray() {
  const m = M();
  const p = m.players[ME()];
  const el = root.querySelector('#tray');
  const out = p.hp <= 0 && !ui.fighting;
  const locked = m.phase !== 'shop' || ui.fighting || p.hp <= 0;
  const ready = !!m.ready?.[p.id];
  const others = humansAlive().filter((h) => h.id !== ME());
  const notReady = others.filter((h) => !m.ready?.[h.id]).length;
  const goLabel = others.length === 0 ? 'Fight' : ready ? 'Ready' : 'Ready up';
  if (out) {
    el.innerHTML = `<div class="spectate">You're out of the match${p.placement ? ` in ${ordinal(p.placement)} place` : ''}. Watching the others finish...</div>`;
    return;
  }
  el.innerHTML = `
    <div class="purse">
      <div class="gold"><b class="num">${p.gold}</b><span>gold<br>+${income(m.round + 1) + interest(p.gold)} next round</span></div>
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
      <button class="btn primary ${ready ? 'is-ready' : ''}" id="fight" ${locked ? 'disabled' : ''} aria-pressed="${ready}">${goLabel}</button>
      <div class="hint">${m.phase !== 'shop' ? 'Fight in progress' : others.length && ready ? `Waiting for ${plural(notReady, 'player')}` : others.length ? 'The fight starts when everyone is ready' : 'Keys: 1-5 buy · R reroll · F fight'}</div>
    </div>`;
  el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => doBuy(Number(b.dataset.slot)));
  el.querySelector('#reroll').onclick = () => S.act('reroll');
  el.querySelector('#lock').onclick = () => S.act('lock');
  el.querySelector('#fight').onclick = toggleReady;
}

function doBuy(slot) {
  const m = M();
  if (m.phase !== 'shop' || ui.fighting) return;
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

function renderSpeed() {
  const el = root.querySelector('#speed');
  el.innerHTML = [1, 2, 4].map((s) => `<button class="btn ${ui.speed === s ? 'on' : ''}" data-speed="${s}">${s}x</button>`).join('') +
    (ui.fighting ? `<button class="btn" id="skip">Skip</button>` : '');
  el.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { ui.speed = Number(b.dataset.speed); arena.setSpeed(ui.speed); renderSpeed(); });
  el.querySelector('#skip')?.addEventListener('click', () => arena.skip());
}

// Your fight replays locally from the shared seed; the host has already
// computed the same result, which the banner reports.
function startFightAnimation() {
  const m = M();
  const opp = opponentOf(m, ME());
  if (!opp || !arena) return;
  const round = m.fightRound;
  ui.fighting = true;
  const f = makeFight(m, ME(), opp.id);
  ui.fightStats = { live: true, round, stats: [f.units[0].stats, f.units[1].stats] };
  const statsTimer = setInterval(refreshStats, 250);
  arena.play(f, (result) => {
    clearInterval(statsTimer);
    ui.fighting = false;
    ui.fightStats = { live: false, round, stats: JSON.parse(JSON.stringify(result.stats)) };
    if (M()?.phase === 'fight' && M().fightRound === round) ui.banner = resultsBanner(result);
    if (screenFor() === 'game' && arena) { arena.setPreview(loadout(M().players[ME()]), foeLoadout()); updateGame(); }
  });
  updateGame();
}

function resultsBanner(result) {
  const m = M();
  const me = ME();
  const mineIdx = m.lastResults.findIndex((r) => r.a === me || (!r.ghost && r.b === me));
  const mine = m.lastResults[mineIdx];
  const name = (id) => (id === me ? 'You' : m.players[id].name);
  const others = m.lastResults.filter((_, i) => i !== mineIdx).map((r) => (r.winner === null
    ? `${name(r.a)} and ${name(r.b)}${r.ghost ? ' (ghost)' : ''} drew`
    : `${name(r.winner)}${r.ghost && r.winner === r.b ? ' (ghost)' : ''} beat ${name(r.loser)}${r.ghost && r.loser === r.b ? ' (ghost)' : ''}${r.ghost && r.loser === r.b ? '' : `, -${r.damage} HP`}`));
  if (!mine || !result) return { spectator: true, others };
  const s = result.stats[0], o = result.stats[1];
  return {
    ghost: mine.ghost && mine.a === me,
    others,
    outcome: mine.winner === me ? 'win' : mine.winner === null ? 'draw' : 'loss',
    damage: mine.damage,
    time: result.time,
    line: `You dealt ${Math.round(s.dealt)} damage and took ${Math.round(s.taken)}.` +
      (s.dodges ? ` ${plural(s.dodges, 'dodge')}.` : '') + (s.crits ? ` ${plural(s.crits, 'crit')}.` : '') + (s.freezes ? ` ${plural(s.freezes, 'freeze')}.` : '') +
      (o.dodges ? ` Your opponent dodged ${plural(o.dodges, 'time')}.` : ''),
  };
}

function renderBanner() {
  const el = root.querySelector('#banner');
  const b = ui.banner;
  const m = M();
  if (!b) { el.innerHTML = ''; return; }
  const list = b.others?.length ? `<ul class="others">${b.others.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '';
  if (b.spectator) {
    el.innerHTML = `<div class="banner" role="status"><span class="eyebrow">Round ${m.fightRound} results</span>${list}
      <p class="slot-note waiting">Waiting for the players still in the match...</p></div>`;
    return;
  }
  const me = m.players[ME()];
  const meOut = me.hp <= 0;
  const lastStanding = m.players.filter((p) => p.hp > 0).length <= 1;
  const title = meOut && !isDuel() ? 'Knocked out' : b.outcome === 'win' ? 'Victory' : b.outcome === 'loss' ? 'Defeat' : 'Draw';
  const sub = b.outcome === 'win'
    ? (b.ghost ? 'You beat the ghost. Ghosts lose no HP.' : `Your opponent loses ${b.damage} HP.`)
    : b.outcome === 'loss' ? `You lose ${b.damage} HP.` : `You ${b.ghost ? '' : 'both '}lose ${Math.ceil(b.damage)} HP.`;
  const watched = !!m.watched?.[ME()];
  const waitingFor = (m.watchers || []).filter((id) => !m.watched?.[id] && !m.players[id].isBot).length;
  el.innerHTML = `<div class="banner ${b.outcome}" role="status">
    <span class="eyebrow">Round ${m.fightRound} · ${b.time.toFixed(1)}s</span>
    <h2>${title}</h2><p>${sub}</p><p style="font-size:13px">${esc(b.line)}</p>
    ${list}
    ${watched ? `<p class="slot-note waiting">Waiting for ${plural(waitingFor, 'player')} to finish watching... ${timerHtml()}</p>`
      : `<button class="btn primary" id="cont">${lastStanding || (meOut && humansAlive().length === 0) ? 'See the result' : meOut ? 'Keep watching' : 'Next round'}</button>`}
  </div>`;
  const cont = el.querySelector('#cont');
  if (cont) { cont.onclick = () => S.act('watched'); cont.focus({ preventScroll: true }); }
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
  el.innerHTML = `<button class="btn ${ui.mobileTab === 'mine' ? 'on' : ''}" data-tab="mine">Your build</button><button class="btn ${ui.mobileTab === 'foe' ? 'on' : ''}" data-tab="foe">${isDuel() ? 'Rival' : 'Opponent and standings'}</button>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.mobileTab = ui.mobileTab === b.dataset.tab ? null : b.dataset.tab; renderTabs(); });
  root.querySelector('#mine').classList.toggle('show', ui.mobileTab === 'mine');
  root.querySelector('#foe').classList.toggle('show', ui.mobileTab === 'foe');
}

function renderOver() {
  saveResult();
  const m = M();
  const me = m.players[ME()];
  const won = me.placement === 1;
  const list = (p) => Object.entries(p.cards).map(([id, n]) => `${esc(CARD_BY_ID[id].name)} x${n}`).join(', ') || 'No cards';
  const winner = m.players.find((p) => p.placement === 1);
  const actions = S.mode === 'solo'
    ? '<button class="btn primary" id="again">Play again</button><button class="btn" id="home">Back to the title screen</button>'
    : S.mode === 'host'
      ? '<button class="btn primary" id="room">Back to the room</button><button class="btn" id="home">Close the room</button>'
      : '<span class="slot-note waiting">Waiting for the host to start another match...</span><button class="btn" id="home">Leave the room</button>';
  root.innerHTML = `
  <div class="screen"><div class="screen-inner">
    <div>
      <div class="eyebrow">After ${m.round} rounds · you won ${plural(me.wins, 'fight')}</div>
      <h1 class="brand" style="color:${won ? 'var(--bronze)' : 'var(--blood)'}">${won ? 'Champion' : isDuel() ? 'Fallen' : `${ordinal(me.placement)} of ${m.players.length}`}</h1>
    </div>
    <table class="final">
      <thead><tr><th>Place</th><th>Gladiator</th><th>Player</th><th class="num">Fights won</th></tr></thead>
      <tbody>${standings(m).map((p) => `<tr class="${p.id === ME() ? 'me' : ''}"><td class="num">${ordinal(p.placement)}</td><td>${esc(CHAR_BY_ID[p.charId].name)}</td><td>${esc(playerLabel(p))}</td><td class="num">${p.wins}</td></tr>`).join('')}</tbody>
    </table>
    <div class="rules">
      <div class="rule"><h3>${esc(CHAR_BY_ID[me.charId].name)} (you)</h3><div class="progress">${tierProgress(tagCounts(me.cards))}</div><p>${list(me)}</p></div>
      ${winner && winner.id !== ME() ? `<div class="rule"><h3>${esc(CHAR_BY_ID[winner.charId].name)} (${esc(winner.name)}, winner)</h3><div class="progress">${tierProgress(tagCounts(winner.cards))}</div><p>${list(winner)}</p></div>` : ''}
    </div>
    <div class="row">${actions}</div>
  </div></div>`;
  root.querySelector('#again')?.addEventListener('click', startSolo);
  root.querySelector('#room')?.addEventListener('click', () => S.backToLobby());
  root.querySelector('#home').onclick = leave;
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
  const m = M();
  if (m.phase === 'fight') {
    if ((e.key === 'Enter' || e.key === ' ') && ui.banner && !ui.banner.spectator && !m.watched?.[ME()] && document.activeElement?.id !== 'cont') { e.preventDefault(); S.act('watched'); }
    return;
  }
  if (m.phase !== 'shop' || ui.fighting) return;
  if (e.key >= '1' && e.key <= '5') doBuy(Number(e.key) - 1);
  else if (e.key === 'r' || e.key === 'R') S.act('reroll');
  else if (e.key === 'f' || e.key === 'F') toggleReady();
});

window.addEventListener('beforeunload', (e) => {
  if (S && S.mode === 'host' && S.stage !== 'closed') { e.preventDefault(); e.returnValue = ''; }
});

render();
