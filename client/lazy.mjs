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
export function registry(load) {
  const all = [], pending = [];
  const need = (id) => {
    if (all[id] || pending[id]) return pending[id];
    const p = load(id);
    if (!p) return undefined;
    pending[id] = p.then((m) => { all[id] = m.default; }, (e) => {
      console.warn(String(e?.message || e));
      setTimeout(() => { pending[id] = undefined; }, 2000);
    });
    return pending[id];
  };
  return { all, need };
}
