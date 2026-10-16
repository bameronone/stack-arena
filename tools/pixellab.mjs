// Generates pixel-art sprites for every gladiator with the PixelLab API.
//
//   PIXELLAB_API_KEY=... node tools/pixellab.mjs [gladiator ids...] [--force]
//
// The key is read from PIXELLAB_API_KEY or from a git-ignored .pixellab-key
// file; it is never written into the repository. For each gladiator this makes
// one side-view base image, then 4-frame animations from it. Files land in
// assets/sprites/<id>/ and the build embeds them in the game. Existing files
// are skipped, so a failed run can simply be re-run.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.PIXELLAB_BASE_URL || 'https://api.pixellab.ai/v1';
const KEY = process.env.PIXELLAB_API_KEY || (existsSync(join(root, '.pixellab-key')) ? readFileSync(join(root, '.pixellab-key'), 'utf8').trim() : '');
if (!KEY) { console.error('Set PIXELLAB_API_KEY or create .pixellab-key'); process.exit(1); }

const SIZE = { width: 64, height: 64 };
const STYLE = 'pixel art gladiator, full body, standing on the ground, side view, facing right, clean readable silhouette';
export const LOOKS = {
  cinder: 'fiery gladiator with a flaming sword, ember-red leather armor, wild orange hair',
  glacia: 'ice sorceress in pale blue robes with a frost crown and a crystal staff',
  viper: 'hooded assassin with two curved daggers, green and black scale cloak',
  wisp: 'nimble dancer with twin war fans, flowing teal and orange silk',
  martyr: 'heavily armored knight with a tower shield and a battered iron helm',
  stormseer: 'storm mage with a crackling lightning staff, dark blue robes, glowing eyes',
  grove: 'druid warrior covered in bark and leaves, wooden staff, mossy beard',
  ashen: 'witch in ash-grey robes holding a smoking green potion and an ember staff',
  reaver: 'savage warrior with a blood-red axe, fur pelts and war paint',
  sage: 'rune-covered mage in white robes with a glowing blue shield of light',
  duelist: 'brass-armored duelist with a rapier and buckler, plumed helmet',
  nightshade: 'shadowy rogue in a smoke-grey cloak with a purple mask and poison needles',
};
export const ANIMS = {
  idle: 'breathing idle, standing ready',
  attack: 'attacking with a weapon swing',
  cast: 'casting a spell with raised arms',
  hurt: 'recoiling from a hit',
  death: 'falling down defeated',
};

let spent = 0;
async function call(endpoint, body) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      spent += data.usage?.usd || 0;
      return data;
    }
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      console.log(`  ${endpoint}: ${res.status}, retrying...`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    throw new Error(`${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

const png = (img) => Buffer.from(img.base64, 'base64');
const asRef = (buf) => ({ type: 'base64', base64: buf.toString('base64'), format: 'png' });

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));
  const todo = ids.length ? ids : Object.keys(LOOKS);
  for (const [i, id] of todo.entries()) {
    if (!LOOKS[id]) { console.error(`Unknown gladiator: ${id}`); continue; }
    const dir = join(root, 'assets/sprites', id);
    mkdirSync(dir, { recursive: true });
    const seed = 1000 + i * 97;
    const basePath = join(dir, 'base.png');
    if (force || !existsSync(basePath)) {
      console.log(`${id}: base image`);
      const r = await call('generate-image-pixflux', {
        description: `${LOOKS[id]}, ${STYLE}`,
        image_size: SIZE,
        negative_description: 'background, text, frame, multiple characters, cropped',
        text_guidance_scale: 8,
        outline: 'single color black outline',
        shading: 'medium shading',
        detail: 'medium detail',
        view: 'side',
        direction: 'east',
        no_background: true,
        seed,
      });
      writeFileSync(basePath, png(r.image));
    }
    const base = readFileSync(basePath);
    for (const [anim, action] of Object.entries(ANIMS)) {
      if (!force && existsSync(join(dir, `${anim}_3.png`))) continue;
      console.log(`${id}: ${anim}`);
      const r = await call('animate-with-text', {
        image_size: SIZE,
        description: LOOKS[id],
        action,
        view: 'side',
        direction: 'east',
        reference_image: asRef(base),
        n_frames: 4,
        text_guidance_scale: 7.5,
        image_guidance_scale: 1.5,
        seed,
      });
      r.images.forEach((img, f) => writeFileSync(join(dir, `${anim}_${f}.png`), png(img)));
    }
  }
  console.log(`Done. Spent about $${spent.toFixed(3)}.`);
}

main().catch((e) => { console.error(e.message); console.log(`Spent about $${spent.toFixed(3)} before stopping.`); process.exit(1); });
