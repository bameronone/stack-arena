// How each gladiator looks and swings, for PixelLab sprite generation.
export const LOOKS = {
  cinder: {
    // Cameron's hand-made PixelLab character in its Two-Handed Guard state;
    // `fetch` pulls these PixMiniMax clips by animation id instead of by name.
    // Idle and both swings were animated back to the guard pose, so they loop
    // and hand off to each other cleanly.
    description: 'fierce female gladiator, athletic woman with a long flaming sword held in both hands, ember-red armor, long wild orange hair in a high ponytail',
    attack: 'swinging the flaming sword with both hands in a horizontal arc, then returning to the two-handed guard',
    animations: {
      idle: '74649177-8e35-4677-8247-a2043e07918b',
      attack: 'a2d5f60f-91d9-4639-a954-581b446900c8', // left to right
      attack2: '59eba069-2f39-452c-b2cc-36c4805bc4b4', // right to left
      death: 'f97fb098-6cda-404f-a1ab-18a1f38f9fd1', // bursts into glowing dust
      cast: '181fcae4-ae5e-4499-b2ce-10a092c2630b', // Blaze Rush
    },
  },
  // The rest follow docs/gladiator-prompts.md, which has each one's pose and clip prompts.
  glacia: {
    // v3 character made through the API, in its Casting Stance state. Idle,
    // both attacks and cast were animated back to the stance.
    animations: {
      idle: '8a081eae-d07f-408f-b859-0b3123a44c9b',
      attack: '606138f0-c360-42f5-9e48-59fe6a1ebd03', // staff thrust, ice shards
      attack2: 'cfeccec3-3c68-4255-893c-3fce00cd5f72', // hand sweep, hail
      cast: '7e4dc646-39f1-4a83-953b-f3365eec3d92', // Hailstorm
      death: '26753a30-841a-42be-a235-be02bcc00f1b', // freezes and shatters
    },
    description: "tall female ice sorceress in a white fur mantle over pale blue robes, crown of icicles, long white hair, holding a frost-crusted crystal staff in her right hand",
    attack: "thrusting the crystal staff forward to the right, a burst of jagged ice shards spraying from its tip, then drawing it back upright",
  },
  reaver: {
    // Cameron's PixelLab character in its Low Reaping Stance state; clips
    // were animated from that pose padded to 176x176 and end back in it.
    animations: {
      idle: '0ebe3cb1-685a-4de2-b497-f1509e6d93ce',
      attack: '31d103a4-e2ff-486b-abc9-64ab1ba6dfd1', // low sweep
      attack2: '0f86bede-ec10-4e69-8610-5d2f51af9a38', // overhead hooking reap
      cast: 'cfd1aa24-c4a1-4642-a54d-2cbd550ed3b1', // Rupture
      // death_11..14 had a stray grey dash above the mist, erased by hand after fetching
      death: '0faefa12-9682-439d-97d2-7383f1c34ffe', // fades into red mist
    },
    description: "gaunt male gladiator, pale lean man with a long hooked scythe held in both hands, crimson sash and dark leather wraps, green vine tattoos on his bare arms, shaggy black hair",
    attack: "sweeping the scythe with both hands in a wide low arc from behind him forward to the right with a red streak, then drawing it back into his reaping stance",
  },
  chainbreaker: {
    description: "huge bare-chested male gladiator, muscular ex-prisoner with broken iron shackles on both wrists, a heavy iron chain wrapped around his right fist with a long loop hanging down, ragged brown trousers, shaved head",
    attack: "whipping the chain overhead and lashing it forward to the right in a long crack, yellow lightning arcing along the links, then reeling it back into his fist",
  },
  oathcleaver: {
    // PixelLab character made through the API in v3 mode, in its
    // Executioner's Stance state; clips were animated from that pose padded
    // to 176x176, and all but death end back in it.
    animations: {
      idle: 'b84f917f-2188-4d53-a6df-f53d62b72f47',
      attack: '01edafad-1f4b-4176-a808-8cd696003cd1', // overhead chop
      attack2: 'dc3cad4f-6a8e-43a3-89b6-a487468cfe6f', // flat cleave (prompt adds "staying side-on facing right the whole time")
      cast: '2b3c3938-b8dc-4a1a-9af7-267b370454a1', // Rusted Verdict
      death: 'e4bd8bbf-e8cd-4c3a-8bc5-a417901c9e95', // crumbles into rust
    },
    description: "tall male knight in rust-red plate armor and a tattered grey tabard, closed great helm, a huge executioner's axe held in both hands",
    attack: "heaving the axe off his shoulder and chopping it straight down in front of him to the right with both hands, then hauling it back up onto his shoulder",
  },
  stormseer: {
    description: "old male storm wizard, thin bearded man with a white blindfold over his eyes, long storm-grey robe with violet runes on the hem, holding a forked iron lightning-rod staff in both hands",
    attack: "thrusting the forked staff forward to the right, a jagged yellow lightning bolt crackling from the forks, then pulling the staff back",
  },
  ashen: {
    description: "hunched old female witch in layered soot-black rags, glowing ember-orange eyes, long tangled grey hair, a smoking brass censer on a chain held in her right hand leaking green fumes",
    attack: "swinging the censer forward to the right on its chain in an underhand arc, a burst of green smoke and orange embers spilling out, then letting it swing back",
  },
  sage: {
    description: "broad-shouldered female battle-mage in a violet long coat with gold trim, short dark hair, a glowing gold hexagonal shield on her left forearm and a short rune-carved rod in her right hand",
    attack: "shoving the gold hex shield forward to the right, a wave of golden light bursting from its face, then pulling it back into guard",
  },
  viper: {
    description: "wiry male assassin in tight green and black scaled leather, hood shaped like a snake's head, lower face masked, a curved dagger in each hand, the left blade dripping green and the right dripping red",
    attack: "lunging forward to the right with a quick stab of the left dagger followed by a slash of the right dagger, leaving green and red streaks, then springing back into his crouch",
    // PixMiniMax clips on the Low Crouched Stance state; idle, swings and cast end back in the crouch.
    animations: {
      idle: 'dbe46be9-8565-4432-945d-923e7adbc592',
      attack: '377eceb9-8ecb-467e-b973-a1ba619ce3e1', // stab then slash
      attack2: '8ccaf899-a181-4ad7-b258-0f11ca7949c0', // spinning X slash
      cast: '0e66a96c-2e09-4636-87ca-e950cfe64f5a', // Fang Flurry
      death: '72a2918e-fd19-47da-a6d5-d9a0e7b7250a', // melts into venom
    },
  },
  duelist: {
    description: "proud female fencer, lean woman in a dark steel half-cuirass over a white shirt, short cropped hair, a thin rapier in her right hand with a glowing white-hot tip",
    attack: "lunging far forward to the right with a long straight rapier thrust, front knee bent deep, leaving a streak of heat and sparks, then recovering back en garde",
    // PixMiniMax clips on the En Garde state, animated from and back to its pose.
    animations: {
      idle: '165a112a-e9a7-46a7-ac70-968ce7325b9d',
      attack: 'e5c9974f-c236-4cf6-9053-a87b8cd95eaf', // long lunge
      attack2: '1d7ba908-f885-41bb-a490-0e027e7feebe', // two diagonal slashes
      cast: 'd0185d21-fb94-4ccd-9cfa-c4ce9f65c382', // Lunge, from the pose padded to 256x256 so the fire trail isn't cut off
      death: 'e8368b9c-ea34-46d8-a795-53480fe51a04', // rapier snaps, falls sideways
    },
  },
  snowthorn: {
    // Sigrun: v3 character in its Archer's Stance state, clips animated with
    // PixMiniMax from the 176px pose (docs/sprites.md).
    description: "lean female huntress wrapped in white wolf pelts with a wolf-head hood, pale braided hair, holding a white bone longbow in her left hand with an ice-blue arrow nocked",
    attack: "drawing the bow string back to her cheek and loosing an ice-blue arrow to the right that leaves a frosty trail, then nocking a new arrow",
    animations: {
      idle: '8b7aefc9-bde5-4806-b903-8326b975f7f6',
      attack: '0001a736-b43c-46c1-8f7d-2197a6da9fc4', // one ice arrow
      attack2: 'e27a9113-703e-4b73-8ee0-2b878a8cf700', // two quick shots
      cast: '6c4c0e96-ebd9-4b04-ad0d-91e95a164d6b', // Winter's Kiss
      death: 'ae72fead-84c0-4f2c-87fe-d33c253704d8', // freezes, kneels, blows away as snow
    },
  },
  runevolt: {
    description: "young male swordsman, lean man in a dark sleeveless tunic, glowing violet runes along his bare right arm, short spiky hair, a straight longsword etched with glowing glyphs in his right hand",
    attack: "slashing the sword in a fast diagonal arc from high down to the right, the blade trailing violet and yellow lightning, then returning to guard",
  },
  wisp: {
    description: "slight female dancer in flowing pale blue and orange scarves, barefoot, long white hair, a folded war fan in each hand, one frost-blue and one ember-orange",
    attack: "spinning on one foot and slashing both fans forward to the right in a sweeping arc, a trail of frost and embers following, ending back in her dancer's stance",
    animations: {
      idle: '4818f9e1-80db-4268-8913-29c4c7eb25d5',
      attack: '2036c27d-43a4-4f05-806e-e9d9fec51a6c',
      attack2: 'f4a664ae-f2d7-4659-bf2e-f93dcf5129c3',
      cast: '1c4815bd-d709-4e55-8b0a-3d934e3813c6',
      death: '015679af-31f3-480e-82e5-d8709d996427',
    },
    // cast opens on two frames of striped blur; start at the split.
    frames: { cast: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  },
  nightshade: {
    description: "masked female assassin in a dark purple bodysuit and a hooded smoke-grey cloak, a needle bandolier across her chest, a fan of long green-tipped needles held between the fingers of her right hand",
    attack: "flicking her right hand forward to the right and throwing a spread of green-tipped needles, then drawing a new set from her bandolier",
  },
  dawnfeather: {
    description: "graceful female dancer with a long cape of gold and flame-coloured feathers, golden skin, barefoot, flowing red-gold hair, a curved golden sickle in each hand",
    attack: "spinning forward to the right with both sickles slashing in a circle, the feather cape whirling out in a ring of fire, ending back in her winged stance",
  },
  martyr: {
    description: "massive male gladiator in dented, patched plate armor with no helmet, scarred bald head, thick beard, a huge tower shield of riveted scrap metal on his left arm and a short iron mace in his right hand",
    attack: "slamming the tower shield forward to the right in a heavy bash with his whole body, then pulling it back and planting it again",
    // PixMiniMax clips on his Braced Stance state, animated from the 176px pose.
    animations: {
      idle: '7e7029ad-45b5-4f8b-b128-4a959c90fbb1',
      attack: '3bd5214d-f362-4fab-acba-88df1271456f', // shield bash
      attack2: '76b64f1e-c6fb-4dd6-bb2b-998066e6a172', // mace over the shield
      death: '01d601fe-6e28-405d-a3fb-adf3a6421e98', // topples onto his shield
      cast: 'b18f56d4-2339-47c3-88a8-9f1c97f14e0e', // Martyrdom: golden dome
    },
  },
  grove: {
    description: "towering half-man half-tree warden, body of rough brown bark with mossy green patches, thick moss beard, leafy branches on his shoulders, a gnarled wooden club held in both hands",
    attack: "lifting the club high with both hands and slamming it down in front of him to the right, leaves and bark chips flying, then raising it back across his body",
    // v3 character in its Rooted Stance state; PixMiniMax clips from the 176px pose.
    animations: {
      idle: '81de4dc7-d093-4568-af68-7240e2cbf328',
      attack: '43b85b0e-56f0-48a2-a07b-d9b16b90d15d', // overhead slam
      attack2: '275cce9d-27bf-45c6-825f-13504aef4f9a', // horizontal sweep
      cast: '39afbefc-a193-405d-a6ec-e1f0de702153', // Overgrowth: vines and flowers bloom
      death: '9faad795-6ea9-4b8f-a904-c190755ef94e', // hardens into a leafless stump
    },
  },
  gravespike: {
    description: "grim male gravedigger-knight in black iron armor, bone spikes jutting from his shoulders, pale gaunt face, a long spiked shovel-spear held in both hands",
    attack: "driving the shovel-spear forward to the right in a hard two-handed thrust, then yanking it back into his guard",
  },
};
