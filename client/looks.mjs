// A player's look: a ball, a hat and a body, worn in every game the room plays. It is
// drawing only, never the sim: the relay carries each slot's look word beside
// the ticks (net/wire.mjs T_LOOK), so the hashed world is the same bits with or
// without them, and a room where nobody picked one looks as it always did.
// Ball 0, hat 0 and body 0 are the house look: the seat's own colours, no hat.
// Every game draws the player as one cartoon figure (client/figure.mjs) that
// wears it: party's rider on its ball, the arena's fighter, golf's golfer.
//
// The lists are append-only: a look's number is its place in its list, and
// that number is what goes on the wire. A number this build doesn't know (a
// newer client's) is drawn as the house look.
//
// A look with `unlock` is earned: it opens when that achievement does
// (client/achievements.mjs), kept in this browser like the achievements. A
// look with `price` is bought, for that many marshmallows out of the browser's
// purse (client/purse.mjs), and kept there. A look has one or neither, never
// both. The relay knows neither: the page wears only what it holds.

import * as L from '../src/layout.mjs';

// The ball's patterns, as party's renderer draws them (case 0)
export const PATTERN = { BEACH: 0, STRIPES: 1, RIBS: 2, SOLID: 3, METAL: 4, EIGHT: 5, DOTS: 6, CHECKER: 7, SWIRL: 8, DISCO: 9 };
// The hat's styles, as the figure wears them (client/figure.mjs fgHat); from
// the top hat on, a hat stands off the head, over the figure's usual height
export const STYLE = { CAP: 0, NONE: 1, BEANIE: 2, BAND: 3, HELMET: 4, CROWN: 5, PUMPKIN: 6, TOPHAT: 7, CONE: 8, HALO: 9, ANTLERS: 10, PHONES: 11, PROP: 12 };

// a: the ball's colour (null: the seat's), b: its second colour (null: the
// seat's other, as the beach ball's third panel has always been)
export const BALLS = [
  { key: 'house', name: 'HOUSE COLOURS', pattern: PATTERN.BEACH, a: null, b: null },
  { key: 'beach', name: 'BEACH BALL', pattern: PATTERN.BEACH, a: [0.95, 0.22, 0.18], b: [0.18, 0.42, 0.95] },
  { key: 'candy', name: 'CANDY', pattern: PATTERN.STRIPES, a: [1.0, 0.42, 0.62], b: [0.98, 0.95, 0.93] },
  { key: 'zebra', name: 'ZEBRA', pattern: PATTERN.STRIPES, a: [0.07, 0.07, 0.08], b: [0.95, 0.95, 0.92] },
  { key: 'melon', name: 'MELON', pattern: PATTERN.RIBS, a: [0.36, 0.76, 0.3], b: [0.1, 0.38, 0.14] },
  { key: 'pumpkin', name: 'PUMPKIN', pattern: PATTERN.RIBS, a: [1.0, 0.56, 0.12], b: [0.8, 0.36, 0.06] },
  { key: 'snow', name: 'SNOWBALL', pattern: PATTERN.SOLID, a: [0.9, 0.94, 1.0], b: [0.9, 0.94, 1.0] },
  { key: 'eight', name: 'EIGHT BALL', pattern: PATTERN.EIGHT, a: [0.06, 0.06, 0.07], b: [0.97, 0.97, 0.94], unlock: 'toasted' },
  { key: 'gold', name: 'GOLD', pattern: PATTERN.METAL, a: [1.0, 0.76, 0.22], b: [1.0, 0.76, 0.22], unlock: 'golden' },
  { key: 'mallow', name: 'MARSHMALLOW', pattern: PATTERN.STRIPES, a: [0.98, 0.95, 0.88], b: [0.78, 0.5, 0.24], unlock: 'campfire' },
  { key: 'swiss', name: 'SWISS CHEESE', pattern: PATTERN.SOLID, a: [1.0, 0.82, 0.3], b: [1.0, 0.82, 0.3], unlock: 'cheese' },
  { key: 'ember', name: 'EMBER', pattern: PATTERN.METAL, a: [1.0, 0.38, 0.1], b: [1.0, 0.38, 0.1], unlock: 'onfire' },
  { key: 'smore', name: "S'MORE", pattern: PATTERN.RIBS, a: [0.98, 0.95, 0.88], b: [0.42, 0.24, 0.12], unlock: 'bonfire' },
  { key: 'platinum', name: 'PLATINUM', pattern: PATTERN.METAL, a: [0.86, 0.88, 0.92], b: [0.86, 0.88, 0.92], unlock: 'house' },
  { key: 'bee', name: 'BUMBLEBEE', pattern: PATTERN.STRIPES, a: [1.0, 0.8, 0.12], b: [0.08, 0.07, 0.06], price: 5 },
  { key: 'soccer', name: 'SOCCER BALL', pattern: PATTERN.DOTS, a: [0.96, 0.96, 0.94], b: [0.07, 0.07, 0.09], price: 10 },
  { key: 'ladybird', name: 'LADYBIRD', pattern: PATTERN.DOTS, a: [0.9, 0.12, 0.1], b: [0.06, 0.05, 0.05], price: 15 },
  { key: 'checker', name: 'CHECKERS', pattern: PATTERN.CHECKER, a: [0.95, 0.95, 0.92], b: [0.08, 0.08, 0.1], price: 20 },
  { key: 'mint', name: 'PEPPERMINT', pattern: PATTERN.SWIRL, a: [0.97, 0.96, 0.94], b: [0.88, 0.1, 0.16], price: 35 },
  { key: 'disco', name: 'DISCO BALL', pattern: PATTERN.DISCO, a: [0.8, 0.84, 0.95], b: [0.55, 0.4, 0.95], price: 100 },
];

