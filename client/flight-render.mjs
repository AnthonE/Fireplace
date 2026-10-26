// Flight's WebGPU renderer (src/flight.wat): the arena's look (the terrain
// ray-marched per pixel, the map's boxes ray-traced in the same pass with
// their shadows, a 3x5 HUD font over rectangles), seen through a camera that
// can point anywhere: a full basis (forward, right, up) instead of golf's
// yaw and sheared pitch, so a chase camera can look straight down a dive.
// Ships are ray-traced in their own quads: a small distance field (a
// fuselage, a canopy, swept wings, fins at the tips, an engine) in the
// ship's frame, its nose and pitch from the record, banked into its turns
// and spun through a barrel roll, the engine bright while it boosts. Lasers
// are beams, charge shots and bombs glowing balls, blasts and sparks blended
// sprites. The map's edge shows as a red grid as you near it. Ships and
// projectiles come straight from shared memory; everything else from the
// main thread each frame. Nothing here is hashed.
import * as L from '../src/layout.mjs';
import * as F from '../src/flight.mjs';
import { FONT } from './font.mjs';
import { GRAPH_N, GRAPH_PANELS } from './netgraph.mjs';

export const COLS = 80;
export const MAX_SPRITE = 384;
export const MAX_BEAM = 512;
export const MAX_RECT = 160;
export const FAR = 1100;
const NO_TINTS = new Uint32Array(L.NPLAYER);
export const PALETTE = [[1, 1, 1], [1, 0.85, 0.25], [1, 0.35, 0.3], [0.4, 1, 0.4], [0.6, 0.6, 0.6], [0.5, 0.85, 1], [1, 0.6, 0.2], [0.8, 0.55, 1]];
const vec3 = (c) => `vec3f(${c.map((v) => v.toFixed(3)).join(', ')})`;

// The camera's basis from its yaw and pitch (radians; the yaw as the sim's,
// 0 along +x turning toward +z) and a roll about the forward axis.
export function basis(yaw, pitch, roll = 0) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [cp * cy, sp, cp * sy];
  const r0 = [-sy, 0, cy];
  const u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
  const c = Math.cos(roll), s = Math.sin(roll);
  return { f, r: r0.map((v, k) => v * c - u0[k] * s), u: u0.map((v, k) => v * c + r0[k] * s) };
}

// The focal length (px) of a frame state's camera on a W x H screen.
export const focalOf = (s, W) => W * 0.62 * (s.zoom || 1);

