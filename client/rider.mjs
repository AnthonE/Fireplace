// A rider on a ball, as party's frontend draws it: the round one
// (a body and a head, two spheres, as the riders have always been) or a blocky
// one, a figure of boxes standing on the ball and walking it along: legs that
// step as it rolls, arms that swing against them and go up when it flies, a
// head with a face, a hat of boxes. Its body is the look's third byte
// (client/looks.mjs BODIES). Drawing only, like the rest of a look.
//
// A box is a sprite of kind BLOCK: the sprite's square covers the box's
// bounding sphere and each pixel casts its own ray at the box (blockAt below),
// so a box costs one quad and is exact at any size, with a bevel and an ink
// line on its edges like party's solids. Its fields: pos the centre, size the
// bounding radius, vel the half sizes (across, up, front), roll its yaw (the
// front toward (cos, 0, sin)), seed its pitch (turned about its across axis,
// a hanging limb's foot going forward), color.a its part (PART) plus 16 times
// its splay, turned about its front first (a twentieth of a radian a step,
// 64 none: a hanging arm's hand going out to its right).
import { lookOf, unpackLook, riderSprites, BODIES, STYLE } from './looks.mjs';
import { colorsOf } from './avatar.mjs';

export const BLOCK = 12; // the sprite kind, the same in both renderers
// what a box's faces show: 0 plain plastic, 1 a head's face, 2 a pumpkin's lit face and ribs, 3 metal, 4 a robot's face
export const PART = { PLAIN: 0, FACE: 1, PUMPKIN: 2, METAL: 3, ROBOT: 4 };

