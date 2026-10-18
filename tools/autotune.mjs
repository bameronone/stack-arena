// Nudges each gladiator toward a 50% win rate in bot-vs-bot play. Base HP
// follows body type (HP_BANDS in characters.js), so it only moves inside its
// band; the rest of the gap goes to ability power (stats.ap), which scales
// everything the gladiator's ability does.
// Edits src/data/characters.js in place; review the diff afterwards.
//   node tools/autotune.mjs [iterations=4] [matches=1500]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { HP_BANDS } from '../src/data/characters.js';

const ITER = Number(process.argv[2] || 4), N = process.argv[3] || '1500';
const AP = [0.5, 1.5];
const file = new URL('../src/data/characters.js', import.meta.url);
const clamp = (x, [lo, hi]) => Math.max(lo, Math.min(hi, x));
for (let i = 0; i < ITER; i++) {
  const rates = JSON.parse(execFileSync('node', [new URL('./sim.mjs', import.meta.url).pathname, N, '--json'], { encoding: 'utf8' }));
  let src = readFileSync(file, 'utf8');
  const changes = [];
  for (const [id, wr] of Object.entries(rates)) {
    const re = new RegExp(`(id: '${id}',[\\s\\S]*?body: '(\\w+)',\\s*stats: \\{ )([^}]*?)( \\})`);
    src = src.replace(re, (_, pre, body, inner, post) => {
      const stats = Object.fromEntries(inner.split(',').map((kv) => kv.split(':').map((x) => x.trim())));
      const step = clamp((0.5 - wr) * 0.5, [-0.08, 0.08]);
      const hp = Number(stats.hp), ap = Number(stats.ap ?? 1);
      const nextHp = clamp(Math.round((hp * (1 + step)) / 10) * 10, HP_BANDS[body]);
      const nextAp = clamp(Math.round(ap * (1 + step) * 100) / 100, AP);
      stats.hp = nextHp;
      if (nextAp === 1) delete stats.ap; else stats.ap = nextAp;
      changes.push(`${id} ${(wr * 100).toFixed(0)}% hp ${hp}->${nextHp} ap ${ap}->${nextAp}`);
      return pre + Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(', ') + post;
    });
  }
  writeFileSync(file, src);
  console.log(`pass ${i + 1}: ${changes.join(', ')}`);
}
