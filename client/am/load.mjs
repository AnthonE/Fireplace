// The registry of kit-mode client modules a frontend and an AI fighter read,
// by mode number (client/am/index.mjs says what a module holds). In a page it
// fills as matches need them: need(mode) imports client/am/<key>.mjs once, and
// AMC[mode] is it from then on (undefined until it arrives, and always for a
// mode with no kit, a Fiesta's: the frontend and the AI fighter treat a kit
// mode as a free-for-all for those frames). A page so loads the modes its
// room plays, 2 to 9 KB gzipped each, and not all of them (69 KB). Outside a
// page every module is here from the start (client/lazy.mjs).
import * as L from '../../src/layout.mjs';
import { PAGE, registry } from '../lazy.mjs';

const r = registry((mode) => { const a = L.AM.find((m) => m.mode === mode); return a && import(`./${a.key}.mjs`); });
export const AMC = r.all;
export const need = r.need;
// the module whose MX codes a news item's size falls in, as index.mjs's newsOf, or undefined while it loads
export const newsOf = (size) => (size >= L.MX_AM ? AMC[L.AM[(size - L.MX_AM) >> 3]?.mode] : undefined);
export { SIDE, SIDE_C, SIDE_RGB, sideOf } from './sides.mjs';

if (!PAGE) (await import('./index.mjs')).AMC.forEach((m, k) => { if (m) AMC[k] = m; });
