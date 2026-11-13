// A person, drawn as a cartoon's: every player in every game, the arena's
// fighter, golf's golfer and party's rider on its ball (client/rider.mjs), in
// WGSL each renderer declares beside its own, and on the cards (drawLook
// below). It is a distance field marched along the pixel's ray in the
// figure's own frame (x to its right, y up from its feet, z the way it
// faces): legs with knees that lift as it runs, a torso, arms with elbows out
// to the gun in its hands (or up in a cheer), a big head with hair (one of
// three cuts), two tall eyes and a small mouth. A zombie reaches with empty
// hands and stares; a robot has a box for a head, a visor and an aerial.
// The renderer gives the colours (Kit: a body's skin, an avatar's six parts,
// a side's shirt) and lights what comes back as it lights anything else.
// 1.83 m tall; a rider is the same figure at RIDE of that. Drawing only, like
// everything here.

import { HATS, BODIES, PATTERN, STYLE, TRIM, lookOf } from './looks.mjs';
import { FACES as WORN_FACES, SHIRTS, BACKS, dressOf } from './dress.mjs';
import { colorsOf } from './avatar.mjs';

const vec3 = (c) => `vec3f(${c.map((v) => v.toFixed(3)).join(', ')})`;
const u32s = (a) => `array<u32, ${a.length}>(${a.map((x) => `${x}u`).join(', ')})`;
// What a figure wears from its look's hat and its dress word (client/looks.mjs, client/dress.mjs), for the
// renderers that draw it (the arena's, golf's): a hat's STYLE + 1 by its place in HATS, none for the house hat
// or none, so a figure with neither draws as it always has; a worn face's and a print's variant + 1; a back
// item's code by its key. wear is (the look's hat byte, the dress word).
const HAT_STYLE = HATS.map((h, k) => (k === 0 || h.key === 'none' ? 0 : h.style + 1));
export const WEAR_WGSL = /* wgsl */ `
const WEAR_HAT = ${u32s(HAT_STYLE)};
const WEAR_HATC = array<vec3f, ${HATS.length}>(${HATS.map((h) => vec3(h.color || [0.9, 0.9, 0.9])).join(', ')});
const WEAR_FACE = ${u32s(WORN_FACES.map((x) => (x.variant === undefined ? 0 : x.variant + 1)))};
const WEAR_PRINT = ${u32s(SHIRTS.map((x) => (x.variant === undefined ? 0 : x.variant + 1)))};
const WEAR_BACK = ${u32s(BACKS.map((x) => ({ pack: 1, cape: 2, jet: 3, wings: 4 })[x.key] ?? 0))};
// k with what it wears: a zombie keeps its hat and its back, and its own face; a print stays on a side's shirt
fn wornKit(k: Kit, wear: vec2u, zombie: bool) -> Kit {
  var o = k;
  let hat = min(wear.x, ${HATS.length - 1}u);
  o.hat = WEAR_HAT[hat];
  o.hatc = WEAR_HATC[hat];
  o.face = select(WEAR_FACE[min(wear.y & 63u, ${WORN_FACES.length - 1}u)], 0u, zombie);
  o.print = select(WEAR_PRINT[min((wear.y >> 6u) & 63u, ${SHIRTS.length - 1}u)], 0u, zombie);
  o.back = WEAR_BACK[min((wear.y >> 12u) & 63u, ${BACKS.length - 1}u)];
  return o;
}
// a standing hat or wings reach over the figure's usual height, so its quad is taller
fn wearTall(wear: vec2u) -> bool { return WEAR_HAT[min(wear.x, ${HATS.length - 1}u)] > 5u || WEAR_BACK[min((wear.y >> 12u) & 63u, ${BACKS.length - 1}u)] == 4u; }
`;

