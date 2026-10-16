// Makes gladiator sprites through PixelLab's MCP server, which uses your
// subscription's generations (the older REST API only spends prepaid credits).
//
//   node tools/pixellab-mcp.mjs create  <gladiator>   character from LOOKS (1 generation)
//   node tools/pixellab-mcp.mjs animate <gladiator>   queue idle/attack/cast/hurt/death, east only (~6 generations)
//   node tools/pixellab-mcp.mjs fetch   <gladiator>   download finished frames into assets/sprites/<gladiator>/
//   node tools/pixellab-mcp.mjs balance
//
// The key comes from PIXELLAB_API_KEY or the git-ignored .pixellab-key file.
// The PixelLab character id is saved in assets/sprites/<gladiator>/pixellab.json.
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LOOKS } from './pixellab-looks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.PIXELLAB_API_KEY || (existsSync(join(root, '.pixellab-key')) ? readFileSync(join(root, '.pixellab-key'), 'utf8').trim() : '');
if (!KEY) { console.error('Set PIXELLAB_API_KEY or create .pixellab-key'); process.exit(1); }

// Clip name -> how PixelLab makes it.
const CLIPS = {
  idle: { template_animation_id: 'fight-stance-idle-8-frames' },
  cast: { template_animation_id: 'fireball' },
  hurt: { template_animation_id: 'taking-punch' },
  death: { template_animation_id: 'falling-back-death' },
  attack: { action: 'attack' },
};

async function tool(name, args = {}) {
  const res = await fetch('https://api.pixellab.ai/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const body = await res.text();
  const line = body.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : body);
  if (msg.error) throw new Error(`${name}: ${msg.error.message}`);
  const text = msg.result.content.map((c) => c.text || '').join('\n');
  if (msg.result.isError) throw new Error(`${name}: ${text}`);
  return text;
}

const metaPath = (id) => join(root, 'assets/sprites', id, 'pixellab.json');
const readMeta = (id) => JSON.parse(readFileSync(metaPath(id), 'utf8'));

async function create(id) {
  const look = LOOKS[id];
  if (!look) throw new Error(`Unknown gladiator ${id}`);
  const text = await tool('create_character', {
    description: look.description, name: id, view: 'side', n_directions: 4, size: 64,
    proportions: JSON.stringify({ type: 'preset', name: 'heroic' }),
    outline: 'single color black outline', shading: 'medium shading', detail: 'medium detail',
  });
  const characterId = text.match(/^id: (\S+)/m)?.[1];
  if (!characterId) throw new Error(text);
  mkdirSync(dirname(metaPath(id)), { recursive: true });
  writeFileSync(metaPath(id), JSON.stringify({ characterId }, null, 2) + '\n');
  console.log(text);
}

async function animate(id) {
  const { characterId } = readMeta(id);
  for (const [clip, how] of Object.entries(CLIPS)) {
    const args = { character_id: characterId, animation_name: clip, directions: ['east'] };
    if (how.template_animation_id) args.template_animation_id = how.template_animation_id;
    else Object.assign(args, { mode: 'v3', frame_count: 6, action_description: LOOKS[id].attack });
    console.log(`${clip}: ${(await tool('animate_character', args)).split('\n').find((l) => l.startsWith('cost')) || 'queued'}`);
  }
}

async function fetchFrames(id) {
  const { characterId } = readMeta(id);
  const text = await tool('get_character', { character_id: characterId, include_preview: false });
  const dir = join(root, 'assets/sprites', id);
  const save = async (url, file) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download ${file}: ${res.status}`);
    writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()));
  };
  const east = text.match(/^\s+east: (https:\S+rotations\/east\.png\S*)/m)?.[1];
  if (!east) throw new Error(`No east rotation yet:\n${text.slice(0, 400)}`);
  await save(east, 'base.png');
  let clips = 0;
  for (const m of text.matchAll(/^\s+(\w+) — .*\n\s+east: (https:\S+)\{i\}\.png(\S*) \(i=0\.\.(\d+)\)/gm)) {
    const [, clip, prefix, query, last] = m;
    if (!CLIPS[clip]) continue;
    for (let i = 0; i <= Number(last); i++) await save(`${prefix}${i}.png${query}`, `${clip}_${i}.png`);
    console.log(`${clip}: ${Number(last) + 1} frames`);
    clips++;
  }
  console.log(`Saved base + ${clips} clips to assets/sprites/${id}/`);
}

const [cmd, id] = process.argv.slice(2);
const run = { create, animate, fetch: fetchFrames, balance: async () => console.log(await tool('get_balance')) }[cmd];
if (!run) { console.error('Usage: node tools/pixellab-mcp.mjs create|animate|fetch <gladiator> | balance'); process.exit(1); }
run(id).catch((e) => { console.error(e.message, e.cause?.message || ''); process.exit(1); });
