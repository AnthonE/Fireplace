// The page's registry of minigame client modules, by MG_* id, filled as rounds
// need them: need(id) imports client/mg/<key>.mjs once, and MG[id] is it from
// then on (undefined until it arrives, which the frontend draws as a bare
// stage under the title card's name). A page so loads only the minigames its
// room plays. client/mg/index.mjs is the eager registry, for Node (the bot
// host, the tools, the tests) and for a page's AI ball (client/party-bot.mjs).
import { MINIGAMES } from '../../src/layout.mjs';

export const MG = [];
const pending = [];

export function need(id) {
  if (MG[id] || pending[id] || !MINIGAMES[id]) return pending[id];
  pending[id] = import(`./${MINIGAMES[id].key}.mjs`).then((m) => (MG[id] = m.default));
  return pending[id];
}
