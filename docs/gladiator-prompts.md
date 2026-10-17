# Gladiator prompts

PixelLab prompts for every gladiator, written for the process in [sprites.md](sprites.md). Each block fills in that doc's steps:

- **Character** is the description for step 1 (`create_character` in v3 mode). It names the weapon and the hands holding it.
- **Pose state** is `edit_description` for step 2 (`create_character_state`).
- **Subject** and **Initial pose** are `subject_description` and `initial_pose` for step 4.
- **idle / attack / attack2 / death** are each clip's `action_description`. Idle, both attacks and cast end back in the pose (`end_frame_base64`); death has no end frame.
- **cast** plays when the gladiator uses their ability at full mana. The arena already supports it (0.7s, `CLIP.cast` in `src/ui/arena.js`); without one the gladiator keeps playing its current clip.

All clips face east (right). The descriptions keep to what renders at sprite size: body, outfit, colours and weapon. Effects that change during a fight (growing spikes, blooming flowers) belong in the game, not the sprite.

Pronouns: Cinder, Glacia, Morwen, Wardweaver, Forgeblade, Sigrun, Haze, Nightshade and Pyrelle are women; Kael, Brakka, Aldric, Orrin, Twinfang, Rook, Anvil, Bram and Mordrek are men.

## Strike

### Cinder, *the Kindled*  (`cinder`)

Done, including the cast. Its other prompts are in [sprites.md](sprites.md).

- **cast** (Blaze Rush): rearing back and dashing forward to the right in a blazing charge, the sword held low then ripped upward in a rising slash that bursts into a wave of fire, then skidding back into her two-handed guard

### Kael, *the Red Harvest*  (`reaver`)

Done. Character `8afd2730-d671-4c26-914a-22a00cb89dbe`, Low Reaping Stance state `eba1435b-2d86-4869-9b09-8cd288a1a4cf`; every clip below was animated with these prompts.

- **Character:** gaunt male gladiator, pale lean man with a long hooked scythe held in both hands, crimson sash and dark leather wraps, green vine tattoos on his bare arms, shaggy black hair
- **Pose state:** low reaping stance: both hands on the scythe shaft, the curved blade held low behind him near the ground, body leaning forward, knees bent, ready to sweep
- **Subject:** a gaunt man in a crimson sash with a long hooked scythe
- **Initial pose:** low reaping stance, both hands on the shaft, scythe blade trailing low behind him
- **idle:** breathing slowly in a low reaping stance, both hands staying on the scythe, sash fluttering, the blade swaying slightly near the ground
- **attack:** sweeping the scythe with both hands in a wide low arc from behind him forward to the right with a red streak, then drawing it back into his reaping stance
- **attack2:** raising the scythe high and pulling it down toward himself in a hooking overhead reap to the right with a red streak, ending back in his reaping stance
- **death:** drops to his knees, the scythe clattering beside him, then slumps face down and fades into drifting red mist
- **cast** (Rupture): planting the scythe and clenching his free fist toward the enemy, red mist pulling out of the air to the right and swirling back into his chest as he straightens up, then returning to his reaping stance

### Brakka, *the Living Conduit*  (`chainbreaker`)

- **Character:** huge bare-chested male gladiator, muscular ex-prisoner with broken iron shackles on both wrists, a heavy iron chain wrapped around his right fist with a long loop hanging down, ragged brown trousers, shaved head
- **Pose state:** wide brawler stance: chain wrapped around his right fist with a long loop hanging down, left fist raised, knees bent, shoulders hunched forward
- **Subject:** a huge bare-chested prisoner with broken shackles swinging an iron chain
- **Initial pose:** wide brawler stance, chain wrapped around his right fist with a loop hanging, left fist raised
- **idle:** breathing heavily in a wide brawler stance, the chain loop swinging gently, small yellow sparks crackling along the links
- **attack:** whipping the chain overhead and lashing it forward to the right in a long crack, yellow lightning arcing along the links, then reeling it back into his fist
- **attack2:** swinging the chain in a low horizontal sweep from left to right across his body with crackling yellow sparks, then catching the loop back in his brawler stance
- **death:** lightning surges through his body, he stiffens as sparks burst off him, then topples backward and the chain goes limp and dark
- **cast** (Thunderfall): swinging the chain in a fast circle overhead until it crackles with lightning, then slamming it onto the ground in front of him to the right as a bright yellow lightning bolt crashes down there, then reeling it back into his fist

### Aldric, *the Rusted Judge*  (`oathcleaver`)