// A box's pixel, in WGSL any renderer can declare (the arena's fighters too):
// blockRay casts a ray from e along unit d at a box, fwd the camera's forward
// axis and focal its focal length (px), for the view depth z and a pixel's
// width there. n is the world normal, bent over the bevel; cover is the
// edge's coverage where the face beyond it turns away (the silhouette, for
// alpha to coverage); ink darkens every edge; glow is light of its own (a
// pumpkin's grin, a robot's eyes).
export const BLOCK_RAY_WGSL = /* wgsl */ `
struct Block { hit: bool, t: f32, z: f32, p: vec3f, n: vec3f, alb: vec3f, cover: f32, ink: f32, glow: vec3f, shine: f32 };
fn blockRay(e: vec3f, d: vec3f, fwd: vec3f, focal: f32, ctr: vec3f, h: vec3f, yaw: f32, pitch: f32, code: u32, c: vec3f) -> Block {
  var b: Block;
  b.hit = false;
  let part = code & 15u;
  let splay = (f32(code >> 4u) - 64.0) * 0.05;
  let f0 = vec3f(cos(yaw), 0.0, sin(yaw));
  let a0 = vec3f(-f0.z, 0.0, f0.x);
  let up = vec3f(0.0, cos(pitch), 0.0) - f0 * sin(pitch);
  let ax = a0 * cos(splay) + up * sin(splay);                // across
  let ay = up * cos(splay) - a0 * sin(splay);                // up, tipped and splayed
  let az = f0 * cos(pitch) + vec3f(0.0, sin(pitch), 0.0);     // the front
  let o = e - ctr;
  let ol = vec3f(dot(o, ax), dot(o, ay), dot(o, az));
  let dl = vec3f(dot(d, ax), dot(d, ay), dot(d, az));
  let inv = 1.0 / select(dl, vec3f(1e-6), abs(dl) < vec3f(1e-6));
  let t1 = (-h - ol) * inv;
  let t2 = (h - ol) * inv;
  let tn = min(t1, t2);
  let tf = max(t1, t2);
  let tin = max(max(tn.x, tn.y), tn.z);
  let tout = min(min(tf.x, tf.y), tf.z);
  if (tin > tout || tin <= 0.0) { return b; }
  b.hit = true;
  b.t = tin;
  b.z = tin * dot(d, fwd);
  b.p = e + d * tin;
  var nl = vec3f(0.0, 0.0, -sign(dl.z));
  if (tin == tn.x) { nl = vec3f(-sign(dl.x), 0.0, 0.0); } else if (tin == tn.y) { nl = vec3f(0.0, -sign(dl.y), 0.0); }
  let q = ol + dl * tin;
  let pw = b.z / focal;                                      // a pixel, in metres there
  let bw = min(0.03, min(min(h.x, h.y), h.z) * 0.3);          // the bevel
  b.cover = 1.0;
  b.ink = 1.0;
  var bent = nl;
  for (var i = 0; i < 3; i++) {
    if (nl[i] != 0.0) { continue; }
    let e = h[i] - abs(q[i]);
    let s = sign(q[i]);
    if (dl[i] * s > 0.0) { b.cover = min(b.cover, clamp(e / pw + 0.5, 0.0, 1.0)); } // the face over this edge turns away
    b.ink = min(b.ink, mix(0.45, 1.0, smoothstep(pw * 0.4, pw * 1.6, e)));
    var tilt = vec3f(0.0);
    tilt[i] = s;
    bent += tilt * (1.0 - smoothstep(0.0, bw, e)) * 0.8;
  }
  b.n = normalize(ax * bent.x + ay * bent.y + az * bent.z);
  b.alb = c;
  b.glow = vec3f(0.0);
  b.shine = 1.0;
  let front = nl.z > 0.5;
  let fu = q.x / h.x;
  let fv = q.y / h.y;
  switch part {
    case 1u: { // a face: two eyes and a smile
      if (front) {
        let ex = vec2f(abs(fu) - 0.36, fv - 0.15) / vec2f(0.11, 0.2);
        let sm = length(vec2f(fu, (fv - 0.1) * 1.15));
        if (dot(ex, ex) < 1.0 || (abs(sm - 0.5) < 0.075 && fv < -0.05 && abs(fu) < 0.48)) { b.alb = vec3f(0.02); }
      }
    }
    case 2u: { // a pumpkin: ribs round it, and a face lit from inside
      let along = select(q.z / h.z, fu, abs(nl.z) > 0.5);
      if (abs(nl.y) < 0.5) { b.alb = c * (0.72 + 0.28 * abs(cos(along * 3.1416 * 1.5))); }
      if (front) {
        let eye = abs(abs(fu) - 0.38) + abs(fv - 0.22) < 0.17 && fv < 0.3;
        let grin = fv < -0.2 && fv > -0.55 + 0.25 * abs(fu) * abs(fu) && abs(fu) < 0.6 && !(fract(fu * 2.5 + 0.25) < 0.22 && fv > -0.3);
        if (eye || grin) { b.alb = vec3f(0.0); b.glow = vec3f(1.6, 0.9, 0.25); }
      }
    }
    case 3u: { b.shine = 2.5; } // metal
    case 4u: { // a robot's face: two lit eyes, a grille
      b.shine = 2.0;
      if (front) {
        let ey = abs(abs(fu) - 0.36) < 0.16 && abs(fv - 0.18) < 0.1;
        if (ey) { b.alb = vec3f(0.0); b.glow = vec3f(0.3, 1.6, 1.8); }
        if (fv < -0.3 && fv > -0.6 && abs(fu) < 0.45) { b.alb = c * select(0.35, 0.8, fract(fu * 5.0) < 0.5); }
      }
    }
    default: {}
  }
  return b;
}
`;
// The same for party's sprites, from the pixel px and the
// renderer's own camera (u.cam, u.fwd, u.right, u.up, u.screen).
export const BLOCK_WGSL = BLOCK_RAY_WGSL + /* wgsl */ `
fn blockAt(px: vec2f, ctr: vec3f, h: vec3f, yaw: f32, pitch: f32, code: u32, c: vec3f) -> Block {
  let d = normalize(u.fwd.xyz * u.cam.w + u.right.xyz * (px.x - u.screen.x * 0.5) + u.up.xyz * (u.screen.y * 0.5 - px.y));
  return blockRay(u.cam.xyz, d, u.fwd.xyz, u.cam.w, ctr, h, yaw, pitch, code, c);
}
`;

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

