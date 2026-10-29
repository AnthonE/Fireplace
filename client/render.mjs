// Golf's WebGPU renderer, three passes: the terrain ray-marched per pixel
// (voxel space, pitch by shearing) and drawn low-poly, flat triangles in
// clean colours under a blue sky with clouds, writing depth; then bodies as
// depth-tested splats uploaded straight from the sim's shared memory (balls,
// the golfers as the arena's blocky figures, and trees of boxes in the rough
// with their shadows); then a HUD on a 320 x 200 grid scaled to the screen.
// Nothing here is hashed, so any math goes.
import * as L from '../src/layout.mjs';
import { GRAPH_N, GRAPH_PANELS } from './netgraph.mjs';
import { fontData, roundWanted, HUD_FONT_WGSL } from './hudfont.mjs';
import { LOWPOLY_WGSL, hudFrame, focalFor } from './lowpoly.mjs';
import { BLOCK_RAY_WGSL } from './rider.mjs';
import { BODIES } from './looks.mjs';
import { PALETTE as AV_PALETTE } from './avatar.mjs';

export const COLS = 80; // HUD cells of 4 x 6 HUD px
const FAR = 900;
const MAX_FLASH = 64;
const MAX_TREE = 4096;
const NO_TINTS = new Uint32Array(L.NPLAYER); // a page with no looks: every seat its own colour
const NO_LOOKS = new Uint32Array(L.NPLAYER).fill(0x10000); // nor bodies: everyone blocky
const NO_AVATARS = new Uint32Array(L.NPLAYER); // nor avatars
// a body's skin and face (client/looks.mjs BODIES) for the golfers' figures
const SKINS = BODIES.map((b) => b.skin || [1.0, 0.8, 0.66]);
const FACES = BODIES.map((b) => b.face || 1);
const vec3 = (c) => `vec3f(${c.map((v) => v.toFixed(3)).join(', ')})`;
// the trees' leaves: mostly greens, now and then an autumn one
const LEAVES = [[0.3, 0.66, 0.22], [0.36, 0.72, 0.2], [0.24, 0.56, 0.2], [0.42, 0.7, 0.24], [0.2, 0.5, 0.26], [1.0, 0.68, 0.2], [0.98, 0.44, 0.22]];
// the third array (vz) ends at 6 x BALL_CAP floats; flags and owners follow
const BALL_WORDS = 6 * L.BALL_CAP + L.BALL_CAP / 4 + L.BALL_CAP / 2;