- **Character:** tall male knight in rust-red plate armor and a tattered grey tabard, closed great helm, a huge executioner's axe held in both hands
- **Pose state:** executioner's stance: both hands on the long axe haft, the broad blade resting high over his right shoulder, feet planted wide
- **Subject:** a knight in rust-red plate with a huge executioner's axe
- **Initial pose:** both hands on the haft, axe blade resting over his right shoulder, feet planted wide
- **idle:** standing heavily with the axe resting on his shoulder, chest rising and falling, tabard swaying slightly
- **attack:** heaving the axe off his shoulder and chopping it straight down in front of him to the right with both hands, then hauling it back up onto his shoulder
- **attack2:** swinging the axe in a flat horizontal cleave from his shoulder across to the right with a dull red streak, then lifting it back onto his shoulder
- **death:** drops to one knee and leans on the axe, then crashes forward as his armor crumbles into flakes of rust that blow away
- **cast** (Rusted Verdict): raising the axe high over his head with both hands and holding it a moment as the blade glows dull red, then bringing it down in a crushing execution strike in front of him to the right, then hauling it back onto his shoulder

## Spell

### Glacia, *of the Long Winter*  (`glacia`)

- **Character:** tall female ice sorceress in a white fur mantle over pale blue robes, crown of icicles, long white hair, holding a frost-crusted crystal staff in her right hand
- **Pose state:** casting stance: crystal staff held upright in her right hand beside her, left palm raised forward glowing pale blue, body turned side-on, robes settled
- **Subject:** a tall ice queen in a white fur mantle with an icicle crown and a crystal staff
- **Initial pose:** staff upright in her right hand, left palm raised forward with a pale blue glow
- **idle:** standing tall with the staff upright, breathing calmly, mantle fur stirring, faint snowflakes drifting around her raised hand
- **attack:** thrusting the crystal staff forward to the right, a burst of jagged ice shards spraying from its tip, then drawing it back upright
- **attack2:** sweeping her left hand forward to the right in an arc that throws a spray of hail and frost, then raising it back to her casting stance
- **death:** frost spreads over her until she is frozen solid, then she cracks and shatters into ice shards that scatter and melt away
- **cast** (Hailstorm): raising the crystal staff high above her head as a swirl of snow gathers around its tip, then sweeping it forward to the right to hurl a storm of hailstones, then lowering it back upright

### Orrin, *Speaker of Squalls*  (`stormseer`)

- **Character:** old male storm wizard, thin bearded man with a white blindfold over his eyes, long storm-grey robe with violet runes on the hem, holding a forked iron lightning-rod staff in both hands
- **Pose state:** both hands gripping the forked staff held diagonally in front of him with the tip raised forward, robe hanging straight, bearded chin lifted
- **Subject:** an old blindfolded storm wizard in a grey robe with a forked lightning staff
- **Initial pose:** both hands on the forked staff held diagonally, tip raised forward
- **idle:** standing still with the forked staff held diagonally, beard and robe stirring in a breeze, tiny sparks flickering between the forks
- **attack:** thrusting the forked staff forward to the right, a jagged yellow lightning bolt crackling from the forks, then pulling the staff back
- **attack2:** raising the staff overhead with both hands and bringing it down forward to the right with a flash of lightning in front of him, then returning to his stance
- **death:** a bolt strikes him from above, he flashes bright white, then crumples to the ground in a puff of smoke, the staff falling beside him
- **cast** (Thunderclap): lifting the forked staff high with both hands and striking its butt down on the ground, a booming ring of yellow lightning bursting outward from the impact, then returning to his stance

### Morwen, *Mother of Smoke*  (`ashen`)

- **Character:** hunched old female witch in layered soot-black rags, glowing ember-orange eyes, long tangled grey hair, a smoking brass censer on a chain held in her right hand leaking green fumes
- **Pose state:** hunched casting stance: right hand holding the censer chain out in front so the censer dangles forward, left hand clawed and raised, back bent, green smoke curling up
- **Subject:** a hunched old witch in black rags swinging a smoking censer
- **Initial pose:** hunched, censer dangling forward from her right hand, left hand clawed and raised
- **idle:** swaying slightly in a hunched stance, the censer swinging gently on its chain, green smoke curling up from it
- **attack:** swinging the censer forward to the right on its chain in an underhand arc, a burst of green smoke and orange embers spilling out, then letting it swing back
- **attack2:** whirling the censer in a full circle beside her and flinging a cloud of glowing green ash forward to the right, then letting it hang again
- **death:** collapses into a heap of black rags that crumbles into grey ash and drifts away with a last puff of green smoke
- **cast** (Cinderplague): raising the censer high and shaking it hard, a thick cloud of green smoke flecked with orange embers billowing out forward to the right, then lowering it to dangle in front of her again