export const FIGURE_WGSL = /* wgsl */ `
struct Kit {
  skin: vec3f, hair: vec3f, torso: vec3f, larm: vec3f, rarm: vec3f, lleg: vec3f, rleg: vec3f, eye: vec3f,
  kind: u32,  // 0 a person, 1 a zombie, 2 a robot
  gun: u32,   // 0 none, 1 a rifle in both hands, 2 a launcher on the shoulder
  cut: u32,   // the hair: 0 short, 1 long, 2 a tail
  hat: u32,   // what it wears (client/looks.mjs, client/dress.mjs), 0 for none: a hat's STYLE + 1
  hatc: vec3f, // the hat's colour
  face: u32,  // a worn face's variant + 1 (client/dress.mjs FACES)
  print: u32, // a shirt print's variant + 1 (SHIRTS)
  back: u32,  // a back item: 1 a backpack, 2 a cape, 3 a jetpack, 4 wings
  // party's riders (client/rider.mjs); 0 in the arena and golf, which then draw as they always have
  act: u32,   // what it acts out (rider.mjs EMOTE: 1 a wave, 2 a cheer, 3 a dance, 4 a spin), 0 nothing
  actT: f32,  // seconds into it
  air: f32,   // 0..1: up in the air, its arms going up and out
  jolt: f32,  // 0..1: its ball just hit, thrown back with its arms out
  lean: f32,  // the whole figure tipped forward about its feet (rad)
};
// where the joints are this frame
struct Rig {
  hipL: vec3f, kneeL: vec3f, footL: vec3f, hipR: vec3f, kneeR: vec3f, footR: vec3f,
  shL: vec3f, elL: vec3f, haL: vec3f, shR: vec3f, elR: vec3f, haR: vec3f,
  head: vec3f, gun: vec3f, tail: vec3f, aim: vec2f, bob: f32,
  ph: f32, st: f32, // the stride's phase and length, for what it wears
};
fn pose_spin(r: Rig) -> f32 { return r.ph * 2.0; }
// cover: 1 on a hit; on a ray that passed within a pixel and a half of it (hit false), how much of the pixel
// the edge takes, with the rest filled in from where it came closest (party's riders smooth their edges with it)
struct Fig { hit: bool, t: f32, z: f32, p: vec3f, n: vec3f, alb: vec3f, glow: vec3f, ink: f32, cover: f32 };

fn fgCap(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
fn fgBox(p: vec3f, h: vec3f, r: f32) -> f32 {
  let q = abs(p) - h + r;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// One leg's joints from its hip: the thigh swings with the stride, the knee
// bends while the leg comes forward and is straight while it pushes.
fn fgLeg(hip: vec3f, ph: f32, st: f32) -> array<vec3f, 2> {
  let th = 0.75 * st * sin(ph);
  let kn = 1.15 * st * max(cos(ph), 0.0);
  let knee = hip + 0.39 * vec3f(0.0, -cos(th), sin(th));
  return array<vec3f, 2>(knee, knee + 0.39 * vec3f(0.0, -cos(th - kn), sin(th - kn)));
}

// An arm held by an angle pair from its shoulder sh (s -1 its left, 1 its right): splay raises it out to its side
// (0 hanging, 1.57 level, 3.14 straight up), then pitch swings it forward about the shoulders' line (a hanging
// hand going forward, a raised one back). Its elbow and its hand, the elbow bent a little out and back.
fn fgArm(sh: vec3f, s: f32, pitch: f32, splay: f32) -> array<vec3f, 2> {
  let d0 = vec3f(s * sin(splay), -cos(splay), 0.0);
  let d = vec3f(d0.x, d0.y * cos(pitch), -d0.y * sin(pitch));
  return array<vec3f, 2>(sh + d * 0.22 + vec3f(s * 0.03, -0.02, -0.04), sh + d * 0.44);
}
// A rider's arm (s as fgArm's): what it acts out, or swinging against the legs as they walk its ball, going up
// and out as it flies (a little wave in them) and flung back when its ball is hit
fn fgArmPose(s: f32, kit: Kit, ph: f32, st: f32) -> vec2f {
  let t = kit.actT;
  if (kit.act == 1u) { return select(vec2f(0.0, 0.08), vec2f(0.25, 2.55 + 0.4 * sin(t * 12.0)), s > 0.0); }
  if (kit.act == 2u) { return vec2f(0.25, 2.6 + 0.2 * sin(t * 14.0 + s)); }
  if (kit.act == 3u) { return vec2f(0.35, 0.5 + 1.6 * (0.5 + 0.5 * sin(t * 9.0 + select(3.14159, 0.0, s > 0.0)))); }
  if (kit.act == 4u) { return vec2f(0.0, 1.55); }
  let swing = 0.5 * st * sin(ph + select(3.14159, 0.0, s > 0.0)) * (1.0 - kit.air);
  let wave = 0.25 * kit.air * sin(ph * 1.9 + s);
  return vec2f(swing + 0.3 * kit.air - 0.6 * kit.jolt, 0.1 + (2.3 + wave) * kit.air + 1.5 * kit.jolt);
}

// pose: (heading, the aim's pitch (rad, up), the stride's phase, its length 0..1), as the blocky figure's
fn fgRig(pose: vec4f, kit: Kit) -> Rig {
  var r: Rig;
  let ph = pose.z;
  let st = pose.w;
  r.bob = abs(sin(ph)) * 0.035 * st;
  r.ph = ph;
  r.st = st;
  let up = vec3f(0.0, r.bob, 0.0);
  r.hipL = vec3f(-0.105, 0.85, 0.0) + up;
  r.hipR = vec3f(0.105, 0.85, 0.0) + up;
  let l = fgLeg(r.hipL, ph, st);
  let rr = fgLeg(r.hipR, ph + 3.14159, st);
  r.kneeL = l[0]; r.footL = l[1] + vec3f(-0.02, 0.0, 0.0);
  r.kneeR = rr[0]; r.footR = rr[1] + vec3f(0.02, 0.0, 0.0);
  r.head = vec3f(0.0, 1.55, 0.015) + up;
  r.shL = vec3f(-0.25, 1.26, 0.0) + up;
  r.shR = vec3f(0.25, 1.26, 0.0) + up;
  r.aim = vec2f(cos(pose.y), sin(pose.y));
  let g = vec3f(0.0, r.aim.y, r.aim.x);
  if (kit.kind == 1u) {
    // reaching, the hands a little apart and never quite still
    r.haL = r.shL + vec3f(0.04, 0.03 + 0.03 * sin(ph * 0.5), 0.5);
    r.haR = r.shR + vec3f(-0.04, 0.03 + 0.03 * sin(ph * 0.5 + 2.0), 0.5);
    r.elL = mix(r.shL, r.haL, 0.5) + vec3f(-0.02, -0.04, 0.0);
    r.elR = mix(r.shR, r.haR, 0.5) + vec3f(0.02, -0.04, 0.0);
  } else if (kit.gun == 2u) {
    // the launcher on the right shoulder, a hand under it and one further along
    r.gun = vec3f(0.25, 1.42, -0.28) + up;
    r.haR = r.gun + g * 0.42 + vec3f(0.0, -0.1, 0.0);
    r.haL = r.gun + g * 0.66 + vec3f(-0.1, -0.09, 0.0);
    r.elR = mix(r.shR, r.haR, 0.5) + vec3f(0.09, -0.1, 0.02);
    r.elL = mix(r.shL, r.haL, 0.5) + vec3f(-0.05, -0.12, 0.0);
  } else if (kit.gun == 1u) {
    // the rifle at the chest along the aim: the right hand on its grip, the left under its barrel
    r.gun = vec3f(0.08, 1.2, 0.06) + up + g * 0.1;
    r.haR = r.gun + g * 0.1 + vec3f(0.0, -0.07, 0.0);
    r.haL = r.gun + g * 0.42 + vec3f(-0.05, -0.05, 0.0);
    r.elR = mix(r.shR, r.haR, 0.5) + vec3f(0.09, -0.09, -0.05);
    r.elL = mix(r.shL, r.haL, 0.5) + vec3f(-0.07, -0.11, 0.0);
  } else {
    // empty hands swing against the legs
    r.haL = r.shL + vec3f(-0.05, -0.44, 0.22 * st * sin(ph + 3.14159));
    r.haR = r.shR + vec3f(0.05, -0.44, 0.22 * st * sin(ph));
    r.elL = mix(r.shL, r.haL, 0.5) + vec3f(-0.03, 0.0, -0.03);
    r.elR = mix(r.shR, r.haR, 0.5) + vec3f(0.03, 0.0, -0.03);
    if (kit.act != 0u || kit.air > 0.0 || kit.jolt > 0.0) {
      let al = fgArmPose(-1.0, kit, ph, st);
      let ar = fgArmPose(1.0, kit, ph, st);
      let l = fgArm(r.shL, -1.0, al.x, al.y);
      let rr = fgArm(r.shR, 1.0, ar.x, ar.y);
      r.elL = l[0]; r.haL = l[1];
      r.elR = rr[0]; r.haR = rr[1];
    }
  }
  // a tail of hair trails the run and sways
  r.tail = r.head + vec3f(0.06 * sin(ph) * st, -0.36 + 0.12 * st, -0.3 - 0.14 * st);
  return r;
}

// parts: 0 the head, 1 the torso, 2 and 3 the arms (left, right), 4 and 5 the legs, 6 hair, 7 shoes, 8 the gun, 9 hands and neck, 10 the hips
fn fgMin(o: vec2f, d: f32, m: f32) -> vec2f { return select(o, vec2f(d, m), d < o.x); }

// A hat on the head, h from the head's centre, by its STYLE (client/looks.mjs): part 11 the hat in its
// colour, 12 its trim. Low hats sit over the hair like a shell; standing ones on top of it. spin turns a propeller.
fn fgHat(h: vec3f, st: u32, spin: f32) -> vec2f {
  var o = vec2f(1e9, 11.0);
  let rxz = length(h.xz);
  if (st == 0u) {
    o = fgMin(o, max(length(h - vec3f(0.0, 0.03, -0.02)) - 0.29, 0.06 - h.y), 11.0);
    o = fgMin(o, fgBox(h - vec3f(0.0, 0.075, 0.25), vec3f(0.16, 0.012, 0.1), 0.01), 11.0);
  } else if (st == 2u) {
    o = fgMin(o, max(length(h - vec3f(0.0, 0.02, -0.02)) - 0.295, 0.02 - h.y), 11.0);
    o = fgMin(o, max(length(h - vec3f(0.0, 0.02, -0.02)) - 0.302, max(h.y - 0.08, -h.y)), 12.0);
    o = fgMin(o, length(h - vec3f(0.0, 0.33, -0.03)) - 0.05, 12.0);
  } else if (st == 3u) {
    o = fgMin(o, max(abs(length(h.xz - vec2f(0.0, -0.02)) - 0.262) - 0.018, abs(h.y - 0.12) - 0.035), 11.0);
  } else if (st == 4u) {
    var d = max(length(h - vec3f(0.0, 0.02, -0.02)) - 0.31, -0.07 - h.y);
    d = max(d, -fgBox(h - vec3f(0.0, -0.03, 0.26), vec3f(0.2, 0.13, 0.16), 0.03));
    o = fgMin(o, d, 11.0);
  } else if (st == 5u) {
    o = fgMin(o, max(abs(rxz - 0.19) - 0.025, abs(h.y - 0.3) - 0.06), 12.0);
    for (var k = 0; k < 4; k++) {
      let a = f32(k) * 1.5708 + 0.785;
      o = fgMin(o, length(h - vec3f(0.19 * cos(a), 0.4, 0.19 * sin(a))) - 0.035, 12.0);
    }
  } else if (st == 7u) {
    o = fgMin(o, max(rxz - 0.31, abs(h.y - 0.27) - 0.012), 11.0);
    o = fgMin(o, max(rxz - 0.19, abs(h.y - 0.44) - 0.17), 11.0);
    o = fgMin(o, max(rxz - 0.195, abs(h.y - 0.33) - 0.035), 12.0);
  } else if (st == 8u) {
    let t = clamp((h.y - 0.26) / 0.42, 0.0, 1.0);
    o = fgMin(o, max(rxz - 0.17 * (1.0 - t), max(0.26 - h.y, h.y - 0.68)) * 0.8, 11.0);
    o = fgMin(o, length(h - vec3f(0.0, 0.7, 0.0)) - 0.04, 12.0);
  } else if (st == 9u) {
    o = fgMin(o, length(vec2f(rxz - 0.17, h.y - 0.46)) - 0.022, 12.0);
  } else if (st == 10u) {
    for (var s = -1.0; s < 2.0; s += 2.0) {
      o = fgMin(o, fgCap(h, vec3f(0.12 * s, 0.2, 0.0), vec3f(0.26 * s, 0.46, -0.02), 0.024), 11.0);
      o = fgMin(o, fgCap(h, vec3f(0.19 * s, 0.33, -0.01), vec3f(0.12 * s, 0.47, 0.0), 0.018), 11.0);
      o = fgMin(o, fgCap(h, vec3f(0.26 * s, 0.46, -0.02), vec3f(0.33 * s, 0.52, 0.0), 0.016), 11.0);
    }
  } else if (st == 11u) {
    o = fgMin(o, max(abs(length(h.xy - vec2f(0.0, 0.02)) - 0.3) - 0.016, max(abs(h.z) - 0.035, -h.y)), 12.0);
    o = fgMin(o, fgBox(vec3f(abs(h.x) - 0.27, h.y, h.z), vec3f(0.04, 0.08, 0.075), 0.03), 11.0);
  } else if (st == 12u) {
    o = fgMin(o, max(length(h - vec3f(0.0, 0.03, -0.02)) - 0.29, 0.05 - h.y), 11.0);
    o = fgMin(o, fgCap(h, vec3f(0.0, 0.31, -0.02), vec3f(0.0, 0.37, -0.02), 0.014), 12.0);
    let b = h - vec3f(0.0, 0.38, -0.02);
    o = fgMin(o, fgBox(vec3f(b.x * cos(spin) - b.z * sin(spin), b.y, b.x * sin(spin) + b.z * cos(spin)), vec3f(0.2, 0.006, 0.035), 0.004), 12.0);
  }
  return o;
}

// What hangs on its back (client/dress.mjs BACKS), p in the figure's frame: part 13 the thing, 14 its trim or its flame.
fn fgBack(p: vec3f, r: Rig, back: u32, st: f32, ph: f32) -> vec2f {
  var o = vec2f(1e9, 13.0);
  let y0 = 1.1 + r.bob;
  if (back == 1u) {
    o = fgMin(o, fgBox(p - vec3f(0.0, y0, -0.21), vec3f(0.15, 0.17, 0.07), 0.04), 13.0);
    o = fgMin(o, fgBox(p - vec3f(0.0, y0 - 0.08, -0.29), vec3f(0.1, 0.06, 0.02), 0.015), 14.0);
  } else if (back == 2u) {
    // from the shoulders, streaming back as it runs: down the cape and through it, tipped by a
    let a = 0.12 + 0.55 * st + 0.04 * sin(ph * 0.7);
    let v = p - vec3f(0.0, 1.3 + r.bob, -0.16);
    let down = vec3f(0.0, -cos(a), -sin(a));
    let thru = vec3f(0.0, -sin(a), cos(a));
    o = fgMin(o, fgBox(vec3f(v.x, -dot(v, down) + 0.42, dot(v, thru)), vec3f(0.23, 0.42, 0.014), 0.01), 13.0);
    o = fgMin(o, fgBox(p - vec3f(0.0, 1.3 + r.bob, -0.14), vec3f(0.24, 0.02, 0.03), 0.01), 14.0);
  } else if (back == 3u) {
    for (var s = -1.0; s < 2.0; s += 2.0) {
      o = fgMin(o, fgCap(p, vec3f(0.09 * s, y0 - 0.12, -0.22), vec3f(0.09 * s, y0 + 0.15, -0.22), 0.065), 13.0);
      o = fgMin(o, fgCap(p, vec3f(0.09 * s, y0 - 0.2, -0.22), vec3f(0.09 * s, y0 - 0.25 - 0.12 * st, -0.22), 0.04), 14.0);
    }
  } else if (back == 4u) {
    // two panels from the shoulder blades, up and out, beating as it runs
    for (var s = -1.0; s < 2.0; s += 2.0) {
      let b = s * (0.45 + 0.12 * st * sin(ph * 2.0));
      let v = p - vec3f(0.33 * s, 1.36 + r.bob, -0.2);
      let w = vec3f(v.x * cos(b) + v.y * sin(b), -v.x * sin(b) + v.y * cos(b), v.z);
      o = fgMin(o, fgBox(w, vec3f(0.2, 0.12, 0.012), 0.01), 13.0);
      let v2 = p - vec3f(0.55 * s, 1.52 + r.bob, -0.21);
      let w2 = vec3f(v2.x * cos(b * 1.4) + v2.y * sin(b * 1.4), -v2.x * sin(b * 1.4) + v2.y * cos(b * 1.4), v2.z);
      o = fgMin(o, fgBox(w2, vec3f(0.15, 0.08, 0.012), 0.01), 13.0);
    }
  }
  return o;
}
fn fgMap(p: vec3f, r: Rig, kit: Kit) -> vec2f {
  var o = vec2f(1e9, 0.0);
  o = fgMin(o, min(fgCap(p, r.hipL, r.kneeL, 0.1), fgCap(p, r.kneeL, r.footL, 0.085)), 4.0);
  o = fgMin(o, min(fgCap(p, r.hipR, r.kneeR, 0.1), fgCap(p, r.kneeR, r.footR, 0.085)), 5.0);
  o = fgMin(o, min(fgCap(p, r.footL + vec3f(0.0, 0.0, -0.02), r.footL + vec3f(0.0, -0.01, 0.13), 0.092),
    fgCap(p, r.footR + vec3f(0.0, 0.0, -0.02), r.footR + vec3f(0.0, -0.01, 0.13), 0.092)), 7.0);
  o = fgMin(o, fgBox(p - vec3f(0.0, 0.88 + r.bob, 0.0), vec3f(0.2, 0.09, 0.125), 0.08), 10.0);
  // the torso, wider at the shoulders than the waist
  let q = p - vec3f(0.0, 1.1 + r.bob, 0.0);
  o = fgMin(o, fgBox(vec3f(q.x / (1.0 + 0.6 * q.y), q.y, q.z), vec3f(0.21, 0.2, 0.13), 0.09) * 0.85, 1.0);
  o = fgMin(o, fgCap(p, vec3f(0.0, 1.28 + r.bob, 0.0), r.head - vec3f(0.0, 0.14, 0.0), 0.06), 9.0);
  let hl = p - r.head;
  if (kit.hat == 7u && kit.kind != 1u) {
    // a pumpkin for a head: ribbed, a stalk
    o = fgMin(o, (length(hl * vec3f(1.0, 1.1, 1.0)) - 0.265 + 0.012 * abs(sin(atan2(hl.x, hl.z) * 4.0))) * 0.9, 0.0);
    o = fgMin(o, fgCap(hl, vec3f(0.0, 0.22, 0.0), vec3f(0.02, 0.32, 0.0), 0.025), 12.0);
  } else if (kit.kind == 2u) {
    o = fgMin(o, fgBox(hl, vec3f(0.22, 0.2, 0.2), 0.05), 0.0);
    o = fgMin(o, min(fgCap(p, r.head + vec3f(0.11, 0.19, 0.0), r.head + vec3f(0.13, 0.27, 0.0), 0.014), length(hl - vec3f(0.13, 0.28, 0.0)) - 0.03), 8.0);
  } else {
    o = fgMin(o, length(hl * vec3f(1.0, 0.95, 1.0)) - 0.245, 0.0);
    // hair: a shell over the head, opened over the face under a ragged fringe
    var dh = length(hl - vec3f(0.0, 0.028, -0.025)) - 0.268;
    let fringe = 0.095 + 0.055 * abs(fract(hl.x * 7.0 + 0.25) - 0.5) - 0.25 * abs(hl.x);
    dh = max(dh, min(hl.z - 0.05, fringe - hl.y));
    if (kit.cut == 1u) { dh = min(dh, fgBox(hl - vec3f(0.0, -0.2, -0.15), vec3f(0.2, 0.22, 0.075), 0.07)); }
    if (kit.cut == 2u) { dh = min(dh, fgCap(p, r.head + vec3f(0.0, 0.09, -0.24), r.tail, 0.08)); }
    o = fgMin(o, dh, 6.0);
  }
  if (kit.hat != 0u && kit.hat != 7u) {
    let hh = fgHat(hl, kit.hat - 1u, pose_spin(r));
    o = fgMin(o, hh.x, hh.y);
  }
  if (kit.back != 0u) {
    let bb = fgBack(p, r, kit.back, r.st, r.ph);
    o = fgMin(o, bb.x, bb.y);
  }
  o = fgMin(o, min(fgCap(p, r.shL, r.elL, 0.078), fgCap(p, r.elL, r.haL, 0.066)), 2.0);
  o = fgMin(o, min(fgCap(p, r.shR, r.elR, 0.078), fgCap(p, r.elR, r.haR, 0.066)), 3.0);
  o = fgMin(o, min(length(p - r.haL), length(p - r.haR)) - 0.075, 9.0);
  if (kit.gun != 0u && kit.kind != 1u) {
    // in the gun's own frame: z along the aim, y up from it
    let g = p - r.gun;
    let gl = vec3f(g.x, g.y * r.aim.x - g.z * r.aim.y, g.y * r.aim.y + g.z * r.aim.x);
    if (kit.gun == 2u) {
      o = fgMin(o, min(fgCap(gl, vec3f(0.0), vec3f(0.0, 0.0, 0.95), 0.085), fgCap(gl, vec3f(0.0, 0.0, 0.9), vec3f(0.0, 0.0, 1.0), 0.105)), 8.0);
    } else {
      var dg = fgBox(gl - vec3f(0.0, 0.0, 0.32), vec3f(0.04, 0.062, 0.34), 0.015);
      dg = min(dg, fgBox(gl - vec3f(0.0, -0.1, 0.1), vec3f(0.028, 0.06, 0.035), 0.012));
      dg = min(dg, fgBox(gl - vec3f(0.0, -0.12, 0.32), vec3f(0.028, 0.075, 0.042), 0.012));
      dg = min(dg, fgBox(gl - vec3f(0.0, -0.035, -0.14), vec3f(0.032, 0.055, 0.12), 0.015));
      o = fgMin(o, dg, 8.0);
    }
  }
  return o;
}

// A shirt print at (u, v) across the shirt's front (-1 to 1), by variant (rider.mjs PART.PRINT's): its colour
// over the shirt's c, and how much it glows
fn fgPrint(q: vec2f, v: u32, c: vec3f) -> vec4f {
  let u = q.x;
  let w = q.y;
  let lite = mix(c, vec3f(1.0), 0.7);
  if (v == 0u && fract(w * 2.0 + 0.5) < 0.45) { return vec4f(lite, 0.0); }
  if (v == 1u && sqrt(abs(u)) + sqrt(abs(w)) < 0.95) { return vec4f(1.0, 0.82, 0.2, 0.0); }
  if (v == 2u) {
    let x = u * 1.15;
    let y = (w + 0.1) * 1.15;
    let a = x * x + y * y - 1.0;
    if (a * a * a - x * x * y * y * y < 0.0) { return vec4f(0.9, 0.12, 0.2, 0.0); }
  }
  if (v == 3u && abs(u) < 0.7 && (abs(w - (0.4 - 0.9 * abs(u))) < 0.12 || abs(w - (-0.15 - 0.9 * abs(u))) < 0.12)) { return vec4f(0.72, 1.0, 0.22, 0.0); }
  if (v == 4u && ((i32(floor(u * 2.0 + 2.0)) + i32(floor(w * 2.0 + 2.0))) & 1) == 0) { return vec4f(lite, 0.0); }
  if (v == 5u) {
    let t = (w + 0.8) / 1.65;
    let wd = 0.56 * pow(clamp(1.0 - t, 0.0, 1.0), 0.7) * smoothstep(0.0, 0.2, t);
    if (t > 0.0 && abs(u) < wd) { return select(vec4f(1.0, 0.4, 0.08, 0.5), vec4f(1.0, 0.88, 0.35, 0.6), abs(u) < wd * 0.5 && t < 0.62); }
  }
  return vec4f(c, 0.0);
}

// The figure standing at feet, along the ray from e in unit direction d
// (fwd the camera's forward, for the depth; pw a pixel's width in metres a
// metre off): where the ray meets it, the colour there before the light, its
// normal in the world, and ink where the surface turns from the eye.
fn figureRay(e: vec3f, d: vec3f, fwd: vec3f, pw: f32, feet: vec3f, pose: vec4f, kit: Kit) -> Fig {
  var o: Fig;
  o.hit = false;
  let f = vec3f(cos(pose.x), 0.0, sin(pose.x));
  let side = vec3f(-f.z, 0.0, f.x);
  let w = e - feet;
  var lo = vec3f(dot(w, side), w.y, dot(w, f));
  var ld = vec3f(dot(d, side), d.y, dot(d, f));
  // a lean tips it all forward about its feet: the ray turned back into its upright frame
  let cl = cos(kit.lean);
  let sl = sin(kit.lean);
  if (kit.lean != 0.0) {
    lo = vec3f(lo.x, lo.y * cl + lo.z * sl, lo.z * cl - lo.y * sl);
    ld = vec3f(ld.x, ld.y * cl + ld.z * sl, ld.z * cl - ld.y * sl);
  }
  // a sphere round it all
  let worn = kit.hat > 5u || kit.back == 4u;          // a standing hat or wings: a taller sphere round it all
  let oc = lo - vec3f(0.0, select(0.95, 1.1, worn), 0.12);
  let b = dot(oc, ld);
  let R = select(1.25, 1.4, worn);
  let disc = b * b - dot(oc, oc) + R * R;
  if (disc <= 0.0) { return o; }
  let far = -b + sqrt(disc);
  var t = max(-b - sqrt(disc), 0.0);
  if (far <= 0.0) { return o; }
  let r = fgRig(pose, kit);
  var part = -1.0;
  var near = 1e9;      // the closest the ray came, in pixels there, and where
  var nearT = 0.0;
  var nearPart = -1.0;
  for (var i = 0; i < 64; i++) {
    let h = fgMap(lo + ld * t, r, kit);
    if (h.x < 0.0008 + 0.5 * pw * t) { part = h.y; break; }
    let q = h.x / (pw * t);
    if (q < near) { near = q; nearT = t; nearPart = h.y; }
    t += h.x * 0.9;
    if (t > far) { break; }
  }
  var edge = false;
  if (part < 0.0) {
    if (near > 1.5) { return o; }
    t = nearT;
    part = nearPart;
    edge = true;
  }
  let p = lo + ld * t;
  let k = vec2f(0.004, -0.004);
  let n = normalize(k.xyy * fgMap(p + k.xyy, r, kit).x + k.yyx * fgMap(p + k.yyx, r, kit).x + k.yxy * fgMap(p + k.yxy, r, kit).x + k.xxx * fgMap(p + k.xxx, r, kit).x);
  o.hit = !edge;
  o.cover = select(1.0, clamp(1.5 - near, 0.0, 1.0), edge);
  o.t = t;
  o.z = t * dot(d, fwd);
  o.p = e + d * t;
  // the normal out of its upright frame (the lean's turn), then into the world's
  let nw = select(n, vec3f(n.x, n.y * cl - n.z * sl, n.y * sl + n.z * cl), kit.lean != 0.0);
  o.n = normalize(side * nw.x + vec3f(0.0, nw.y, 0.0) + f * nw.z);
  o.glow = vec3f(0.0);
  let hl = p - r.head;
  var c = kit.skin;
  if (part == 1.0) {
    c = kit.torso;
    // a collar, a line down the front and a belt, or a print on the front between them
    if (p.y > 1.27 + r.bob) { c = mix(c, vec3f(1.0), 0.45); }
    else if (p.y < 0.955 + r.bob) { c = vec3f(0.14, 0.13, 0.2); }
    else if (kit.print != 0u && p.z > 0.0) { let pr = fgPrint(vec2f(p.x / 0.2, (p.y - 1.11 - r.bob) / 0.15), kit.print - 1u, c); c = pr.xyz; o.glow = c * pr.w; }
    else if (abs(p.x) < 0.01 && p.z > 0.0) { c *= 0.6; }
  } else if (part == 11.0) {
    c = kit.hatc;
    let st = kit.hat - 1u;
    if (st == 8u && fract((hl.y - 0.26) / 0.084) < 0.5) { c = vec3f(0.98, 0.95, 0.7); }
    if (st == 12u) { let a = atan2(hl.x, hl.z); c = select(select(kit.hatc, vec3f(0.2, 0.42, 0.92), a > 1.0), vec3f(1.0, 0.82, 0.2), a < -1.0); }
  } else if (part == 12.0) {
    let st = kit.hat - 1u;
    c = kit.hatc * 0.7;
    if (st == 7u) { c = vec3f(0.78, 0.1, 0.14); }
    else if (st == 8u) { c = vec3f(0.98, 0.95, 0.7); }
    else if (st == 9u || st == 5u) { c = kit.hatc; o.glow = select(vec3f(0.0), kit.hatc * 0.9, st == 9u); }
    else if (st == 11u) { c = kit.hatc * 0.35; }
    else if (st == 12u) { c = vec3f(1.0, 0.82, 0.2); }
    else if (kit.hat == 7u) { c = vec3f(0.24, 0.45, 0.15); }
  } else if (part == 13.0) {
    c = select(select(select(vec3f(0.97, 0.97, 1.0), vec3f(0.62, 0.66, 0.72), kit.back == 3u), vec3f(0.78, 0.1, 0.14), kit.back == 2u), vec3f(0.85, 0.42, 0.1), kit.back == 1u);
  } else if (part == 14.0) {
    c = select(select(vec3f(0.55, 0.26, 0.06), vec3f(0.95, 0.8, 0.25), kit.back == 2u), vec3f(1.0, 0.55, 0.15), kit.back == 3u);
    if (kit.back == 3u) { o.glow = vec3f(1.4, 0.6, 0.15); }
  } else if (part == 2.0) { c = kit.larm; }
  else if (part == 3.0) { c = kit.rarm; }
  else if (part == 4.0) { c = kit.lleg; }
  else if (part == 5.0) { c = kit.rleg; }
  else if (part == 10.0) { c = mix(kit.lleg, kit.rleg, 0.5); }
  else if (part == 6.0) {
    c = kit.hair;
    // the ring of light a cartoon's hair has, broken into strands
    let ring = hl.y - 0.135 - 0.014 * sin(atan2(hl.x, hl.z) * 13.0);
    if (abs(ring) < 0.013 && n.y > 0.25 && hl.z > -0.05) { c = mix(c, vec3f(1.0), 0.35); }
  } else if (part == 7.0) { c = select(vec3f(0.16, 0.15, 0.24), vec3f(0.92, 0.92, 0.95), p.y < 0.03); }
  else if (part == 8.0) {
    c = select(vec3f(0.17, 0.18, 0.24), vec3f(0.3, 0.42, 0.24), kit.gun == 2u);
    if (kit.kind == 2u && hl.y > 0.15 && hl.y < 0.4 && abs(hl.z) < 0.06) { c = vec3f(0.9, 0.3, 0.25); o.glow = vec3f(1.2, 0.2, 0.15) * step(0.25, hl.y); }
  } else if (part == 0.0 && kit.hat == 7u && kit.kind != 1u) {
    // a pumpkin's: ribs, and eyes and a grin lit from inside
    c = kit.hatc * (0.78 + 0.22 * abs(cos(atan2(hl.x, hl.z) * 4.0)));
    if (hl.z > 0.1) {
      let eye = abs(abs(hl.x) - 0.09) + abs(hl.y - 0.05) < 0.05;
      let grin = hl.y < -0.04 && hl.y > -0.12 + 3.0 * hl.x * hl.x && abs(hl.x) < 0.14;
      if (eye || grin) { c = vec3f(0.0); o.glow = vec3f(1.6, 0.9, 0.25); }
    }
  } else if (part == 0.0 && kit.kind == 2u) {
    // a robot's face: a dark visor with two lit eyes, a grille under it
    c = kit.skin;
    if (hl.z > 0.15) {
      if (abs(hl.y - 0.04) < 0.065 && abs(hl.x) < 0.175) {
        c = vec3f(0.06, 0.07, 0.12);
        if (abs(abs(hl.x) - 0.085) < 0.045 && abs(hl.y - 0.04) < 0.028) { c = vec3f(0.0); o.glow = vec3f(0.3, 1.5, 1.8); }
      } else if (hl.y < -0.06 && hl.y > -0.14 && abs(hl.x) < 0.11 && fract(hl.x * 22.0) < 0.5) { c *= 0.5; }
    }
  } else if (part == 0.0 && hl.z > 0.04) {
    // the face: two tall eyes (a dark lid, the iris, a pupil, a white glint), a mouth, a blush; or a worn one's
    // (client/dress.mjs FACES: 1 cool, 2 wink, 3 surprised, 4 cat, 5 star-eyed, as kit.face)
    let ex = (abs(hl.x) - 0.098) / 0.052;
    let ey = (hl.y + 0.015) / 0.078;
    let er = ex * ex + ey * ey;
    let fw = select(kit.face, 0u, kit.kind != 0u);
    let smile = abs(hl.y + 0.115 - 5.0 * hl.x * hl.x) < 0.008 && abs(hl.x) < 0.06;
    if (fw == 1u && abs(hl.y + 0.005) < 0.062 && abs(hl.x) < 0.2) {
      c = vec3f(0.05, 0.05, 0.08);
      if (abs(hl.x + 0.12 - 0.6 * (hl.y + 0.005)) < 0.012) { c = vec3f(0.5, 0.55, 0.7); }
    } else if (fw == 1u && abs(hl.y + 0.125 - 0.35 * hl.x) < 0.008 && abs(hl.x) < 0.06) { c = vec3f(0.55, 0.2, 0.2); }
    else if (fw == 5u && er < 1.4) {
      if (sqrt(abs(ex)) + sqrt(abs(ey)) < 1.05) { c = vec3f(1.0, 0.85, 0.2); o.glow = vec3f(1.0, 0.7, 0.1); }
    } else if (fw == 2u && hl.x > 0.0 && er < 1.0) {
      if (abs(ey + 0.1 - 0.6 * ex * ex) < 0.14) { c = vec3f(0.1, 0.08, 0.16); }
    } else if (fw == 3u && length(vec2f(hl.x, hl.y + 0.13)) < 0.03) { c = vec3f(0.3, 0.08, 0.1); }
    else if (fw == 4u && abs(hl.x) + abs(hl.y + 0.065) < 0.025) { c = vec3f(0.95, 0.5, 0.6); }
    else if (fw == 4u && abs(hl.x) > 0.11 && abs(hl.x) < 0.2 && (abs(hl.y + 0.07 - 0.25 * (abs(hl.x) - 0.11)) < 0.005 || abs(hl.y + 0.1 + 0.08 * (abs(hl.x) - 0.11)) < 0.005)) { c = vec3f(0.12, 0.1, 0.12); }
    else if (fw != 0u && fw != 3u && fw != 1u && smile) { c = vec3f(0.55, 0.2, 0.2); }
    else if (kit.kind == 1u) {
      // a zombie's: round white eyes with a dot each, a ragged mouth
      let zr = length(vec2f(abs(hl.x) - 0.098, hl.y + 0.006));
      if (zr < 0.062) { c = select(vec3f(0.95, 0.96, 0.85), vec3f(0.05), zr < 0.018); o.glow = vec3f(0.25, 0.28, 0.1) * step(0.018, zr); }
      else if (abs(hl.y + 0.13 - 0.015 * sign(fract(hl.x * 18.0) - 0.5)) < 0.015 && abs(hl.x) < 0.095) { c = vec3f(0.12, 0.03, 0.04); }
    } else if (er < 1.0) {
      c = kit.eye;
      if (ey > 0.5 || er > 0.78) { c = vec3f(0.1, 0.08, 0.16); }
      else if (ex * ex + (ey + 0.1) * (ey + 0.1) < 0.2) { c = kit.eye * 0.35; }
      let gx = (hl.x - sign(hl.x) * 0.098) / 0.052 + 0.32;
      if (gx * gx + (ey - 0.3) * (ey - 0.3) * 0.6 < 0.07) { c = vec3f(1.0); }
      if (ey < -0.45 && er <= 0.78) { c = mix(c, vec3f(1.0), 0.35); }
    } else if (fw == 0u && abs(hl.y + 0.125 + 5.0 * hl.x * hl.x) < 0.0075 && abs(hl.x) < 0.045) { c = vec3f(0.55, 0.2, 0.2); }
    else if (length(vec2f((abs(hl.x) - 0.155) * 0.8, hl.y + 0.095)) < 0.035) { c = mix(c, vec3f(1.0, 0.5, 0.5), 0.4); }
  }
  // metal all over a robot but its lights
  if (kit.kind == 2u && part != 8.0) { c = mix(c, vec3f(0.75, 0.8, 0.9), 0.25) * (1.0 + 0.25 * step(0.75, n.y)); }
  o.alb = c;
  // ink where it turns from the eye, close enough that a line is narrower than the limb
  o.ink = 1.0 - smoothstep(0.3, 0.22, dot(n, -ld)) * (1.0 - smoothstep(0.004, 0.012, pw * t));
  return o;
}
`;

