import { HostGame } from './host.js';
import { hostRoom, joinRoom } from '../net/transport.js';
import { MAX_PLAYERS } from '../engine/match.js';

// A session is what the UI talks to. Solo games, hosted rooms and joined
// rooms all look the same:
//   stage       'lobby' | 'game' | 'closed'
//   M           match state (read-only for the UI)
//   me          your player id
//   remaining() seconds left on the phase clock, or null
//   act(a, v)   ban | pick | sig | buy | reroll | lock | ready | watched
//   onChange(fn)
// Hosted rooms also manage lobby slots; joined rooms only mirror the host.

// Host and players must run the same build, or the host's rules (bans,
// combat) would differ from what a player's page shows. The build stamps a
// hash of the code into BUILD; unbundled (tests, tools) it is 1.
export const PROTOCOL = typeof BUILD !== 'undefined' ? BUILD : 1;
export const BOT_NAMES = ['Varro', 'Lucia', 'Crixus', 'Flamma', 'Priscus', 'Verus', 'Tetraites'];

function changeEmitter() {
  const subs = new Set();
  return { on: (fn) => { subs.add(fn); return () => subs.delete(fn); }, emit: () => { for (const fn of subs) fn(); } };
}

// A random id kept in this browser so a player who drops out of a match can
// come back to the same gladiator by joining the room code again.
export function playerToken() {
  try {
    let t = localStorage.getItem('stack-arena-token');
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('stack-arena-token', t); }
    return t;
  } catch { return Math.random().toString(36).slice(2); }
}

export const cleanName = (s) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Gladiator';

export function soloSession({ bots, shopTime }) {
  const ev = changeEmitter();
  const host = new HostGame({
    players: [{ name: 'You' }, ...bots.map((level, i) => ({ name: BOT_NAMES[i], isBot: true, level }))],
    shopTime,
  });
  host.onChange(ev.emit);
  const timer = setInterval(() => { host.tick(); host.poll(); }, 250);
  return {
    mode: 'solo', stage: 'game', me: 0,
    get M() { return host.M; },
    remaining: () => host.remaining(),
    act: (a, v) => host.act(0, a, v),
    onChange: ev.on,
    close: () => clearInterval(timer),
  };
}