// color: the hat's (null: the ball's colour, as the cap has always been)
export const HATS = [
  { key: 'cap', name: 'CAP', style: STYLE.CAP, color: null },
  { key: 'beanie', name: 'BEANIE', style: STYLE.BEANIE, color: [0.86, 0.18, 0.2] },
  { key: 'band', name: 'HEADBAND', style: STYLE.BAND, color: [0.2, 0.36, 0.88] },
  { key: 'helmet', name: 'HELMET', style: STYLE.HELMET, color: [0.95, 0.95, 0.97] },
  { key: 'none', name: 'NO HAT', style: STYLE.NONE, color: null },
  { key: 'pumpkin', name: 'PUMPKIN HEAD', style: STYLE.PUMPKIN, color: [1.0, 0.56, 0.12], unlock: 'chair' },
  { key: 'crown', name: 'CROWN', style: STYLE.CROWN, color: [1.0, 0.8, 0.22], unlock: 'roll' },
  { key: 'pilot', name: 'FLIGHT HELMET', style: STYLE.HELMET, color: [0.4, 0.46, 0.3], unlock: 'ace' },
  { key: 'cone', name: 'PARTY HAT', style: STYLE.CONE, color: [0.95, 0.25, 0.6], price: 10 },
  { key: 'phones', name: 'HEADPHONES', style: STYLE.PHONES, color: [0.15, 0.7, 0.95], price: 15 },
  { key: 'tophat', name: 'TOP HAT', style: STYLE.TOPHAT, color: [0.1, 0.1, 0.13], price: 25 },
  { key: 'antlers', name: 'ANTLERS', style: STYLE.ANTLERS, color: [0.62, 0.42, 0.24], price: 30 },
  { key: 'prop', name: 'PROPELLER CAP', style: STYLE.PROP, color: [0.9, 0.2, 0.18], price: 45 },
  { key: 'halo', name: 'HALO', style: STYLE.HALO, color: [1.0, 0.86, 0.3], price: 75 },
];
// what a hat wears beside its own colour: a top hat's band, a party hat's
// stripes and a propeller cap's other panels and blade (the cards'
// client/figure.mjs drawLook; the figure's WGSL has its own copies)
export const TRIM = { BAND: [0.78, 0.1, 0.14], CREAM: [0.98, 0.95, 0.7], BLUE: [0.2, 0.42, 0.92], YELLOW: [1.0, 0.82, 0.2] };