// Hair and eye colours a slot's hash picks from, as WGSL array bodies.
export const HAIRS = [[0.13, 0.13, 0.22], [0.38, 0.23, 0.15], [0.98, 0.83, 0.38], [1.0, 0.55, 0.72], [0.3, 0.55, 0.96], [0.87, 0.89, 0.96], [0.86, 0.22, 0.2], [0.2, 0.74, 0.7], [0.6, 0.38, 0.85], [0.95, 0.5, 0.2]];
export const EYES = [[0.2, 0.5, 0.95], [0.25, 0.7, 0.4], [0.6, 0.35, 0.2], [0.7, 0.3, 0.85], [0.9, 0.3, 0.3], [0.95, 0.65, 0.2]];

// ---- the figure in JS: its kit, for party's riders, and a picture of it for the cards

// A rider is the figure at this size: 1.39 m on a ball 2 m across.
export const RIDE = 0.76;
const PEACH = [1.0, 0.8, 0.66];
const WEAR_FACE_JS = WORN_FACES.map((x) => (x.variant === undefined ? 0 : x.variant + 1));
const WEAR_PRINT_JS = SHIRTS.map((x) => (x.variant === undefined ? 0 : x.variant + 1));
const BACK_CODE = { pack: 1, cape: 2, jet: 3, wings: 4 };