// Where world point q lands on the screen through frame state s ({ cam,
// basis }), as the shader's project() puts it: [x, y, depth ahead of the eye
// (m; under 0.3 behind it)]. For the HUD's reticles and markers.
export function project(s, W, H, q) {
  const { f, r, u } = s.basis;
  const d = [q[0] - s.cam[0], q[1] - s.cam[1], q[2] - s.cam[2]];
  const zf = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const k = focalOf(s, W) / Math.max(zf, 0.01);
  return [W / 2 + (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) * k, H / 2 - (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * k, zf];
}

const WGSL = /* wgsl */ `
struct U {
  cam: vec4f,     // eye x, y, z, focal (px)
  fwd: vec4f,     // forward, time (s)
  right: vec4f,   // right, far (m)
  up: vec4f,      // up, highest ground (m)
  screen: vec4f,  // width, height, extrapolate the confirmed world (s), extrapolate my own ship and shots (s)
  misc: vec4f,    // my slot (drawn from the prediction), sprites, beams, rects
  hud: vec4f,     // rows, crosshair kind, hit marker (0..1), damage flash (0..1)
  map: vec4f,     // boxes, groups, sides (0 none, 1 one against the rest, 2 red and blue), the ceiling (m)
  bounds: vec4f,  // the map's edge: x0, x1, z0, z1
  fx: vec4f,      // net graph shown, the radar's centre x, y and radius (px)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hmap: texture_2d<f32>;
@group(0) @binding(2) var smap: texture_2d<u32>;
@group(0) @binding(3) var<storage, read> players: array<u32>;
@group(0) @binding(4) var<storage, read> proj: array<u32>;
@group(0) @binding(5) var<storage, read> sprites: array<vec4f>;
@group(0) @binding(6) var<storage, read> beams: array<vec4f>;
@group(0) @binding(7) var<storage, read> rects: array<vec4f>;
@group(0) @binding(8) var<storage, read> hud: array<u32>;
@group(0) @binding(9) var<storage, read> font: array<u32>;
@group(0) @binding(10) var<storage, read> graph: array<vec4f>;
@group(0) @binding(11) var<storage, read> boxes: array<vec4f>;  // two a box: x0, y0, z0, material | x1, y1, z1, 0
@group(0) @binding(12) var<storage, read> groups: array<vec4f>; // two a group: x0, y0, z0, first box | x1, y1, z1, count

const SKY_LO = vec3f(0.72, 0.8, 0.9);
const SKY_HI = vec3f(0.16, 0.34, 0.68);
const SUN = vec3f(0.42, 0.78, 0.46);
const FOG = 650.0;

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

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), s.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), s.x), s.y);
}

// grass, rock, sand, metal
fn surfColor(s: u32, w: vec2f) -> vec3f {
  let n = hash2(floor(w * 2.0));
  switch s {
    case 0u: { return vec3f(0.3, 0.5, 0.2) * (0.86 + 0.24 * n) * (0.9 + 0.2 * hash2(floor(w * 0.08))); }
    case 1u: { return vec3f(0.48, 0.43, 0.36) * (0.8 + 0.35 * hash2(floor(w * 0.7))); }
    case 2u: { return vec3f(0.72, 0.62, 0.42) * (0.92 + 0.12 * n); }
    default: {
      let seam = min(abs(fract(w.x / 4.0) - 0.5), abs(fract(w.y / 4.0) - 0.5)) < 0.04;
      return select(vec3f(0.5, 0.56, 0.62), vec3f(0.3, 0.34, 0.4), seam);
    }
  }
}

fn ground(w: vec2f) -> vec3f {
  let g = clamp(w * 0.5 - 0.5, vec2f(0.0), vec2f(510.0));
  let i = vec2i(g);
  let f = g - vec2f(i);
  let a = surfColor(textureLoad(smap, i, 0).r, w);
  let b = surfColor(textureLoad(smap, i + vec2i(1, 0), 0).r, w);
  let c = surfColor(textureLoad(smap, i + vec2i(0, 1), 0).r, w);
  let d = surfColor(textureLoad(smap, i + vec2i(1, 1), 0).r, w);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

var<private> MATERIAL: array<vec3f, 6> = array<vec3f, 6>(vec3f(0.56, 0.6, 0.64), vec3f(0.47, 0.42, 0.36), vec3f(0.24, 0.27, 0.31),
  vec3f(0.62, 0.17, 0.14), vec3f(0.17, 0.27, 0.64), vec3f(0.75, 0.95, 1.0));

struct Hit { t: f32, n: vec3f, k: u32 };

fn traceBoxes(o: vec3f, d: vec3f, tmax: f32) -> Hit {
  var h: Hit;
  h.t = tmax;
  h.k = 0xffffffffu;
  let inv = 1.0 / select(d, vec3f(1e-9), abs(d) < vec3f(1e-9));
  for (var g = 0u; g < u32(u.map.y); g++) {
    let gl = groups[2u * g];
    let gh = groups[2u * g + 1u];
    let ga = (gl.xyz - o) * inv;
    let gb = (gh.xyz - o) * inv;
    let gn = min(ga, gb);
    let gf = max(ga, gb);
    if (max(max(gn.x, gn.y), max(gn.z, 0.0)) > min(min(gf.x, gf.y), min(gf.z, h.t))) { continue; }
    let first = u32(gl.w);
    for (var k = first; k < first + u32(gh.w); k++) {
      let ta = (boxes[2u * k].xyz - o) * inv;
      let tb = (boxes[2u * k + 1u].xyz - o) * inv;
      let tn = min(ta, tb);
      let tf = max(ta, tb);
      let t0 = max(max(tn.x, tn.y), tn.z);
      if (t0 <= min(min(tf.x, tf.y), tf.z) && t0 > 0.0 && t0 < h.t) {
        h.t = t0;
        h.k = k;
        if (t0 == tn.x) { h.n = vec3f(-sign(d.x), 0.0, 0.0); } else if (t0 == tn.y) { h.n = vec3f(0.0, -sign(d.y), 0.0); } else { h.n = vec3f(0.0, 0.0, -sign(d.z)); }
      }
    }
  }
  return h;
}

fn sunlit(p: vec3f) -> f32 {
  if (u.map.x < 0.5) { return 1.0; }
  return select(1.0, 0.0, traceBoxes(p, SUN, 400.0).k != 0xffffffffu);
}

fn boxColor(k: u32, w: vec3f, n: vec3f) -> vec3f {
  let lo = boxes[2u * k];
  let hi = boxes[2u * k + 1u].xyz;
  let m = min(u32(lo.w), 5u);
  var uv = w.xy;
  var e = min(min(w.x - lo.x, hi.x - w.x), min(w.y - lo.y, hi.y - w.y));
  if (abs(n.x) > 0.5) { uv = w.zy; e = min(min(w.z - lo.z, hi.z - w.z), min(w.y - lo.y, hi.y - w.y)); }
  if (abs(n.y) > 0.5) { uv = w.xz; e = min(min(w.x - lo.x, hi.x - w.x), min(w.z - lo.z, hi.z - w.z)); }
  var c = MATERIAL[m];
  if (m == 1u) { c *= 0.75 + 0.4 * hash2(floor(uv * 1.5)); }
  else if (m != 5u) {
    let seam = min(abs(fract(uv.x / 2.0) - 0.5), abs(fract(uv.y / 1.0) - 0.5)) > 0.47;
    c *= select(1.0, 0.82, seam) * (0.94 + 0.08 * hash2(floor(uv * 0.5)));
  }
  return c * select(1.0, 0.6, e < 0.08);
}

fn sky(d: vec3f) -> vec3f {
  var c = mix(SKY_LO, SKY_HI, clamp(d.y * 1.8 + 0.1, 0.0, 1.0));
  c += vec3f(1.0, 0.9, 0.7) * pow(max(dot(d, SUN), 0.0), 300.0);
  // clouds: a high flat layer, thin
  if (d.y > 0.02) {
    let q = u.cam.xz + d.xz * ((400.0 - u.cam.y) / d.y);
    let n = vnoise(q / 140.0) * 0.6 + vnoise(q / 47.0) * 0.3 + vnoise(q / 17.0) * 0.1;
    c = mix(c, vec3f(0.96, 0.97, 1.0), smoothstep(0.5, 0.75, n) * 0.75 * clamp(d.y * 6.0, 0.0, 1.0));
  }
  return c;
}

fn dither(c: vec3f, p: vec2f) -> vec3f {
  var m = array<f32, 4>(0.0, 0.5, 0.75, 0.25);
  let k = m[(u32(p.x) & 1u) + 2u * (u32(p.y) & 1u)];
  return floor(c * 31.0 + k) / 31.0;
}

// The ray through screen pixel p.
fn rayOf(p: vec2f) -> vec3f {
  let sx = (p.x - u.screen.x * 0.5) / u.cam.w;
  let sy = (u.screen.y * 0.5 - p.y) / u.cam.w;
  return normalize(u.fwd.xyz + u.right.xyz * sx + u.up.xyz * sy);
}

// The map's edge, over what the ray reaches by t: a red grid on each side's
// plane between the ground and the ceiling, fading in within 140 m.
fn edge(c: vec3f, d: vec3f, t: f32) -> vec3f {
  var o = c;
  let b = u.bounds;
  for (var k = 0u; k < 4u; k++) {
    let x = k < 2u;
    let plane = select(select(b.w, b.z, k == 2u), select(b.y, b.x, k == 0u), x);
    let dd = select(d.z, d.x, x);
    let oo = select(u.cam.z, u.cam.x, x);
    if (abs(dd) < 1e-5) { continue; }
    let s = (plane - oo) / dd;
    if (s <= 0.0 || s >= t || s > 140.0) { continue; }
    let q = u.cam.xyz + d * s;
    let along = select(q.x, q.z, x);
    let lo = select(b.x, b.z, x);
    let hi = select(b.y, b.w, x);
    if (along < lo || along > hi || q.y > u.map.w) { continue; }
    let g = fract(vec2f(along, q.y) / 8.0);
    let line = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)) < 0.04;
    let a = (1.0 - s / 140.0) * select(0.1, 0.55, line);
    o = mix(o, vec3f(1.0, 0.25, 0.2), a);
  }
  return o;
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
  let d = rayOf(p.xy);
  let fz = dot(d, u.fwd.xyz); // forward depth a metre along the ray
  let k = 0.012 * 240.0 / u.cam.w;
  let bh = traceBoxes(u.cam.xyz, d, u.right.w);
  var t = 0.3;
  var prev = 0.0;
  var hit = false;
  loop {
    let w = u.cam.xyz + d * t;
    if (w.y <= hgt(w.x, w.z)) { hit = true; break; }
    if (d.y >= 0.0 && w.y > u.up.w) { break; }
    prev = t;
    t += 0.04 + t * k;
    if (t > min(u.right.w, bh.t)) { break; }
  }
  if (bh.k != 0xffffffffu && (!hit || bh.t < t)) {
    let w = u.cam.xyz + d * bh.t;
    var c = boxColor(bh.k, w, bh.n);
    if (u32(boxes[2u * bh.k].w) != 5u) {
      c *= 0.42 + 0.68 * max(dot(bh.n, SUN), 0.0) * sunlit(w + bh.n * 0.01) + 0.06 * bh.n.y;
    }
    c = mix(c, SKY_LO, 1.0 - exp(-bh.t / FOG));
    c = edge(c, d, bh.t);
    o.color = vec4f(dither(c, p.xy), 1.0);
    o.depth = bh.t * fz / u.right.w;
    return o;
  }
  if (!hit) {
    let c = edge(sky(d), d, 1e9);
    o.color = vec4f(dither(c, p.xy), 1.0);
    o.depth = 1.0;
    return o;
  }
  var lo = prev;
  var hi = t;
  for (var i = 0; i < 6; i++) {
    let m = 0.5 * (lo + hi);
    let w = u.cam.xyz + d * m;
    if (w.y <= hgt(w.x, w.z)) { hi = m; } else { lo = m; }
  }
  t = hi;
  let w = u.cam.xyz + d * t;
  let n = normalize(vec3f(hgt(w.x - 1.0, w.z) - hgt(w.x + 1.0, w.z), 2.0, hgt(w.x, w.z - 1.0) - hgt(w.x, w.z + 1.0)));
  var c = ground(w.xz);
  c = mix(c, vec3f(0.46, 0.41, 0.35) * (0.8 + 0.3 * hash2(floor(w.xz * 0.5))), smoothstep(0.82, 0.7, n.y));
  c *= 0.45 + 0.65 * max(dot(n, SUN), 0.0) * select(1.0, sunlit(w + vec3f(0.0, 0.05, 0.0)), t < 200.0);
  c = mix(c, SKY_LO, 1.0 - exp(-t / FOG));
  c = edge(c, d, t);
  o.color = vec4f(dither(c, p.xy), 1.0);
  o.depth = t * fz / u.right.w;
  return o;
}

// ---- projection shared by every splat and beam
fn project(q: vec3f) -> vec4f {
  let r = q - u.cam.xyz;
  let zf = dot(r, u.fwd.xyz);
  let s = u.cam.w / max(zf, 0.01);
  return vec4f(u.screen.x * 0.5 + dot(r, u.right.xyz) * s, u.screen.y * 0.5 - dot(r, u.up.xyz) * s, zf, s);
}

fn pf(base: u32, off: u32) -> f32 { return bitcast<f32>(players[(base + off) / 4u]); }
fn jf(base: u32, off: u32) -> f32 { return bitcast<f32>(proj[(base + off) / 4u]); }
fn slotColor(s: u32) -> vec3f {
  let h = f32(s) * 0.618034;
  return 0.5 + 0.4 * cos(6.2832 * (fract(h) + vec3f(0.0, 0.33, 0.67)));
}
fn tintOf(p: u32, seat: vec3f) -> vec3f {
  let w = players[${L.NPLAYER * L.PSIZE / 4}u + min(p, 255u)];
  if (p > 255u || (w >> 24u) == 0u) { return seat; }
  return vec3f(f32((w >> 16u) & 255u), f32((w >> 8u) & 255u), f32(w & 255u)) / 255.0;
}

var<private> CORNERS: array<vec2f, 6> = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));

// ---- ships: a quad round each one's bounding ball, the ship ray-traced in it
struct ShipOut {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) center: vec4f, // centre, radius (m)
  @location(1) @interpolate(flat) f: vec4f,      // nose, boosting (1)
  @location(2) @interpolate(flat) r: vec4f,      // right wing, the hull's flash (0..1)
  @location(3) @interpolate(flat) up: vec4f,     // up, 0
  @location(4) @interpolate(flat) color: vec4f,  // the wings' colour, far (1: a dot will do)
};
const SHIP_R = 2.7;

@vertex fn vs_ship(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> ShipOut {
  var o: ShipOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  let b = i * ${L.PSIZE}u;
  let fl = players[(b + ${L.P_FL}u) / 4u] & 255u;
  if ((fl & ${L.PF_LIVE}u) == 0u || (fl & ${L.PF_DEAD}u) != 0u) { return o; }
  let dt = select(u.screen.z, u.screen.w, i == u32(u.misc.x));
  let vel = vec3f(pf(b, ${L.P_VX}u), pf(b, ${L.P_VY}u), pf(b, ${L.P_VZ}u));
  let c = vec3f(pf(b, ${L.P_PX}u), pf(b, ${L.P_PY}u), pf(b, ${L.P_PZ}u)) + vel * dt;
  // the nose: F_YAW the high half of the word at 36, F_PITCH the low half of the word at 40 (signed)
  let wy = players[(b + 36u) / 4u];
  let wp = players[(b + 40u) / 4u];
  let wb = players[(b + 44u) / 4u];
  let yaw = f32(wy >> 16u) / 16384.0 * 6.2832;
  let pitch = f32(bitcast<i32>(wp << 16u) >> 16u) / 16384.0 * 6.2832;
  let rollTicks = f32((wp >> 24u) & 255u);
  let bits = (wb >> 8u) & 255u;
  let input = players[(b + ${L.P_IN}u) / 4u];
  let fwd = vec3f(cos(pitch) * cos(yaw), sin(pitch), cos(pitch) * sin(yaw));
  let r0 = vec3f(-sin(yaw), 0.0, cos(yaw));
  let u0 = cross(r0, fwd);
  // banked into the turn its pilot asks for, spun through a barrel roll
  let aim = f32((input & 0x7ffu) << 3u);
  var dy = aim - f32(wy >> 16u);
  dy = dy - 16384.0 * round(dy / 16384.0);
  var roll = clamp(dy / 1400.0, -1.0, 1.0) * 0.85;
  if (rollTicks > 0.0) {
    let k = 1.0 - rollTicks / ${F.ROLL_TICKS}.0;
    roll += select(1.0, -1.0, (bits & ${F.FB_LEFT}u) != 0u) * 6.2832 * k;
  }
  let cr = cos(roll);
  let sr = sin(roll);
  let rr = r0 * cr - u0 * sr;
  let uu = u0 * cr + r0 * sr;
  let pr = project(c);
  if (pr.z < 0.3 || pr.z > u.right.w) { return o; }
  var color = tintOf(i, slotColor(i));
  if (u.map.z > 1.5) { color = select(vec3f(0.92, 0.22, 0.16), vec3f(0.22, 0.42, 1.0), (fl & ${L.PF_BLUE}u) != 0u); }
  else if (u.map.z > 0.5) { color = vec3f(0.3, 0.5, 0.95); }
  if ((fl & ${L.PF_JUGG}u) != 0u) { color = vec3f(1.0, 0.72, 0.15); }
  let boosting = ((input >> ${L.AW_MOVE}u) & 1u) != 0u && (bits & ${F.FB_SPENT}u) == 0u && ((wp >> 16u) & 255u) > 0u;
  let px = max(SHIP_R * pr.w, 1.6);
  let s = pr.xy + CORNERS[v] * px;
  o.pos = vec4f(s.x / u.screen.x * 2.0 - 1.0, 1.0 - s.y / u.screen.y * 2.0, pr.z / u.right.w, 1.0);
  o.center = vec4f(c, SHIP_R);
  o.f = vec4f(fwd, select(0.0, 1.0, boosting));
  o.r = vec4f(rr, 0.0);
  o.up = vec4f(uu, 0.0);
  o.color = vec4f(color, select(0.0, 1.0, SHIP_R * pr.w < 2.5));
  return o;
}

fn sdEll(p: vec3f, r: vec3f) -> f32 {
  let k0 = length(p / r);
  let k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}
fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
// The ship in its own frame (x the nose, y up, z the right wing), metres:
// the distance and which part (0 the hull, 1 the canopy, 2 the wings, 3 the
// fins, 4 the engine).
fn shipSdf(p: vec3f) -> vec2f {
  var d = vec2f(sdEll(p - vec3f(0.15, 0.0, 0.0), vec3f(2.1, 0.36, 0.44)), 0.0);
  let canopy = sdEll(p - vec3f(0.45, 0.26, 0.0), vec3f(0.62, 0.24, 0.24));
  if (canopy < d.x) { d = vec2f(canopy, 1.0); }
  let az = abs(p.z);
  // swept back and dipping a little toward the tips, thinner and narrower out there
  let span = clamp(az, 0.3, 2.0);
  let wq = vec3f(p.x + 0.5 * span + 0.15, p.y + 0.08 * span, az - 1.15);
  let wing = sdBox(wq, vec3f(0.62 - 0.2 * span, 0.045, 0.85)) * 0.8;
  if (wing < d.x) { d = vec2f(wing, 2.0); }
  let fq = vec3f(p.x + 1.05 - 0.45 * p.y, p.y - 0.12, az - 1.98);
  let fin = sdBox(fq, vec3f(0.42, 0.5, 0.035)) * 0.8;
  if (fin < d.x) { d = vec2f(fin, 3.0); }
  let eng = sdEll(p - vec3f(-1.7, 0.0, 0.0), vec3f(0.5, 0.3, 0.42));
  if (eng < d.x) { d = vec2f(eng, 4.0); }
  return d;
}

struct ShipFrag { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs_ship(s: ShipOut) -> ShipFrag {
  var o: ShipFrag;
  let d = rayOf(s.pos.xy);
  let oc = u.cam.xyz - s.center.xyz;
  // into the ship's frame
  let lo = vec3f(dot(oc, s.f.xyz), dot(oc, s.up.xyz), dot(oc, s.r.xyz));
  let ld = vec3f(dot(d, s.f.xyz), dot(d, s.up.xyz), dot(d, s.r.xyz));
  // the bounding ball's span along the ray
  let b = dot(lo, ld);
  let disc = b * b - dot(lo, lo) + s.center.w * s.center.w;
  if (disc < 0.0) { discard; }
  var t = max(-b - sqrt(disc), 0.3);
  let t1 = -b + sqrt(disc);
  var part = -1.0;
  if (s.color.w > 0.5) {
    // far off: a dot of the wings' colour
    t = max(-b, 0.3);
    part = 2.0;
  } else {
    for (var k = 0; k < 48; k++) {
      let h = shipSdf(lo + ld * t);
      if (h.x < 0.004 * t) { part = h.y; break; }
      t += max(h.x, 0.01);
      if (t > t1) { break; }
    }
  }
  if (part < 0.0) { discard; }
  let p = lo + ld * t;
  var n = vec3f(0.0, 1.0, 0.0);
  if (s.color.w < 0.5) {
    let e = vec2f(0.01, -0.01);
    n = normalize(e.xyy * shipSdf(p + e.xyy).x + e.yyx * shipSdf(p + e.yyx).x + e.yxy * shipSdf(p + e.yxy).x + e.xxx * shipSdf(p + e.xxx).x);
  }
  // back to the world for the light
  let nw = normalize(s.f.xyz * n.x + s.up.xyz * n.y + s.r.xyz * n.z);
  var c = vec3f(0.82, 0.84, 0.88);
  if (part == 1.0) { c = vec3f(0.15, 0.3, 0.55) + vec3f(0.6) * pow(max(dot(reflect(d, nw), SUN), 0.0), 20.0); }
  else if (part == 2.0) { c = mix(vec3f(0.85, 0.86, 0.9), s.color.rgb, select(0.35, 1.0, abs(p.z) > 1.3 || abs(p.x + 0.5 * clamp(abs(p.z), 0.3, 2.0) + 0.15) < 0.25)); }
  else if (part == 3.0) { c = s.color.rgb * 0.85; }
  else if (part == 4.0) { c = vec3f(0.3, 0.32, 0.36); }
  var lit = 0.4 + 0.7 * max(dot(nw, SUN), 0.0) + 0.25 * pow(1.0 - max(dot(nw, -d), 0.0), 3.0);
  if (part == 1.0) { lit = 1.0; }
  c *= lit;
  // the engine's mouth: the back of the engine glows, white hot while boosting
  if (part == 4.0 && p.x < -1.95) { c = mix(vec3f(0.3, 0.75, 1.0), vec3f(1.0, 0.95, 0.8), s.f.w) * 1.4; }
  let w = u.cam.xyz + d * t;
  c = mix(c, SKY_LO, 1.0 - exp(-t / FOG));
  o.color = vec4f(dither(c, s.pos.xy), 1.0);
  o.depth = dot(w - u.cam.xyz, u.fwd.xyz) / u.right.w;
  return o;
}

// ---- splats: projectiles, then sprites
struct SOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) kind: u32,
};

@vertex fn vs_splat(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> SOut {
  var o: SOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  let corner = CORNERS[v];
  var center = vec3f(0.0);
  var half = vec2f(0.0);
  var color = vec4f(1.0);
  var kind = 0u;
  var minpx = 0.8;
  if (i < ${L.NPROJ}u) {
    let b = i * ${L.JSIZE}u;
    let k = (proj[(b + ${L.J_KIND}u) / 4u] >> 16u) & 255u;
    if (k == 0u) { return o; }
    let mine = (proj[(b + ${L.J_OWNER}u) / 4u] & 255u) == u32(u.misc.x);
    let vel = vec3f(jf(b, ${L.J_VX}u), jf(b, ${L.J_VY}u), jf(b, ${L.J_VZ}u));
    center = vec3f(jf(b, ${L.J_PX}u), jf(b, ${L.J_PY}u), jf(b, ${L.J_PZ}u)) + vel * select(u.screen.z, u.screen.w, mine);
    kind = 2u;
    if (k == ${F.K_CHARGE}u) { half = vec2f(0.7); color = vec4f(0.6, 1.0, 0.5, 1.0); minpx = 2.5; }
    else if (k == ${F.K_BOMB}u) {
      let blink = fract(u.fwd.w * 4.0) < 0.5;
      half = vec2f(0.55); color = select(vec4f(1.0, 0.3, 0.2, 1.0), vec4f(1.0, 0.9, 0.85, 1.0), blink); minpx = 2.5;
    }
    else { half = vec2f(0.2); color = vec4f(1.0, 0.7, 0.3, 1.0); minpx = 1.5; }
  } else {
    let s = i - ${L.NPROJ}u;
    if (s >= u32(u.misc.y)) { return o; }
    let a = sprites[3u * s];
    color = sprites[3u * s + 1u];
    let info = sprites[3u * s + 2u]; // kind, aspect, min px, 0
    center = a.xyz;
    half = vec2f(a.w, a.w * info.y);
    kind = u32(info.x);
    minpx = info.z;
  }
  let pr = project(center);
  if (pr.z < 0.3 || pr.z > u.right.w) { return o; }
  let px = max(half * pr.w, vec2f(minpx, minpx * half.y / half.x));
  let s = pr.xy + corner * px;
  o.pos = vec4f(s.x / u.screen.x * 2.0 - 1.0, 1.0 - s.y / u.screen.y * 2.0, pr.z / u.right.w, 1.0);
  o.uv = corner;
  o.color = color;
  o.kind = kind;
  return o;
}

// solid splats: 2 a glowing ball (its core white)
@fragment fn fs_splat(s: SOut) -> @location(0) vec4f {
  let r2 = dot(s.uv, s.uv);
  if (r2 > 1.0) { discard; }
  let c = mix(vec3f(1.0, 1.0, 0.95), s.color.rgb, sqrt(r2));
  return vec4f(dither(c, s.pos.xy), 1.0);
}

// glowing sprites, blended: 3 a blast, 5 a spark, 6 a ring
@fragment fn fs_glow(s: SOut) -> @location(0) vec4f {
  let r2 = dot(s.uv, s.uv);
  if (r2 > 1.0) { discard; }
  var a = s.color.a * (1.0 - r2);
  if (s.kind == 6u) { a = s.color.a * smoothstep(0.5, 1.0, r2) * 2.0; }
  return vec4f(mix(s.color.rgb, vec3f(1.0, 1.0, 0.9), (1.0 - r2) * a) * a, a);
}

// ---- beams: lasers and trails, a quad between two projected points
struct BOut { @builtin(position) pos: vec4f, @location(0) color: vec4f, @location(1) across: f32 };
@vertex fn vs_beam(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> BOut {
  var o: BOut;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  if (i >= u32(u.misc.z)) { return o; }
  let a = beams[3u * i];
  let b = beams[3u * i + 1u];
  var pa = project(a.xyz);
  var pb = project(b.xyz);
  if (pa.z < 0.3 && pb.z < 0.3) { return o; }
  if (pa.z < 0.3) { let t = (0.3 - pa.z) / (pb.z - pa.z); pa = project(mix(a.xyz, b.xyz, t)); }
  if (pb.z < 0.3) { let t = (0.3 - pb.z) / (pa.z - pb.z); pb = project(mix(b.xyz, a.xyz, t)); }
  let d = pb.xy - pa.xy;
  let n = normalize(vec2f(-d.y, d.x) + vec2f(1e-6, 0.0));
  let c = CORNERS[v];
  let end = select(pa, pb, c.x > 0.0);
  let w = max(a.w * end.w, 0.6);
  let s = end.xy + n * c.y * w;
  o.pos = vec4f(s.x / u.screen.x * 2.0 - 1.0, 1.0 - s.y / u.screen.y * 2.0, clamp(end.z / u.right.w, 0.0, 1.0), 1.0);
  o.color = beams[3u * i + 2u];
  o.across = c.y;
  return o;
}
@fragment fn fs_beam(b: BOut) -> @location(0) vec4f {
  let a = b.color.a * (1.0 - abs(b.across) * 0.6);
  return vec4f(mix(b.color.rgb, vec3f(1.0), (1.0 - abs(b.across)) * 0.5) * a, a);
}

// ---- HUD
var<private> PALETTE: array<vec3f, 8> = array<vec3f, 8>(${PALETTE.map(vec3).join(', ')});

fn glyphBit(cell: vec2i, px: vec2i) -> bool {
  if (cell.x < 0 || cell.y < 0 || cell.x >= ${COLS} || cell.y >= i32(u.hud.x)) { return false; }
  if (px.x < 0 || px.x > 2 || px.y < 0 || px.y > 4) { return false; }
  let ch = hud[u32(cell.y) * ${COLS}u + u32(cell.x)] & 255u;
  if (ch < 32u || ch > 95u) { return false; }
  return ((font[ch - 32u] >> u32(14 - (px.y * 3 + px.x))) & 1u) == 1u;
}

fn lit(p: vec2i) -> bool {
  let cell = vec2i(p.x / 4, p.y / 6);
  return glyphBit(cell, vec2i(p.x - cell.x * 4, p.y - cell.y * 6));
}

fn graphPx(p: vec2i) -> vec4f {
  let col = p.x - (i32(u.screen.x) - ${GRAPH_N + 4});
  if (u.fx.x < 0.5 || col < 0 || col >= ${GRAPH_N}) { return vec4f(0.0); }
  let k = (p.y - 18) / 24;
  let yy = p.y - 18 - 24 * k;
  if (p.y < 18 || k >= ${GRAPH_PANELS} || yy >= 17) { return vec4f(0.0); }
  let v = graph[u32(k * ${GRAPH_N} + col)];
  let f = (16.5 - f32(yy)) / 17.0;
  let near = 0.5 / 17.0;
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
  return vec4f(0.0, 0.0, 0.0, 0.5);
}

@fragment fn fs_hud(@builtin(position) q: vec4f) -> @location(0) vec4f {
  let p = vec2i(q.xy);
  let c = vec2f(u.screen.x, u.screen.y) * 0.5;
  let d = q.xy - c - vec2f(0.5);
  let r = length(d);
  // the hit marker: four short ticks out from the centre
  if (u.hud.z > 0.0 && abs(abs(d.x) - abs(d.y)) < 0.7 && max(abs(d.x), abs(d.y)) > 4.0 && max(abs(d.x), abs(d.y)) < 8.0) {
    return vec4f(1.0, 1.0, 1.0, u.hud.z);
  }
  // where the mouse aims: a small open ring (1), or nothing (0)
  if (u.hud.y > 0.5 && abs(r - 3.5) < 0.6) { return vec4f(1.0, 1.0, 1.0, 0.7); }
  if (lit(p)) {
    let cell = vec2i(p.x / 4, p.y / 6);
    let k = (hud[u32(cell.y) * ${COLS}u + u32(cell.x)] >> 8u) & 7u;
    return vec4f(PALETTE[k], 1.0);
  }
  if (lit(p - vec2i(1, 1))) { return vec4f(0.0, 0.0, 0.0, 0.8); }
  let g = graphPx(p);
  if (g.a > 0.0) { return g; }
  for (var k = i32(u.misc.w) - 1; k >= 0; k--) {
    let rc = rects[2u * u32(k)];
    if (q.x >= rc.x && q.x < rc.z && q.y >= rc.y && q.y < rc.w) {
      let col = rects[2u * u32(k) + 1u];
      return vec4f(dither(col.rgb, q.xy), col.a);
    }
  }
  // the radar's face, and its sweep
  let td = q.xy - u.fx.yz;
  let tr = length(td);
  if (u.fx.w > 0.0 && abs(tr - u.fx.w) < 0.7) { return vec4f(0.5, 0.8, 1.0, 0.7); }
  if (u.fx.w > 0.0 && tr < u.fx.w) {
    if (abs(td.x) < 0.4 || abs(td.y) < 0.4) { return vec4f(0.5, 0.8, 1.0, 0.3); }
    let sweep = fract(atan2(td.y, td.x) / 6.2832 - u.fwd.w * 0.5);
    return vec4f(0.08, 0.2, 0.32, 0.4 + 0.25 * pow(sweep, 8.0));
  }
  let edge = max(abs(d.x) / c.x, abs(d.y) / c.y);
  if (u.hud.w > 0.0 && edge > 0.8) { return vec4f(0.8, 0.05, 0.05, u.hud.w * (edge - 0.8) * 3.0); }
  discard;
  return vec4f(0.0);
}
`;

export async function createRenderer(canvas, { present = true, device: shared = null } = {}) {
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
  const rows = Math.floor(H / 6);
  const module = device.createShaderModule({ code: WGSL });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('; '));

  const NU = 40;
  const ubuf = device.createBuffer({ size: 4 * NU, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const storage = (size) => device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const playerBuf = storage(L.NPLAYER * L.PSIZE + L.NPLAYER * 4);
  const projBuf = storage(L.NPROJ * L.JSIZE);
  const spriteBuf = storage(MAX_SPRITE * 48);
  const beamBuf = storage(MAX_BEAM * 48);
  const rectBuf = storage(MAX_RECT * 32);
  const hudBuf = storage(COLS * rows * 4);
  const fontBuf = storage(FONT.length * 4);
  const graphBuf = storage(GRAPH_PANELS * GRAPH_N * 16);
  const boxBuf = storage(L.NBOX * 32);
  const groupBuf = storage(L.NGROUP * 32);
  let nbox = 0, ngroup = 0, bounds = [0, 1024, 0, 1024];
  device.queue.writeBuffer(fontBuf, 0, FONT);
  const hmap = device.createTexture({ size: [512, 512], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const smap = device.createTexture({ size: [512, 512], format: 'r8uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  const depth = device.createTexture({ size: [W, H], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT });

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'uint' } },
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((b) => ({ binding: b, visibility: b <= 6 ? GPUShaderStage.VERTEX : GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } })),
    ],
  });
  const bind = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: ubuf } },
      { binding: 1, resource: hmap.createView() },
      { binding: 2, resource: smap.createView() },
      ...[playerBuf, projBuf, spriteBuf, beamBuf, rectBuf, hudBuf, fontBuf, graphBuf, boxBuf, groupBuf].map((buffer, k) => ({ binding: 3 + k, resource: { buffer } })),
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
  const add = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const terrain = pipe('vs_full', 'fs_terrain', { depthWrite: true, depthCompare: 'always' });
  const ship = pipe('vs_ship', 'fs_ship', { depthWrite: true, depthCompare: 'less' });
  const splat = pipe('vs_splat', 'fs_splat', { depthWrite: true, depthCompare: 'less' });
  const glow = pipe('vs_splat', 'fs_glow', { depthWrite: false, depthCompare: 'less', blend: add });
  const beam = pipe('vs_beam', 'fs_beam', { depthWrite: false, depthCompare: 'less', blend: add });
  const hudPipe = pipe('vs_full', 'fs_hud', { depthWrite: false, depthCompare: 'always', blend: over });

  const uf = new Float32Array(NU);
  const hud = new Uint32Array(COLS * rows);
  const spriteData = new Float32Array(MAX_SPRITE * 12);
  const beamData = new Float32Array(MAX_BEAM * 12);
  const rectData = new Float32Array(MAX_RECT * 8);
  const mine = new Uint8Array(L.PSIZE);
  let hmax = 100;

  return {
    rows, width: W, height: H,
    setTerrain(u8) {
      const h16 = new Uint16Array(u8.buffer, L.TERRAIN_H, 512 * 512);
      const hf = new Float32Array(512 * 512);
      hmax = 0;
      for (let i = 0; i < hf.length; i++) { hf[i] = h16[i] / 256; hmax = Math.max(hmax, hf[i]); }
      device.queue.writeTexture({ texture: hmap }, hf, { bytesPerRow: 512 * 4 }, [512, 512]);
      device.queue.writeTexture({ texture: smap }, u8.slice(L.TERRAIN_S, L.TERRAIN_S + 512 * 512), { bytesPerRow: 512 }, [512, 512]);
    },

    // map: a View's map() (src/arena-view.mjs): its boxes and their groups, its bounds
    setMap(map) {
      const b = new Float32Array(L.NBOX * 8), g = new Float32Array(L.NGROUP * 8);
      map.boxes.forEach((x, k) => b.set([x.box[0], x.box[1], x.box[2], x.material, x.box[3], x.box[4], x.box[5], 0], 8 * k));
      map.groups.forEach((x, k) => g.set([x.box[0], x.box[1], x.box[2], x.first, x.box[3], x.box[4], x.box[5], x.count], 8 * k));
      device.queue.writeBuffer(boxBuf, 0, b);
      device.queue.writeBuffer(groupBuf, 0, g);
      nbox = map.boxes.length;
      ngroup = map.groups.length;
      bounds = map.bounds;
    },

    // s: { cam, basis ({ f, r, u }: basis()), zoom, time, dt, dtPred, proj, slot (mine, drawn from `me`),
    //      me (my ship's record as the prediction has it, 64 B, its position already corrected), ceiling,
    //      glow: [{ pos, size, color: [r,g,b,a], kind (3 a blast, 5 a spark, 6 a ring), minpx }],
    //      beams: [{ a, b, width, color: [r,g,b,a] }], rects: [[x0, y0, x1, y1, r, g, b, a]],
    //      crosshair (0 none, 1 the aim's ring), marker, hurt, text, graph, radar ([x, y, r] px, or null),
    //      sides (0 colour by slot, 1 one side against the rest, 2 red and blue), tints }
    frame(u8, s, target) {
      if (!ctx && !target) return;
      const sprites = s.glow.slice(0, MAX_SPRITE);
      const { f, r, u } = s.basis;
      const radar = s.radar || [0, 0, 0];
      uf.set([s.cam[0], s.cam[1], s.cam[2], focalOf(s, W), f[0], f[1], f[2], s.time, r[0], r[1], r[2], FAR, u[0], u[1], u[2], hmax + 2,
        W, H, s.dt, s.dtPred ?? s.dt, s.slot, sprites.length, Math.min(s.beams.length, MAX_BEAM), Math.min(s.rects.length, MAX_RECT),
        rows, s.crosshair, s.marker, s.hurt, nbox, ngroup, Number(s.sides) || 0, s.ceiling || 400,
        ...bounds, s.graph ? 1 : 0, ...radar]);
      if (s.graph) device.queue.writeBuffer(graphBuf, 0, s.graph);
      device.queue.writeBuffer(ubuf, 0, uf);
      device.queue.writeBuffer(playerBuf, 0, u8, L.PLAYERS, L.NPLAYER * L.PSIZE);
      if (s.me && s.slot >= 0 && s.slot < L.NPLAYER) { mine.set(s.me); device.queue.writeBuffer(playerBuf, s.slot * L.PSIZE, mine); }
      device.queue.writeBuffer(playerBuf, L.NPLAYER * L.PSIZE, s.tints ?? NO_TINTS);
      device.queue.writeBuffer(projBuf, 0, u8, s.proj ?? L.PROJ, L.NPROJ * L.JSIZE);
      sprites.forEach((p, k) => {
        const c = p.color;
        spriteData.set([p.pos[0], p.pos[1], p.pos[2], p.size, c[0], c[1], c[2], c[3] ?? 1, p.kind, p.aspect ?? 1, p.minpx ?? 1, 0], k * 12);
      });
      if (sprites.length) device.queue.writeBuffer(spriteBuf, 0, spriteData, 0, sprites.length * 12);
      const nb = Math.min(s.beams.length, MAX_BEAM);
      for (let k = 0; k < nb; k++) { const b = s.beams[k]; beamData.set([b.a[0], b.a[1], b.a[2], b.width, b.b[0], b.b[1], b.b[2], 0, ...b.color], k * 12); }
      if (nb) device.queue.writeBuffer(beamBuf, 0, beamData, 0, nb * 12);
      const nr = Math.min(s.rects.length, MAX_RECT);
      for (let k = 0; k < nr; k++) rectData.set(s.rects[k], k * 8);
      if (nr) device.queue.writeBuffer(rectBuf, 0, rectData, 0, nr * 8);
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
      pass.setPipeline(ship);
      pass.draw(6, L.NPLAYER);
      pass.setPipeline(splat);
      pass.draw(6, L.NPROJ);
      pass.setPipeline(beam);
      if (nb) pass.draw(6, nb);
      pass.setPipeline(glow);
      if (sprites.length) pass.draw(6, sprites.length, 0, L.NPROJ);
      pass.setPipeline(hudPipe);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    },

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