const WGSL = /* wgsl */ `
struct U {
  cam: vec4f,      // eye x, y, z, focal (px)
  view: vec4f,     // cos yaw, sin yaw, horizon (px), time (s)
  screen: vec4f,   // width, height, far, extrapolate (s)
  cup: vec4f,      // cup x, y, z, my slot
  hole: vec4f,     // hole direction x, z, highest ground, flash count
  me: vec4u,       // nballs, my ball (or 0xffffffff), hud rows, sunk-ball count
  pred: vec4f,     // extrapolate my projectiles (s): they come from the prediction, at its own clock; the net graph shown (1)
  hudv: vec4f,     // the HUD's scale (screen px a HUD px), its left (px), trees, its top (px)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hmap: texture_2d<f32>;
@group(0) @binding(2) var smap: texture_2d<u32>;
@group(0) @binding(3) var<storage, read> balls: array<f32>;
@group(0) @binding(4) var<storage, read> players: array<u32>;
@group(0) @binding(5) var<storage, read> proj: array<u32>;
@group(0) @binding(6) var<storage, read> flashes: array<vec4f>;
@group(0) @binding(7) var<storage, read> hud: array<u32>;
@group(0) @binding(8) var<storage, read> font: array<u32>;
@group(0) @binding(9) var<storage, read> graph: array<vec4f>;
@group(0) @binding(10) var<storage, read> trees: array<vec4f>; // two a tree: x, ground y, z, size | turn, style, leaf colour (rgba8 bits), 0

const FOG = 700.0;
${LOWPOLY_WGSL}

fn hgt(x: f32, z: f32) -> f32 {
  let g = clamp(vec2f(x, z) * 0.5, vec2f(0.0), vec2f(510.99));
  let i = vec2i(g);
  let f = g - vec2f(i);
  let a = textureLoad(hmap, i, 0).r;
  let b = textureLoad(hmap, i + vec2i(1, 0), 0).r;
  let c = textureLoad(hmap, i + vec2i(0, 1), 0).r;
  let d = textureLoad(hmap, i + vec2i(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// fairway mown in stripes across the hole, the rough a tint a facet, sand with a lip, the green in a checker
fn surfColor(sw: vec2f, w: vec2f, tint: f32) -> vec3f {
  let stripe = select(0.93, 1.07, (i32(floor(dot(w, vec2f(-u.hole.y, u.hole.x)) / 6.0)) & 1) == 0);
  switch u32(sw.x) {
    case 0u: { return vec3f(0.36, 0.74, 0.24) * stripe; }
    case 1u: { return vec3f(0.22, 0.54, 0.17) * (0.92 + 0.14 * tint); }
    case 2u: { return select(vec3f(0.98, 0.88, 0.6), vec3f(0.86, 0.74, 0.48), sw.y < 0.62); }
    default: { return vec3f(0.44, 0.84, 0.32) * select(0.97, 1.03, ((i32(floor(w.x / 3.0)) + i32(floor(w.y / 3.0))) & 1) == 0); }
  }
}

struct VOut { @builtin(position) pos: vec4f };
@vertex fn vs_full(@builtin(vertex_index) i: u32) -> VOut {
  var o: VOut;
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  return o;
}

struct TOut { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs_terrain(@builtin(position) p: vec4f) -> TOut {
  var o: TOut;
  let fwd = u.view.xy;
  let right = vec2f(-fwd.y, fwd.x);
  let dir = fwd + right * ((p.x - u.screen.x * 0.5) / u.cam.w);
  let rise = (u.view.z - p.y) / u.cam.w;
  var z = 0.3;
  var prev = 0.0;
  var hit = false;
  // the steps grow with distance, and shrink as the screen's pixels do
  let k = 0.012 * 240.0 / u.cam.w;
  loop {
    let w = u.cam.xz + dir * z;
    let ry = u.cam.y + rise * z;
    if (ry <= hgt(w.x, w.y)) { hit = true; break; }
    if (rise >= 0.0 && ry > u.hole.z) { break; }
    prev = z;
    z += 0.04 + z * k;
    if (z > u.screen.z) { break; }
  }
  if (!hit) {
    o.color = vec4f(sky(normalize(vec3f(dir.x, rise, dir.y)), u.cam.xyz, u.view.w), 1.0);
    o.depth = 1.0;
    return o;
  }
  var a = prev;
  var b = z;
  for (var i = 0; i < 6; i++) {
    let m = 0.5 * (a + b);
    let w = u.cam.xz + dir * m;
    if (u.cam.y + rise * m <= hgt(w.x, w.y)) { b = m; } else { a = m; }
  }
  z = b;
  let w = u.cam.xz + dir * z;
  let fc = facetAt(w, z);
  let n = fc.xyz;
  var c = surfColor(surfAt(w), w, fc.w);
  // steep ground is rock, faceted grey
  c = select(c, vec3f(0.55, 0.53, 0.5) * (0.88 + 0.2 * fc.w), n.y < 0.72);
  c *= grain(w, z) * light(n, 1.0);
  // the slipgate: a dark swirl in the green with a lit rim
  let dc = distance(w, u.cup.xz);
  if (dc < 0.62) {
    let ang = atan2(w.y - u.cup.z, w.x - u.cup.x);
    let swirl = 0.5 + 0.5 * sin(ang * 3.0 + dc * 18.0 - u.view.w * 5.0);
    c = mix(vec3f(0.08, 0.02, 0.12), vec3f(0.45, 0.15, 0.7), swirl * (1.0 - dc / 0.62));
    if (dc > 0.5) { c = vec3f(0.85, 0.75, 1.0); }
  }
  o.color = vec4f(fogged(c, z), 1.0);
  o.depth = z / u.screen.z;
  return o;
}

// ---- splats
struct SOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) kind: u32,
  @location(3) @interpolate(flat) feet: vec3f, // a golfer's or a tree's: where it stands
  @location(4) @interpolate(flat) pose: vec4f, // a golfer's heading, aim (rad, up), stride's phase and length (0..1); a tree's turn, size, style
  @location(5) @interpolate(flat) skin: vec4f, // a golfer's skin, and its face (client/rider.mjs PART)
  @location(6) @interpolate(flat) av: u32,     // its Elo Pros avatar word (client/avatar.mjs), 0 for none
};
${BLOCK_RAY_WGSL}
const SKINS = array<vec3f, ${SKINS.length}>(${SKINS.map(vec3).join(', ')});
const FACES = array<u32, ${FACES.length}>(${FACES.map((f) => `${f}u`).join(', ')});
const AV_PALETTE = array<vec3f, 32>(${AV_PALETTE.map(vec3).join(', ')});
fn avc(a: u32, k: u32) -> vec3f { return AV_PALETTE[(a >> (5u * k)) & 31u]; }

// A golfer as a blocky figure, the arena's fighter (client/arena-render.mjs)
// with the launcher in its hands: legs stepping with its speed, arms out
// along its aim, a head with a face. The nearest of its boxes on the ray.
fn figure(e: vec3f, d: vec3f, fwd: vec3f, s: SOut) -> Block {
  let S = 1.35;
  let yaw = s.pose.x;
  let f = vec3f(cos(yaw), 0.0, sin(yaw));
  let side = vec3f(-f.z, 0.0, f.x);
  let up = vec3f(0.0, 1.0, 0.0);
  let c = s.color.rgb;
  let av = select(0u, s.av, (s.av >> 31u) == 1u);
  var best: Block;
  best.hit = false;
  best.t = 1e9;
  for (var i = 0u; i < 7u; i++) {
    let k = select(-1.0, 1.0, (i & 1u) == 1u);
    var ctr = vec3f(0.0);
    var h = vec3f(0.12, 0.25, 0.12) * S;
    var pitch = 0.0;
    var splay = 0.0;
    var col = c;
    var part = 0u;
    if (i < 2u) { // a leg
      pitch = sin(s.pose.z) * 0.7 * s.pose.w * k;
      let ay = up * cos(pitch) - f * sin(pitch);
      ctr = s.feet + up * 0.5 * S + side * 0.125 * S * k - ay * 0.25 * S;
      col = select(c * 0.5, avc(av, select(4u, 5u, k > 0.0)), av != 0u);
    } else if (i < 4u) { // an arm
      pitch = 1.5 + s.pose.y;
      splay = -0.22 * k;
      let u0 = up * cos(pitch) - f * sin(pitch);
      let ay = u0 * cos(splay) - side * sin(splay);
      ctr = s.feet + up * 0.92 * S + side * 0.375 * S * k - ay * 0.17 * S;
      col = select(s.skin.rgb, avc(av, select(2u, 3u, k > 0.0)), av != 0u);
    } else if (i == 4u) { // the torso
      ctr = s.feet + up * 0.75 * S;
      h = vec3f(0.25, 0.25, 0.125) * S;
      if (av != 0u) { col = avc(av, 1u); }
    } else if (i == 5u) { // the head
      ctr = s.feet + up * 1.1825 * S;
      h = vec3f(0.16, 0.15, 0.15) * 1.15 * S;
      col = select(s.skin.rgb, avc(av, 0u), av != 0u);
      part = select(u32(s.skin.w + 0.5) & 15u, select(1u, 4u, (av & 0x40000000u) != 0u), av != 0u);
    } else { // the launcher, on the shoulder along the aim
      let g = f * cos(s.pose.y) + up * sin(s.pose.y);
      ctr = s.feet + up * 0.95 * S + g * 0.5 * S + side * 0.08 * S;
      h = vec3f(0.08, 0.08, 0.42) * S;
      pitch = s.pose.y;
      col = vec3f(0.3, 0.42, 0.22);
      part = 3u;
    }
    let b = blockRay(e, d, fwd, u.cam.w, ctr, h, yaw, pitch, part + 16u * u32(round(splay / 0.05) + 64.0), col);
    if (b.hit && b.t < best.t) { best = b; }
  }
  return best;
}

// A tree in the rough, of boxes: a trunk under a round top of two (style 0,
// most) or a pine of four tiers (style 1). Size scales it, about 7 m tall at 1.
fn tree(e: vec3f, d: vec3f, fwd: vec3f, s: SOut) -> Block {
  let k = s.pose.y;
  let pine = s.pose.z > 0.5;
  let leaf = s.color.rgb;
  var best: Block;
  best.hit = false;
  best.t = 1e9;
  for (var i = 0u; i < 5u; i++) {
    var ctr = vec3f(0.0, 0.0, 0.0);
    var h = vec3f(0.0);
    var col = leaf;
    if (i == 0u) { ctr.y = select(1.6, 1.3, pine); h = vec3f(0.32, ctr.y, 0.32); col = vec3f(0.46, 0.31, 0.18); }
    else if (!pine) {
      if (i == 1u) { ctr.y = 4.0; h = vec3f(1.8, 1.35, 1.8); }
      else if (i == 2u) { ctr.y = 5.7; h = vec3f(1.15, 0.7, 1.15); col = leaf * 1.08; }
      else { continue; }
    } else {
      let t = f32(i - 1u);
      ctr.y = 2.8 + t * 1.15;
      h = vec3f(vec2f(1.9 - t * 0.45), 0.58).xzy;
      col = leaf * (0.92 + 0.05 * t);
    }
    let b = blockRay(e, d, fwd, u.cam.w, s.feet + ctr * k, h * k, s.pose.x, 0.0, 16u * 64u, col);
    if (b.hit && b.t < best.t) { best = b; }
  }
  return best;
}

fn pf(base: u32, off: u32) -> f32 { return bitcast<f32>(players[(base + off) / 4u]); }
fn jf(base: u32, off: u32) -> f32 { return bitcast<f32>(proj[(base + off) / 4u]); }
fn slotColor(s: u32) -> vec3f {
  let h = f32(s) * 0.618034;
  return 0.55 + 0.45 * cos(6.2832 * (fract(h) + vec3f(0.0, 0.33, 0.67)));
}
// a look's colour for slot p (client/looks.mjs tint, after the player records), else the seat's
fn tintOf(p: u32, seat: vec3f) -> vec3f {
  let w = players[${L.NPLAYER * L.PSIZE / 4}u + min(p, 255u)];
  if (p > 255u || (w >> 24u) == 0u) { return seat; }
  return vec3f(f32((w >> 16u) & 255u), f32((w >> 8u) & 255u), f32(w & 255u)) / 255.0;
}

// world point -> screen x, y (px), forward depth, px per metre
fn project(q: vec3f) -> vec4f {
  let r = q - u.cam.xyz;
  let zf = r.x * u.view.x + r.z * u.view.y;
  let xr = -r.x * u.view.y + r.z * u.view.x;
  let s = u.cam.w / max(zf, 0.01);
  return vec4f(u.screen.x * 0.5 + xr * s, u.view.z - r.y * s, zf, s);
}
// this pixel's ray, unit, and the camera's forward axis (level: the pitch is a shear)
fn pixelRay(px: vec2f) -> vec3f {
  let fwd = vec3f(u.view.x, 0.0, u.view.y);
  return normalize(fwd + vec3f(-u.view.y, 0.0, u.view.x) * ((px.x - u.screen.x * 0.5) / u.cam.w) + vec3f(0.0, (u.view.z - px.y) / u.cam.w, 0.0));
}

var<private> CORNERS: array<vec2f, 6> = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));

// instance ranges: balls [0, BALL_CAP), players, projectiles, flashes, markers, trees, then the trees' shadows
@vertex fn vs_splat(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SOut {
  var o: SOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0); // off screen unless set below
  let corner = CORNERS[v];
  var center = vec3f(0.0);
  var half = vec2f(0.0);   // metres
  var color = vec4f(1.0);
  var kind = 0u;
  var minpx = 0.6;
  let dt = u.screen.w;
  if (i < ${L.BALL_CAP}u) {
    if (i >= u.me.x) { return o; }
    let fl = (bitcast<u32>(balls[${6 * L.BALL_CAP}u + i / 4u]) >> ((i & 3u) * 8u)) & 255u;
    if ((fl & ${L.F_LIVE}u) == 0u) { return o; }
    let owner = (bitcast<u32>(balls[${6 * L.BALL_CAP + L.BALL_CAP / 4}u + i / 2u]) >> ((i & 1u) * 16u)) & 65535u;
    let vel = select(vec3f(0.0), vec3f(balls[i + ${3 * L.BALL_CAP}u], balls[i + ${4 * L.BALL_CAP}u], balls[i + ${5 * L.BALL_CAP}u]), (fl & ${L.F_AWAKE}u) != 0u);
    center = vec3f(balls[i], balls[i + ${L.BALL_CAP}u], balls[i + ${2 * L.BALL_CAP}u]) + vel * dt;
    half = vec2f(${L.PHYS.R});
    // a look shows more than the seat's tint does
    let looked = owner < 256u && (players[${L.NPLAYER * L.PSIZE / 4}u + min(owner, 255u)] >> 24u) != 0u;
    color = vec4f(mix(vec3f(1.0), tintOf(owner, slotColor(owner)), select(select(0.25, 0.6, looked), 0.0, owner == u32(u.cup.w))), 1.0);
    kind = 0u;
    minpx = 0.8;
  } else if (i < ${L.BALL_CAP + L.NPLAYER}u) {
    let p = i - ${L.BALL_CAP}u;
    let b = p * ${L.PSIZE}u;
    let fl = players[(b + ${L.P_FL}u) / 4u] & 255u;
    if ((fl & ${L.PF_LIVE}u) == 0u || p == u32(u.cup.w)) { return o; }
    let vel = vec3f(pf(b, ${L.P_VX}u), pf(b, ${L.P_VY}u), pf(b, ${L.P_VZ}u));
    center = vec3f(pf(b, ${L.P_PX}u), pf(b, ${L.P_PY}u) + 0.92, pf(b, ${L.P_PZ}u)) + vel * dt;
    // a camera standing in one (a spectator's, riding the eyes it watches) doesn't see it from inside
    if (distance(center.xz, u.cam.xz) < 0.7 && abs(center.y - u.cam.y) < 1.4) { return o; }
    half = vec2f(1.05, 1.0);
    // its figure: heading and aim from its input word (src/view.mjs), legs stepping as fast as it goes, its look's body
    let w = players[(b + ${L.P_IN}u) / 4u];
    let speed = length(vel.xz);
    o.feet = center - vec3f(0.0, 0.92, 0.0);
    o.pose = vec4f(f32(w & 0x3fffu) / 16384.0 * 6.2832, (f32((w >> 14u) & 0x3ffu) - 512.0) / 1024.0 * 3.1416, u.view.w * (3.0 + speed * 0.9), min(speed / 6.0, 1.0));
    let body = min((players[${L.NPLAYER * L.PSIZE / 4 + L.NPLAYER}u + p] >> 16u) & 255u, ${BODIES.length - 1}u);
    o.skin = vec4f(SKINS[body], f32(FACES[body]));
    o.av = players[${L.NPLAYER * L.PSIZE / 4 + 2 * L.NPLAYER}u + p];
    color = vec4f(tintOf(p, slotColor(p)), 1.0);
    kind = 1u;
    minpx = 1.0;
  } else if (i < ${L.BALL_CAP + L.NPLAYER + L.NPROJ}u) {
    let j = i - ${L.BALL_CAP + L.NPLAYER}u;
    let b = j * ${L.JSIZE}u;
    let k = (proj[(b + ${L.J_KIND}u) / 4u] >> 16u) & 255u;
    if (k == 0u) { return o; }
    let mine = (proj[(b + ${L.J_OWNER}u) / 4u] & 255u) == u32(u.cup.w);
    let vel = vec3f(jf(b, ${L.J_VX}u), jf(b, ${L.J_VY}u), jf(b, ${L.J_VZ}u));
    center = vec3f(jf(b, ${L.J_PX}u), jf(b, ${L.J_PY}u), jf(b, ${L.J_PZ}u)) + vel * select(dt, u.pred.x, mine);
    if (k == ${L.K_ROCKET}u) { half = vec2f(0.22); color = vec4f(1.0, 0.75, 0.3, 1.0); kind = 2u; minpx = 1.5; }
    else { half = vec2f(0.14); color = vec4f(0.25, 0.32, 0.18, 1.0); kind = 0u; minpx = 1.0; }
  } else if (i < ${L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH}u) {
    let f = i - ${L.BALL_CAP + L.NPLAYER + L.NPROJ}u;
    if (f >= u32(u.hole.w)) { return o; }
    let fl = flashes[2u * f];
    let info = flashes[2u * f + 1u]; // age (s), size (m), kind, 0
    center = fl.xyz;
    let grow = clamp(info.x / 0.35, 0.0, 1.0);
    half = vec2f(info.y * (0.35 + 0.65 * grow));
    color = vec4f(select(vec3f(1.0, 0.65, 0.2), vec3f(0.75, 0.4, 1.0), info.z > 1.5), 1.0 - grow);
    kind = 3u;
  } else if (i < ${L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH + 2}u) {
    // markers: 0 the flag over the cup, 1 the arrow over my ball
    let m = i - ${L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH}u;
    if (m == 0u) {
      center = u.cup.xyz + vec3f(0.0, 1.6, 0.0);
      half = vec2f(0.6, 1.6);
      kind = 4u;
      minpx = 3.0;
    } else {
      if (u.me.y == 0xffffffffu) { return o; }
      let bi = u.me.y;
      let fl = (bitcast<u32>(balls[${6 * L.BALL_CAP}u + bi / 4u]) >> ((bi & 3u) * 8u)) & 255u;
      if ((fl & ${L.F_LIVE}u) == 0u) { return o; }
      center = vec3f(balls[bi], balls[bi + ${L.BALL_CAP}u] + 0.9 + 0.12 * sin(u.view.w * 4.0), balls[bi + ${2 * L.BALL_CAP}u]);
      half = vec2f(0.3);
      color = vec4f(1.0, 0.85, 0.2, 1.0);
      kind = 5u;
      minpx = 2.5;
    }
  } else {
    // a tree, or (the second run of instances) its shadow on the ground
    let base = ${L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH + 2}u;
    let shadow = i - base >= ${MAX_TREE}u;
    let t = (i - base) % ${MAX_TREE}u;
    if (t >= u32(u.hudv.z)) { return o; }
    let a = trees[2u * t];      // x, ground y, z, size
    let b = trees[2u * t + 1u]; // turn, style, leaf colour (r, g)
    o.feet = a.xyz;
    o.pose = vec4f(b.x, a.w, b.y, 0.0);
    color = vec4f(unpack4x8unorm(bitcast<u32>(b.z)).rgb, 1.0);
    if (shadow) {
      // where the top's shadow falls: away from the sun, as far as the top is high
      let sd = SUN;
      center = a.xyz - vec3f(sd.x, 0.0, sd.z) / sd.y * 3.6 * a.w + vec3f(0.0, 0.3, 0.0);
      o.feet = center;
      half = vec2f(2.6 * a.w);
      kind = 7u;
    } else {
      center = a.xyz + vec3f(0.0, 3.4 * a.w, 0.0);
      half = vec2f(4.4 * a.w);
      kind = 6u;
    }
    minpx = 0.0;
  }
  let pr = project(center);
  if (pr.z < 0.3 || pr.z > u.screen.z || (kind == 5u && pr.z < 4.0)) { return o; }
  var px = max(half * pr.w, vec2f(minpx, minpx * half.y / max(half.x, 1e-3)));
  if (kind == 5u) { px = min(px, vec2f(4.0 * u.hudv.x)); } // the arrow over my ball stays small
  let s = vec2f(pr.x, pr.y) + corner * px;
  o.pos = vec4f(s.x / u.screen.x * 2.0 - 1.0, 1.0 - s.y / u.screen.y * 2.0, pr.z / u.screen.z, 1.0);
  o.uv = corner;
  o.color = color;
  o.kind = kind;
  return o;
}

// a box's pixel lit as the ground is, with its edges inked
fn shadeBlock(b: Block) -> vec3f {
  return (b.alb * light(b.n, 1.0) + b.glow) * mix(1.0, b.ink, 0.6);
}

struct FOut { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs_splat(s: SOut) -> FOut {
  var o: FOut;
  o.depth = s.pos.z;
  if (s.kind == 1u || s.kind == 6u) {
    let fwd = vec3f(u.view.x, 0.0, u.view.y);
    let d = pixelRay(s.pos.xy);
    var b: Block;
    if (s.kind == 1u) { b = figure(u.cam.xyz, d, fwd, s); } else { b = tree(u.cam.xyz, d, fwd, s); }
    if (!b.hit || b.cover < 0.5) { discard; }
    o.color = vec4f(fogged(shadeBlock(b), b.z), 1.0);
    o.depth = b.z / u.screen.z;
    return o;
  }
  let r2 = dot(s.uv, s.uv);
  var c = s.color.rgb;
  switch s.kind {
    case 0u: { // a ball: shiny plastic
      if (r2 > 1.0) { discard; }
      let n = vec3f(s.uv.x, -s.uv.y, sqrt(1.0 - r2));
      let l = normalize(vec3f(0.3, 0.8, 0.5));
      c = c * (0.5 + 0.6 * max(dot(n, l), 0.0)) + vec3f(0.5) * pow(max(dot(n, normalize(l + vec3f(0.0, 0.0, 1.0))), 0.0), 24.0);
    }
    case 2u: { // a rocket: hot core, glow
      if (r2 > 1.0) { discard; }
      c = mix(vec3f(1.0, 1.0, 0.85), c, sqrt(r2));
    }
    case 4u: { // the flag: pole and pennant, rippling
      let pole = abs(s.uv.x + 0.85) < 0.1;
      let wave = 0.06 * sin(s.uv.x * 5.0 - u.view.w * 6.0) * (s.uv.x + 0.85);
      let fy = s.uv.y - wave;
      let flag = s.uv.x > -0.85 && fy < -0.35 && fy > -1.0 + (s.uv.x + 0.85) * 0.18 && s.uv.x < 1.0 - abs(fy + 0.68) * 0.5;
      if (!pole && !flag) { discard; }
      c = select(vec3f(0.95, 0.95, 0.92), vec3f(0.95, 0.15, 0.12) * (0.9 + 0.6 * wave), flag);
    }
    case 5u: { // my arrow, pointing down
      if (abs(s.uv.x) > (1.0 - s.uv.y) * 0.5 || s.uv.y < -1.0) { discard; }
    }
    default: {}
  }
  o.color = vec4f(c, 1.0);
  return o;
}

@fragment fn fs_flash(s: SOut) -> @location(0) vec4f {
  let r2 = dot(s.uv, s.uv);
  if (r2 > 1.0) { discard; }
  let a = s.color.a * (1.0 - r2);
  return vec4f(mix(s.color.rgb, vec3f(1.0, 1.0, 0.8), (1.0 - r2) * a) * a, a);
}

// A tree's shadow: the pixel's ray met with the level of its foot, a soft
// dark disc there, its depth pulled a metre nearer so slopes don't cut it.
struct SH { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs_shadow(s: SOut) -> SH {
  var o: SH;
  let d = pixelRay(s.pos.xy);
  if (d.y > -1e-4) { discard; }
  let t = (s.feet.y - u.cam.y) / d.y;
  let q = u.cam.xyz + d * t;
  let r = distance(q.xz, s.feet.xz) / (2.2 * s.pose.y);
  if (r > 1.0 || t < 0.0) { discard; }
  let a = 0.4 * (1.0 - smoothstep(0.6, 1.0, r));
  let z = t * dot(d, vec3f(u.view.x, 0.0, u.view.y));
  o.color = vec4f(0.0, 0.0, 0.0, a);
  o.depth = clamp((z - 1.5) / u.screen.z, 0.0, 1.0);
  return o;
}

// ---- HUD: COLS x rows cells of 4 x 6 HUD px (u.hudv.x screen px each, client/lowpoly.mjs hudFrame); each cell a char (low 8 bits) and a colour (bits 8-11)
var<private> PALETTE: array<vec3f, 8> = array<vec3f, 8>(vec3f(1.0), vec3f(1.0, 0.85, 0.25), vec3f(1.0, 0.35, 0.3), vec3f(0.4, 1.0, 0.4),
  vec3f(0.6), vec3f(0.5, 0.85, 1.0), vec3f(1.0, 0.6, 0.2), vec3f(0.8, 0.55, 1.0));

fn glyphBit(cell: vec2i, px: vec2i) -> bool {
  if (cell.x < 0 || cell.y < 0 || cell.x >= ${COLS} || cell.y >= i32(u.me.z)) { return false; }
  if (px.x < 0 || px.x > 2 || px.y < 0 || px.y > 4) { return false; }
  let ch = hud[u32(cell.y) * ${COLS}u + u32(cell.x)] & 255u;
  if (ch < 32u || ch > 95u) { return false; }
  return ((font[ch - 32u] >> u32(14 - (px.y * 3 + px.x))) & 1u) == 1u;
}

fn lit(p: vec2i) -> bool {
  if (p.x < 0 || p.y < 0) { return false; }
  let cell = vec2i(p.x / 4, p.y / 6);
  return glyphBit(cell, vec2i(p.x - cell.x * 4, p.y - cell.y * 6));
}

// ---- the net graph (client/netgraph.mjs): ${GRAPH_PANELS} strips of ${GRAPH_N} columns at the top right, under
// their labels (HUD rows 2, 6, 10, 14), each 17 HUD px tall, newest on the right
fn graphPx(p: vec2i) -> vec4f {
  let col = p.x - (${COLS * 4} - ${GRAPH_N + 4});
  if (u.pred.y < 0.5 || col < 0 || col >= ${GRAPH_N}) { return vec4f(0.0); }
  let k = (p.y - 18) / 24;
  let yy = p.y - 18 - 24 * k;
  if (p.y < 18 || k >= ${GRAPH_PANELS} || yy >= 17) { return vec4f(0.0); }
  let v = graph[u32(k * ${GRAPH_N} + col)];
  let f = (16.5 - f32(yy)) / 17.0; // this pixel's height, 0 at the base to 1 at the top
  let near = 0.5 / 17.0;
  let back = vec4f(0.0, 0.0, 0.0, 0.5);
  if (yy == 16) { return vec4f(0.35, 0.35, 0.35, 0.8); }
  if (k == 0) {
    if (abs(f - v.w) < near) { return vec4f(PALETTE[5], 1.0); }
    if (f < v.x) { return vec4f(PALETTE[3], 0.9); }
    if (f < v.x + v.y) { return vec4f(PALETTE[6], 0.9); }
    if (f < v.x + v.y + v.z) { return vec4f(PALETTE[7], 0.9); }
  } else if (k == 1) {
    if (f < v.x) { return vec4f(PALETTE[6], 0.9); }
  } else if (k == 2) {
    if (abs(f - v.x) < near) { return vec4f(PALETTE[1], 1.0); }
    if (abs(f - v.y) < near) { return vec4f(PALETTE[5], 1.0); }
  } else {
    if (v.y > 3.5) { return vec4f(PALETTE[2], 1.0); }
    if (v.y > 2.5) { return vec4f(PALETTE[7], 1.0); }
    if (v.y > 1.5) { return vec4f(0.35, 0.55, 1.0, 1.0); }
    if (v.x > 0.5 && f < 0.6) { return vec4f(PALETTE[3], 1.0); }
  }
  return back;
}

${HUD_FONT_WGSL}
@fragment fn fs_hud(@builtin(position) q: vec4f) -> @location(0) vec4f {
  // the crosshair, in HUD px from the screen's centre
  let d = vec2i(floor((q.xy - floor(vec2f(u.screen.x, u.screen.y) * 0.5)) / u.hudv.x));
  if ((d.x == 0 && abs(d.y) >= 2 && abs(d.y) <= 4) || (d.y == 0 && abs(d.x) >= 2 && abs(d.x) <= 4)) { return vec4f(1.0, 1.0, 1.0, 0.9); }
  let hp = (q.xy - u.hudv.yw) / u.hudv.x;
  let p = vec2i(floor(hp));
  // the rounder font (client/hudfont.mjs) when the page has its atlas, else the 3x5 font with a shadow
  let roundOn = font[64u] != 0u;
  let t = roundText(hp, ${COLS}u, u.me.z);
  if (t.a > 0.0) { return t; }
  if (!roundOn && lit(p)) {
    let cell = vec2i(p.x / 4, p.y / 6);
    let k = (hud[u32(cell.y) * ${COLS}u + u32(cell.x)] >> 8u) & 7u;
    return vec4f(PALETTE[k], 1.0);
  }
  if (!roundOn && lit(p - vec2i(1, 1))) { return vec4f(0.0, 0.0, 0.0, 0.8); }
  let g = graphPx(p);
  if (g.a > 0.0) { return g; }
  discard;
  return vec4f(0.0);
}
`;