// What slot wears, as the Kit the WGSL takes (colours sRGB 0..1, the rest whole numbers): the choices the
// arena's and golf's kitOf make from the same words, so a player is one person in every game. The slot picks
// the hair, the eyes and the cut; the look the shirt (its ball's colour, or the seat's), the trousers (the
// shirt's, darker), the body's skin and the hat; an Elo Pros avatar its six parts in place of the skin, shirt
// and legs, and a robot's head by its face bit; D the dress pieces ({ face, shirt, back }, client/dress.mjs
// dressOf) a worn face, a print and a back item.
export function kitOf(slot, look = 0, avatar = 0, D = null) {
  const L = lookOf(slot, look >>> 0);
  const B = BODIES[L.body];
  const A = colorsOf(avatar >>> 0);
  const h = Math.imul(slot, 2654435761) >>> 7;
  const skin = A ? A.head : B.skin || PEACH;
  const c = L.a;
  const legs = c.map((v) => v * 0.5);
  return {
    kind: (A ? A.robot : B.face === 4) ? 2 : 0,
    cut: (h >>> 5) % 3,
    hat: HAT_STYLE[L.hat],
    hatc: HATS[L.hat].color || [0.9, 0.9, 0.9],
    face: D?.face?.variant === undefined ? 0 : D.face.variant + 1,
    print: D?.shirt?.variant === undefined ? 0 : D.shirt.variant + 1,
    back: BACK_CODE[D?.back?.key] ?? 0,
    skin, hair: HAIRS[h % HAIRS.length], eye: EYES[(h >>> 11) % EYES.length],
    torso: A ? A.torso : c, larm: A ? A.larm : skin, rarm: A ? A.rarm : skin, lleg: A ? A.lleg : legs, rleg: A ? A.rleg : legs,
  };
}
// the same from a dress word, kept per slot and words: party asks every frame for every rider
const KITS = new Map();
export function figureKit(slot, look = 0, avatar = 0, dress = 0) {
  const key = `${slot},${(look >>> 0) & 0xffffff},${avatar >>> 0},${dress >>> 0}`;
  let k = KITS.get(key);
  if (!k) {
    if (KITS.size > 2048) KITS.clear();
    KITS.set(key, (k = kitOf(slot, look & 0xffffff, avatar, dressOf(dress))));
  }
  return k;
}

