// A person, drawn as a cartoon's: the arena's fighter and golf's golfer, in
// WGSL each renderer declares beside its own. Where client/rider.mjs's
// blocky figure is seven boxes, this is a distance field marched along the
// pixel's ray in the figure's own frame (x to its right, y up from its feet,
// z the way it faces): legs with knees that lift as it runs, a torso, arms
// with elbows out to the gun in its hands, a big head with hair (one of
// three cuts), two tall eyes and a small mouth. A zombie reaches with empty
// hands and stares; a robot has a box for a head, a visor and an aerial.
// The renderer gives the colours (Kit: a body's skin, an avatar's six parts,
// a side's shirt) and lights what comes back as it lights anything else.
// 1.83 m tall, as the blocky one was. Drawing only, like everything here.

import { HATS } from './looks.mjs';
import { FACES as WORN_FACES, SHIRTS, BACKS } from './dress.mjs';

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
  face: u32,  // a worn face's variant + 1 (rider.mjs PART.FACEWEAR's)
  print: u32, // a shirt print's variant + 1 (PART.PRINT's)
  back: u32,  // a back item: 1 a backpack, 2 a cape, 3 a jetpack, 4 wings
};
// where the joints are this frame
struct Rig {
  hipL: vec3f, kneeL: vec3f, footL: vec3f, hipR: vec3f, kneeR: vec3f, footR: vec3f,
  shL: vec3f, elL: vec3f, haL: vec3f, shR: vec3f, elR: vec3f, haR: vec3f,
  head: vec3f, gun: vec3f, tail: vec3f, aim: vec2f, bob: f32,
  ph: f32, st: f32, // the stride's phase and length, for what it wears
};
fn pose_spin(r: Rig) -> f32 { return r.ph * 2.0; }
struct Fig { hit: bool, t: f32, z: f32, p: vec3f, n: vec3f, alb: vec3f, glow: vec3f, ink: f32 };

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
  let lo = vec3f(dot(w, side), w.y, dot(w, f));
  let ld = vec3f(dot(d, side), d.y, dot(d, f));
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
  for (var i = 0; i < 64; i++) {
    let h = fgMap(lo + ld * t, r, kit);
    if (h.x < 0.0008 + 0.5 * pw * t) { part = h.y; break; }
    t += h.x * 0.9;
    if (t > far) { break; }
  }
  if (part < 0.0) { return o; }
  let p = lo + ld * t;
  let k = vec2f(0.004, -0.004);
  let n = normalize(k.xyy * fgMap(p + k.xyy, r, kit).x + k.yyx * fgMap(p + k.yyx, r, kit).x + k.yxy * fgMap(p + k.yxy, r, kit).x + k.xxx * fgMap(p + k.xxx, r, kit).x);
  o.hit = true;
  o.t = t;
  o.z = t * dot(d, fwd);
  o.p = e + d * t;
  o.n = normalize(side * n.x + vec3f(0.0, n.y, 0.0) + f * n.z);
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
