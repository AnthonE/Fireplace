// A rider on a ball, as party's frontend draws it: the cartoon figure every
// game draws its players as (client/figure.mjs), standing on its ball and
// walking it along, its legs stepping as it rolls, its arms swinging against
// them and going up as it flies, thrown back when its ball is hit, acting out
// an emote. Its body (the look's third byte, client/looks.mjs BODIES), its
// Elo Pros avatar and its dress dress it as they dress the arena's fighter and
// golf's golfer. Drawing only, like the rest of a look.
//
// A rider is one sprite of kind FIGURE: the sprite's square covers it and each
// pixel marches its ray through the figure (figureRay), the figure's record
// (`fig`: where its feet are, its pose and its kit) in a buffer of its own.
import { figureKit, RIDE } from './figure.mjs';

export { BLOCK } from './block.mjs';
export const FIGURE = 13; // the sprite kind in party's renderer

// Emotes: the look word's top byte, its low four bits the emote and its high
// four a count, so the same emote twice is a new word (the relay passes a
// changed word on, client/net.mjs). Acted out for EMOTE_S from when a page
// first sees the word change. Keys 1 to 4 in party.
export const EMOTE = { WAVE: 1, CHEER: 2, DANCE: 3, SPIN: 4 };
export const EMOTE_KEYS = { Digit1: EMOTE.WAVE, Digit2: EMOTE.CHEER, Digit3: EMOTE.DANCE, Digit4: EMOTE.SPIN };
export const EMOTE_S = 2.5;
// look word w with emote k put on (its count one on)
export const withEmote = (w, k) => (((w & 0xffffff) | (((((w >>> 28) + 1) & 15) << 4 | (k & 15)) << 24)) >>> 0);
// What slot p is acting out at now (ms), as the word w shows it: { id, t } or
// null. seen is the frontend's own Map, slot -> [the top byte, when it changed].
export function emoteOf(seen, p, w, now) {
  const top = w >>> 24;
  const was = seen.get(p);
  if (!was || was[0] !== top) seen.set(p, [top, was ? now : -1e9]); // a word there before this page looked is old news
  const [, at] = seen.get(p);
  const id = top & 15;
  return id && now - at < EMOTE_S * 1000 ? { id, t: (now - at) / 1000 } : null;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const COLOURS = ['skin', 'hair', 'torso', 'larm', 'rarm', 'lleg', 'rleg', 'eye', 'hatc'];
// a kit turned to stone: each colour a grey as light as it was (Red Light's caught)
const stone = (k) => ({ ...k, ...Object.fromEntries(COLOURS.map((c) => { const l = 0.3 + 0.35 * (0.3 * k[c][0] + 0.59 * k[c][1] + 0.11 * k[c][2]); return [c, [l, l, l * 1.06]]; })) });

// Push a rider's sprite onto out (a renderer's solid list). at is the top of
// its ball, face its heading (radians: the front toward (cos, 0, sin)), roll
// how far the ball has turned (radians: the legs step with it), speed its
// speed over the ground and vy its climb (m/s, the arms go up in the air), bob
// a little lift as it rolls, emote what it is acting out ({ id, t }: EMOTES,
// seconds in) or null, jolt how hard its ball was just hit (0..1: thrown back,
// arms out; client/juice.mjs), avatar the player's Elo Pros avatar word
// (client/avatar.mjs) or 0, dress its dress word (client/dress.mjs) or 0, grey
// true for one turned to stone.
export function rider(out, slot, w, { at, face, roll = 0, speed = 0, vy = 0, bob = 0, emote = null, jolt = 0, avatar = 0, dress = 0, grey = false }) {
  const e = emote && emote.t < EMOTE_S ? emote : null;
  const et = e ? e.t : 0, ek = e ? e.id : 0;
  // what an emote does to the whole rider: a hop, a sway, a turn
  if (ek === EMOTE.CHEER) bob += 0.14 * Math.abs(Math.sin(et * 7));
  if (ek === EMOTE.DANCE) { bob += 0.05 * Math.abs(Math.sin(et * 9)); face += 0.45 * Math.sin(et * 4.5); }
  if (ek === EMOTE.SPIN) face += Math.min(1, et / 1.6) * Math.PI * 4;
  bob += 0.12 * jolt;
  const stride = clamp01(speed / 6);
  const kit = grey ? stone(figureKit(slot, w, avatar, dress)) : figureKit(slot, w, avatar, dress);
  // a standing hat or wings reach over its usual height: a taller square
  const tall = kit.hat > 5 || kit.back === 4;
  const feet = [at[0], at[1] + bob, at[2]];
  out.push({
    pos: [feet[0], feet[1] + (tall ? 1.1 : 0.95) * RIDE, feet[2]], size: (tall ? 1.65 : 1.5) * RIDE, color: [1, 1, 1, 1], kind: FIGURE, minpx: 1,
    fig: {
      feet, scale: RIDE,
      // its heading, its aim (level), and its legs: walking the ball as it rolls, or stepping in place to a dance
      pose: [face, 0, ek === EMOTE.DANCE ? et * 9 : roll * 1.6, ek === EMOTE.DANCE ? 0.45 : stride],
      act: ek, actT: et, air: e ? 0 : clamp01((Math.abs(vy) - 4) / 4), jolt,
      // leaning into its speed, thrown back by a hit
      lean: 0.1 * stride - 0.35 * jolt,
      kit,
    },
  });
}