// ---- a picture of a look, for the TV's cards and the wardrobe (a 2D canvas context)
const css = (c, k = 1) => `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v * k)) * 255)).join(',')})`;
const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const INK = 'rgba(26,22,48,0.85)';

// The look's ball, radius r at (cx, cy), with the figure standing on it as the renderers stand it: r pixels a
// metre (party's ball is a metre round), the rider RIDE of the figure's size. slot and w as kitOf's; t (s) swings
// its arms a little; avatar its Elo Pros avatar word or 0; dress the pieces it wears (client/dress.mjs dressOf)
// or null, with behind: true for the figure seen from behind (a back item shown off).
export function drawLook(g, cx, cy, r, slot, w, t = 0, avatar = 0, dress = null) {
  const L = lookOf(slot, w);
  drawBall(g, cx, cy, r, L, t);
  drawFigure(g, cx, cy - r, r * RIDE, kitOf(slot, w, avatar, dress), t, !!dress?.behind);
}

function drawBall(g, cx, cy, r, L, t) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = css(L.a); g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  const spin = (t * 0.6) % 1;
  if (L.pattern === PATTERN.BEACH) {
    const pw = 2 * r / 3;
    for (let k = -3; k < 3; k++) {
      g.fillStyle = [css(L.a), css([0.85, 0.85, 0.85]), css(L.b)][(k + 3) % 3];
      g.fillRect(cx - r + k * pw + spin * 3 * pw, cy - r, pw + 1, 2 * r);
    }
    g.fillStyle = css([0.85, 0.85, 0.85]); g.fillRect(cx - r, cy - r, 2 * r, r * 0.28); g.fillRect(cx - r, cy + r * 0.72, 2 * r, r * 0.28);
  } else if (L.pattern === PATTERN.STRIPES) {
    g.fillStyle = css(L.b);
    for (let k = 1; k < 5; k += 2) g.fillRect(cx - r, cy - r + k * (2 * r / 5), 2 * r, 2 * r / 5);
  } else if (L.pattern === PATTERN.RIBS) {
    g.fillStyle = css(L.b);
    for (let k = 0; k < 8; k += 2) g.fillRect(cx - r + ((k + spin * 2) % 8) * (r / 4), cy - r, r / 8, 2 * r);
  } else if (L.pattern === PATTERN.METAL) {
    g.fillStyle = css(L.a, 1.25); g.fillRect(cx - r * 0.6, cy - r * 0.7, r * 0.35, r * 0.35);
  } else if (L.pattern === PATTERN.EIGHT) {
    g.fillStyle = css(L.b); g.beginPath(); g.arc(cx + r * 0.15, cy - r * 0.1, r * 0.45, 0, Math.PI * 2); g.fill();
    const px = Math.max(1, Math.round(r * 0.12));
    const EIGHT = [7, 5, 7, 5, 7]; // the font's 8, three pixels a row
    EIGHT.forEach((row, y) => { for (let x = 0; x < 3; x++) if ((row >> (2 - x)) & 1) { g.fillStyle = '#111'; g.fillRect(cx + r * 0.15 - 1.5 * px + x * px, cy - r * 0.1 - 2.5 * px + y * px, px, px); } });
  } else if (L.pattern === PATTERN.DOTS) {
    // a spot facing you and five round it, turning
    g.fillStyle = css(L.b);
    const spot = (x, y, k) => { g.beginPath(); g.ellipse(cx + x * r, cy + y * r, r * 0.3 * k, r * 0.3, 0, 0, Math.PI * 2); g.fill(); };
    spot(0, 0, 1);
    for (let k = 0; k < 5; k++) { const a = (k / 5 + spin * 0.2) * Math.PI * 2; spot(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.8); }
  } else if (L.pattern === PATTERN.CHECKER) {
    g.fillStyle = css(L.b);
    const q = r / 2;
    for (let y = -2; y < 2; y++) for (let x = -3; x < 3; x++) if ((x + y) & 1) g.fillRect(cx + (x + spin * 2) * q, cy + y * q, q + 0.5, q + 0.5);
  } else if (L.pattern === PATTERN.SWIRL) {
    // six arms from the middle, bent as they go
    g.fillStyle = css(L.b);
    for (let k = 0; k < 6; k += 2) {
      g.beginPath(); g.moveTo(cx, cy);
      for (let i = 0; i <= 8; i++) { const d = (i / 8) * r * 1.1, a = ((k + spin * 2) / 6) * Math.PI * 2 + (i / 8) * 1.2; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
      for (let i = 8; i >= 0; i--) { const d = (i / 8) * r * 1.1, a = ((k + 1 + spin * 2) / 6) * Math.PI * 2 + (i / 8) * 1.2; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
      g.fill();
    }
  } else if (L.pattern === PATTERN.DISCO) {
    // mirror tiles, each its own grey, a few catching the light
    const q = r / 3;
    for (let y = -3; y < 3; y++) for (let x = -3; x < 3; x++) {
      const h = (Math.imul(x * 7 + y * 13 + 40, 0x9e3779b1) >>> 24) / 255;
      g.fillStyle = h > 0.86 ? '#fff' : css(h > 0.6 ? L.b : L.a, 0.55 + 0.6 * h);
      g.fillRect(cx + x * q + 0.5, cy + y * q + 0.5, q - 1, q - 1);
    }
  }
  g.restore();
  // a rim, so a dark ball still shows on a dark card
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, r * 0.05);
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
}

