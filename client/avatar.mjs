// A player's Elo Pros avatar: the blocky figure they picked on their profile,
// one 32-bit word (scry-forge's meter/faces.py `avatar`, docs/client/GAMEDEV.md
// there): six parts at 5 bits each, an index into PALETTE (head bits 0-4,
// torso 5-9, left arm 10-14, right arm 15-19, left leg 20-24, right leg
// 25-29), bit 30 a robot's face, bit 31 set on every avatar, so 0 is none.
// The relay reads it off the player's face when they sign in and sends it
// beside the looks (net/wire.mjs T_AVATAR, CL_AVATARS). Drawing only: a blocky
// rider or fighter wears its colours in place of the look's skin, shirt and
// legs; the hat and the ball stay the look's.

// sRGB, by index: the profile editor's palette, in the same order
export const PALETTE_HEX = [
  '#f5cd30', '#ffd9b3', '#e0ac85', '#b07a55', '#7a4e31', '#4a2e1d', '#ffffff', '#c7c9cc',
  '#8a8d91', '#4d5054', '#1c1d21', '#d7332b', '#8e1f1b', '#f07a2e', '#ffc82e', '#f2e6b8',
  '#7fd13b', '#3c9a47', '#1f5c33', '#2ec4b6', '#7cc6f2', '#2f6fd6', '#1f2f6b', '#6a4bc4',
  '#b48af0', '#e05ab8', '#ff9fc8', '#8b5a2b', '#c2b280', '#5e6b3a', '#9aa7b0', '#3a2a4d',
];
export const PALETTE = PALETTE_HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
export const PARTS = ['head', 'torso', 'larm', 'rarm', 'lleg', 'rleg'];
export const SET = 0x80000000;
export const ROBOT = 0x40000000;
// what Elo Pros calls the default: yellow head and arms, a blue torso, green legs, a smile
export const DEFAULT = (SET | (21 << 5) | (17 << 20) | (17 << 25)) >>> 0;

export const isAvatar = (w) => (w >>> 31) === 1;
export const part = (w, k) => (w >>> (5 * k)) & 31;
export const pack = (parts, robot = false) => (parts.reduce((w, c, k) => w | ((c & 31) << (5 * k)), SET | (robot ? ROBOT : 0)) >>> 0);

// an avatar's colours (0..1 sRGB) by part, and its face; null for none
export function colorsOf(w) {
  if (!isAvatar(w >>> 0)) return null;
  const out = { robot: (w & ROBOT) !== 0 };
  PARTS.forEach((k, i) => { out[k] = PALETTE[part(w, i)]; });
  return out;
}

// An AI player's avatar in a local room (client/local.mjs): a shirt and
// trousers of its own on one of the palette's skins, picked from its slot.
const SKINS = [0, 1, 2, 3, 4, 5];
export function guestAvatar(p) {
  const h = Math.imul(p + 7, 0x85ebca6b) >>> 0;
  const skin = SKINS[h % SKINS.length], shirt = (h >>> 4) % 32, legs = (h >>> 9) % 32;
  return pack([skin, shirt, skin, skin, legs, legs], ((h >>> 14) & 15) === 0);
}
