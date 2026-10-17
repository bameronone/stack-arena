import { buildUnit, DT, SUDDEN_DEATH_AT, BURN_AT, overtime } from '../engine/combat.js';
import { TAGS } from '../data/tags.js';

// Canvas renderer for the pit. It either shows a static preview of both
// gladiators or plays a Fight forward in real time at the chosen speed.
// The pit is drawn as a tilted board seen from behind your gladiator, like an
// auto-battler camera: you stand near the front left, your opponent at the
// back right.

const SELF_STACKS = ['fire', 'shield', 'regen', 'arcane', 'lightning', 'armor'];

// Pixel-art sprites embedded by the build from assets/sprites (made with
// tools/pixellab.mjs). Gladiators without sprites are drawn as medallions.
const SPRITE_DATA = typeof SPRITES !== 'undefined' ? SPRITES : {};
const spriteCache = {};
function spriteSet(charId) {
  const data = SPRITE_DATA[charId];
  if (!data) return null;
  if (!spriteCache[charId]) {
    const load = (src) => { const img = new Image(); img.src = src; return img; };
    spriteCache[charId] = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(load)]));
  }
  const set = spriteCache[charId];
  return set.base?.[0]?.complete && set.base[0].naturalWidth ? set : null;
}
// One-shot animations: seconds for the whole clip, however many frames it has.
const CLIP = { attack: 0.45, cast: 0.7, hurt: 0.35, death: 0.9 };
// Seconds a new clip takes to fade in over the last frame of the old one.
const BLEND = 0.12;
let tintCanvas = null;
function tinted(img, color, alpha) {
  tintCanvas ??= document.createElement('canvas');
  tintCanvas.width = img.naturalWidth; tintCanvas.height = img.naturalHeight;
  const t = tintCanvas.getContext('2d');
  t.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  t.globalCompositeOperation = 'source-over';
  t.drawImage(img, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  t.globalAlpha = alpha;
  t.fillStyle = color;
  t.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  t.globalAlpha = 1;
  return tintCanvas;
}
const ON_ME = ['frost', 'poison', 'bleed'];

export function createArena(canvas) {
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1;
  let units = null;
  let fight = null;
  let onDone = null;
  let speed = 2;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let floaters = [];
  let fx = [];
  let strikes = []; // lightning bolts on screen
  let names = ['', '']; // player names shown over each fighter
  let flip = false; // draw unit 1 on the left
  let mystery = false; // the right fighter is an unrevealed opponent
  // Standings on the back wall: one plaque per player, best on the left.
  let board = [], plaqueX = {}, plaqueRects = [], onPick = null;
  const anim = [0, 1].map(() => ({ lunge: 0, flash: 0, cast: 0, dodge: 0, dodgeDir: 1, clip: 'idle', clipT: 0, from: null, spawn: {} }));
  let clock = 0;
  // Switching clips remembers where the old one was so the two can blend.
  const setClip = (a, clip) => { a.from = { clip: a.clip, clipT: a.clipT }; a.clip = clip; a.clipT = 0; };
  const startClip = (a, clip) => { if (a.clip !== 'death') setClip(a, clip); };
  let dotSeen = [{ poison: 0, bleed: 0 }, { poison: 0, bleed: 0 }];
  let dotTimer = 0;
  let embers = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.04, r: Math.random() * 1.6 + 0.4 }));

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(10, r.width); h = Math.max(10, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();

  // The stage, seen from the side: a back wall over the top part, then the
  // floor narrowing away from the camera. Both fighters stand on the same
  // line, near the front, as large as the arena allows.
  function stage() {
    const narrow = w < 640;
    const floorTop = h * (narrow ? 0.4 : 0.3);
    const feet = h * (narrow ? 0.8 : 0.9);
    return { floorTop, feet, narrow };
  }
  function pos(side) {
    const st = stage();
    const x = w * ((flip ? 1 - side : side) === 0 ? (st.narrow ? 0.27 : 0.32) : (st.narrow ? 0.73 : 0.68));
    return { x, y: st.feet - baseRadius() * 1.05, k: 1 };
  }
  function baseRadius() {
    return Math.max(26, Math.min(w * 0.09, h * 0.17, 120));
  }
  function radius() {
    return baseRadius();
  }
  // Unit vector from a fighter toward the other one, for lunges.
  function toward(side) {
    const a = pos(side), b = pos(1 - side);
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  }

  function float(side, text, color, size = 16, dy = 0) {
    const p = pos(side);
    const r = radius(side);
    floaters.push({ x: p.x + (Math.random() - 0.5) * r, y: p.y - r * 0.6 + dy, text, color, size, life: 1.1 });
    if (floaters.length > 60) floaters.shift();
  }

  function onEvent(ev) {
    const a = anim[ev.side];
    switch (ev.type) {
      case 'attack': a.lunge = 1; startClip(a, 'attack'); break;
      case 'dmg':
        anim[ev.side].flash = 1;
        if (anim[ev.side].clip === 'idle') startClip(anim[ev.side], 'hurt');
        float(ev.side, Math.round(ev.amt) + (ev.crit ? '!' : ''), ev.crit ? '#f2d16b' : ev.kind === 'ability' ? '#b59cf0' : ev.kind === 'thorns' ? '#a8a39a' : '#e9dcc0', ev.crit ? 22 : ev.kind === 'ability' ? 19 : 15);
        break;
      case 'dodge': a.dodge = 1; a.dodgeDir = -a.dodgeDir; float(ev.side, 'DODGE', TAGS.evasion.color, 15, -10); break;
      case 'freeze': float(ev.side, 'FROZEN', TAGS.frost.color, 18, -18); shards(ev.side); break;
      case 'cast': a.cast = 1; startClip(a, 'cast'); float(ev.side, ev.name, TAGS.spell.color, 16, -32); break;
      case 'revive': setClip(a, 'idle'); float(ev.side, 'REVIVED', TAGS.fire.color, 20, -24); break;
      case 'resist': float(ev.side, 'RESISTED', '#a8a39a', 14, -18); break;
      case 'immune': float(ev.side, 'IMMUNE', '#e9eef5', 14, -18); break;
      case 'burst': float(ev.side, 'PANDEMIC', TAGS.poison.color, 18, -18); break;
      case 'bolt': strikes.push(makeStrike(ev.side)); anim[ev.side].flash = 1; break;
      case 'grit': float(ev.side, 'GRIT', '#d6a24e', 18, -26); break;
    }
  }

  function setPreview(loadA, loadB, labels = ['', ''], opts = {}) {
    names = labels;
    flip = false;
    mystery = !!opts.mystery;
    fight = null;
    onDone = null;
    floaters = [];
    fx = []; strikes = [];
    try {
      const a = buildUnit(loadA, 0), b = buildUnit(loadB, 1);
      a.enemy = b; b.enemy = a;
      units = [a, b];
    } catch { units = null; }
    start();
  }

  // flip draws unit 1 on the left, for when you are the second fighter of
  // your pairing (the fight must keep the host's order to replay the same).
  function play(f, done, labels = names, opts = {}) {
    names = labels;
    flip = !!opts.flip;
    mystery = false;
    fight = f;
    fight.onEvent = onEvent;
    units = fight.units;
    onDone = done;
    acc = 0;
    floaters = [];
    fx = []; strikes = [];
    // Count from where the fight is now: a watched fight may join mid-way.
    dotSeen = units.map((u) => ({ poison: u.enemy.stats.byKind.poison || 0, bleed: u.enemy.stats.byKind.bleed || 0 }));
    start();
  }

  function skip() {
    if (!fight) return;
    fight.onEvent = null;
    fight.runToEnd();
    finish();
  }

  function finish() {
    const cb = onDone;
    onDone = null;
    if (cb) cb(fight.result());
  }

  function setSpeed(s) { speed = s; }

  function start() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (fight && !fight.over) {
      acc += dt * speed;
      let steps = 0;
      while (acc >= DT && !fight.over && steps++ < 200) { fight.step(DT); acc -= DT; }
      dotTimer += dt;
      if (dotTimer > 0.6) { dotTimer = 0; dotFloaters(); }
      if (fight.over) setTimeout(finish, 650);
    }
    clock += dt;
    const pace = fight ? Math.max(1, speed / 2) : 1;
    for (const [side, a] of anim.entries()) {
      const u = units?.[side];
      if (u?.dead && a.clip !== 'death') setClip(a, 'death');
      if (u && !u.dead && a.clip === 'death') setClip(a, 'idle');
      a.clipT += dt * pace;
      if (CLIP[a.clip] && a.clip !== 'death' && a.clipT >= CLIP[a.clip]) setClip(a, 'idle');
      if (a.from && a.clipT >= BLEND) a.from = null;
      a.lunge = Math.max(0, a.lunge - dt * 6 * pace);
      a.flash = Math.max(0, a.flash - dt * 5);
      a.cast = Math.max(0, a.cast - dt * 2);
      a.dodge = Math.max(0, a.dodge - dt * 2.2 * pace);
      if (u && !u.dead) spawnStatus(u, a, dt);
    }
    for (const f of floaters) { f.life -= dt * 0.9; f.y -= dt * 38; }
    floaters = floaters.filter((f) => f.life > 0);
    for (const p of fx) {
      p.life -= dt / p.ttl;
      p.vy += (p.g || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor != null && p.y >= p.floor) { p.y = p.floor; p.vx = 0; p.vy = 0; p.g = 0; p.kind === 'drop' && (p.kind = 'splat'); }
    }
    fx = fx.filter((p) => p.life > 0);
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function dotFloaters() {
    for (const u of fight.units) {
      const src = u.enemy.stats.byKind;
      for (const k of ['poison', 'bleed']) {
        const total = src[k] || 0;
        const d = total - dotSeen[u.side][k];
        if (d >= 1) float(u.side, Math.round(d), TAGS[k].color, 13, 26);
        dotSeen[u.side][k] = total;
      }
    }
  }

  // ------------------------------------------------------------ status effects
  // Each status gets its own particles: poison bubbles up, bleed drips onto
  // the floor, fire licks at the feet, regen floats up as crosses. Frost and
  // dodges are drawn on the figure itself (see drawUnit).
  const STATUS_FX = {
    poison: { per: (u) => Math.min(14, 3 + u.poison / 4) },
    bleed: { per: (u) => Math.min(16, 3 + u.bleed / 2) },
    fire: { per: (u) => Math.min(14, u.fire * 0.7) },
    regen: { per: (u) => Math.min(3, 0.6 + u.regen / 12) },
    lightning: { per: (u) => Math.min(10, 1 + u.lightning * 0.8) },
    frost: { per: (u) => (u.frozen > 0 ? 6 : Math.min(4, u.frost / 4)) },
  };
  function spawnStatus(u, a, dt) {
    if (fx.length > 260) return;
    const p = pos(u.side), r = radius(u.side);
    const feet = p.y + r * 1.05;
    for (const [k, def] of Object.entries(STATUS_FX)) {
      const on = k === 'frost' ? u.frost >= 1 || u.frozen > 0 : u[k] >= 1;
      if (!on) { a.spawn[k] = 0; continue; }
      a.spawn[k] = (a.spawn[k] || 0) + dt * def.per(u) * (reduceMotion ? 0.3 : 1);
      while (a.spawn[k] >= 1) {
        a.spawn[k] -= 1;
        const rx = (Math.random() - 0.5) * r * 1.1;
        if (k === 'poison') fx.push({ kind: 'bubble', x: p.x + rx, y: p.y + Math.random() * r * 0.6, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 16, size: 3 + Math.random() * 4 * p.k, ttl: 1.3, life: 1, color: TAGS.poison.color });
        else if (k === 'bleed') fx.push({ kind: 'drop', x: p.x + rx * 0.8, y: p.y - r * 0.2 + Math.random() * r * 0.6, vx: (Math.random() - 0.5) * 10, vy: 10, g: 260, floor: feet - Math.random() * r * 0.15, size: 2.2 + Math.random() * 2.4 * p.k, ttl: 1.8, life: 1, color: TAGS.bleed.color });
        else if (k === 'fire') fx.push({ kind: 'flame', x: p.x + rx, y: feet - Math.random() * r * 0.3, vx: (Math.random() - 0.5) * 6, vy: -30 - Math.random() * 25, size: 3 + Math.random() * 3 * p.k, ttl: 0.7, life: 1, color: TAGS.fire.color });
        else if (k === 'regen') fx.push({ kind: 'cross', x: p.x + rx, y: p.y + r * 0.2, vx: 0, vy: -22, size: 3 + p.k * 2, ttl: 1.2, life: 1, color: TAGS.regen.color });
        else if (k === 'lightning') { const ang = Math.random() * Math.PI * 2; fx.push({ kind: 'shard', x: p.x + Math.cos(ang) * r * 0.9, y: p.y + Math.sin(ang) * r * 0.9, vx: Math.cos(ang) * 30, vy: Math.sin(ang) * 30, size: 1.5 + Math.random() * 1.5, ttl: 0.25, life: 1, color: TAGS.lightning.color, rot: ang }); }
        else if (k === 'frost') fx.push({ kind: 'flake', x: p.x + rx * 1.2, y: p.y - r * (0.9 + Math.random() * 0.4), vx: (Math.random() - 0.5) * 6, vy: 14 + Math.random() * 10, size: 1.4 + Math.random() * 1.6, ttl: 1.6, life: 1, color: '#d8f1ff' });
      }
    }
  }
  function shards(side) {
    const p = pos(side), r = radius(side);
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, v = 60 + Math.random() * 90;
      fx.push({ kind: 'shard', x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 40, g: 220, floor: p.y + r * 1.05, size: 2 + Math.random() * 3, ttl: 0.9, life: 1, color: '#bfe7ff', rot: ang });
    }
  }
  // A jagged bolt from above the stage down onto the target.
  function makeStrike(side) {
    const p = pos(side), r = radius(side);
    const pts = [];
    let x = p.x + (Math.random() - 0.5) * r;
    const y0 = 0, y1 = p.y;
    for (let i = 0; i <= 8; i++) {
      pts.push([x, y0 + ((y1 - y0) * i) / 8]);
      x += (Math.random() - 0.5) * r * 0.5;
      x += (p.x - x) * 0.25;
    }
    return { pts, life: 1 };
  }
  function drawStrikes(dt) {
    for (const st of strikes) {
      st.life -= dt * 3;
      if (st.life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = st.life;
      ctx.lineJoin = 'round';
      for (const [wd, col] of [[9, 'rgba(245,228,91,0.25)'], [4, TAGS.lightning.color], [1.5, '#fffbe0']]) {
        ctx.strokeStyle = col; ctx.lineWidth = wd;
        ctx.beginPath();
        st.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
      ctx.restore();
    }
    strikes = strikes.filter((st) => st.life > 0);
  }
  // An opponent you haven't been shown yet: a dark, hooded silhouette.
  function drawMystery(p, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 1.05, r * 0.9, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(p.x, p.y - r * 0.2, 2, p.x, p.y, r * 1.2);
    g.addColorStop(0, 'rgba(60,52,70,0.9)'); g.addColorStop(1, 'rgba(15,13,18,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(214,162,78,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(233,220,192,${0.55 + 0.15 * Math.sin(clock * 2)})`;
    ctx.font = `${Math.round(r * 1.1)}px "Grenze Gotisch", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', p.x, p.y + 4);
    ctx.font = '700 13px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#e9dcc0';
    ctx.fillText('Next opponent', p.x, p.y - r - 26);
    ctx.font = '600 11px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#a99c87';
    ctx.fillText('Revealed when the fight starts', p.x, p.y - r - 11);
  }

  // The standings, hung on the back wall. Plaques slide to their new place
  // when the order changes. Swords mark players whose fight is still going;
  // clicking those watches it.
  function drawBoard(dt) {
    plaqueRects = [];
    if (!board.length) return;
    const { floorTop, narrow } = stage();
    const n = board.length;
    const margin = narrow ? 8 : 24;
    const slot = (w - margin * 2) / n;
    const pw = Math.min(160, slot - 6), ph = narrow ? 26 : 40;
    const compact = pw < 92;
    const y = narrow ? 92 : Math.max(58, floorTop - ph - 54);
    const now = performance.now();
    board.forEach((b, i) => {
      const target = margin + slot * i + slot / 2;
      const cur = plaqueX[b.id] ?? target;
      plaqueX[b.id] = cur + (target - cur) * Math.min(1, dt * 6);
      const x = plaqueX[b.id] - pw / 2;
      const fighting = b.until > now;
      ctx.save();
      ctx.globalAlpha = b.out ? 0.45 : 1;
      ctx.fillStyle = 'rgba(20,17,24,0.82)';
      roundRect(x, y, pw, ph, 5); ctx.fill();
      ctx.lineWidth = b.me || b.foe ? 2 : 1;
      ctx.strokeStyle = b.me ? '#d6a24e' : b.foe ? '#d9505e' : 'rgba(214,162,78,0.25)';
      ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      const hpw = pw - 12, hpy = y + ph - 9;
      ctx.fillStyle = '#2a2530'; ctx.fillRect(x + 6, hpy, hpw, 4);
      ctx.fillStyle = b.me ? '#7fca6e' : '#c9b79c';
      ctx.fillRect(x + 6, hpy, hpw * Math.max(0, Math.min(1, b.hp / b.max)), 4);
      ctx.fillStyle = '#e9dcc0';
      if (compact) {
        ctx.textAlign = 'center';
        ctx.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
        ctx.fillText(`${b.glyph} ${b.hp}`, x + pw / 2 - (fighting && narrow ? 5 : 0), y + 15);
      } else {
        ctx.textAlign = 'left';
        ctx.font = '700 12px "Barlow Semi Condensed", system-ui, sans-serif';
        let name = (b.place ? `${b.place}. ` : `${i + 1}. `) + b.name;
        while (ctx.measureText(name).width > pw - 34 && name.length > 3) name = name.slice(0, -2) + '…';
        ctx.fillText(name, x + 6, y + 14);
        ctx.font = '600 10px "Barlow Semi Condensed", system-ui, sans-serif';
        ctx.fillStyle = '#a99c87';
        ctx.fillText(b.char, x + 6, y + 26);
        ctx.textAlign = 'right';
        ctx.font = '700 12px "Barlow Semi Condensed", system-ui, sans-serif';
        ctx.fillStyle = '#e9dcc0';
        ctx.fillText(String(b.hp), x + pw - 6, y + 14);
        if (b.ready) { ctx.fillStyle = '#7fca6e'; ctx.fillText('✓', x + pw - 6, y + 26); }
      }
      if (fighting) {
        // Under the plaque; inside its right edge on narrow screens, where
        // the fighters' names sit just below.
        const sx = narrow ? x + pw - 8 : x + pw / 2, sy = narrow ? y + 9 : y + ph + 13, k = narrow ? 4 : 11;
        const swing = Math.sin(now / 160) * 0.25;
        ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        // Two crossed swords: blade, crossguard and grip, clashing gently.
        for (const dir of [-1, 1]) {
          const a = dir * (0.8 + swing);
          const ux = Math.sin(a), uy = -Math.cos(a); // hilt to tip
          const hx = sx - ux * k, hy = sy - uy * k;
          ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(hx + ux * k * 0.35, hy + uy * k * 0.35); ctx.lineTo(sx + ux * k, sy + uy * k); ctx.stroke();
          ctx.strokeStyle = '#d6a24e';
          const gx = hx + ux * k * 0.35, gy = hy + uy * k * 0.35;
          ctx.beginPath(); ctx.moveTo(gx - uy * k * 0.35, gy + ux * k * 0.35); ctx.lineTo(gx + uy * k * 0.35, gy - ux * k * 0.35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(gx, gy); ctx.stroke();
        }
        if (b.watchable) plaqueRects.push({ id: b.id, x, y, w: pw, h: ph + (narrow ? 0 : 20) });
      }
      ctx.restore();
    });
  }
  function boardHit(ev) {
    const rc = canvas.getBoundingClientRect();
    const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
    return plaqueRects.find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  }
  canvas.addEventListener('click', (ev) => { const hit = boardHit(ev); if (hit && onPick) onPick(hit.id); });
  canvas.addEventListener('mousemove', (ev) => { canvas.style.cursor = boardHit(ev) ? 'pointer' : ''; });
  function setStandings(list, pick) {
    board = list;
    onPick = pick;
    start();
  }

  function drawFx(front) {
    for (const p of fx) {
      if ((p.kind === 'splat') === front) continue;
      const alpha = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.globalAlpha = p.kind === 'splat' ? alpha * 0.7 : alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'bubble':
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha *= 0.35; ctx.fill();
          break;
        case 'drop':
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.7, p.size * 1.3, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'splat':
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 1.8, p.size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
          break;
        case 'flame': {
          const s = p.size * (0.4 + p.life * 0.6);
          ctx.fillStyle = p.life > 0.55 ? '#ffd27a' : p.color;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 1.8); ctx.quadraticCurveTo(p.x + s, p.y, p.x, p.y + s * 0.6); ctx.quadraticCurveTo(p.x - s, p.y, p.x, p.y - s * 1.8); ctx.fill();
          break;
        }
        case 'cross':
          ctx.fillRect(p.x - p.size, p.y - p.size * 0.3, p.size * 2, p.size * 0.6);
          ctx.fillRect(p.x - p.size * 0.3, p.y - p.size, p.size * 0.6, p.size * 2);
          break;
        case 'flake':
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
          break;
        case 'shard':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.life * 4);
          ctx.beginPath(); ctx.moveTo(0, -p.size * 1.6); ctx.lineTo(p.size * 0.6, 0); ctx.lineTo(0, p.size * 1.6); ctx.lineTo(-p.size * 0.6, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------------ the stage
  function drawFloor(dt) {
    const { floorTop } = stage();
    // Back wall with the crowd along its top edge.
    const wall = ctx.createLinearGradient(0, 0, 0, floorTop);
    wall.addColorStop(0, '#100e13');
    wall.addColorStop(1, '#241d23');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, floorTop);
    ctx.fillStyle = '#1a161c';
    const crowdY = floorTop * 0.42;
    for (let i = 0; i < 46; i++) {
      const x = (i / 45) * w, hh = floorTop * (0.08 + ((i * 37) % 11) / 90);
      ctx.beginPath(); ctx.arc(x, crowdY - hh, Math.max(5, w / 90), 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - w / 110, crowdY - hh, w / 55, hh + 4);
    }
    ctx.fillStyle = '#2b2328';
    ctx.fillRect(0, crowdY, w, 5);
    // Stone blocks in the wall.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const rowH = (floorTop - crowdY) / 4;
    for (let r = 0; r < 4; r++) {
      const y = crowdY + 5 + r * rowH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      const bw = w / 12;
      for (let x = (r % 2) * bw / 2; x < w; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rowH); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(214,162,78,0.35)';
    ctx.fillRect(0, floorTop - 2, w, 2);

    // Floor: a trapezoid that narrows toward the wall.
    const inset = w * 0.16;
    ctx.fillStyle = '#120f14';
    ctx.fillRect(0, floorTop, w, h - floorTop);
    const fl = ctx.createLinearGradient(0, floorTop, 0, h);
    fl.addColorStop(0, '#3b3029');
    fl.addColorStop(1, '#5a4636');
    ctx.fillStyle = fl;
    ctx.beginPath(); ctx.moveTo(inset, floorTop); ctx.lineTo(w - inset, floorTop); ctx.lineTo(w + w * 0.04, h); ctx.lineTo(-w * 0.04, h); ctx.closePath(); ctx.fill();
    // Seams: lines toward the vanishing point, and rows that widen toward you.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(14,12,17,0.35)';
    for (let c = 0; c <= 10; c++) {
      const t = c / 10;
      ctx.beginPath(); ctx.moveTo(inset + (w - 2 * inset) * t, floorTop); ctx.lineTo(-w * 0.04 + w * 1.08 * t, h); ctx.stroke();
    }
    for (let r = 1; r < 6; r++) {
      const y = floorTop + (h - floorTop) * (r / 6) ** 1.4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Torchlight pooling under the fighters.
    const g = ctx.createRadialGradient(w / 2, stage().feet, 10, w / 2, stage().feet, w * 0.5);
    g.addColorStop(0, 'rgba(255,190,120,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, floorTop, w, h - floorTop);
    ctx.restore();
    ctx.strokeStyle = 'rgba(214,162,78,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-w * 0.04, h); ctx.lineTo(inset, floorTop); ctx.lineTo(w - inset, floorTop); ctx.lineTo(w + w * 0.04, h); ctx.stroke();

    if (!reduceMotion) {
      ctx.fillStyle = 'rgba(240,122,58,0.35)';
      for (const e of embers) {
        e.y -= e.v * dt;
        if (e.y < 0) { e.y = 1; e.x = Math.random(); }
        ctx.beginPath();
        ctx.arc(e.x * w, e.y * h, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function bar(x, y, ww, hh, frac, color, back = '#0e0c11') {
    ctx.fillStyle = back;
    roundRect(x, y, ww, hh, hh / 2); ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      roundRect(x, y, Math.max(hh, ww * Math.min(1, frac)), hh, hh / 2); ctx.fill();
    }
  }
  // Dashes across an HP bar, one per `step` HP, with a heavier one every 1000,
  // so you can read how big a health pool is at a glance.
  function hpTicks(x, y, ww, hh, maxHp) {
    const step = [100, 200, 250, 500, 1000].find((s) => maxHp / s <= 24) || 2000;
    ctx.fillStyle = 'rgba(14,12,17,0.85)';
    for (let v = step; v < maxHp; v += step) {
      const tx = Math.round(x + (ww * v) / maxHp);
      const big = v % 1000 === 0;
      ctx.fillRect(tx - (big ? 1 : 0.5), y, big ? 2 : 1, big ? hh : hh * 0.6);
    }
  }

  // PixelLab characters stand on a canvas ~40% larger than the figure.
  function spriteBox(y, r) {
    return { size: r * 3.4, feet: y + r * 1.05 };
  }

  function spriteFrame(set, a) {
    const frames = set[a.clip] || set.idle || set.base;
    const n = frames.length;
    // Idle loops from its first frame each time it comes back, so it picks up
    // from the ready pose the other clips start and end on.
    const i = a.clip === 'idle' ? Math.floor(a.clipT * 8) % n
      : Math.min(n - 1, Math.floor((a.clipT / (CLIP[a.clip] || 0.4)) * n));
    return frames[i]?.complete && frames[i].naturalWidth ? frames[i] : set.base[0];
  }

  // tint: [color, alpha] laid over the figure; alpha: overall opacity.
  function drawSprite(u, set, a, x, y, r, { tint = null, alpha = 1 } = {}) {
    const img = spriteFrame(set, a);
    let src = img;
    if (tint) src = tinted(img, tint[0], tint[1]);
    // Clips can come on larger canvases than the base image (a wide swing
    // needs room), with the figure centred at the same pixel scale. So every
    // frame is drawn at the base image's scale around the same centre point.
    const { size, feet } = spriteBox(y, r);
    const base = set.base[0];
    const scale = size / base.naturalWidth;
    const cy = feet - base.naturalHeight * 0.48 * scale;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha * (u.dead && a.clip === 'death' && a.clipT > CLIP.death ? 0.55 : 1);
    ctx.translate(x, 0);
    if ((flip ? 1 - u.side : u.side) === 1) ctx.scale(-1, 1);
    ctx.drawImage(src, -dw / 2, cy - dh / 2, dw, dh);
    // The old clip's frame fades out on top while the new clip comes in.
    if (a.from) {
      const old = spriteFrame(set, { clip: a.from.clip, clipT: Math.min(a.from.clipT, CLIP[a.from.clip] || Infinity) });
      const ow = old.naturalWidth * scale, oh = old.naturalHeight * scale;
      ctx.globalAlpha *= 1 - a.clipT / BLEND;
      ctx.drawImage(tint ? tinted(old, tint[0], tint[1]) : old, -ow / 2, cy - oh / 2, ow, oh);
    }
    ctx.restore();
  }

  function drawMedallion(u, a, x, y, r, { tint = null, alpha = 1 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const mg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    mg.addColorStop(0, '#3b3442');
    mg.addColorStop(1, '#1b1820');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = TAGS[u.char.resources[0]].color;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (u.char.resources[1]) {
      ctx.strokeStyle = TAGS[u.char.resources[1]].color;
      ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (tint) {
      ctx.globalAlpha = alpha * tint[1] * 0.8;
      ctx.fillStyle = tint[0];
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = alpha;
    }
    if (u.dead) {
      ctx.fillStyle = 'rgba(10,8,12,0.6)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#e9dcc0';
    ctx.font = `${Math.round(r * 0.95)}px "Grenze Gotisch", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.char.name.split(' ').map((s) => s[0]).join(''), x, y + 2);
    ctx.restore();
  }

  // A block of ice around a frozen fighter.
  function drawIce(x, y, r, t) {
    const top = y - r * 1.75, bottom = y + r * 1.1, half = r * 0.95;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.fillStyle = 'rgba(150,215,250,0.28)';
    ctx.strokeStyle = 'rgba(220,245,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - half, bottom); ctx.lineTo(x - half * 1.08, y - r * 0.4); ctx.lineTo(x - half * 0.7, top + r * 0.2);
    ctx.lineTo(x - half * 0.1, top); ctx.lineTo(x + half * 0.75, top + r * 0.15); ctx.lineTo(x + half * 1.05, y - r * 0.5);
    ctx.lineTo(x + half, bottom); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - half * 0.55, top + r * 0.45); ctx.lineTo(x - half * 0.75, y);
    ctx.moveTo(x - half * 0.1, top + r * 0.1); ctx.lineTo(x + half * 0.2, y - r * 0.6);
    ctx.moveTo(x + half * 0.6, top + r * 0.5); ctx.lineTo(x + half * 0.7, y + r * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawUnit(u) {
    const p = pos(u.side);
    const r = radius(u.side);
    const a = anim[u.side];
    const dir = toward(u.side);
    if (mystery && u.side === 1) { drawMystery(p, r); return; }
    // Dodging hops back, away from the attacker.
    const hop = a.dodge > 0 ? Math.sin(Math.min(1, a.dodge) * Math.PI) : 0;
    const x = p.x + dir.x * (a.lunge * r * 0.5 - hop * r * 0.7);
    const y = p.y - hop * r * 0.15;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x, p.y + r * 1.05, r * 0.9, r * 0.24, 0, 0, Math.PI * 2); ctx.fill();
    // frost creeping over the floor under a chilled fighter
    if (u.frost >= 1 || u.frozen > 0) {
      ctx.fillStyle = `rgba(160,220,250,${u.frozen > 0 ? 0.35 : Math.min(0.25, u.frost / 60)})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 1.05, r * 1.2, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }

    // cast glow
    if (a.cast > 0) {
      ctx.strokeStyle = `rgba(181,156,240,${a.cast * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.25 + (1 - a.cast) * 0.5), 0, Math.PI * 2); ctx.stroke();
    }
    // grit: a bronze ring while incoming damage is cut
    if (u.grit > 0) {
      ctx.strokeStyle = `rgba(214,162,78,${0.5 + 0.3 * Math.sin(clock * 12)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r + 20, 0, Math.PI * 2); ctx.stroke();
    }
    // shield ring
    if (u.shield > 0) {
      ctx.strokeStyle = 'rgba(233,238,245,0.85)';
      ctx.lineWidth = 2 + Math.min(8, (u.shield / u.maxHp) * 16);
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
    }
    // focus arc
    if (u.focusGain > 0 || u.focus > 0) {
      ctx.strokeStyle = TAGS.evasion.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.focus / 1)); ctx.stroke();
    }

    const sprites = spriteSet(u.char.id);
    const figure = (fx0, fy0, opts) => (sprites ? drawSprite(u, sprites, a, fx0, fy0, r, opts) : drawMedallion(u, a, fx0, fy0, r, opts));
    // Evasion: afterimages left where the fighter was standing.
    if (a.dodge > 0 && !u.dead) {
      for (const k of [1, -1]) {
        figure(p.x - dir.x * hop * r * (k > 0 ? 0.25 : 0.5), p.y, { tint: [TAGS.evasion.color, 0.75], alpha: a.dodge * (k > 0 ? 0.5 : 0.3) });
      }
    }
    let tint = null;
    if (u.frozen > 0) tint = ['#6cc4f0', 0.5];
    else if (a.flash > 0) tint = ['#ff4a5a', a.flash * 0.55];
    else if (u.poison >= 1) tint = [TAGS.poison.color, Math.min(0.35, 0.1 + u.poison / 120) * (0.75 + 0.25 * Math.sin(clock * 4))];
    else if (u.frost >= 1) tint = ['#9fdcff', Math.min(0.3, u.frost / 50)];
    figure(x, y, { tint });
    if (u.frozen > 0 && !u.dead) drawIce(x, y, r, u.frozen);

    // bars
    // With a sprite, the bars sit above the figure's head instead of the medallion.
    const box = spriteBox(p.y, r);
    const bw = Math.min(220, Math.max(110, baseRadius() * 2.4)), bx = p.x - bw / 2, by = sprites ? box.feet - box.size * 0.86 - 18 : p.y - r - 34;
    const bh = 10;
    bar(bx, by, bw, bh, u.hp / u.maxHp, (flip ? 1 - u.side : u.side) === 0 ? '#7fca6e' : '#d9505e');
    if (u.shield > 0) {
      ctx.fillStyle = 'rgba(233,238,245,0.9)';
      const sx = bx + bw * Math.min(1, u.hp / u.maxHp);
      roundRect(Math.min(sx, bx + bw - 3), by, Math.max(3, Math.min(bw * (u.shield / u.maxHp), bx + bw - sx)), bh, 3);
      ctx.fill();
    }
    hpTicks(bx, by, bw, bh, u.maxHp);
    if (u.poison >= 1 || u.bleed >= 1) {
      // A thin line under the HP bar in the color of the damage over time.
      ctx.fillStyle = u.bleed > u.poison ? TAGS.bleed.color : TAGS.poison.color;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 6);
      ctx.fillRect(bx + 2, by + bh, bw - 4, 1.5);
      ctx.globalAlpha = 1;
    }
    bar(bx, by + bh + 3, bw, 4, u.mana / (u.manaMax * u.m.castCost), '#5b8cff');
    // Player name over gladiator name, with HP on the right.
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.font = '700 13px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#e9dcc0';
    const who = names[u.side] || u.char.name;
    ctx.fillText(who, bx, by - (names[u.side] ? 18 : 5));
    if (names[u.side]) {
      ctx.font = '600 11px "Barlow Semi Condensed", system-ui, sans-serif';
      ctx.fillStyle = '#a99c87';
      ctx.fillText(u.char.name, bx, by - 5);
    }
    ctx.textAlign = 'right';
    ctx.font = '700 12px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#e9dcc0';
    ctx.fillText(`${Math.ceil(u.hp)}`, bx + bw, by - 5);

    // stacks
    const chips = [];
    for (const k of SELF_STACKS) if (u[k] >= 1) chips.push({ k, v: u[k], mine: true });
    if (u.focusGain > 0 || u.focus > 0) chips.push({ k: 'evasion', v: Math.round(u.focus * 100) + '%', mine: true });
    for (const k of ON_ME) if (u[k] >= 1) chips.push({ k, v: u[k], mine: false });
    const cw = 46, ch = 20, gap = 4;
    const perRow = Math.max(2, Math.floor((w * 0.4) / (cw + gap)));
    ctx.textBaseline = 'middle';
    chips.forEach((c, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      const n = Math.min(perRow, chips.length - row * perRow);
      const cx = p.x - (n * (cw + gap) - gap) / 2 + col * (cw + gap);
      const cy = p.y + r * 1.05 + 14 + row * (ch + gap);
      const color = TAGS[c.k].color;
      ctx.fillStyle = '#15131acc';
      roundRect(cx, cy, cw, ch, 4); ctx.fill();
      ctx.fillStyle = color + '22';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(c.mine ? [] : [3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '700 11px "Barlow Semi Condensed", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(TAGS[c.k].glyph, cx + 5, cy + ch / 2 + 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e9dcc0';
      ctx.fillText(typeof c.v === 'number' ? Math.floor(c.v) : c.v, cx + cw - 5, cy + ch / 2 + 1);
    });
  }

  // The fight clock: elapsed time, with a bar that fills toward overtime
  // (30s) and then the arena burn (60s).
  function drawClock(t) {
    const o = overtime(t);
    const top = w < 640 ? 36 : 0; // below the speed buttons on narrow screens
    const bw = Math.min(360, w * 0.5), bx = w / 2 - bw / 2, by = top + 32, bh = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = t > SUDDEN_DEATH_AT ? '#d9505e' : '#e9dcc0';
    const label = t > BURN_AT
      ? `${t.toFixed(1)}s · ARENA BURN ${(o.burn * 100).toFixed(1)}% max HP/s · +${Math.round((o.damage - 1) * 100)}% damage`
      : t > SUDDEN_DEATH_AT
        ? `${t.toFixed(1)}s · OVERTIME +${Math.round((o.damage - 1) * 100)}% damage · ${Math.round(o.healing * 100)}% healing and shields`
        : `${t.toFixed(1)}s`;
    ctx.fillText(label, w / 2, top + 18);
    // Track: the overtime stretch is tinted so you can see it coming.
    const ot = bx + bw * (SUDDEN_DEATH_AT / BURN_AT);
    ctx.fillStyle = '#0e0c11';
    roundRect(bx, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = 'rgba(217,80,94,0.22)';
    ctx.fillRect(ot, by, bx + bw - ot, bh);
    const frac = Math.min(1, t / BURN_AT);
    const fillW = bw * frac;
    if (fillW > 0) {
      ctx.fillStyle = '#a99c87';
      ctx.fillRect(bx, by, Math.min(fillW, ot - bx), bh);
      if (fillW > ot - bx) { ctx.fillStyle = '#d9505e'; ctx.fillRect(ot, by, fillW - (ot - bx), bh); }
    }
    if (t > BURN_AT) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 8);
      ctx.fillStyle = '#f0a43a';
      roundRect(bx, by, bw, bh, 3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(ot - 1, by - 3, 2, bh + 6);
    ctx.font = '700 10px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = t > SUDDEN_DEATH_AT ? '#d9505e' : '#a99c87';
    ctx.fillText(`OVERTIME ${SUDDEN_DEATH_AT}s`, ot, by + bh + 10);
    ctx.textAlign = 'right';
    ctx.fillStyle = t > BURN_AT ? '#f0a43a' : '#a99c87';
    ctx.fillText(`BURN ${BURN_AT}s`, bx + bw, by + bh + 10);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a99c87';
    ctx.fillText('0s', bx, by + bh + 10);
  }

  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFloor(dt);
    drawBoard(dt);
    if (!units) return;
    drawFx(true);
    for (const u of units) drawUnit(u);
    drawFx(false);
    drawStrikes(dt);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (fight) drawClock(fight.t);
    const mid = { x: w / 2, y: pos(0).y };
    ctx.font = `${Math.round(baseRadius() * 0.6)}px "Grenze Gotisch", Georgia, serif`;
    ctx.fillStyle = 'rgba(214,162,78,0.55)';
    ctx.fillText('vs', mid.x, mid.y);
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.font = `700 ${f.size}px "Barlow Semi Condensed", system-ui, sans-serif`;
      ctx.fillStyle = '#0e0c11';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    if (fight) fight.onEvent = null;
  }

  return { setPreview, play, skip, setSpeed, setStandings, destroy, get playing() { return !!(fight && onDone); } };
}
