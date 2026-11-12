// The purse: marshmallows as money. A browser's tally (client/achievements.mjs)
// counts every marshmallow its player ever won, and that total only grows:
// the achievements and Elo Pros' board read it. What a player bought is kept
// beside it, in this browser like the tally: what was spent and what it
// bought, by a look's id (client/looks.mjs lookId). The balance is the one
// less the other, so buying never touches the tally. Pure functions over the
// two; only loadPurse and savePurse reach for storage, and a browser with
// none keeps a purse for the visit.
//
// The room's relay knows nothing of it: a look is a number beside the sim,
// and a page is trusted to wear only what it holds, as it is for a look an
// achievement opens.

export const emptyPurse = () => ({ v: 1, spent: 0, owned: {} });

// what is left to spend: never under 0, whatever the two hold (a tally
// cleared without its purse)
export const balance = (tally, purse) => Math.max(0, (tally.mallows | 0) - purse.spent);
export const owns = (purse, id) => Object.hasOwn(purse.owned, id);

// The purse after buying id for price: { purse, ok, short }. Owned already
// costs nothing; a price the balance doesn't reach buys nothing, and short is
// how many more it takes. The purse passed in is never changed.
export function buy(tally, purse, id, price, now = Date.now()) {
  if (owns(purse, id)) return { purse, ok: true, short: 0 };
  if (!Number.isSafeInteger(price) || price <= 0) return { purse, ok: false, short: 0 };
  const short = price - balance(tally, purse);
  if (short > 0) return { purse, ok: false, short };
  return { purse: { ...purse, spent: purse.spent + price, owned: { ...purse.owned, [id]: Math.floor(now / 1000) } }, ok: true, short: 0 };
}

// everything this browser holds, as one Set for looks.mjs isOpen: the
// achievements' ids and the bought looks' (an id of the purse's has a colon,
// an achievement's never)
export const openSet = (tally, purse) => new Set([...Object.keys(tally.got), ...Object.keys(purse.owned)]);

const KEY = 'fireplace.purse';
// the browser's own storage, or null where reading it throws (a sandboxed frame) or there is none
const browser = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function loadPurse(store = browser()) {
  try {
    const p = JSON.parse(store.getItem(KEY) || 'null');
    if (p && p.v === 1 && Number.isSafeInteger(p.spent) && p.spent >= 0 && p.owned && typeof p.owned === 'object' && !Array.isArray(p.owned)) return { v: 1, spent: p.spent, owned: { ...p.owned } };
  } catch { /* none, or not readable */ }
  return emptyPurse();
}
// the purse as storage holds it now (another tab may have bought since this
// one read it), or the one in hand where there is nothing kept
export function freshPurse(purse, store = browser()) {
  try { if (store.getItem(KEY) !== null) return loadPurse(store); } catch { /* no storage: the one in hand */ }
  return purse;
}
// true if it was kept
export function savePurse(purse, store = browser()) {
  try { store.setItem(KEY, JSON.stringify(purse)); return true; } catch { return false; /* private window: this visit only */ }
}
