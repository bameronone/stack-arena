// Bundles the ES modules into one self-contained HTML page (dist/index.html)
// with no dependencies, plus dist/play.html, a full document for local use.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const order = [
  'src/rng.js', 'src/data/tags.js', 'src/data/cards.js', 'src/data/characters.js',
  'src/engine/combat.js', 'src/engine/shop.js', 'src/engine/match.js', 'src/ai/bot.js',
  'src/ui/arena.js', 'src/ui/app.js',
];
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];[ \t]*\n/gm, '')
  .replace(/^export (const|function|class|let) /gm, '$1 ');
const js = '(() => {\n"use strict";\n' + order.map((f) => `// ---- ${f}\n${strip(readFileSync(join(root, f), 'utf8'))}`).join('\n') + '\n})();';
if (/^\s*(import|export)\s/m.test(js)) throw new Error('unstripped import/export left in bundle');
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8');
const page = readFileSync(join(root, 'src/ui/index.template.html'), 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), page);
writeFileSync(join(root, 'dist/play.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n${page.replace('<div id="app">', '</head><body><div id="app">')}\n</body></html>\n`);
console.log(`dist/index.html ${(page.length / 1024).toFixed(1)} KB`);