// The figure from the front (or from behind), its feet at (cx, base), m pixels a metre of its own: the parts
// figureRay marches, at the same places and sizes, each filled over an ink line round it as the renderers ink
// where a surface turns away. K is a kit (kitOf), t (s) swings its arms a little.
export function drawFigure(g, cx, base, m, K, t = 0, behind = false) {
  const X = (x) => cx + (behind ? x : -x) * m; // seen from the front, its right is on the picture's left
  const Y = (y) => base - y * m;
  const ink = Math.max(0.6, m * 0.022);
  const robot = K.kind === 2;
  // metal all over a robot but its lights
  const tone = (c) => (robot ? mixc(c, [0.75, 0.8, 0.9], 0.25) : c);
  const shape = (c, path, line = true) => {
    g.beginPath(); path();
    if (line) { g.lineWidth = 2 * ink; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); }
    g.fillStyle = typeof c === 'string' ? c : css(tone(c)); g.fill();
  };
  const capsule = (x0, y0, x1, y1, rr) => () => {
    const ax = X(x0), ay = Y(y0), bx = X(x1), by = Y(y1), a = Math.atan2(by - ay, bx - ax), R = rr * m;
    g.arc(ax, ay, R, a + Math.PI / 2, a + Math.PI * 1.5); g.arc(bx, by, R, a - Math.PI / 2, a + Math.PI / 2); g.closePath();
  };
  const disc = (x, y, rx, ry = rx) => () => g.ellipse(X(x), Y(y), rx * m, ry * m, 0, 0, Math.PI * 2);
  // a box (centre, half sizes) with its corners rounded rr, wider at its top by k
  const box = (x, y, hx, hy, rr, k = 0) => () => {
    const pts = [[-hx * (1 - k), -hy], [hx * (1 - k), -hy], [hx * (1 + k), hy], [-hx * (1 + k), hy]].map(([a, b]) => [X(x + a), Y(y + b)]);
    g.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    for (let i = 1; i <= 4; i++) g.arcTo(pts[i % 4][0], pts[i % 4][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], rr * m);
    g.closePath();
  };
  const sw = Math.sin(t * 2) * 0.03;
  const head = [0, 1.55];
  const H = (x, y) => [head[0] + x, head[1] + y];
  const pumpkin = K.hat === 7, hatSt = K.hat - 1;
  // what hangs on its back, from the front only where it shows round the body: wings, a cape's edges
  const wings = () => {
    for (const s of [-1, 1]) {
      shape([0.97, 0.97, 1], () => { g.save(); g.translate(X(0.33 * s), Y(1.36)); g.rotate(-s * 0.45 * (behind ? -1 : 1)); g.rect(-0.2 * m, -0.12 * m, 0.4 * m, 0.24 * m); g.restore(); });
      shape([0.97, 0.97, 1], () => { g.save(); g.translate(X(0.55 * s), Y(1.52)); g.rotate(-s * 0.63 * (behind ? -1 : 1)); g.rect(-0.15 * m, -0.08 * m, 0.3 * m, 0.16 * m); g.restore(); });
    }
  };
  const backItem = () => {
    if (K.back === 1) { shape([0.85, 0.42, 0.1], box(0, 1.1, 0.15, 0.17, 0.04)); shape([0.55, 0.26, 0.06], box(0, 1.02, 0.1, 0.06, 0.015)); }
    else if (K.back === 2) { shape([0.78, 0.1, 0.14], box(0, 0.88, 0.23, 0.42, 0.01, 0.04)); shape([0.95, 0.8, 0.25], box(0, 1.3, 0.24, 0.02, 0.01)); }
    else if (K.back === 3) {
      for (const s of [-1, 1]) {
        shape([0.62, 0.66, 0.72], capsule(0.09 * s, 0.98, 0.09 * s, 1.25, 0.065));
        shape('rgb(255,150,50)', capsule(0.09 * s, 0.9, 0.09 * s, 0.85, 0.04), false);
      }
    } else if (K.back === 4) wings();
  };
  if (!behind) {
    if (K.back === 4) wings();
    if (K.back === 2) shape([0.78, 0.1, 0.14], box(0, 0.88, 0.27, 0.42, 0.01));
  }
  // long hair hangs behind the shoulders
  if (K.cut === 1 && !pumpkin && !robot && !behind) shape(K.hair, box(...H(0, -0.2), 0.2, 0.22, 0.07));
  // legs, shoes, hips
  for (const s of [-1, 1]) {
    const leg = s < 0 ? K.lleg : K.rleg;
    shape(leg, capsule(0.105 * s, 0.85, 0.105 * s, 0.46, 0.1));
    shape(leg, capsule(0.105 * s, 0.46, 0.125 * s, 0.07, 0.085));
    shape([0.16, 0.15, 0.24], disc(0.125 * s, 0.07, 0.092, 0.09));
    shape([0.92, 0.92, 0.95], box(0.125 * s, 0.01, 0.085, 0.02, 0.01), false);
  }
  shape(mixc(K.lleg, K.rleg, 0.5), box(0, 0.88, 0.2, 0.09, 0.08));
  // the torso, wider at the shoulders: a belt, a collar, and a print on its front or a line down it
  const torso = box(0, 1.1, 0.21, 0.2, 0.09, 0.12);
  shape(K.torso, torso);
  g.save(); g.beginPath(); torso(); g.clip();
  g.fillStyle = css(tone(mixc(K.torso, [1, 1, 1], 0.45))); g.fillRect(X(-0.3), Y(1.45), (X(0.3) - X(-0.3)), Y(1.27) - Y(1.45));
  g.fillStyle = css(tone([0.14, 0.13, 0.2])); g.fillRect(X(-0.3), Y(0.955), (X(0.3) - X(-0.3)), Y(0.8) - Y(0.955));
  if (!behind && K.print) drawPrint(g, (u) => X(u * 0.2), (v) => Y(1.11 + v * 0.15), m * 0.2, K.print - 1, tone(K.torso));
  else if (!behind) { g.fillStyle = css(tone(K.torso), 0.6); g.fillRect(X(0.01), Y(1.27), Math.max(1, 0.02 * m), Y(0.955) - Y(1.27)); }
  g.restore();
  if (behind) backItem();
  // arms, swinging a little, and hands
  for (const s of [-1, 1]) {
    const arm = s < 0 ? K.larm : K.rarm, z = s * sw;
    shape(arm, capsule(0.25 * s, 1.26, 0.33 * s, 1.04 + z, 0.078));
    shape(arm, capsule(0.33 * s, 1.04 + z, 0.3 * s, 0.82 + 2 * z, 0.066));
    shape(K.skin, disc(0.3 * s, 0.82 + 2 * z, 0.075));
  }
  shape(K.skin, capsule(0, 1.28, 0, 1.41, 0.06));
  // the head
  if (pumpkin) {
    shape(K.hatc, disc(...head, 0.265, 0.24));
    g.strokeStyle = css(K.hatc, 0.75); g.lineWidth = Math.max(1, 0.012 * m);
    for (const x of [-0.16, 0, 0.16]) { g.beginPath(); g.ellipse(X(x), Y(head[1]), Math.abs(0.11 - Math.abs(x) * 0.3) * m + 0.5, 0.235 * m, 0, 0, Math.PI * 2); g.stroke(); }
    shape([0.24, 0.45, 0.15], capsule(...H(0, 0.22), ...H(0.02, 0.32), 0.025));
    if (!behind) {
      for (const s of [-1, 1]) shape('rgb(255,216,96)', () => { g.moveTo(X(0.09 * s), Y(head[1] + 0.1)); g.lineTo(X(0.14 * s), Y(head[1] + 0.05)); g.lineTo(X(0.09 * s), Y(head[1])); g.lineTo(X(0.04 * s), Y(head[1] + 0.05)); g.closePath(); }, false);
      shape('rgb(255,216,96)', () => { g.moveTo(X(-0.14), Y(head[1] - 0.06)); g.quadraticCurveTo(X(0), Y(head[1] - 0.2), X(0.14), Y(head[1] - 0.06)); g.closePath(); }, false);
    }
  } else if (robot) {
    shape(K.skin, box(...head, 0.22, 0.2, 0.05));
    shape([0.17, 0.18, 0.24], capsule(...H(0.11, 0.19), ...H(0.13, 0.27), 0.014));
    shape([0.9, 0.3, 0.25], disc(...H(0.13, 0.28), 0.03));
    if (!behind) {
      shape('rgb(15,18,30)', box(...H(0, 0.04), 0.175, 0.065, 0.02), false);
      for (const s of [-1, 1]) shape('rgb(90,240,255)', box(...H(0.085 * s, 0.04), 0.045, 0.028, 0.01), false);
      g.fillStyle = css(tone(K.skin), 0.5);
      for (let i = 0; i < 5; i++) g.fillRect(X(-0.11 + i * 0.045 + 0.0225), Y(head[1] - 0.06), Math.max(1, 0.022 * m), 0.08 * m);
    }
  } else {
    // hair: a shell over the head, and from the front a face under a ragged fringe
    shape(K.hair, disc(...H(0, 0.028), 0.268));
    if (K.cut === 2 && behind) shape(K.hair, capsule(...H(0, 0.09), ...H(0, -0.36), 0.08));
    if (K.cut === 1 && behind) shape(K.hair, box(...H(0, -0.2), 0.2, 0.22, 0.07));
    if (!behind) {
      g.save();
      g.beginPath();
      g.moveTo(X(-0.3), Y(head[1] - 0.3));
      for (let i = 0; i <= 24; i++) {
        const x = -0.26 + i * 0.52 / 24;
        g.lineTo(X(x), Y(head[1] + 0.095 + 0.055 * Math.abs((((x * 7 + 0.25) % 1) + 1) % 1 - 0.5) - 0.25 * Math.abs(x)));
      }
      g.lineTo(X(0.3), Y(head[1] - 0.3));
      g.closePath(); g.clip();
      shape(K.skin, disc(...head, 0.245, 0.258), false);
      g.restore();
      drawFace(g, X, Y, m, head, K);
    }
  }
  // the hat
  if (K.hat && !pumpkin) drawHat(g, X, Y, m, head, hatSt, K.hatc, t, shape, capsule, disc, box, behind);
}

