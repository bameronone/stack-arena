import { createMatch, makeFight, resolveFight, finishRound } from '../src/engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../src/ai/bot.js';

export function playMatchForTest(seed) {
  const m = createMatch({ seed, players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }] });
  botBan(m, 0); botBan(m, 1);
  botPick(m, 0); botPick(m, 1);
  while (m.phase !== 'over' && m.round < 40) {
    if (m.phase === 'signature') { botSignature(m, 0); botSignature(m, 1); }
    botShop(m, 0); botShop(m, 1);
    for (const [a, b, ghost] of m.pairs) resolveFight(m, a, b, makeFight(m, a, b).runToEnd(), ghost);
    finishRound(m);
  }
  return m;
}
