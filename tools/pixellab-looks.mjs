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
