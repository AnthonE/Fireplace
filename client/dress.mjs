// What a blocky rider wears besides its ball, hat and body (client/looks.mjs):
// a face on its head, a print on its shirt and something on its back. Drawing
// only, like a look: the relay carries each slot's dress word beside the looks
// (net/wire.mjs T_DRESS), never in a tick, record or hash. A round rider has
// no shirt or back to dress, so it wears none of it.
//
// The word: the face in the low six bits, the shirt's print in the next six,
// the back item in the next six; the rest is spare. 0 wears nothing of it, the
// head's own face and a plain shirt. Each list is append-only, as the looks'
// are: a piece's number is its place, and a number this build doesn't know is
// drawn as nothing.
//
// A piece is free, earned (`unlock`, an achievement's id), or bought (`price`,
// in marshmallows), never two of those, as a look is (looks.mjs isOpen), and a
// priced one is also an owned item on Elo Pros (client/shop.mjs). `variant` is
// the face or print the shader draws (rider.mjs PART.FACEWEAR, PART.PRINT);
// a back item is boxes, by its key (rider.mjs).
import { isOpen } from './looks.mjs';

const tag = (slot, list) => list.map((x) => ({ ...x, slot }));

export const FACES = tag('face', [
  { key: 'smile', name: 'SMILE' },
  { key: 'cool', name: 'COOL', variant: 0, price: 10 },
  { key: 'wink', name: 'WINK', variant: 1, price: 10 },
  { key: 'oh', name: 'SURPRISED', variant: 2, price: 15 },
  { key: 'cat', name: 'CAT', variant: 3, price: 25 },
  { key: 'stars', name: 'STAR EYES', variant: 4, price: 40 },
]);
export const SHIRTS = tag('shirt', [
  { key: 'plain', name: 'PLAIN' },
  { key: 'stripes', name: 'STRIPES', variant: 0, price: 10 },
  { key: 'check', name: 'CHECKS', variant: 4, price: 15 },
  { key: 'chevrons', name: 'CHEVRONS', variant: 3, price: 20 },
  { key: 'heart', name: 'HEART', variant: 2, price: 20 },
  { key: 'star', name: 'STAR', variant: 1, price: 30 },
  { key: 'flame', name: 'FLAME', variant: 5, unlock: 'onfire' },
]);
export const BACKS = tag('back', [
  { key: 'none', name: 'NOTHING' },
  { key: 'pack', name: 'BACKPACK', price: 20 },
  { key: 'cape', name: 'CAPE', price: 40 },
  { key: 'jet', name: 'JETPACK', price: 100 },
  { key: 'wings', name: 'WINGS', unlock: 'ace' },
]);
export const DRESS = { face: FACES, shirt: SHIRTS, back: BACKS };

export const packDress = (face = 0, shirt = 0, back = 0) => ((face & 63) | ((shirt & 63) << 6) | ((back & 63) << 12)) >>> 0;
const at = (list, w, k) => (list[(w >>> k) & 63] ? (w >>> k) & 63 : 0);
export const unpackDress = (w) => ({ face: at(FACES, w, 0), shirt: at(SHIRTS, w, 6), back: at(BACKS, w, 12) });
// the pieces a word names, and 0 for nothing worn
export const dressOf = (w) => { const d = unpackDress(w >>> 0); return { face: FACES[d.face], shirt: SHIRTS[d.shirt], back: BACKS[d.back] }; };

// a word with anything not open put back to nothing worn (looks.mjs wearable's counterpart)
export function wearableDress(w, got) {
  const d = unpackDress(w >>> 0);
  return packDress(isOpen(FACES[d.face], got) ? d.face : 0, isOpen(SHIRTS[d.shirt], got) ? d.shirt : 0, isOpen(BACKS[d.back], got) ? d.back : 0);
}

// ---- what this browser picked (localStorage, with the look)
const KEY = 'fireplace.dress';
export function savedDress() {
  try { const v = localStorage.getItem(KEY); return v === null ? 0 : Number(v) >>> 0; } catch { return 0; }
}
export function saveDress(w) {
  try { localStorage.setItem(KEY, String(w >>> 0)); } catch { /* private window: this visit only */ }
}