// The figure's body (client/figure.mjs): its skin, and its face, 1 a person's
// or 4 a robot's (a box for a head, a visor, metal all over). The keys are as
// they were when party's riders were spheres (round) or boxes (the rest): a
// look's number never changes, and every body is the figure now.
// on its head (rider.mjs PART). Its shirt is the ball's colour, its legs the
// second colour's, darker.
export const BODIES = [
  { key: 'round', name: 'TAN', skin: [0.88, 0.64, 0.46], face: 1 },
  { key: 'blocky', name: 'YELLOW', skin: [0.96, 0.8, 0.22], face: 1 },
  { key: 'peach', name: 'PEACH', skin: [1.0, 0.8, 0.66], face: 1 },
  { key: 'cocoa', name: 'COCOA', skin: [0.55, 0.36, 0.24], face: 1 },
  { key: 'robot', name: 'ROBOT', skin: [0.62, 0.66, 0.72], face: 4 },
  { key: 'goldbot', name: 'GOLD ROBOT', skin: [1.0, 0.66, 0.08], face: 4, price: 150 },
];

// a look's id in a purse (client/purse.mjs): its list and its key, which never change
export const lookId = (x) => `${x.slot ?? (x.pattern !== undefined ? 'ball' : x.style !== undefined ? 'hat' : 'body')}:${x.key}`;

// what a card calls one: THE EIGHT BALL, THE CANDY BALL, THE CROWN
export const lookName = (x) => `THE ${x.pattern === undefined || /BALL$/.test(x.name) ? x.name : `${x.name} BALL`}`;

// A slot's name, as the relay sent it (net/wire.mjs T_NAMES) into the client's
// CL_NAMES: '' for a guest, who goes by P1, P2, ... Drawing only, like a look.
export function writeName(u8, p, name) {
  const at = L.CL_NAMES + p * L.NAME_BYTES;
  u8.fill(0, at, at + L.NAME_BYTES);
  u8.set(new TextEncoder().encode(name).subarray(0, L.NAME_BYTES), at);
}
export function nameAt(u8, p) {
  const at = L.CL_NAMES + p * L.NAME_BYTES;
  let n = 0;
  while (n < L.NAME_BYTES && u8[at + n]) n++;
  return n ? String.fromCharCode(...u8.subarray(at, at + n)) : '';
}
// what a label calls slot p: its name, or P<n>
export const slotLabel = (u8, p) => nameAt(u8, p) || `P${p + 1}`;

// The look word: the ball in the low byte, the hat in the next, the body in the third. 0 is the house look.
export const packLook = (ball, hat, body = 0) => ((ball & 255) | ((hat & 255) << 8) | ((body & 255) << 16)) >>> 0;
const byte = (list, w, k) => (list[(w >>> k) & 255] ? (w >>> k) & 255 : 0);
export const unpackLook = (w) => ({ ball: byte(BALLS, w, 0), hat: byte(HATS, w, 8), body: byte(BODIES, w, 16) });

// The seat's colour, as the balls have always been drawn
export const slotColor = (s) => { const h = (s * 0.618034) % 1; return [0, 0.33, 0.67].map((o) => 0.55 + 0.4 * Math.cos(6.2832 * (h + o))); };
// three 0..1 channels as one integer under 2^24, exact in an f32
export const rgb24 = (c) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);

// What a slot in look w draws as: the ball's colour (the body's too), its
// second colour, the pattern, the hat's colour and style.
export function lookOf(slot, w = 0, seat = slotColor) {
  const { ball, hat, body } = unpackLook(w);
  const B = BALLS[ball], Hh = HATS[hat];
  const a = B.a || seat(slot);
  return { ball, hat, body, a, b: B.b || seat(slot + 0.5), pattern: B.pattern, hatColor: Hh.color || a, style: Hh.style };
}

