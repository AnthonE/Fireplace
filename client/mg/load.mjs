// The registry of minigame client modules a frontend and an AI ball read, by
// MG_* id. In a page it fills as rounds need them: need(id) imports
// client/mg/<key>.mjs once, and MG[id] is it from then on (undefined until it
// arrives: the frontend draws a bare stage under the title card's name, the
// AI ball rolls on its common sense). A page so loads the minigames its room
// plays, 5 to 17 KB gzipped each with its constants, and not all of them (484
// KB). Outside a page every module is here from the start (client/lazy.mjs).
// client/mg/index.mjs stays the list itself, which new-mg.mjs appends to.
import { MINIGAMES } from '../../src/layout.mjs';
import { PAGE, registry } from '../lazy.mjs';

const r = registry((id) => MINIGAMES[id] && import(`./${MINIGAMES[id].key}.mjs`));
export const MG = r.all;
export const need = r.need;
// every minigame's, for a room played faster than a fetch (the studio's check)
export const needAll = () => Promise.all(MINIGAMES.map((_, k) => need(k)));

if (!PAGE) (await import('./index.mjs')).MG.forEach((m, k) => { MG[k] = m; });