### Wardweaver, *Keeper of Wards*  (`sage`)

- **Character:** broad-shouldered female battle-mage in a violet long coat with gold trim, short dark hair, a glowing gold hexagonal shield on her left forearm and a short rune-carved rod in her right hand
- **Pose state:** guard stance: gold hexagonal shield raised in front on her left arm, rune rod held back in her right hand glowing violet, feet apart, knees slightly bent
- **Subject:** a battle-mage woman in a violet coat with a glowing gold hex shield and a rune rod
- **Initial pose:** gold hex shield raised in front on her left arm, rune rod held back in her right hand
- **idle:** breathing steadily behind her raised gold shield, coat tails stirring, the rod glowing softly violet
- **attack:** shoving the gold hex shield forward to the right, a wave of golden light bursting from its face, then pulling it back into guard
- **attack2:** swinging the rune rod forward to the right over the top of the shield, launching a bolt of violet light, then drawing it back
- **death:** her shield cracks into glowing gold hexagon shards, she falls to her knees, and she and the shards fade into violet sparks
- **cast** (Arcane Barrier): raising the gold hex shield as a dome of golden hexagons flickers up around her, then thrusting the shield forward to the right so the dome bursts outward in a wave of gold and violet light, then returning to guard

## Precision

### Twinfang, *the Coiled Blade*  (`viper`)

- **Character:** wiry male assassin in tight green and black scaled leather, hood shaped like a snake's head, lower face masked, a curved dagger in each hand, the left blade dripping green and the right dripping red
- **Pose state:** low crouched stance: knees deeply bent, left dagger held forward at chest height, right dagger held back by his hip in a reverse grip, weight on the balls of his feet
- **Subject:** a wiry hooded assassin in green-black scale leather with two curved daggers
- **Initial pose:** low crouch, left dagger forward, right dagger reverse-grip by his hip
- **idle:** bobbing lightly in a low crouch, both daggers ready, the hood tip swaying
- **attack:** lunging forward to the right with a quick stab of the left dagger followed by a slash of the right dagger, leaving green and red streaks, then springing back into his crouch
- **attack2:** spinning once in place and slashing both daggers in crossing arcs to the right, leaving an X of green and red streaks, ending back in his crouch
- **death:** staggers, drops both daggers and crumples, his body turning sickly green and melting into a puddle of venom
- **cast** (Fang Flurry): darting forward to the right in a blur of rapid alternating dagger stabs, green and red streaks crisscrossing in front of him, then flipping back into his crouch

### Forgeblade, *First Blade of the Pit*  (`duelist`)

- **Character:** proud female fencer, lean woman in a dark steel half-cuirass over a white shirt, short cropped hair, a thin rapier in her right hand with a glowing white-hot tip
- **Pose state:** en garde fencing stance: side-on, right arm extended forward holding the rapier pointed ahead, left hand raised back behind her head, knees bent, front foot forward
- **Subject:** a lean woman fencer in a dark steel cuirass with a white-hot rapier
- **Initial pose:** en garde, side-on, rapier arm extended forward, left hand raised behind her
- **idle:** bouncing lightly en garde, the rapier point making small circles, its white-hot tip glowing and sparking
- **attack:** lunging far forward to the right with a long straight rapier thrust, front knee bent deep, leaving a streak of heat and sparks, then recovering back en garde
- **attack2:** stepping in and flicking the rapier in two fast diagonal slashes to the right with bright sparks, then returning en garde
- **death:** her rapier snaps, she drops to one knee clutching her chest, then falls sideways as the glow on the broken blade fades to grey
- **cast** (Lunge): drawing the rapier back as its tip flares white-hot, then exploding forward to the right in a long, low lunge that leaves a bright trail of heat and sparks, then recovering back en garde

### Sigrun, *the Last Huntress*  (`snowthorn`)