// A face on the head at hc (client/figure.mjs figureRay's, part 0): two tall eyes with lids, irises, pupils
// and a glint, a small mouth and a blush; or a worn one's (kit.face: 1 cool, 2 wink, 3 surprised, 4 cat, 5 stars)
function drawFace(g, X, Y, m, hc, K) {
  const at = (x, y) => [X(x), Y(hc[1] + y)];
  const fill = (c, path) => { g.fillStyle = c; g.beginPath(); path(); g.fill(); };
  const ell = (x, y, rx, ry) => () => { const [px, py] = at(x, y); g.ellipse(px, py, Math.max(0.5, rx * m), Math.max(0.5, ry * m), 0, 0, Math.PI * 2); };
  const line = (c, pts, w) => { g.strokeStyle = c; g.lineWidth = Math.max(0.8, w * m); g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => { const [px, py] = at(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); };
  const fw = K.face;
  const arc = (y0, k, w, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const x = -w + 2 * w * i / n; return [x, y0 + k * x * x]; });
  // the blush, under everything but the eyes
  for (const s of [-1, 1]) fill('rgba(255,128,128,0.35)', ell(0.155 * s, -0.095, 0.044, 0.035));
  const eye = (s) => {
    fill(css([0.1, 0.08, 0.16]), ell(0.098 * s, -0.015, 0.052, 0.078));
    fill(css(K.eye), ell(0.098 * s, -0.025, 0.041, 0.055));
    fill(css(K.eye, 0.35), ell(0.098 * s, -0.03, 0.024, 0.03));
    fill('#fff', ell(0.098 * s - 0.017, 0.006, 0.013, 0.018));
  };
  if (fw === 1) {
    // dark glasses across both eyes, a glint, a smirk
    fill(css([0.05, 0.05, 0.08]), () => { const [x0, y0] = at(-0.2, 0.057), [x1, y1] = at(0.2, -0.067); g.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0); });
    line(css([0.5, 0.55, 0.7]), [[-0.15, 0.04], [-0.1, -0.05]], 0.02);
    line(css([0.55, 0.2, 0.2]), [[-0.06, -0.146], [0.06, -0.104]], 0.016);
    return;
  }
  for (const s of [-1, 1]) {
    if (fw === 5) {
      // star eyes: four points each, gold
      const [px, py] = at(0.098 * s, -0.015), R = 0.07 * m, r0 = 0.022 * m;
      g.fillStyle = 'rgb(255,217,51)'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, d = i % 2 ? r0 : R; g.lineTo(px + Math.cos(a) * d, py + Math.sin(a) * d); }
      g.fill();
    } else if (fw === 2 && s > 0) line(css([0.1, 0.08, 0.16]), arc(-0.03, 6, 0.045).map(([x, y]) => [x + 0.098, y]), 0.02); // a wink: its right eye shut
    else eye(s);
  }
  if (fw === 3) fill(css([0.3, 0.08, 0.1]), ell(0, -0.13, 0.03, 0.03));
  else if (fw === 4) {
    fill(css([0.95, 0.5, 0.6]), () => { const [px, py] = at(0, -0.065), d = 0.025 * m; g.moveTo(px, py - d); g.lineTo(px + d, py); g.lineTo(px, py + d); g.lineTo(px - d, py); g.closePath(); });
    for (const s of [-1, 1]) { line(css([0.12, 0.1, 0.12]), [[0.11 * s, -0.07], [0.2 * s, -0.0475]], 0.01); line(css([0.12, 0.1, 0.12]), [[0.11 * s, -0.1], [0.2 * s, -0.107]], 0.01); }
    line(css([0.55, 0.2, 0.2]), arc(-0.115, 5, 0.06), 0.016);
  } else if (fw) line(css([0.55, 0.2, 0.2]), arc(-0.115, 5, 0.06), 0.016);
  else line(css([0.55, 0.2, 0.2]), arc(-0.125, -5, 0.045), 0.015);
}