// A ball's sprite fields (client/party-render.mjs SPRITE.BALL): color[3] is 1
// for the house look (beach panels, the seat's colours from the seed), else
// 2 + the pattern, and the seed its second colour, rgb24. Its rider is the
// figure (client/rider.mjs).
export function ballSprite(slot, w = 0) {
  const L = lookOf(slot, w);
  return unpackLook(w).ball ? { color: [...L.a, 2 + L.pattern], seed: rgb24(L.b) } : { color: [...L.a, 1], seed: slot };
}

// For renderers that tint a whole player one colour (golf, the arena): the
// ball's colour with bit 24 set, or 0 for the house look (the seat's colour).
export const tint = (w) => { const { ball } = unpackLook(w); return ball ? (rgb24(BALLS[ball].a) | 0x1000000) >>> 0 : 0; };
// every slot's, from a host (client/host.mjs look), into one array kept per host
const TINTS = new WeakMap();
export function tintsOf(h) {
  let t = TINTS.get(h);
  if (!t) TINTS.set(h, (t = new Uint32Array(256)));
  for (let p = 0; p < 256; p++) t[p] = tint(h.look(p));
  return t;
}

// every slot's look word, for the arena's figures (client/arena-render.mjs: the body's skin and face), kept per host
const LOOKS = new WeakMap();
export function looksOf(h) {
  let t = LOOKS.get(h);
  if (!t) LOOKS.set(h, (t = new Uint32Array(256)));
  for (let p = 0; p < 256; p++) t[p] = h.look(p);
  return t;
}
// every slot's Elo Pros avatar (client/avatar.mjs), the same way
const AVATARS = new WeakMap();
export function avatarsOf(h) {
  let t = AVATARS.get(h);
  if (!t) AVATARS.set(h, (t = new Uint32Array(256)));
  for (let p = 0; p < 256; p++) t[p] = h.avatar ? h.avatar(p) : 0;
  return t;
}

// ---- what this browser picked, and what it has earned (localStorage, like the room's theme)
const KEY = 'fireplace.look';
// what a browser that never picked wears: the house colours on the yellow body, as Elo Pros' default avatar is
export const FIRST_LOOK = packLook(0, 0, 1);
export function savedLook() {
  try { const v = localStorage.getItem(KEY); return v === null ? FIRST_LOOK : Number(v) >>> 0; } catch { return FIRST_LOOK; }
}
// An AI player's look in a local room (client/local.mjs): any free ball, hat
// and body but the house one (none earned, none bought), picked from its slot
// so it keeps it all game.
export function guestLook(p) {
  const open = (list) => list.map((x, k) => (x.unlock || x.price ? -1 : k)).filter((k) => k >= 0);
  const h = Math.imul(p + 1, 0x9e3779b1) >>> 0;
  const balls = open(BALLS), hats = open(HATS), bodies = open(BODIES).filter((k) => k > 0);
  return packLook(balls[h % balls.length], hats[(h >>> 8) % hats.length], bodies[(h >>> 16) % bodies.length]);
}
export function saveLook(w) {
  try { localStorage.setItem(KEY, String(w >>> 0)); } catch { /* private window: this visit only */ }
}
// open: a free look, one whose achievement is in `got`, or a priced one whose
// id is (a Set of what this browser holds: purse.mjs openSet)
export const isOpen = (look, got) => (look.price ? got.has(lookId(look)) : !look.unlock || got.has(look.unlock));
// the next open entry after k in list, wrapping
export function nextOpen(list, k, got) {
  for (let i = 1; i <= list.length; i++) { const j = (k + i) % list.length; if (isOpen(list[j], got)) return j; }
  return 0;
}
// a word with anything not open put back to the house look
export function wearable(w, got) {
  const { ball, hat, body } = unpackLook(w);
  return packLook(isOpen(BALLS[ball], got) ? ball : 0, isOpen(HATS[hat], got) ? hat : 0, isOpen(BODIES[body], got) ? body : 0);
}

// A picture of a look, for the TV's cards and the wardrobe: client/figure.mjs drawLook.