- **Character:** lean female huntress wrapped in white wolf pelts with a wolf-head hood, pale braided hair, holding a white bone longbow in her left hand with an ice-blue arrow nocked
- **Pose state:** archer's stance: side-on, bow held forward in her left hand, right hand at the string with an ice arrow nocked but not drawn, feet apart
- **Subject:** a lean huntress in white wolf pelts with a bone longbow
- **Initial pose:** side-on, bone bow held forward in her left hand, ice arrow nocked, string relaxed
- **idle:** standing ready with an arrow nocked, breathing slowly with frosty breath, pelt fur stirring
- **attack:** drawing the bow string back to her cheek and loosing an ice-blue arrow to the right that leaves a frosty trail, then nocking a new arrow
- **attack2:** quickly drawing and firing two ice arrows in a row to the right, frost puffing from the bow, then returning to her ready stance
- **death:** frost creeps over her and she sinks to her knees, then crumbles into a drift of snow that blows away
- **cast** (Winter's Kiss): slowly drawing the bow as a large glowing ice arrow forms on the string and frost swirls around her, then loosing it to the right in a burst of snow, then nocking a new arrow

### Rook, *the Thunderbrand*  (`runevolt`)

- **Character:** young male swordsman, lean man in a dark sleeveless tunic, glowing violet runes along his bare right arm, short spiky hair, a straight longsword etched with glowing glyphs in his right hand
- **Pose state:** one-handed guard: sword held forward and up in his right hand, left hand open at his side crackling with yellow sparks, knees bent, side-on
- **Subject:** a young swordsman with violet runes on his arm and a glyph-etched sword
- **Initial pose:** sword held forward in his right hand, left hand open and crackling with sparks
- **idle:** shifting lightly in his guard, the runes on his arm pulsing violet, small yellow sparks jumping along the sword
- **attack:** slashing the sword in a fast diagonal arc from high down to the right, the blade trailing violet and yellow lightning, then returning to guard
- **attack2:** driving the sword forward in a straight thrust to the right that releases a crackling yellow bolt from its tip, then pulling back to guard
- **death:** the runes on his arm flare bright and lightning bursts out of him, then he falls backward as the glow fades and the sword clatters down
- **cast** (Runic Discharge): raising the sword upright in front of his face as the runes on his arm and blade blaze violet, then slashing it down and forward to the right to release a wave of violet runes and yellow lightning, then returning to guard

## Evasion

### Haze, *Never Where You Strike*  (`wisp`)

- **Character:** slight female dancer in flowing pale blue and orange scarves, barefoot, long white hair, a folded war fan in each hand, one frost-blue and one ember-orange
- **Pose state:** dancer's stance: up on the balls of her feet, the blue fan raised high above her head and the orange fan held low in front, scarves flowing, body twisted
- **Subject:** a slight dancer in flowing blue and orange scarves with two war fans
- **Initial pose:** on her toes, blue fan raised high, orange fan low in front
- **idle:** swaying gently on her toes, scarves drifting, fans fluttering slightly
- **attack:** spinning on one foot and slashing both fans forward to the right in a sweeping arc, a trail of frost and embers following, ending back in her dancer's stance
- **attack2:** snapping both fans open and flinging them forward to the right in a crossing slash with a spray of blue frost and orange sparks, then folding them back
- **death:** she fades like a mirage, her body thinning into blue mist and orange sparks that drift away until only her scarves fall
- **cast** (Mirage): spinning so fast she blurs, a frost-blue copy and an ember-orange copy of her splitting off to either side, all three slashing their fans forward to the right before the copies vanish and she settles back into her dancer's stance

### Nightshade, *Smoke and Needles*  (`nightshade`)

- **Character:** masked female assassin in a dark purple bodysuit and a hooded smoke-grey cloak, a needle bandolier across her chest, a fan of long green-tipped needles held between the fingers of her right hand
- **Pose state:** crouched throwing stance: right hand drawn back by her ear holding the needles, left arm pointing forward, cloak draped, knees bent
- **Subject:** a masked assassin in purple and grey with a fan of poison needles
- **Initial pose:** crouched, right hand drawn back holding needles, left arm pointing forward
- **idle:** crouched and still, cloak edges curling like smoke, the green-tipped needles glinting in her hand
- **attack:** flicking her right hand forward to the right and throwing a spread of green-tipped needles, then drawing a new set from her bandolier
- **attack2:** spinning low and throwing needles from both hands to the right as a puff of grey-green smoke bursts around her, ending back crouched
- **death:** she bursts into a cloud of grey-green smoke that thins and drifts away, leaving only her falling cloak
- **cast** (Smoke Veil): slamming a smoke pellet onto the ground so a swirling dome of grey-green smoke rises around her, throwing a spread of needles out of it to the right, then the smoke thins back to her crouch

### Pyrelle, *the Reborn Flame*  (`dawnfeather`)

- **Character:** graceful female dancer with a long cape of gold and flame-coloured feathers, golden skin, barefoot, flowing red-gold hair, a curved golden sickle in each hand
- **Pose state:** winged stance: arms spread wide like wings with a golden sickle in each hand, feather cape fanned out behind her, up on one foot
- **Subject:** a golden-skinned dancer with a cape of flame feathers and two golden sickles
- **Initial pose:** arms spread wide like wings, a sickle in each hand, feather cape fanned out
- **idle:** swaying gracefully with arms spread, feathers rippling like flames, tiny embers drifting up from the cape
- **attack:** spinning forward to the right with both sickles slashing in a circle, the feather cape whirling out in a ring of fire, ending back in her winged stance
- **attack2:** leaping up and slashing both sickles down to the right in a diving strike with flames streaming from the cape, landing back in her winged stance
- **death:** she bursts into flame and burns down to a small pile of glowing ash, and a single green sprout rises from it
- **cast** (Phoenix Waltz): spreading her arms wide as the feather cape blazes up into fiery wings, twirling in a full circle that throws a ring of flame outward while small green leaves swirl up around her feet, then settling back into her winged stance

## Pain

### Anvil, *Who Bleeds for Steel*  (`martyr`)

- **Character:** massive male gladiator in dented, patched plate armor with no helmet, scarred bald head, thick beard, a huge tower shield of riveted scrap metal on his left arm and a short iron mace in his right hand
- **Pose state:** braced stance: tower shield planted in front of him covering most of his body, mace raised over the shield's top edge, knees bent, leaning into the shield
- **Subject:** a massive bearded man in dented plate with a scrap-metal tower shield and a mace
- **Initial pose:** tower shield planted in front, mace raised over its top edge, leaning into it
- **idle:** braced behind the tower shield, breathing heavily, shoulders rising and falling
- **attack:** slamming the tower shield forward to the right in a heavy bash with his whole body, then pulling it back and planting it again
- **attack2:** bringing the iron mace down over the top of the shield to the right in a heavy overhead blow, then raising it back behind the shield
- **death:** the tower shield falls flat in front of him, he drops to his knees and topples forward onto it with a heavy crash
- **cast** (Martyrdom): raising the tower shield high and slamming its bottom edge into the ground as a golden dome of light shimmers up around him, then lifting the shield back into his braced stance

### Bram, *Rooted*  (`grove`)

- **Character:** towering half-man half-tree warden, body of rough brown bark with mossy green patches, thick moss beard, leafy branches on his shoulders, a gnarled wooden club held in both hands
- **Pose state:** rooted stance: feet planted wide, both hands on the gnarled club held diagonally across his body, head lowered, shoulders hunched
- **Subject:** a towering bark-skinned tree warden with a moss beard and a gnarled club
- **Initial pose:** feet planted wide, both hands holding the club diagonally across his body
- **idle:** standing rooted with the club across his body, breathing slowly, the leaves on his shoulders rustling
- **attack:** lifting the club high with both hands and slamming it down in front of him to the right, leaves and bark chips flying, then raising it back across his body
- **attack2:** swinging the club in a wide horizontal sweep from left to right with leaves scattering, then returning it across his body
- **death:** he stiffens and slowly hardens into a still, leafless tree stump as his last leaves fall around him
- **cast** (Overgrowth): planting the club in the ground and spreading his arms as vines and flowers bloom across his bark body and green light rises around him, then gripping the club again

### Mordrek, *the Unyielding*  (`gravespike`)

- **Character:** grim male gravedigger-knight in black iron armor, bone spikes jutting from his shoulders, pale gaunt face, a long spiked shovel-spear held in both hands
- **Pose state:** low guard: both hands on the shovel-spear's shaft, the spiked spade blade pointed forward at chest height, knees bent, shoulders hunched under the bone spikes
- **Subject:** a grim knight in black iron with bone shoulder spikes and a spiked shovel-spear
- **Initial pose:** both hands on the shaft, spiked spade blade pointed forward at chest height
- **idle:** hunched in a low guard, breathing slowly, the spade blade swaying slightly
- **attack:** driving the shovel-spear forward to the right in a hard two-handed thrust, then yanking it back into his guard
- **attack2:** swinging the spade blade upward in a scooping diagonal arc to the right like digging, then pulling it back into his guard
- **death:** falls backward as his black armor and bone spikes crumble into a mound of dark earth
- **cast** (Grave Sentence): stabbing the shovel-spear down into the ground in front of him so a row of bone spikes bursts up from the earth to the right, then wrenching the spade free back into his guard