// A shirt's print on its front (client/dress.mjs SHIRTS' variant v, figure.mjs fgPrint's): U and V take its
// own u and v (-1 to 1 across and up it) to the picture, s the pixels across half of it, c the shirt's colour
function drawPrint(g, U, V, s, v, c) {
  const fill = (col, path) => { g.fillStyle = col; g.beginPath(); path(); g.fill(); };
  const lite = css(c.map((x) => x + (1 - x) * 0.7));
  if (v === 0) {
    for (const w of [0.55, -0.45]) { g.fillStyle = lite; g.fillRect(U(-1.3), V(w), U(1.3) - U(-1.3), V(w - 0.45) - V(w)); }
  } else if (v === 4) {
    g.fillStyle = lite;
    for (let a = -2; a < 2; a++) for (let b = -2; b < 2; b++) if (((a + b) & 1) === 0) g.fillRect(Math.min(U(a / 2), U((a + 1) / 2)), V((b + 1) / 2), Math.abs(U((a + 1) / 2) - U(a / 2)), V(b / 2) - V((b + 1) / 2));
  } else if (v === 1) fill('rgb(255,209,51)', () => { g.moveTo(U(0), V(0.9)); g.lineTo(U(0.2), V(0.2)); g.lineTo(U(0.9), V(0)); g.lineTo(U(0.2), V(-0.2)); g.lineTo(U(0), V(-0.9)); g.lineTo(U(-0.2), V(-0.2)); g.lineTo(U(-0.9), V(0)); g.lineTo(U(-0.2), V(0.2)); });
  else if (v === 2) fill('rgb(230,31,51)', () => { g.arc(U(-0.36), V(0.25), 0.36 * s, 0, Math.PI * 2); g.arc(U(0.36), V(0.25), 0.36 * s, 0, Math.PI * 2); g.moveTo(U(-0.72), V(0.15)); g.lineTo(U(0.72), V(0.15)); g.lineTo(U(0), V(-0.8)); });
  else if (v === 3) { g.strokeStyle = 'rgb(184,255,56)'; g.lineWidth = Math.max(1, 0.2 * s); for (const w of [0.4, -0.15]) { g.beginPath(); g.moveTo(U(-0.7), V(w - 0.63)); g.lineTo(U(0), V(w)); g.lineTo(U(0.7), V(w - 0.63)); g.stroke(); } }
  else if (v === 5) {
    fill('rgb(255,102,20)', () => { g.moveTo(U(0), V(0.85)); g.quadraticCurveTo(U(0.6), V(-0.2), U(0), V(-0.8)); g.quadraticCurveTo(U(-0.6), V(-0.2), U(0), V(0.85)); });
    fill('rgb(255,224,89)', () => { g.moveTo(U(0), V(0.2)); g.quadraticCurveTo(U(0.3), V(-0.35), U(0), V(-0.7)); g.quadraticCurveTo(U(-0.3), V(-0.35), U(0), V(0.2)); });
  }
}

// A hat on the head at hc by its STYLE (client/looks.mjs; figure.mjs fgHat's shapes, seen from the front)
function drawHat(g, X, Y, m, hc, st, c, t, shape, capsule, disc, box, behind) {
  const H = (x, y) => [hc[0] + x, hc[1] + y];
  const trim = c.map((v) => v * 0.7);
  // a dome over the head from its brim up: a sphere of radius rr centred y0 over the head's centre, cut at y1
  const dome = (y0, rr, y1) => () => {
    const a = Math.asin(Math.max(-1, Math.min(1, (y1 - y0) / rr)));
    g.arc(X(0), Y(hc[1] + y0), rr * m, Math.PI + a, -a); g.closePath();
  };
  if (st === STYLE.CAP) {
    shape(c, dome(0.03, 0.29, 0.06));
    if (!behind) shape(c.map((v) => v * 0.85), box(...H(0, 0.075), 0.16, 0.014, 0.01));
  } else if (st === STYLE.BEANIE) {
    shape(c, dome(0.02, 0.295, 0.02));
    shape(trim, box(...H(0, 0.05), 0.3, 0.03, 0.02));
    shape(trim, disc(...H(0, 0.33), 0.05));
  } else if (st === STYLE.BAND) shape(c, box(...H(0, 0.12), 0.28, 0.035, 0.01));
  else if (st === STYLE.HELMET) {
    // a shell open at the face
    if (behind) shape(c, dome(0.02, 0.31, -0.07));
    else {
      shape(c, dome(0.02, 0.31, 0.1));
      for (const s of [-1, 1]) shape(c, box(...H(0.255 * s, 0.015), 0.055, 0.085, 0.02));
    }
  } else if (st === STYLE.CROWN) {
    shape(c, box(...H(0, 0.3), 0.215, 0.06, 0.01));
    for (const s of [-1, 1]) shape(c, disc(...H(0.134 * s, 0.4), 0.035));
  } else if (st === STYLE.TOPHAT) {
    shape(c, box(...H(0, 0.27), 0.31, 0.014, 0.008));
    shape(c, box(...H(0, 0.44), 0.19, 0.17, 0.01));
    shape([0.78, 0.1, 0.14], box(...H(0, 0.33), 0.195, 0.035, 0.005), false);
  } else if (st === STYLE.CONE) {
    // stripes up a cone, cream and its colour, and a bobble
    for (let i = 0; i < 5; i++) {
      const y0 = 0.26 + i * 0.084, y1 = Math.min(0.68, y0 + 0.084), w0 = 0.17 * (1 - (y0 - 0.26) / 0.42), w1 = 0.17 * (1 - (y1 - 0.26) / 0.42);
      shape(i % 2 ? [0.98, 0.95, 0.7] : c, () => { g.moveTo(X(-w0), Y(hc[1] + y0)); g.lineTo(X(w0), Y(hc[1] + y0)); g.lineTo(X(w1), Y(hc[1] + y1)); g.lineTo(X(-w1), Y(hc[1] + y1)); g.closePath(); }, i === 0);
    }
    shape([0.98, 0.95, 0.7], disc(...H(0, 0.7), 0.04));
  } else if (st === STYLE.HALO) {
    g.strokeStyle = css(c, 1.2); g.lineWidth = Math.max(1, 0.044 * m);
    g.beginPath(); g.ellipse(X(0), Y(hc[1] + 0.46), 0.17 * m, 0.04 * m, 0, 0, Math.PI * 2); g.stroke();
  } else if (st === STYLE.ANTLERS) {
    for (const s of [-1, 1]) {
      shape(c, capsule(...H(0.12 * s, 0.2), ...H(0.26 * s, 0.46), 0.024));
      shape(c, capsule(...H(0.19 * s, 0.33), ...H(0.12 * s, 0.47), 0.018));
      shape(c, capsule(...H(0.26 * s, 0.46), ...H(0.33 * s, 0.52), 0.016));
    }
  } else if (st === STYLE.PHONES) {
    g.strokeStyle = css(c, 0.35); g.lineWidth = Math.max(1, 0.032 * m);
    g.beginPath(); g.arc(X(0), Y(hc[1] + 0.02), 0.3 * m, Math.PI, 0); g.stroke();
    for (const s of [-1, 1]) shape(c, box(...H(0.27 * s, 0), 0.07, 0.11, 0.03));
  } else if (st === STYLE.PROP) {
    // three panels (its colour in front, blue to its right, yellow to its left), a stalk, a blade turning
    g.save(); g.beginPath(); dome(0.03, 0.29, 0.05)(); g.lineWidth = 2 * Math.max(0.6, m * 0.022); g.strokeStyle = INK; g.stroke(); g.clip();
    // its right side blue and its left yellow (atan2's turn round it), its own colour over the front between them
    const w0 = behind ? 0 : 0.1;
    g.fillStyle = css(TRIM.BLUE); g.fillRect(Math.min(X(0.3), X(w0)), Y(hc[1] + 0.4), Math.abs(X(0.3) - X(w0)), 0.4 * m);
    g.fillStyle = css(TRIM.YELLOW); g.fillRect(Math.min(X(-0.3), X(-w0)), Y(hc[1] + 0.4), Math.abs(X(-0.3) - X(-w0)), 0.4 * m);
    if (!behind) { g.fillStyle = css(c); g.fillRect(Math.min(X(0.1), X(-0.1)), Y(hc[1] + 0.4), Math.abs(X(-0.1) - X(0.1)), 0.4 * m); }
    g.restore();
    shape(TRIM.YELLOW, capsule(...H(0, 0.31), ...H(0, 0.37), 0.014));
    const w = 0.2 * Math.abs(Math.cos(t * 6)) + 0.035;
    shape(TRIM.YELLOW, box(...H(0, 0.38), w, 0.008, 0.004));
  }
}
