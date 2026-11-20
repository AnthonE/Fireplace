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

// A minigame's client module on other numbers than the site serves: its text
// with its imports made absolute and the one of its own constants
// (src/mg/<key>.mjs) pointed at url, a module of the same names. base is the
// module's own address.
export function variantSource(text, base, key, url) {
  const own = new URL(`../../src/mg/${key}.mjs`, base).href;
  let hit = 0;
  const out = text.replace(/(\bfrom\s*|\bimport\s*)(['"])(\.\.?\/[^'"]+)\2/g, (s, kw, q, spec) => {
    const abs = new URL(spec, base).href;
    if (abs === own) hit++;
    return `${kw}${q}${abs === own ? url : abs}${q}`;
  });
  if (!hit) throw new Error(`client/mg/${key}.mjs imports no src/mg/${key}.mjs`);
  return out;
}

// The studio's play (client/studio.mjs): minigame id's module built on the
// constants at url (a blob of the edited text), so what the edited numbers
// move in the sim, the drawing and the AI ball move with. Should it not
// load, the module as served.
export function withConsts(id, url) {
  const key = MINIGAMES[id]?.key;
  if (!key) return undefined;
  const base = new URL(`./${key}.mjs`, import.meta.url);
  return r.put(id, fetch(base, { cache: 'no-cache' }).then((res) => res.text()).then((text) => {
    const blob = URL.createObjectURL(new Blob([variantSource(text, base, key, url)], { type: 'text/javascript' }));
    return import(blob).finally(() => URL.revokeObjectURL(blob));
  }).catch((e) => { console.warn(`${key} on the edited numbers: ${e?.message || e}`); return import(base.href); }));
}

if (!PAGE) (await import('./index.mjs')).MG.forEach((m, k) => { MG[k] = m; });
