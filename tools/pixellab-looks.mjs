// How each gladiator looks and swings, for PixelLab sprite generation.
export const LOOKS = {
  cinder: {
    // Cameron's hand-made PixelLab character (Fighting Pose state); `fetch`
    // pulls these PixMiniMax clips by animation id instead of by clip name.
    description: 'fierce female gladiator, athletic woman with a long flaming sword held in her right hand, ember-red leather armor, long wild orange hair in a high ponytail',
    attack: 'grab the sword with both hands and swing it in a full arc, then return to the fighting stance',
    animations: {
      idle: 'IDLE_ID',
      attack: 'a896e7b9-54bb-4717-9b8e-7049cb6b78b5',
      death: 'aed68eb9-0024-48d3-a899-c610f25b8fc8',
    },
    // Generated frames to keep per clip: the attack skips its slow wind-up and
    // plays every other frame so the whole swing fits one attack; death skips
    // two frames that jump out of the stance.
    frames: {
      attack: [6, 8, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32],
      death: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
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