const PEACH = [1.0, 0.8, 0.66];
const madd = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k, a[2] + v[2] * k];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const scale = (c, k) => c.map((v) => v * k);
// an angle as the same turn within half a turn of 0 (a splay's code holds only that)
const turnHalf = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// Push a rider's sprites onto out (a renderer's solid list). at is the top of
// its ball, face its heading (radians: the front toward (cos, 0, sin)), roll
// how far the ball has turned (radians: the legs step with it), speed its
// speed over the ground and vy its climb (m/s, the arms go up in the air), bob
// a little lift as it rolls, emote what it is acting out ({ id, t }: EMOTES,
// seconds in) or null, jolt how hard its ball was just hit (0..1: thrown back,
// arms out; client/juice.mjs), avatar the player's Elo Pros avatar word
// (client/avatar.mjs: a blocky rider wears its colours and face) or 0.
export function rider(out, slot, w, { at, face, roll = 0, speed = 0, vy = 0, bob = 0, emote = null, jolt = 0, avatar = 0 }) {
  const { body } = unpackLook(w);
  const B = BODIES[body];
  const e = emote && emote.t < EMOTE_S ? emote : null;
  const et = e ? e.t : 0, ek = e ? e.id : 0;
  // what an emote does to the whole rider: a hop, a turn
  if (ek === EMOTE.CHEER) bob += 0.14 * Math.abs(Math.sin(et * 7));
  if (ek === EMOTE.DANCE) { bob += 0.05 * Math.abs(Math.sin(et * 9)); face += 0.45 * Math.sin(et * 4.5); }
  if (ek === EMOTE.SPIN) face += Math.min(1, et / 1.6) * Math.PI * 4;
  bob += 0.12 * jolt;
  if (!B.blocky) {
    const rs = riderSprites(slot, w);
    out.push({ pos: [at[0], at[1] + 0.22 + bob, at[2]], size: 0.34, color: rs.body.color, kind: 1, minpx: 1 });
    out.push({ pos: [at[0], at[1] + 0.78 + bob, at[2]], size: 0.3, color: rs.head.color, kind: 8, minpx: 1, vel: [Math.cos(face), 0, Math.sin(face)] });
    return;
  }
  const L = lookOf(slot, w);
  const f = [Math.cos(face), 0, Math.sin(face)];
  const side = [-f[2], 0, f[0]];
  const up = [0, 1, 0];
  const box = (ctr, h, color, part = 0, pitch = 0, splay = 0) => out.push({ pos: ctr, size: Math.hypot(h[0], h[1], h[2]), color: [color[0], color[1], color[2], part + 16 * (Math.round(turnHalf(splay) / 0.05) + 64)], kind: BLOCK, minpx: 0.5, vel: h, roll: face, seed: pitch });
  // a limb hung from its pivot, hang metres down to its centre, swung by pitch and splayed (blockAt's frame)
  const limb = (pivot, h, hang, [pitch, splay], color, part = 0) => {
    const u0 = [-f[0] * Math.sin(pitch), Math.cos(pitch), -f[2] * Math.sin(pitch)];
    const ay = [u0[0] * Math.cos(splay) - side[0] * Math.sin(splay), u0[1] * Math.cos(splay), u0[2] * Math.cos(splay) - side[2] * Math.sin(splay)];
    box(madd(pivot, ay, -hang), h, color, part, pitch, splay);
  };
  const stride = clamp01(speed / 6);
  const step = Math.sin(roll * 1.6) * 0.8 * stride;
  const air = e ? 0 : clamp01((Math.abs(vy) - 4) / 4);
  const wave = Math.sin(roll * 3 + slot) * 0.25 * air;
  // an arm's [pitch, splay] on side k (-1 its left, 1 its right): stepping, up and out in the air, or the emote's
  const arm = (k) => {
    if (ek === EMOTE.WAVE) return k > 0 ? [0.25, 2.55 + 0.4 * Math.sin(et * 12)] : [0, -0.08];
    if (ek === EMOTE.CHEER) return [0.25, k * (2.6 + 0.2 * Math.sin(et * 14 + k))];
    if (ek === EMOTE.DANCE) return [0.35, k * (0.5 + 1.6 * (0.5 + 0.5 * Math.sin(et * 9 + (k > 0 ? 0 : Math.PI))))];
    if (ek === EMOTE.SPIN) return [0, k * 1.55];
    return [-step * k * (1 - air) + 0.3 * air, k * (0.06 + (2.3 + wave) * air)];
  };
  const leg = (k) => (ek === EMOTE.DANCE ? [0.4 * Math.sin(et * 9) * k, k * 0.12] : [step * k, 0]);
  const y0 = at[1] + bob;
  const base = [at[0], y0, at[2]];
  const A = colorsOf(avatar);
  const skin = B.skin || PEACH, shirt = A ? A.torso : L.a, pants = scale(L.b, 0.62);
  const skinPart = B.metal && !A ? PART.METAL : PART.PLAIN;
  // a part's colour: the avatar's, else the look's
  const legC = (k) => (A ? (k > 0 ? A.rleg : A.lleg) : pants);
  const armC = (k) => (A ? (k > 0 ? A.rarm : A.larm) : skin);
  // legs from the hips, stepping
  for (const k of [-1, 1]) limb(madd(madd(base, up, 0.5), side, 0.125 * k), [0.12, 0.25, 0.12], 0.25, leg(k), legC(k));
  // the torso, leaning into its speed
  box(madd(madd(base, up, 0.75), f, 0.03 * stride - 0.06 * jolt), [0.25, 0.25, 0.125], shirt, 0, 0.1 * stride - 0.35 * jolt);
  // arms from the shoulders, against the legs, up in the air
  for (const k of [-1, 1]) {
    const [pitch, splay] = arm(k);
    limb(madd(madd(base, up, 0.92), side, 0.375 * k), [0.12, 0.25, 0.12], 0.17, [pitch - 0.6 * jolt, splay + k * 1.5 * jolt], armC(k), skinPart);
  }
  // the head, a size up on the rest (as such figures have it), and its hat
  const hs = 1.15;
  const hc = madd(base, up, 1.01 + 0.15 * hs);
  const st = L.style;
  const pumpkin = st === STYLE.PUMPKIN;
  box(hc, [0.16 * hs, 0.15 * hs, 0.15 * hs], pumpkin ? L.hatColor : A ? A.head : skin, pumpkin ? PART.PUMPKIN : A ? (A.robot ? PART.ROBOT : PART.FACE) : B.face);
  const at3 = (u, fw, a = 0) => madd(madd(madd(hc, up, u * hs), f, fw * hs), side, a * hs);
  const hat3 = (ctr, h, color, part) => box(ctr, h.map((v) => v * hs), color, part);
  const hcol = L.hatColor;
  if (st === STYLE.CAP) {
    hat3(at3(0.12, 0), [0.17, 0.05, 0.16], hcol);
    hat3(at3(0.085, 0.22), [0.15, 0.015, 0.07], scale(hcol, 0.85));
  } else if (st === STYLE.BEANIE) {
    hat3(at3(0.14, 0), [0.175, 0.075, 0.165], hcol);
    hat3(at3(0.08, 0), [0.18, 0.025, 0.17], scale(hcol, 0.7));
    hat3(at3(0.24, 0), [0.04, 0.03, 0.04], scale(hcol, 0.7));
  } else if (st === STYLE.BAND) {
    hat3(at3(0.09, 0), [0.165, 0.03, 0.156], hcol);
  } else if (st === STYLE.HELMET) {
    hat3(at3(0.05, -0.03), [0.185, 0.145, 0.155], hcol);
    hat3(at3(0.196, -0.03), [0.03, 0.006, 0.156], scale(hcol, 0.3));
  } else if (st === STYLE.CROWN) {
    hat3(at3(0.19, 0), [0.17, 0.04, 0.16], hcol, PART.METAL);
    for (const a of [-1, 1]) for (const b of [-1, 1]) hat3(at3(0.27, 0.125 * b, 0.135 * a), [0.035, 0.04, 0.035], hcol, PART.METAL);
    hat3(at3(0.19, 0.163), [0.03, 0.025, 0.006], [0.85, 0.04, 0.06]);
  } else if (pumpkin) {
    hat3(at3(0.2, 0), [0.03, 0.05, 0.03], [0.12, 0.3, 0.06]);
  }
}
