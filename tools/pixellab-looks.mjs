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
    },
  },
  // The rest follow docs/gladiator-prompts.md, which has each one's pose and clip prompts.
  glacia: {
    description: "tall female ice sorceress in a white fur mantle over pale blue robes, crown of icicles, long white hair, holding a frost-crusted crystal staff in her right hand",
    attack: "thrusting the crystal staff forward to the right, a burst of jagged ice shards spraying from its tip, then drawing it back upright",
  },
  reaver: {
    description: "gaunt male gladiator, pale lean man with a long hooked scythe held in both hands, crimson sash and dark leather wraps, green vine tattoos on his bare arms, shaggy black hair",
    attack: "sweeping the scythe with both hands in a wide low arc from behind him forward to the right with a red streak, then drawing it back into his reaping stance",
  },
  chainbreaker: {
    description: "huge bare-chested male gladiator, muscular ex-prisoner with broken iron shackles on both wrists, a heavy iron chain wrapped around his right fist with a long loop hanging down, ragged brown trousers, shaved head",
    attack: "whipping the chain overhead and lashing it forward to the right in a long crack, yellow lightning arcing along the links, then reeling it back into his fist",
  },
  oathcleaver: {
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
  },
  duelist: {
    description: "proud female fencer, lean woman in a dark steel half-cuirass over a white shirt, short cropped hair, a thin rapier in her right hand with a glowing white-hot tip",
    attack: "lunging far forward to the right with a long straight rapier thrust, front knee bent deep, leaving a streak of heat and sparks, then recovering back en garde",
  },
  snowthorn: {
    description: "lean female huntress wrapped in white wolf pelts with a wolf-head hood, pale braided hair, holding a white bone longbow in her left hand with an ice-blue arrow nocked",
    attack: "drawing the bow string back to her cheek and loosing an ice-blue arrow to the right that leaves a frosty trail, then nocking a new arrow",
  },
  runevolt: {
    description: "young male swordsman, lean man in a dark sleeveless tunic, glowing violet runes along his bare right arm, short spiky hair, a straight longsword etched with glowing glyphs in his right hand",
    attack: "slashing the sword in a fast diagonal arc from high down to the right, the blade trailing violet and yellow lightning, then returning to guard",
    // v3 character in its One-Handed Guard state; PixMiniMax clips from the 176px pose.
    animations: {
      idle: 'f7fe0807-65cd-4343-8181-1c671cfdc348',
      attack: '68f15840-1d3d-4370-98b1-b1213af4efd1', // diagonal lightning slash
      attack2: '69146099-2c55-4267-a9ad-4115fc248077', // thrust that fires a bolt
      cast: 'e253486e-877a-4785-92f0-1a02754425cf', // Runic Discharge
      death: 'ecf2bb71-9611-4792-aad3-1713e83e3a90', // runes flare, falls backward
    },
    // The last two death frames lose his body and leave only the sword; hold on him lying down.
    frames: { death: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  },
  wisp: {
    description: "slight female dancer in flowing pale blue and orange scarves, barefoot, long white hair, a folded war fan in each hand, one frost-blue and one ember-orange",
    attack: "spinning on one foot and slashing both fans forward to the right in a sweeping arc, a trail of frost and embers following, ending back in her dancer's stance",
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
  },
  grove: {
    description: "towering half-man half-tree warden, body of rough brown bark with mossy green patches, thick moss beard, leafy branches on his shoulders, a gnarled wooden club held in both hands",
    attack: "lifting the club high with both hands and slamming it down in front of him to the right, leaves and bark chips flying, then raising it back across his body",
  },
  gravespike: {
    description: "grim male gravedigger-knight in black iron armor, bone spikes jutting from his shoulders, pale gaunt face, a long spiked shovel-spear held in both hands",
    attack: "driving the shovel-spear forward to the right in a hard two-handed thrust, then yanking it back into his guard",
  },
};
