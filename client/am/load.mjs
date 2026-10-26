// The page's registry of team-mode client modules, by mode number, filled as
// matches need them: need(mode) imports client/am/<key>.mjs once, and
// AMC[mode] is it from then on (undefined until it arrives, and always for a
// mode without one, as in client/am/index.mjs, the eager registry the AI
// fighter, Node and the tests use). A page so loads only the modes its room
// plays.
import * as L from '../../src/layout.mjs';

export const AMC = [];
const pending = [];

export function need(mode) {
  const a = L.AM.find((m) => m.mode === mode);
  if (AMC[mode] || pending[mode] || !a) return pending[mode];
  pending[mode] = import(`./${a.key}.mjs`).then((m) => (AMC[mode] = m.default));
  return pending[mode];
}

// the module whose MX codes a news item's size falls in, as index.mjs's newsOf, or undefined while it loads
export const newsOf = (size) => (size >= L.MX_AM ? AMC[L.AM[(size - L.MX_AM) >> 3]?.mode] : undefined);
