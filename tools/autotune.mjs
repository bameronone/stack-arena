// Nudges each gladiator's base HP toward a 50% win rate in bot-vs-bot play.
// Edits src/data/characters.js in place; review the diff afterwards.
//   node tools/autotune.mjs [iterations=4] [matches=1500]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ITER = Number(process.argv[2] || 4), N = process.argv[3] || '1500';
const file = new URL('../src/data/characters.js', import.meta.url);
for (let i = 0; i < ITER; i++) {
  const rates = JSON.parse(execFileSync('node', [new URL('./sim.mjs', import.meta.url).pathname, N, '--json'], { encoding: 'utf8' }));
  let src = readFileSync(file, 'utf8');
  const changes = [];
  for (const [id, wr] of Object.entries(rates)) {
    const re = new RegExp(`(id: '${id}',[\\s\\S]*?stats: \\{ hp: )(\\d+)`);
    src = src.replace(re, (_, pre, hp) => {
      const step = Math.max(-0.08, Math.min(0.08, (0.5 - wr) * 0.5));
      const next = Math.round((Number(hp) * (1 + step)) / 5) * 5;
      changes.push(`${id} ${(wr * 100).toFixed(0)}% ${hp}->${next}`);
      return pre + next;
    });
  }
  writeFileSync(file, src);
  console.log(`pass ${i + 1}: ${changes.join(', ')}`);
}
