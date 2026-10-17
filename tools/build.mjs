// Bundles the ES modules into one self-contained page with no dependencies:
//   dist/index.html     full HTML document (GitHub Pages, or open it locally)
//   dist/artifact.html  body-only version for publishing as a Claude artifact
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const order = [
  'src/rng.js', 'src/data/tags.js', 'src/data/cards.js', 'src/data/characters.js',
  'src/engine/combat.js', 'src/engine/shop.js', 'src/engine/match.js', 'src/ai/cardValues.js', 'src/ai/bot.js',
  'src/game/host.js', 'src/net/transport.js', 'src/game/session.js',
  'src/ui/arena.js', 'src/ui/app.js',
];
// Every relative import must be bundled, and before the file that imports it.
order.forEach((f, i) => {
  for (const [, rel] of readFileSync(join(root, f), 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const dep = join(dirname(f), rel);
    const at = order.indexOf(dep);
    if (at < 0 || at > i) throw new Error(`${f} imports ${dep}, which is ${at < 0 ? 'missing from' : 'after it in'} the bundle order`);
  }
});
// All modules share one scope in the bundle, so top-level names must be unique.
const seen = new Map();
for (const f of order) {
  for (const [, name] of readFileSync(join(root, f), 'utf8').matchAll(/^(?:export )?(?:async )?(?:function\*?|const|let|class) ([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(name)) throw new Error(`top-level name "${name}" is defined in both ${seen.get(name)} and ${f}`);
    seen.set(name, f);
  }
}
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];[ \t]*\n/gm, '')
  .replace(/^export (async function|const|function|class|let) /gm, '$1 ');
// Embed sprites from assets/sprites/<gladiator>/<clip>_<frame>.png as data URIs.
const spriteDir = process.env.SPRITES_DIR || join(root, 'assets/sprites');
const sprites = {};
if (existsSync(spriteDir)) {
  for (const id of readdirSync(spriteDir)) {
    const dir = join(spriteDir, id);
    if (!existsSync(join(dir, 'base.png'))) continue;
    const uri = (f) => `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}`;
    sprites[id] = { base: uri('base.png') };
    for (const clip of ['idle', 'attack', 'attack2', 'cast', 'hurt', 'death']) {
      const frames = readdirSync(dir).filter((f) => new RegExp(`^${clip}_\\d+\\.png$`).test(f))
        .sort((a, b) => parseInt(a.split('_')[1], 10) - parseInt(b.split('_')[1], 10));
      if (frames.length) sprites[id][clip] = frames.map(uri);
    }
  }
}
const js = '(() => {\n"use strict";\n' + `const SPRITES = ${JSON.stringify(sprites)};\n` + order.map((f) => `// ---- ${f}\n${strip(readFileSync(join(root, f), 'utf8'))}`).join('\n') + '\n})();';
if (/^\s*(import|export)\s/m.test(js)) throw new Error('unstripped import/export left in bundle');
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8');
const icon = `data:image/svg+xml,${encodeURIComponent(readFileSync(join(root, 'assets/icon.svg'), 'utf8').trim())}`;
const page = readFileSync(join(root, 'src/ui/index.template.html'), 'utf8')
  .replace('__ICON__', () => icon)
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/artifact.html'), page);
writeFileSync(join(root, 'dist/index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n${page.replace('<div id="app">', '</head><body><div id="app">')}\n</body></html>\n`);
console.log(`dist/index.html, dist/artifact.html ${(page.length / 1024).toFixed(1)} KB, sprites for ${Object.keys(sprites).length} gladiators`);