// Trees for a course, drawing only: on a 9 m grid jittered by a hash, thick
// where a slow noise says so, and only in rough with nothing but rough for
// 16 m round them (balls fly through them, so they keep clear of the play)
// and level enough to stand on. Two vec4s each, as the shader's trees.
function plantTrees(hf, surf) {
  const out = new Float32Array(MAX_TREE * 8);
  const bits = new Uint32Array(out.buffer);
  const hash = (x, z, k) => { let h = Math.imul(x * 374761393 + z * 668265263 + k * 2147483647, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (x, z) => {
    const gx = x / 140, gz = z / 140, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = hash(ix, iz, 9), b = hash(ix + 1, iz, 9), c = hash(ix, iz + 1, 9), d = hash(ix + 1, iz + 1, 9);
    const kx = fx * fx * (3 - 2 * fx), kz = fz * fz * (3 - 2 * fz);
    return a + (b - a) * kx + (c - a) * kz + (a - b - c + d) * kx * kz;
  };
  const cell = (x, z) => Math.min(511, Math.max(0, Math.trunc(z * 0.5))) * 512 + Math.min(511, Math.max(0, Math.trunc(x * 0.5)));
  const height = (x, z) => {
    const gx = Math.min(Math.max(x * 0.5, 0), 510.99), gz = Math.min(Math.max(z * 0.5, 0), 510.99);
    const ix = Math.trunc(gx), iz = Math.trunc(gz), fx = gx - ix, fz = gz - iz, i = iz * 512 + ix;
    return hf[i] + (hf[i + 1] - hf[i]) * fx + (hf[i + 512] - hf[i]) * fz + (hf[i] - hf[i + 1] - hf[i + 512] + hf[i + 513]) * fx * fz;
  };
  let n = 0;
  for (let gz = 0; gz < 1024 && n < MAX_TREE; gz += 9) {
    for (let gx = 0; gx < 1024 && n < MAX_TREE; gx += 9) {
      if (hash(gx, gz, 1) > smooth(gx, gz) * 0.9 - 0.1) continue;
      const x = gx + hash(gx, gz, 2) * 9, z = gz + hash(gx, gz, 3) * 9;
      if (x < 8 || z < 8 || x > 1016 || z > 1016) continue;
      let clear = surf[cell(x, z)] === 1;
      for (let k = 0; clear && k < 12; k++) {
        const a = k * Math.PI / 6;
        clear = surf[cell(x + Math.cos(a) * 8, z + Math.sin(a) * 8)] === 1 && surf[cell(x + Math.cos(a) * 16, z + Math.sin(a) * 16)] === 1;
      }
      if (!clear) continue;
      const y = height(x, z);
      if (Math.abs(height(x + 2, z) - height(x - 2, z)) > 2.5 || Math.abs(height(x, z + 2) - height(x, z - 2)) > 2.5) continue;
      const leaf = LEAVES[Math.min(LEAVES.length - 1, Math.floor(hash(gx, gz, 4) ** 3 * LEAVES.length))];
      out.set([x, y - 0.2, z, 0.8 + 0.6 * hash(gx, gz, 5), hash(gx, gz, 6) * Math.PI / 2, hash(gx, gz, 7) < 0.3 ? 1 : 0, 0, 0], n * 8);
      bits[n * 8 + 6] = Math.round(leaf[0] * 255) | (Math.round(leaf[1] * 255) << 8) | (Math.round(leaf[2] * 255) << 16) | (0x40 << 24); // a top byte that keeps the float normal
      n++;
    }
  }
  return out.subarray(0, n * 8);
}

// present: false draws nothing to the canvas (only capture() renders), for
// headless browsers, where presenting a WebGPU canvas loses the device.
export async function createRenderer(canvas, { present = true, device: shared = null } = {}) {
  // a page with several renderers (Fireplace) gives them one device, so one can draw into another's texture
  let device = shared;
  if (!device) {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU is not available in this browser');
    device = await adapter.requestDevice();
  }
  device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', e.error.message));
  const format = navigator.gpu.getPreferredCanvasFormat();
  const ctx = present ? canvas.getContext('webgpu') : null;
  ctx?.configure({ device, format, alphaMode: 'opaque' });
  const W = canvas.width, H = canvas.height;
  const { hudScale: hs, hudX, hudY } = hudFrame(W, H);
  const rows = Math.floor(200 / 6);
  const module = device.createShaderModule({ code: WGSL });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('; '));

  const ubuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const storage = (size) => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const ballBuf = storage(BALL_WORDS * 4);
  const playerBuf = storage(L.NPLAYER * L.PSIZE + L.NPLAYER * 12); // the records, then each slot's tint, look and avatar
  const projBuf = storage(L.NPROJ * L.JSIZE);
  const flashBuf = storage(MAX_FLASH * 32);
  const hudBuf = storage(COLS * rows * 4);
  const fontAll = fontData({ round: roundWanted() });
  const fontBuf = storage(fontAll.length * 4);
  const graphBuf = storage(GRAPH_PANELS * GRAPH_N * 16);
  const treeBuf = storage(MAX_TREE * 32);
  device.queue.writeBuffer(fontBuf, 0, fontAll);
  const hmap = device.createTexture({ size: [512, 512], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const smap = device.createTexture({ size: [512, 512], format: 'r8uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const depth = device.createTexture({ size: [W, H], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
      ...[3, 4, 5, 6, 7, 8, 9, 10].map((b) => ({ binding: b, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } })),
    ],
  });
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: ubuf } },
      { binding: 1, resource: hmap.createView() },
      { binding: 2, resource: smap.createView() },
      ...[ballBuf, playerBuf, projBuf, flashBuf, hudBuf, fontBuf, graphBuf, treeBuf].map((buffer, k) => ({ binding: 3 + k, resource: { buffer } })),
    ],
  });
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const pipe = (vs, fs, { depthWrite, depthCompare, blend }) => device.createRenderPipeline({
    layout: pl,
    vertex: { module, entryPoint: vs },
    fragment: { module, entryPoint: fs, targets: [{ format, blend }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: depthWrite, depthCompare },
  });
  const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const terrain = pipe('vs_full', 'fs_terrain', { depthWrite: true, depthCompare: 'always' });
  const splat = pipe('vs_splat', 'fs_splat', { depthWrite: true, depthCompare: 'less' });
  const shadow = pipe('vs_splat', 'fs_shadow', { depthWrite: false, depthCompare: 'less', blend: over });
  const flash = pipe('vs_splat', 'fs_flash', { depthWrite: false, depthCompare: 'less', blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } });
  const hudPipe = pipe('vs_full', 'fs_hud', { depthWrite: false, depthCompare: 'always', blend: over });

  const uf = new Float32Array(32);
  const uu = new Uint32Array(uf.buffer);
  const hud = new Uint32Array(COLS * rows);
  const flashData = new Float32Array(MAX_FLASH * 8);
  let hmax = 100;
  let ntree = 0;

  return {
    rows, width: W, height: H, hudScale: hs, hudX, hudY,
    // The terrain, once per room: heights (1/256 m) and surfaces out of shared memory, and the trees from them.
    setTerrain(u8) {
      const h16 = new Uint16Array(u8.buffer, L.TERRAIN_H, 512 * 512);
      const hf = new Float32Array(512 * 512);
      hmax = 0;
      for (let i = 0; i < hf.length; i++) { hf[i] = h16[i] / 256; hmax = Math.max(hmax, hf[i]); }
      const surf = u8.slice(L.TERRAIN_S, L.TERRAIN_S + 512 * 512);
      device.queue.writeTexture({ texture: hmap }, hf, { bytesPerRow: 512 * 4 }, [512, 512]);
      device.queue.writeTexture({ texture: smap }, surf, { bytesPerRow: 512 }, [512, 512]);
      const trees = plantTrees(hf, surf);
      ntree = trees.length / 8;
      device.queue.writeBuffer(treeBuf, 0, trees);
    },

    // One frame. s: { cam: [x, y, z], yaw, pitch (radians), time, dt, dtPred, proj, cup, dir, slot, myBall, nballs, flashes: [{ pos, age, size, kind }], text: Uint32Array, graph: the net graph's Float32Array or null }
    // dt extrapolates the confirmed world; projectiles come from address `proj`
    // (the prediction's copy, where mine are ahead), mine extrapolated by dtPred.
    // Drawn to the canvas, or to `target` (a texture) when given.
    frame(u8, s, target) {
      if (!ctx && !target) return;
      const focal = focalFor(W, H, 0.75);
      uf.set([s.cam[0], s.cam[1], s.cam[2], focal, Math.cos(s.yaw), Math.sin(s.yaw), H / 2 + Math.tan(Math.max(-1.35, Math.min(1.35, s.pitch))) * focal, s.time,
        W, H, FAR, s.dt, s.cup[0], s.cup[1], s.cup[2], s.slot, s.dir[0], s.dir[1], hmax + 2, Math.min(s.flashes.length, MAX_FLASH)]);
      uu[20] = s.nballs; uu[21] = s.myBall < 0 ? 0xffffffff : s.myBall; uu[22] = rows; uu[23] = 0;
      uf[24] = s.dtPred ?? s.dt;
      uf[25] = s.graph ? 1 : 0;
      uf.set([hs, hudX, ntree, hudY], 28);
      if (s.graph) device.queue.writeBuffer(graphBuf, 0, s.graph);
      device.queue.writeBuffer(ubuf, 0, uf);
      const n = s.nballs;
      if (n) {
        for (const [k, a] of [L.PX, L.PY, L.PZ, L.VX, L.VY, L.VZ].entries()) device.queue.writeBuffer(ballBuf, k * L.BALL_CAP * 4, u8, a, ((n + 3) & ~3) * 4);
        device.queue.writeBuffer(ballBuf, 6 * L.BALL_CAP * 4, u8, L.FLAGS, (n + 3) & ~3);
        device.queue.writeBuffer(ballBuf, (6 * L.BALL_CAP + L.BALL_CAP / 4) * 4, u8, L.OWNER, ((n + 1) & ~1) * 2);
      }
      device.queue.writeBuffer(playerBuf, 0, u8, L.PLAYERS, L.NPLAYER * L.PSIZE);
      device.queue.writeBuffer(playerBuf, L.NPLAYER * L.PSIZE, s.tints ?? NO_TINTS);
      device.queue.writeBuffer(playerBuf, L.NPLAYER * L.PSIZE + L.NPLAYER * 4, s.looks ?? NO_LOOKS);
      device.queue.writeBuffer(playerBuf, L.NPLAYER * L.PSIZE + L.NPLAYER * 8, s.avatars ?? NO_AVATARS);
      device.queue.writeBuffer(projBuf, 0, u8, s.proj ?? L.PROJ, L.NPROJ * L.JSIZE);
      s.flashes.slice(0, MAX_FLASH).forEach((f, k) => flashData.set([f.pos[0], f.pos[1], f.pos[2], 0, f.age, f.size, f.kind, 0], k * 8));
      device.queue.writeBuffer(flashBuf, 0, flashData);
      hud.set(s.text.subarray(0, hud.length));
      device.queue.writeBuffer(hudBuf, 0, hud);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: (target || ctx.getCurrentTexture()).createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 },
      });
      pass.setBindGroup(0, bind);
      pass.setPipeline(terrain);
      pass.draw(3);
      const trees0 = L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH + 2;
      pass.setPipeline(shadow);
      if (ntree) pass.draw(6, ntree, 0, trees0 + MAX_TREE);
      pass.setPipeline(splat);
      if (n) pass.draw(6, n, 0, 0);
      pass.draw(6, L.NPLAYER + L.NPROJ, 0, L.BALL_CAP);
      pass.draw(6, 2, 0, L.BALL_CAP + L.NPLAYER + L.NPROJ + MAX_FLASH);
      if (ntree) pass.draw(6, ntree, 0, trees0);
      pass.setPipeline(flash);
      if (s.flashes.length) pass.draw(6, Math.min(s.flashes.length, MAX_FLASH), 0, L.BALL_CAP + L.NPLAYER + L.NPROJ);
      pass.setPipeline(hudPipe);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    },

    // One frame read back from the GPU as RGBA bytes, for screenshots where
    // the browser can't composite a WebGPU canvas (headless runs).
    async capture(u8, s) {
      const tex = device.createTexture({ size: [W, H], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this.frame(u8, s, tex);
      const row = Math.ceil(W * 4 / 256) * 256;
      const buf = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [W, H]);
      device.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const rgba = new Uint8ClampedArray(W * H * 4);
      const bgra = format === 'bgra8unorm';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * row + x * 4, o = (y * W + x) * 4;
          rgba[o] = src[i + (bgra ? 2 : 0)]; rgba[o + 1] = src[i + 1]; rgba[o + 2] = src[i + (bgra ? 0 : 2)]; rgba[o + 3] = 255;
        }
      }
      buf.unmap();
      buf.destroy();
      tex.destroy();
      return { width: W, height: H, rgba };
    },
  };
}
