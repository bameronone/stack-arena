# Making a gladiator's sprites

How Cinder was made, step by step, so other gladiators can get the same look.
Every other gladiator's prompts for these steps are in [gladiator-prompts.md](gladiator-prompts.md).
Everything goes through PixelLab's MCP endpoint (`https://api.pixellab.ai/mcp`,
JSON-RPC `tools/call`) with the subscription key as a Bearer token. Costs below
are subscription generations.

The game needs four clips per gladiator, all facing east (right):

| Clip | What it is | Required |
| --- | --- | --- |
| `idle` | loops forever between actions | yes |
| `attack` | one swing, ends back in the idle pose | yes |
| `attack2` | a second swing; the arena alternates `attack` and `attack2` | no |
| `death` | plays once and holds its last frame | yes |
| `dead` | loops at the idle rate after `death` ends, instead of holding its last frame, at full opacity | no |

`hurt`, `cast` and `dead` are optional. A gladiator without them keeps playing its
current clip.

## 1. Make the character (`create_character`, v3)

Use v3 mode, which costs 3 generations at this size. Standard mode (1
generation) looks flat. The web app's v3 option with the same settings works
too; Cinder was made there.

```json
{
  "description": "<the gladiator's Character line from gladiator-prompts.md>",
  "name": "<Gladiator>",
  "mode": "v3",
  "view": "side",
  "size": 92,
  "detail": "high detail",
  "body_type": "humanoid"
}
```

v3 always draws 8 directions. Use a description that names the weapon and the
hands holding it. Poll `get_character` until it says `completed`; the
rotations can be downloaded before its last background job finishes.

Cinder: `45a2bdc4-1747-4ab2-9d78-4c727cdf16e3` ("fierce female gladiator, athletic woman…").
Glacia: `cba5ffe0-ec6f-4093-98f7-4c7dfae6e139`, made through the API with the call above.

## 2. Make a fighting-pose state (`create_character_state`)

Clips start from the character's pose, so put the character in the stance you
want first. Keep identity and colours with `use_color_palette_from_reference`,
and give a weapon room with a bigger canvas.

```json
{
  "character_id": "<character id>",
  "state_name": "Two-Handed Guard",
  "use_color_palette_from_reference": true,
  "override_width": 128, "override_height": 128,
  "edit_description": "two-handed fighting stance: both hands gripping the hilt of the flaming sword together, blade raised diagonally up and forward in front of her body in a guard position, knees bent, feet apart, ready to swing"
}
```

This cost about 10 generations. The new state gets its own id; Cinder's is
`eeaf22fe-6a29-45ca-8cf0-4f0bc2bdbb37`. Every clip below is animated on that id.

## 3. Pad the pose to 176×176

`animate_character` has no canvas setting. PixMiniMax generates at the size of
the start frame, and the state's 128px canvas cut the ends off sword trails.
Download the state's east rotation (`get_character` lists the URL) and centre it
on a transparent 176×176 image:

```python
from PIL import Image
pose = Image.open('east.png').convert('RGBA')               # 128x128
canvas = Image.new('RGBA', (176, 176), (0, 0, 0, 0))
canvas.alpha_composite(pose, ((176 - pose.width) // 2, (176 - pose.height) // 2))
canvas.save('pose176.png')
```

Send it base64-encoded as `custom_start_frame_base64`, and as `end_frame_base64`
for clips that should return to the pose. PixelLab trims the stored frames to
fit the motion but keeps the figure centred, so the game lines them up.

## 4. Animate the clips (`animate_character`, PixMiniMax)

Shared arguments, 1 generation per clip at this size:

```json
{
  "character_id": "<state id>",
  "directions": ["east"],
  "mode": "pixminimax",
  "frame_count": 16,
  "keep_first_frame": false,
  "custom_start_frame_base64": "<pose176.png>",
  "subject_description": "a female gladiator in ember-red armor with a flaming greatsword",
  "initial_pose": "two-handed guard stance, both hands on the hilt, flaming blade raised back over her rear shoulder"
}
```

- `keep_first_frame: false` drops the copy of the start pose that PixelLab
  otherwise stores as frame 0.
- Setting `end_frame_base64` to the same pose makes the clip end where it
  began. That gives a seamless idle loop and swings that flow back into idle.

Cinder's action descriptions:

| Clip | `end_frame_base64` | `action_description` |
| --- | --- | --- |
| idle | pose | breathing steadily in a two-handed guard stance, both hands staying on the hilt, shoulders gently rising and falling, ponytail swaying, sword flames flickering |
| attack | pose | swinging the flaming sword with both hands in a powerful horizontal arc from behind her, sweeping forward to the right in front of her body with a trail of fire, then pulling the blade back into her two-handed guard |
| attack2 | pose | thrusting the flaming sword forward to the right, then sweeping it with both hands in a backhand horizontal arc from right to left across her body with a trail of fire, ending back in her two-handed guard |
| death | none | struck down, her whole body and sword glow bright orange and burst into glowing ember dust that scatters upward and fades away until nothing is left |

Cinder's idle was animated before the 176px fix, from the plain rotation with
`end_frame_url` set to it. Nothing in an idle reaches the canvas edge, so it
didn't need redoing.

Clips with an end frame can sit at about 95% for 20 to 40 minutes before they
finish. If a call fails with a `QueuePool` error, PixelLab is busy; wait and
retry the same call.

## 5. Pull the frames into the game

List the finished clips' animation ids in `tools/pixellab-looks.mjs` and the
state id in `assets/sprites/<gladiator>/pixellab.json`:

```js
cinder: {
  animations: {
    idle: '74649177-…',   // the id in the clip's frame URL: …/animations/<id>/east/{i}.png
    attack: 'a2d5f60f-…',
    attack2: '59eba069-…',
    death: 'f97fb098-…',
  },
  // optional: frames to keep per clip, in order (e.g. to trim a slow wind-up)
  // frames: { attack: [6, 8, 10, …] },
},
```

Then run:

```sh
NODE_USE_ENV_PROXY=1 node tools/pixellab-mcp.mjs fetch cinder   # base.png + <clip>_<n>.png
npm run build && npm test
NODE_PATH=$(npm root -g) node tools/playtest.cjs /tmp/pt        # full match, reports JS errors
```

The arena sizes each sprite by the figure in `base.png`, not by its canvas, so
characters on different canvases come out the same height. The timings for
`attack`, `attack2`, `death` and the 0.12s blend between clips are in
`src/ui/arena.js` (`CLIP`, `BLEND`). Idle plays at 8 frames per second.
