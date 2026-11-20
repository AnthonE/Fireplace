// A registry of client modules a page fetches as it needs them (a minigame's,
// a kit mode's): need(id) imports the module once and all[id] is it from then
// on, undefined until it arrives, so whoever reads the registry draws or
// plays without it for the frames in between. A fetch that fails is asked for
// again two seconds on.
//
// PAGE says the code runs in a browser, a window or a worker. Anywhere else
// (Node: the bot host, the tools, the tests) nothing may wait on a fetch, a
// bot's words being a function of its seed and the world, so there the
// registries fill themselves whole as they load (client/mg/load.mjs,
// client/am/load.mjs).
export const PAGE = typeof document !== 'undefined' || typeof WorkerGlobalScope !== 'undefined';

// load(id): the module's import(), or nothing for an id with no module.
// put(id, p): the module p resolves to in id's place, whatever was there or
// on its way (the studio's play: a minigame's module on the numbers being
// edited).
export function registry(load) {
  const all = [], pending = [];
  const take = (id, p, retry) => {
    const mine = p.then((m) => { if (pending[id] === mine) all[id] = m.default; }, (e) => {
      console.warn(String(e?.message || e));
      if (retry) setTimeout(() => { if (pending[id] === mine) pending[id] = undefined; }, 2000);
    });
    return (pending[id] = mine);
  };
  const need = (id) => {
    if (all[id] || pending[id]) return pending[id];
    const p = load(id);
    return p ? take(id, p, true) : undefined;
  };
  const put = (id, p) => { all[id] = undefined; return take(id, p, false); };
  return { all, need, put };
}
