// How each gladiator looks and swings, for PixelLab sprite generation.
export const LOOKS = {
  cinder: {
    description: 'fierce female gladiator, athletic woman with a long flaming sword held in her right hand, ember-red leather armor, long wild orange hair in a high ponytail',
    attack: 'stepping forward in a low lunge and swinging the sword in a fast overhead slash, knees bent, body leaning into the swing',
    // Every clip spells out the sword so templates never draw her unarmed.
    clips: {
      idle: 'breathing in a low ready stance, knees bent, both hands gripping the sword held up in front of her',
      cast: 'raising the sword overhead as flames gather on the blade, then thrusting it forward to throw a fireball',
      hurt: 'recoiling backward from a hit, still holding the sword, then recovering to a ready stance',
      death: 'staggering, dropping to her knees and falling back, the sword falling beside her',
    },
  },
  glacia: { description: 'ice sorceress in pale blue robes with a frost crown and a crystal staff', attack: 'thrusting a staff forward in a quick strike' },
  viper: { description: 'hooded assassin with two curved daggers, green and black scale cloak', attack: 'lunging forward with two quick dagger stabs' },
  wisp: { description: 'nimble dancer with twin war fans, flowing teal and orange silk', attack: 'spinning and slashing with two fans' },
  martyr: { description: 'heavily armored knight with a tower shield and a battered iron helm', attack: 'bashing forward with a heavy shield' },
  stormseer: { description: 'storm mage with a crackling lightning staff, dark blue robes, glowing eyes', attack: 'swinging a staff in a short arc' },
  grove: { description: 'druid warrior covered in bark and leaves, wooden staff, mossy beard', attack: 'slamming a wooden staff downward' },
  ashen: { description: 'witch in ash-grey robes holding a smoking green potion and an ember staff', attack: 'jabbing forward with a staff' },
  reaver: { description: 'savage warrior with a blood-red axe, fur pelts and war paint', attack: 'chopping down hard with an axe' },
  sage: { description: 'rune-covered mage in white robes with a glowing blue shield of light', attack: 'pushing a glowing shield forward' },
  duelist: { description: 'brass-armored duelist with a rapier and buckler, plumed helmet', attack: 'lunging forward with a rapier thrust' },
  nightshade: { description: 'shadowy rogue in a smoke-grey cloak with a purple mask and poison needles', attack: 'flicking poison needles forward with a quick throw' },
};