export async function hostSession({ name, kind = 'peer' }) {
  const t = await hostRoom(kind);
  const ev = changeEmitter();
  let host = null;
  let timer = 0;
  const connToPlayer = new Map();
  // Who each human player was, so they can rejoin after leaving: id -> { token, name }.
  let seats = new Map();
  const s = {
    mode: 'host', stage: 'lobby', me: 0, code: t.code, shopTime: 30,
    slots: [{ kind: 'host', name: cleanName(name) }, { kind: 'open' }],
    get M() { return host?.M; },
    remaining: () => host?.remaining() ?? null,
    act: (a, v) => host?.act(0, a, v),
    onChange: ev.on,

    setSlot(i, spec) {
      const slot = s.slots[i];
      if (!slot || slot.kind === 'host') return;
      if (slot.kind === 'human') { t.send(slot.conn, { t: 'refused', reason: 'The host removed you from the room.' }); t.kick(slot.conn); }
      s.slots[i] = spec;
      lobbyChanged();
    },
    addSlot(spec = { kind: 'open' }) {
      if (s.slots.length < MAX_PLAYERS) { s.slots.push(spec); lobbyChanged(); }
    },
    removeSlot(i) {
      if (s.slots[i]?.kind === 'host' || s.slots.length <= 2) return;
      if (s.slots[i].kind === 'human') { t.send(s.slots[i].conn, { t: 'refused', reason: 'The host removed you from the room.' }); t.kick(s.slots[i].conn); }
      s.slots.splice(i, 1);
      lobbyChanged();
    },
    setShopTime(sec) { s.shopTime = sec; lobbyChanged(); },
    canStart: () => s.slots.filter((x) => x.kind !== 'open').length >= 2,

    start() {
      if (!s.canStart()) return;
      const filled = s.slots.filter((x) => x.kind !== 'open');
      let botIndex = 0;
      const players = filled.map((x) => (x.kind === 'bot'
        ? { name: BOT_NAMES[botIndex++ % BOT_NAMES.length], isBot: true, level: x.level }
        : { name: x.name }));
      connToPlayer.clear();
      seats = new Map();
      filled.forEach((x, id) => { if (x.kind === 'human') { connToPlayer.set(x.conn, id); seats.set(id, { token: x.token, name: x.name }); } });
      host = new HostGame({ players, shopTime: s.shopTime || 20 });
      host.onChange(() => { broadcastState(); ev.emit(); });
      for (const [conn, id] of connToPlayer) t.send(conn, { t: 'start', you: id });
      s.stage = 'game';
      clearInterval(timer);
      timer = setInterval(() => { host.tick(); host.poll(); }, 250);
      broadcastState();
      ev.emit();
    },
    backToLobby() {
      clearInterval(timer);
      host = null;
      s.stage = 'lobby';
      lobbyChanged();
    },
    close() {
      clearInterval(timer);
      t.close();
      s.stage = 'closed';
    },
  };

  function lobbyView() {
    return {
      code: s.code, shopTime: s.shopTime,
      slots: s.slots.map((x) => ({ kind: x.kind, name: x.name, level: x.level })),
    };
  }
  function lobbyChanged() {
    s.slots.forEach((x, i) => { if (x.kind === 'human') t.send(x.conn, { t: 'lobby', lobby: lobbyView(), you: i }); });
    ev.emit();
  }
  function broadcastState() {
    if (host) t.broadcast({ t: 'state', M: host.M, remaining: host.remaining() });
  }

  t.onMessage((conn, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL) { t.send(conn, { t: 'refused', reason: 'You and the host have different versions of the game. Both of you should reload the page, then try again.' }); return t.kick(conn); }
      if (s.stage !== 'lobby') {
        if (host && rejoin(conn, msg)) return;
        t.send(conn, { t: 'refused', reason: 'That match has already started.' });
        return t.kick(conn);
      }
      const i = s.slots.findIndex((x) => x.kind === 'open');
      if (i < 0) { t.send(conn, { t: 'refused', reason: 'The room is full.' }); return t.kick(conn); }
      s.slots[i] = { kind: 'human', name: cleanName(msg.name), conn, token: String(msg.token || '') };
      lobbyChanged();
    } else if (msg.t === 'act' && s.stage === 'game' && host) {
      const id = connToPlayer.get(conn);
      if (id != null) host.act(id, msg.a, msg.v);
    }
  });
  // A player who left (or dropped) joins the same code again: they get their
  // gladiator back from the bot. Matched by browser token, else by name.
  function rejoin(conn, msg) {
    const token = String(msg.token || '');
    const name = cleanName(msg.name);
    let id = null;
    for (const [pid, seat] of seats) if (token && seat.token === token) id = pid;
    if (id == null) for (const [pid, seat] of seats) if (seat.name === name && host.M.players[pid].isBot) id = pid;
    if (id == null) return false;
    for (const [c, pid] of connToPlayer) if (pid === id) { connToPlayer.delete(c); t.kick(c); }
    host.rejoin(id, seats.get(id).name);
    connToPlayer.set(conn, id);
    t.send(conn, { t: 'start', you: id });
    t.send(conn, { t: 'state', M: host.M, remaining: host.remaining() });
    return true;
  }

  t.onLeave((conn) => {
    const i = s.slots.findIndex((x) => x.kind === 'human' && x.conn === conn);
    if (i >= 0) s.slots[i] = { kind: 'open' };
    if (s.stage === 'game' && host && connToPlayer.has(conn)) {
      host.replaceWithBot(connToPlayer.get(conn));
      connToPlayer.delete(conn);
    } else if (s.stage === 'lobby') lobbyChanged();
  });
  return s;
}

export async function clientSession({ code, name, kind = 'peer' }) {
  const t = await joinRoom(code, kind);
  const ev = changeEmitter();
  let deadline = null;
  const s = {
    mode: 'client', stage: 'connecting', me: null, code, M: null, lobby: null, slot: null, closedReason: null,
    remaining: () => (deadline == null ? null : Math.max(0, (deadline - Date.now()) / 1000)),
    act: (a, v) => t.send({ t: 'act', a, v }),
    onChange: ev.on,
    // After a match: look at the room while the host decides what's next.
    backToLobby: () => { if (s.lobby) { s.stage = 'lobby'; ev.emit(); } },
    close: () => { t.close(); s.stage = 'closed'; },
  };
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The host did not answer. Check the room code.')), 8000);
    t.onMessage((msg) => {
      if (msg.t === 'start') { clearTimeout(timeout); resolve(); }
      if (msg.t === 'lobby') {
        clearTimeout(timeout);
        s.lobby = msg.lobby; s.slot = msg.you;
        if (s.stage !== 'game' || !s.M || s.M.phase === 'over') s.stage = 'lobby';
        resolve();
      } else if (msg.t === 'start') {
        s.me = msg.you; s.stage = 'game'; s.M = null;
      } else if (msg.t === 'state') {
        s.M = msg.M;
        deadline = msg.remaining == null ? null : Date.now() + msg.remaining * 1000;
        if (s.me != null && !(s.stage === 'lobby' && msg.M?.phase === 'over')) s.stage = 'game';
      } else if (msg.t === 'refused') {
        clearTimeout(timeout);
        s.closedReason = msg.reason;
        s.stage = 'closed';
        reject(new Error(msg.reason));
      }
      ev.emit();
    });
  });
  t.onClose(() => {
    if (s.stage === 'closed') return;
    s.stage = 'closed';
    s.closedReason ??= 'The host closed the room.';
    ev.emit();
  });
  t.send({ t: 'hello', name: cleanName(name), v: PROTOCOL, token: playerToken() });
  await ready;
  return s;
}
