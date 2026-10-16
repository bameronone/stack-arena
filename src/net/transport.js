// Network transports. Both give the host and clients the same small API:
//   host:   { code, onJoin(fn(conn)), onMessage(fn(conn, msg)), onLeave(fn(conn)), send(conn, msg), broadcast(msg), close() }
//   client: { send(msg), onMessage(fn(msg)), onClose(fn()), close() }
//
// 'peer'  WebRTC through PeerJS. PeerJS's free public server only introduces
//         the browsers; game traffic then flows directly between them.
// 'local' BroadcastChannel between tabs of one browser, for testing.

const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'stack-arena-room-';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newRoomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return s;
}

export function cleanCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
}

let peerJsPromise = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  peerJsPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS did not load.')));
    s.onerror = () => { peerJsPromise = null; reject(new Error('Could not load the networking library. Check your connection.')); };
    document.head.appendChild(s);
  });
  return peerJsPromise;
}

function emitter() {
  const subs = {};
  return {
    on: (ev, fn) => { (subs[ev] ??= []).push(fn); },
    emit: (ev, ...args) => { for (const fn of subs[ev] || []) fn(...args); },
  };
}

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

// ---------------------------------------------------------------- PeerJS

async function peerHost() {
  const Peer = await loadPeerJs();
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newRoomCode();
    try {
      const peer = await withTimeout(new Promise((resolve, reject) => {
        const p = new Peer(PREFIX + code);
        p.on('open', () => resolve(p));
        p.on('error', (e) => reject(e));
      }), 12000, 'Could not reach the matchmaking server.');
      const ev = emitter();
      const conns = new Map();
      peer.on('connection', (conn) => {
        conn.on('open', () => { conns.set(conn.peer, conn); ev.emit('join', conn.peer); });
        conn.on('data', (msg) => ev.emit('message', conn.peer, msg));
        const leave = () => { if (conns.delete(conn.peer)) ev.emit('leave', conn.peer); };
        conn.on('close', leave);
        conn.on('error', leave);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* already destroyed */ } });
      return {
        code,
        onJoin: (fn) => ev.on('join', fn),
        onMessage: (fn) => ev.on('message', fn),
        onLeave: (fn) => ev.on('leave', fn),
        send: (id, msg) => conns.get(id)?.send(msg),
        broadcast: (msg) => { for (const c of conns.values()) c.send(msg); },
        kick: (id) => { conns.get(id)?.close(); conns.delete(id); },
        close: () => peer.destroy(),
      };
    } catch (e) {
      if (e?.type !== 'unavailable-id') throw new Error(e?.message || 'Could not open a room.');
    }
  }
  throw new Error('Could not open a room. Try again.');
}

async function peerJoin(code) {
  const Peer = await loadPeerJs();
  const peer = new Peer();
  const ev = emitter();
  const conn = await withTimeout(new Promise((resolve, reject) => {
    peer.on('error', (e) => reject(new Error(e?.type === 'peer-unavailable' ? `No room called ${code}. Check the code with your host.` : e?.message || 'Could not connect.')));
    peer.on('open', () => {
      const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => resolve(c));
      c.on('error', (e) => reject(e));
    });
  }), 15000, 'Timed out connecting to the room. The host may be offline, or your network may block peer-to-peer connections.');
  conn.on('data', (msg) => ev.emit('message', msg));
  conn.on('close', () => ev.emit('close'));
  // Losing the matchmaking server doesn't affect the open game connection.
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* already destroyed */ } });
  return {
    send: (msg) => conn.send(msg),
    onMessage: (fn) => ev.on('message', fn),
    onClose: (fn) => ev.on('close', fn),
    close: () => peer.destroy(),
  };
}

// ---------------------------------------------------------------- local

function localHost() {
  const code = newRoomCode();
  const ch = new BroadcastChannel(PREFIX + code);
  const ev = emitter();
  const conns = new Set();
  ch.onmessage = ({ data }) => {
    if (data.to !== 'host') return;
    if (data.type === 'hello') { conns.add(data.from); ev.emit('join', data.from); }
    else if (data.type === 'bye') { if (conns.delete(data.from)) ev.emit('leave', data.from); }
    else if (conns.has(data.from)) ev.emit('message', data.from, data.msg);
  };
  return {
    code,
    onJoin: (fn) => ev.on('join', fn),
    onMessage: (fn) => ev.on('message', fn),
    onLeave: (fn) => ev.on('leave', fn),
    send: (id, msg) => ch.postMessage({ to: id, msg }),
    broadcast: (msg) => ch.postMessage({ to: '*', msg }),
    kick: (id) => { conns.delete(id); ch.postMessage({ to: id, type: 'kick' }); },
    close: () => { ch.postMessage({ to: '*', type: 'close' }); ch.close(); },
  };
}

function localJoin(code) {
  const id = 'tab-' + Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel(PREFIX + code);
  const ev = emitter();
  ch.onmessage = ({ data }) => {
    if (data.to !== id && data.to !== '*') return;
    if (data.type === 'close' || data.type === 'kick') ev.emit('close');
    else ev.emit('message', data.msg);
  };
  window.addEventListener('pagehide', () => ch.postMessage({ to: 'host', from: id, type: 'bye' }));
  ch.postMessage({ to: 'host', from: id, type: 'hello' });
  return {
    send: (msg) => ch.postMessage({ to: 'host', from: id, msg }),
    onMessage: (fn) => ev.on('message', fn),
    onClose: (fn) => ev.on('close', fn),
    close: () => { ch.postMessage({ to: 'host', from: id, type: 'bye' }); ch.close(); },
  };
}

export async function hostRoom(kind = 'peer') {
  return kind === 'local' ? localHost() : peerHost();
}

export async function joinRoom(code, kind = 'peer') {
  return kind === 'local' ? localJoin(code) : peerJoin(code);
}
