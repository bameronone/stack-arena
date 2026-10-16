import { buildUnit, DT, SUDDEN_DEATH_AT } from '../engine/combat.js';
import { TAGS } from '../data/tags.js';

// Canvas renderer for the pit. It either shows a static preview of both
// gladiators or plays a Fight forward in real time at the chosen speed.

const SELF_STACKS = ['fire', 'shield', 'regen', 'arcane', 'armor'];
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
  const anim = [{ lunge: 0, flash: 0, cast: 0 }, { lunge: 0, flash: 0, cast: 0 }];
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

  function pos(side) {
    return { x: w * (side === 0 ? 0.28 : 0.72), y: h * 0.5 };
  }
  function radius() {
    return Math.max(26, Math.min(w * 0.09, h * 0.16, 62));
  }

  function float(side, text, color, size = 16, dy = 0) {
    const p = pos(side);
    floaters.push({ x: p.x + (Math.random() - 0.5) * radius(), y: p.y - radius() * 0.6 + dy, text, color, size, life: 1.1 });
    if (floaters.length > 60) floaters.shift();
  }

  function onEvent(ev) {
    const a = anim[ev.side];
    switch (ev.type) {
      case 'attack': a.lunge = 1; break;
      case 'dmg':
        anim[ev.side].flash = 1;
        float(ev.side, Math.round(ev.amt) + (ev.crit ? '!' : ''), ev.crit ? '#f2d16b' : ev.kind === 'ability' ? '#b59cf0' : ev.kind === 'thorns' ? '#a8a39a' : '#e9dcc0', ev.crit ? 22 : ev.kind === 'ability' ? 19 : 15);
        break;
      case 'dodge': float(ev.side, 'DODGE', TAGS.evasion.color, 15, -10); break;
      case 'freeze': float(ev.side, 'FROZEN', TAGS.frost.color, 18, -18); break;
      case 'cast': a.cast = 1; float(ev.side, ev.name, TAGS.spell.color, 16, -32); break;
      case 'revive': float(ev.side, 'REVIVED', TAGS.fire.color, 20, -24); break;
      case 'resist': float(ev.side, 'RESISTED', '#a8a39a', 14, -18); break;
      case 'immune': float(ev.side, 'IMMUNE', '#e9eef5', 14, -18); break;
      case 'burst': float(ev.side, 'PANDEMIC', TAGS.poison.color, 18, -18); break;
    }
  }

  function setPreview(loadA, loadB) {
    fight = null;
    onDone = null;
    floaters = [];
    try {
      const a = buildUnit(loadA, 0), b = buildUnit(loadB, 1);
      a.enemy = b; b.enemy = a;
      units = [a, b];
    } catch { units = null; }
    start();
  }

  function play(f, done) {
    fight = f;
    fight.onEvent = onEvent;
    units = fight.units;
    onDone = done;
    acc = 0;
    floaters = [];
    dotSeen = [{ poison: 0, bleed: 0 }, { poison: 0, bleed: 0 }];
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
    for (const a of anim) {
      a.lunge = Math.max(0, a.lunge - dt * 6 * Math.max(1, speed / 2));
      a.flash = Math.max(0, a.flash - dt * 5);
      a.cast = Math.max(0, a.cast - dt * 2);
    }
    for (const f of floaters) { f.life -= dt * 0.9; f.y -= dt * 38; }
    floaters = floaters.filter((f) => f.life > 0);
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

  function roundRect(x, y, ww, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  function drawFloor(dt) {
    ctx.fillStyle = '#15131a';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, Math.max(w, h) * 0.6);
    g.addColorStop(0, '#3a2f26');
    g.addColorStop(0.55, '#231d22');
    g.addColorStop(1, '#15131a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.55, w * 0.47, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,162,78,0.18)';
    ctx.lineWidth = 1;
    for (const s of [1, 0.72]) {
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.55, w * 0.47 * s, h * 0.42 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  function drawUnit(u) {
    const r = radius();
    const p = pos(u.side);
    const a = anim[u.side];
    const dir = u.side === 0 ? 1 : -1;
    const x = p.x + dir * a.lunge * r * 0.5;
    const y = p.y;
    const ringColor = TAGS[u.char.resources[0]].color;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 1.05, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();

    // cast glow
    if (a.cast > 0) {
      ctx.strokeStyle = `rgba(181,156,240,${a.cast * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * (1.25 + (1 - a.cast) * 0.5), 0, Math.PI * 2); ctx.stroke();
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
    // medallion
    const mg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    mg.addColorStop(0, '#3b3442');
    mg.addColorStop(1, '#1b1820');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (u.char.resources[1]) {
      ctx.strokeStyle = TAGS[u.char.resources[1]].color;
      ctx.beginPath(); ctx.arc(x, y, r - 5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (a.flash > 0) {
      ctx.fillStyle = `rgba(217,80,94,${a.flash * 0.35})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (u.frozen > 0) {
      ctx.fillStyle = 'rgba(108,196,240,0.38)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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

    // bars
    const bw = Math.max(110, r * 2.6), bx = p.x - bw / 2, by = y - r - 34;
    bar(bx, by, bw, 9, u.hp / u.maxHp, u.side === 0 ? '#7fca6e' : '#d9505e');
    if (u.shield > 0) {
      ctx.fillStyle = 'rgba(233,238,245,0.9)';
      const sx = bx + bw * Math.min(1, u.hp / u.maxHp);
      roundRect(Math.min(sx, bx + bw - 3), by, Math.max(3, Math.min(bw * (u.shield / u.maxHp), bx + bw - sx)), 9, 3);
      ctx.fill();
    }
    bar(bx, by + 12, bw, 4, u.mana / (u.manaMax * u.m.castCost), '#5b8cff');
    ctx.font = '600 12px "Barlow Semi Condensed", system-ui, sans-serif';
    ctx.fillStyle = '#e9dcc0';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(u.hp)}`, bx, by - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a99c87';
    ctx.fillText(u.char.name, bx + bw, by - 8);

    // stacks
    const chips = [];
    for (const k of SELF_STACKS) if (u[k] >= 1) chips.push({ k, v: u[k], mine: true });
    if (u.focusGain > 0 || u.focus > 0) chips.push({ k: 'evasion', v: Math.round(u.focus * 100) + '%', mine: true });
    for (const k of ON_ME) if (u[k] >= 1) chips.push({ k, v: u[k], mine: false });
    const cw = 46, ch = 20, gap = 4;
    const perRow = Math.max(2, Math.floor((w * 0.42) / (cw + gap)));
    chips.forEach((c, i) => {
      const row = Math.floor(i / perRow), col = i % perRow;
      const n = Math.min(perRow, chips.length - row * perRow);
      const cx = p.x - (n * (cw + gap) - gap) / 2 + col * (cw + gap);
      const cy = y + r + 24 + row * (ch + gap);
      const color = TAGS[c.k].color;
      ctx.fillStyle = color + '22';
      roundRect(cx, cy, cw, ch, 4); ctx.fill();
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

  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFloor(dt);
    if (!units) return;
    for (const u of units) drawUnit(u);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (fight) {
      const t = fight.t;
      ctx.font = '600 14px "Barlow Semi Condensed", system-ui, sans-serif';
      ctx.fillStyle = t > SUDDEN_DEATH_AT ? '#d9505e' : '#a99c87';
      const label = t > SUDDEN_DEATH_AT ? `SUDDEN DEATH  +${Math.round((t - SUDDEN_DEATH_AT) * 8)}% damage` : `${t.toFixed(1)}s`;
      ctx.fillText(label, w / 2, 22);
    } else {
      ctx.font = '600 13px "Barlow Semi Condensed", system-ui, sans-serif';
      ctx.fillStyle = '#a99c87';
      ctx.fillText('Fight preview: starting stats', w / 2, 22);
    }
    ctx.font = `${Math.round(radius() * 0.6)}px "Grenze Gotisch", Georgia, serif`;
    ctx.fillStyle = 'rgba(214,162,78,0.55)';
    ctx.fillText('vs', w / 2, h * 0.5);
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

  return { setPreview, play, skip, setSpeed, destroy, get playing() { return !!(fight && onDone); } };
}
