// What a fighter holds, seen from its own eyes: the gun, or what a carrier
// carries (a flag, the skull, the bomb), as a handful of rounded parts in
// camera space (x right, y up, z ahead, metres from the eye) that the
// arena's renderer marches as one distance field, the way it does a
// fighter (client/figure.mjs), and lights and inks as it does the world.
// A part is a box with its edges rounded or a tube along z, either
// narrowing toward its front if asked, or a cloth that waves. The model is
// 12 floats an entry:
//   0     the first frame: where it is held, its right, its up (its front their cross)
//   1     the box round every part, in that frame: its centre, its half sizes
//   2...  a part: its centre and kind (0 a box, 1 a tube, plus its taper, 0 to 0.95; 2 a cloth),
//         its half sizes and edge radius (a tube's: radius, bore, half length, edge radius; a cloth's: its wave's phase),
//         its colour and paint (PAINT) times 2 plus how much it glows (0..1);
//         or a frame for the parts after it (kind -1): its origin, right and up in the first frame
// Drawing only.
import * as L from '../src/layout.mjs';

export const MAX_VM = 20;
// what a part's faces show: 0 plain, 1 a skull's sockets and nose on its front, 2 grooves across it, 3 metal's two glints
export const PAINT = { PLAIN: 0, SKULL: 1, RIBS: 2, METAL: 3 };
const SKIN = [1.0, 0.8, 0.66];

// A frame's axes for a yaw (its front toward (cos, 0, sin): a quarter turn
// is straight ahead) and a pitch (its front up): right, up and front.
function axes(yaw, pitch) {
  const f0 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { r: [f0[2], 0, -f0[0]], u: [-f0[0] * sp, cp, -f0[2] * sp], f: [f0[0] * cp, sp, f0[2] * cp] };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The parts, in their frame ([x right, y up, z ahead], metres). A box: its
// centre, half sizes and colour; r rounds its edges (r as large as its two
// smaller half sizes makes a capsule). A tube along z: its radius and half
// length; bore is the dark middle of its ends. taper narrows the front end
// by that much of its width. A cloth is a thin box waving across its length
// (WAVE m at its far end), its last fifth a darker hem.
const WAVE = 0.022;
const box = (c, h, col, { r = 0.005, taper = 0, glow = 0, paint = 0 } = {}) => [...c, taper, ...h, Math.min(r, ...h), ...col, paint * 2 + glow];
const tube = (c, rad, half, col, { r = 0.003, taper = 0, glow = 0, paint = 0, bore = 0 } = {}) => [...c, 1 + taper, rad, bore, half, Math.min(r, rad, half), ...col, paint * 2 + glow];
const cloth = (c, h, col, phase) => [...c, 2, ...h, phase, ...col, 0];
const hand = (c, h = [0.03, 0.032, 0.04]) => box(c, h, SKIN, { r: 0.022 });
// how far a part reaches from its centre, each way
const reach = (p) => (p[3] >= 2 ? [p[4] + WAVE, p[5], p[6]] : p[3] >= 1 ? [p[4], p[4], p[6]] : [p[4], p[5], p[6]]);

// A held thing's model: its parts held at o turned by yaw and pitch, then
// any more groups of parts ({ o, yaw, pitch, parts }) each in a frame of
// its own (a flag's cloth off its pole, a seeker's needles standing up).
function place(parts, o, yaw, pitch, more = []) {
  const a = axes(yaw, pitch);
  const out = [...o, 0, ...a.r, 0, ...a.u, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const grow = (c, e) => { for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], c[i] - e[i]); hi[i] = Math.max(hi[i], c[i] + e[i]); } };
  for (const p of parts) { out.push(...p); grow(p, reach(p)); }
  for (const g of more) {
    // the group's frame in the first one's, and each of its parts' corners there
    const b = axes(g.yaw, g.pitch), d = [0, 1, 2].map((i) => g.o[i] - o[i]);
    const at = [dot(d, a.r), dot(d, a.u), dot(d, a.f)];
    const col = (v) => [dot(v, a.r), dot(v, a.u), dot(v, a.f)];
    const br = col(b.r), bu = col(b.u), bf = col(b.f);
    out.push(...at, -1, ...br, 0, ...bu, 0);
    for (const p of g.parts) {
      out.push(...p);
      const e = reach(p);
      for (let k = 0; k < 8; k++) {
        const q = [0, 1, 2].map((i) => p[i] + (k >> i & 1 ? e[i] : -e[i]));
        grow([0, 1, 2].map((i) => at[i] + br[i] * q[0] + bu[i] * q[1] + bf[i] * q[2]), [0, 0, 0]);
      }
    }
  }
  out.splice(12, 12, ...lo.map((v, i) => (v + hi[i]) / 2), 0, ...lo.map((v, i) => (hi[i] - v) / 2 + 0.002), 0, 0, 0, 0, 0);
  return new Float32Array(out.slice(0, MAX_VM * 12));
}

// Where on a W x H screen a model is drawn, through a lens of focal length
// focal (px): the rectangle [x0, y0, x1, y1] round its box's corners, each
// no nearer than 6 cm, within the screen; all 0 for none.
export function handRect(m, W, H, focal) {
  if (!m || m.length < 36) return [0, 0, 0, 0];
  const o = m.subarray(0, 3), r = m.subarray(4, 7), u = m.subarray(8, 11);
  const f = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    const q = [0, 1, 2].map((i) => m[12 + i] + (k >> i & 1 ? 1 : -1) * m[16 + i]);
    const p = [0, 1, 2].map((i) => o[i] + r[i] * q[0] + u[i] * q[1] + f[i] * q[2]);
    const z = Math.max(p[2], 0.06), x = W / 2 + p[0] * focal / z, y = H / 2 - p[1] * focal / z;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : [0, 0, 0, 0];
}

// Where the hands are this frame: m = { t (s), bob (320 x 200 units, as the
// old gun's), drop, lunge (0..1), kick (0..1) }.
function hold(m) {
  const o = [0.19 + m.bob * 0.002 - m.lunge * 0.08, -0.215 - (Math.abs(m.bob) + m.drop) * 0.002 - m.kick * 0.012, 0.44 - m.kick * 0.035 + m.lunge * 0.14];
  return { o, yaw: Math.PI / 2 + 0.16, pitch: 0.06 + m.kick * 0.09 };
}

// Gun w's model, its muzzle flashing for a frame or two after a shot.
export function gunModel(w, m, flash = false) {
  const dark = [0.2, 0.21, 0.24], steel = [0.34, 0.36, 0.4];
  const { o, yaw, pitch } = hold(m);
  let parts, tip, glow = [1, 0.85, 0.4], more = [];
  switch (w) {
    case L.W_AR: {
      // the assault rifle: an olive body, a ribbed shroud round the barrel, a carry rail with a lit sight
      const body = [0.34, 0.42, 0.3];
      parts = [box([0, 0, 0], [0.032, 0.048, 0.16], body, { r: 0.012 }), tube([0, 0.012, 0.215], 0.028, 0.07, body.map((v) => v * 0.78), { paint: PAINT.RIBS }),
        tube([0, 0.012, 0.32], 0.011, 0.05, dark), box([0, 0.06, -0.03], [0.011, 0.012, 0.1], dark, { r: 0.006 }), box([0, 0.078, -0.06], [0.011, 0.007, 0.02], [0.3, 0.9, 1], { r: 0.004, glow: 1 }),
        box([0, -0.09, 0.05], [0.02, 0.05, 0.028], steel, { r: 0.008 }), box([0, -0.02, -0.21], [0.027, 0.043, 0.065], body.map((v) => v * 0.78), { r: 0.014 }), hand([0, -0.055, -0.045])];
      tip = [0, 0.012, 0.39];
      break;
    }
    case L.W_BR: {
      // the burst rifle: grey, a scope on two mounts, a brake on its muzzle
      const body = [0.5, 0.52, 0.56];
      parts = [box([0, 0, 0], [0.03, 0.046, 0.17], body, { r: 0.01, paint: PAINT.METAL }), tube([0, 0.012, 0.25], 0.013, 0.09, dark), tube([0, 0.012, 0.33], 0.019, 0.018, dark),
        tube([0, 0.082, 0.02], 0.022, 0.075, [0.16, 0.17, 0.21], { bore: 0.016 }), box([0, 0.054, 0.02], [0.008, 0.012, 0.05], dark, { r: 0.004 }),
        box([0, -0.082, 0.05], [0.02, 0.042, 0.03], dark, { r: 0.008 }), box([0, -0.02, -0.21], [0.027, 0.043, 0.065], body.map((v) => v * 0.78), { r: 0.014 }), hand([0, -0.055, -0.045])];
      tip = [0, 0.012, 0.37];
      break;
    }
    case L.W_MAGNUM:
      // the magnum: a silver frame and barrel, a drum between them, a brown grip in the hand
      parts = [box([0, 0.004, 0.05], [0.017, 0.028, 0.08], [0.76, 0.78, 0.84], { r: 0.008, paint: PAINT.METAL }), tube([0, 0.012, 0.17], 0.015, 0.045, [0.62, 0.64, 0.7]),
        tube([0, -0.002, 0.06], 0.033, 0.03, [0.68, 0.7, 0.76], { r: 0.006 }), box([0, 0.038, -0.025], [0.006, 0.01, 0.012], dark, { r: 0.004 }),
        box([0, -0.062, -0.012], [0.02, 0.046, 0.024], [0.42, 0.28, 0.2], { r: 0.01 }), hand([0, -0.07, -0.012], [0.032, 0.034, 0.038])];
      tip = [0, 0.012, 0.235];
      break;
    case L.W_SNIPER:
      // the sniper rifle: long and dark, the scope a tube with a bell at each end
      parts = [box([0, 0, 0], [0.027, 0.042, 0.2], [0.24, 0.27, 0.29], { r: 0.01 }), tube([0, 0.012, 0.37], 0.011, 0.17, dark), tube([0, 0.012, 0.535], 0.018, 0.022, dark),
        tube([0, 0.08, 0.03], 0.02, 0.1, [0.13, 0.14, 0.18]), tube([0, 0.08, 0.14], 0.03, 0.026, [0.13, 0.14, 0.18], { r: 0.006 }), tube([0, 0.08, -0.08], 0.027, 0.022, [0.13, 0.14, 0.18], { r: 0.006, bore: 0.019 }),
        box([0, 0.05, 0.03], [0.008, 0.014, 0.06], dark, { r: 0.004 }), box([0, -0.025, -0.25], [0.026, 0.048, 0.07], [0.2, 0.22, 0.24], { r: 0.014 }), hand([0, -0.055, -0.045])];
      tip = [0, 0.012, 0.58];
      break;
    case L.W_SHOTGUN: {
      // the shotgun: a wooden stock and pump, a fat barrel over its magazine
      const wood = [0.55, 0.36, 0.2];
      parts = [box([0, -0.02, -0.19], [0.027, 0.042, 0.08], wood, { r: 0.016 }), box([0, 0, 0.02], [0.031, 0.043, 0.1], steel, { r: 0.01, paint: PAINT.METAL }),
        tube([0, 0.024, 0.23], 0.02, 0.13, steel), tube([0, -0.02, 0.2], 0.015, 0.1, dark), tube([0, -0.022, 0.17], 0.028, 0.055, wood.map((v) => v * 0.8), { r: 0.008, paint: PAINT.RIBS }),
        hand([0, -0.055, -0.045])];
      tip = [0, 0.024, 0.38];
      break;
    }
    case L.W_ROCKET:
      // the rocket launcher: an olive tube open at the back, a rim at each end, a yellow band, a sight on top
      parts = [tube([0, 0.03, 0.05], 0.066, 0.32, [0.36, 0.43, 0.28]), tube([0, 0.03, 0.37], 0.08, 0.022, [0.2, 0.23, 0.17], { r: 0.008 }),
        tube([0, 0.03, -0.27], 0.078, 0.024, [0.2, 0.23, 0.17], { r: 0.008, bore: 0.056 }), tube([0, 0.03, 0.2], 0.0685, 0.014, [0.95, 0.78, 0.22], { r: 0.002 }),
        box([0, -0.075, 0], [0.02, 0.05, 0.025], dark, { r: 0.008 }), box([0, 0.108, 0.1], [0.01, 0.02, 0.03], dark, { r: 0.005 }), hand([0, -0.085, 0], [0.032, 0.032, 0.04])];
      tip = [0, 0.03, 0.42];
      break;
    case L.W_PLASMA:
      // the plasma rifle: a rounded violet shell with a fin, two lit prongs out of its front
      parts = [box([0, 0, 0.02], [0.048, 0.05, 0.13], [0.55, 0.4, 0.8], { r: 0.036 }), box([0, 0.052, -0.01], [0.012, 0.02, 0.09], [0.4, 0.28, 0.62], { r: 0.012 }),
        tube([0.03, 0, 0.2], 0.013, 0.075, [0.4, 0.85, 1], { taper: 0.55, glow: 1 }), tube([-0.03, 0, 0.2], 0.013, 0.075, [0.4, 0.85, 1], { taper: 0.55, glow: 1 }), hand([0, -0.055, -0.045])];
      tip = [0, 0, 0.29];
      glow = [0.5, 0.9, 1];
      break;
    case L.W_NEEDLER: {
      // the seeker: a rounded magenta shell, six lit needles standing out of its back, leaning forward
      parts = [box([0, 0, 0.02], [0.048, 0.042, 0.12], [0.5, 0.28, 0.6], { r: 0.03 }), tube([0, -0.004, 0.15], 0.026, 0.035, [0.36, 0.2, 0.44], { r: 0.012 }), hand([0, -0.055, -0.045])];
      const a = axes(yaw, pitch), up = pitch + 1.15, needles = [];
      // each needle's foot on the shell's top, in the needles' own frame (its front up along a needle)
      const b = axes(yaw, up);
      for (let i = 0; i < 6; i++) {
        const foot = [(i & 1 ? 1 : -1) * 0.014, 0.034, -0.07 + i * 0.03];
        const d = [0, 1, 2].map((k) => a.r[k] * foot[0] + a.u[k] * foot[1] + a.f[k] * foot[2]);
        needles.push(box([dot(d, b.r), dot(d, b.u), dot(d, b.f) + 0.022], [0.007, 0.007, 0.034], [1, 0.45, 0.9], { r: 0.006, taper: 0.8, glow: 1 }));
      }
      more = [{ o, yaw, pitch: up, parts: needles }];
      tip = [0, -0.004, 0.2];
      glow = [1, 0.5, 0.9];
      break;
    }
    case L.W_SWORD: {
      // the sword: a hilt and its guard, two lit blades drawn to a point
      const blade = [0.55, 0.95, 1];
      return place([tube([0, 0, 0], 0.022, 0.07, steel), box([0, 0, 0.078], [0.05, 0.02, 0.012], steel, { r: 0.008 }), hand([0, 0, -0.005], [0.032, 0.032, 0.04]),
        box([0.032, 0, 0.27], [0.008, 0.024, 0.18], blade, { r: 0.007, taper: 0.9, glow: 1 }), box([-0.032, 0, 0.27], [0.008, 0.024, 0.18], blade, { r: 0.007, taper: 0.9, glow: 1 })], o, Math.PI / 2 + 0.3, 0.55 + m.kick * 0.2);
    }
    default:
      // empty hands: a forearm in a sleeve with a cuff, its fist out front
      parts = [tube([0, -0.02, -0.08], 0.036, 0.12, [0.3, 0.37, 0.52], { r: 0.012 }), tube([0, -0.012, 0.035], 0.04, 0.012, [0.42, 0.5, 0.66], { r: 0.006 }), box([0, 0, 0.085], [0.04, 0.04, 0.044], SKIN, { r: 0.03 })];
      tip = null;
  }
  if (flash && tip) parts.push(box(tip, [0.04, 0.04, 0.04], glow, { r: 0.04, glow: 1 }));
  return place(parts, o, yaw, pitch, more);
}

// What a carrier holds (its kit module's carry), in the colour of the side
// it was taken from for a flag: the flag on its pole over the shoulder, the
// skull held out, or the bomb held out, its light blinking twice a second.
export function carryModel(kind, color, m) {
  const { o } = hold(m);
  if (kind === 'skull') {
    // turned to look back at its carrier: the dome with its sockets, the jaw under it
    const bone = [0.92, 0.89, 0.8];
    return place([box([0, 0.03, 0.06], [0.08, 0.075, 0.08], bone, { r: 0.05, paint: PAINT.SKULL }), box([0, -0.062, 0.075], [0.052, 0.03, 0.055], bone, { r: 0.014 }),
      hand([0, -0.085, -0.01], [0.034, 0.034, 0.04])], [o[0] - 0.03, o[1] + 0.05, o[2] + 0.1], -Math.PI / 2 + 0.2, 0.1);
  }
  if (kind === 'bomb') {
    const lit = m.t * 1000 % 500 < 250;
    return place([box([0, 0.03, 0.06], [0.085, 0.085, 0.085], [0.26, 0.27, 0.32], { r: 0.085 }), tube([0, 0.03, 0.06], 0.088, 0.014, [0.6, 0.6, 0.56], { r: 0.004 }),
      box([0, 0.125, 0.06], [0.026, 0.014, 0.026], [0.5, 0.5, 0.47], { r: 0.008 }),
      box([0, 0.148, 0.06], [0.012, 0.012, 0.012], lit ? [1, 0.15, 0.1] : [0.35, 0.06, 0.05], { r: 0.012, glow: lit ? 1 : 0 }), hand([0, -0.08, 0], [0.034, 0.034, 0.04])], o, Math.PI / 2 + 0.16, 0.06);
  }
  // the flag: the pole leaning in from the bottom right, the cloth off its top swinging a little
  const swing = Math.sin(m.t * 3) * 0.12;
  const base = [o[0] + 0.03, o[1] - 0.12, o[2] - 0.05], py = Math.PI / 2 + 0.55, pp = 1.05;
  const f = axes(py, pp).f;
  const top = [0, 1, 2].map((i) => base[i] + f[i] * 0.64);
  // the cloth flies off to the left and away, a wave running out along it
  return place([tube([0, 0, 0.3], 0.012, 0.36, [0.8, 0.8, 0.76]), box([0, 0, 0.67], [0.02, 0.02, 0.02], [1, 0.82, 0.3], { r: 0.02 })], base, py, pp,
    [{ o: top, yaw: 2.64 + swing, pitch: 0, parts: [cloth([0, -0.1, 0.15], [0.005, 0.1, 0.15], color, m.t * 7)] }]);
}

// The model's pixel, in WGSL beside the renderer's own (it brings `vm` and
// u.screen): what the ray through pixel px from an eye of focal length
// focal (px) meets of n entries. heldRay hands back the depth ahead, the
// normal in the eye's frame, the colour before the light, how much of it
// glows, and an ink line (0..1) where two parts meet and along a part's
// sharper edges; the renderer lights it and writes its depth.
export const VIEWMODEL_WGSL = /* wgsl */ `
struct Held { hit: bool, z: f32, n: vec3f, alb: vec3f, glow: f32, line: f32 };
// (the arena's crosshair has the name of the builtin)
fn vmCross(a: vec3f, b: vec3f) -> vec3f { return a.yzx * b.zxy - a.zxy * b.yzx; }

// One part at p from its centre: kind 0 a box (b: half sizes, edge radius),
// 1 a tube along z (b: radius, bore, half length, edge radius), its fraction
// how much narrower the front end is; 2 a cloth (b: half sizes, its wave's
// phase), a thin box pushed across by a wave that grows toward its far end.
fn vmPart(p: vec3f, kind: f32, b: vec4f) -> f32 {
  if (kind >= 2.0) {
    let c = abs(vec3f(p.x - ${WAVE} * (0.5 + 0.5 * p.z / b.z) * sin(p.z * 16.0 - b.w), p.yz)) - b.xyz + 0.003;
    return (length(max(c, vec3f(0.0))) + min(max(c.x, max(c.y, c.z)), 0.0) - 0.003) * 0.7;
  }
  let s = max(1.0 - fract(kind) * clamp(0.5 + 0.5 * p.z / b.z, 0.0, 1.0), 0.05);
  let q = vec3f(p.xy / s, p.z);
  if (kind >= 1.0) {
    let e = vec2f(length(q.xy) - b.x, abs(q.z) - b.z) + b.w;
    return (min(max(e.x, e.y), 0.0) + length(max(e, vec2f(0.0))) - b.w) * s;
  }
  let e = abs(q) - b.xyz + b.w;
  return (length(max(e, vec3f(0.0))) + min(max(e.x, max(e.y, e.z)), 0.0) - b.w) * s;
}

// The field at p in the first frame: the nearest part's distance, its place
// in vm, and the next nearest's distance.
fn vmMap(p: vec3f, n: u32) -> vec3f {
  var o = vec3f(1e9, 0.0, 1e9);
  var q = p;
  for (var i = 2u; i < n; i++) {
    let a = vm[3u * i];
    let b = vm[3u * i + 1u];
    if (a.w < 0.0) {
      let c = vm[3u * i + 2u];
      let d = p - a.xyz;
      q = vec3f(dot(d, b.xyz), dot(d, c.xyz), dot(d, vmCross(b.xyz, c.xyz)));
      continue;
    }
    let d = vmPart(q - a.xyz, a.w, b);
    if (d < o.x) { o = vec3f(d, f32(i), o.x); } else if (d < o.z) { o.z = d; }
  }
  return o;
}

fn heldRay(px: vec2f, n: u32, focal: f32) -> Held {
  var o: Held;
  o.hit = false;
  let dc = normalize(vec3f((px.x - u.screen.x * 0.5) / focal, (u.screen.y * 0.5 - px.y) / focal, 1.0));
  // into the first frame, where the march runs
  let ar = vm[1].xyz;
  let au = vm[2].xyz;
  let af = vmCross(ar, au);
  let lo = -vec3f(dot(vm[0].xyz, ar), dot(vm[0].xyz, au), dot(vm[0].xyz, af));
  let ld = vec3f(dot(dc, ar), dot(dc, au), dot(dc, af));
  // the box round it all
  let inv = 1.0 / select(ld, vec3f(1e-6), abs(ld) < vec3f(1e-6));
  let t1 = (vm[3].xyz - vm[4].xyz - lo) * inv;
  let t2 = (vm[3].xyz + vm[4].xyz - lo) * inv;
  let tn = min(t1, t2);
  let tf = max(t1, t2);
  var t = max(max(max(tn.x, tn.y), tn.z), 0.0);
  let far = min(min(tf.x, tf.y), tf.z);
  if (t >= far) { return o; }
  var h = vec3f(0.0);
  var found = false;
  for (var i = 0; i < 48; i++) {
    h = vmMap(lo + ld * t, n);
    if (h.x < 0.0004 + 0.5 * t / focal) { found = true; break; }
    t += h.x * 0.9;
    if (t > far) { break; }
  }
  if (!found) { return o; }
  // the part it met, in the frame that part is in
  let k = u32(h.y);
  let p0 = lo + ld * t;
  var q = p0;
  var fr = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  for (var i = 2u; i < k; i++) {
    if (vm[3u * i].w < 0.0) {
      let fa = vm[3u * i + 1u].xyz;
      let fb = vm[3u * i + 2u].xyz;
      fr = mat3x3f(fa, fb, vmCross(fa, fb));
      q = (p0 - vm[3u * i].xyz) * fr;
    }
  }
  let a = vm[3u * k];
  let b = vm[3u * k + 1u];
  let c = vm[3u * k + 2u];
  let pl = q - a.xyz;
  let e = vec2f(0.0006, -0.0006);
  let nl = normalize(e.xyy * vmPart(pl + e.xyy, a.w, b) + e.yyx * vmPart(pl + e.yyx, a.w, b) + e.yxy * vmPart(pl + e.yxy, a.w, b) + e.xxx * vmPart(pl + e.xxx, a.w, b));
  let n0 = fr * nl;
  o.hit = true;
  o.z = t * dc.z;
  o.n = ar * n0.x + au * n0.y + af * n0.z;
  let paint = u32(c.w * 0.5);
  o.glow = c.w - f32(paint) * 2.0;
  var alb = c.rgb;
  let an = abs(nl);
  // how far round an edge's rounding the surface has turned, 0 on a face to 1 halfway over
  var turn = 0.0;
  if (a.w >= 2.0) {
    // a cloth's hem
    if (pl.z > 0.6 * b.z) { alb *= 0.8; }
  } else if (a.w >= 1.0) {
    let side = length(an.xy);
    turn = min(side, an.z) / max(max(side, an.z), 1e-4);
    // a tube's bore: the dark middle of either end
    if (an.z > 0.7 && length(pl.xy) < b.y) { alb = vec3f(0.07, 0.07, 0.12); }
  } else {
    let hi = max(an.x, max(an.y, an.z));
    turn = (an.x + an.y + an.z - hi - min(an.x, min(an.y, an.z))) / max(hi, 1e-4);
  }
  if (paint == 1u && nl.z > 0.3) {
    // a skull's front: two sockets and a nose
    let f = pl.xy / b.xy;
    if (length(vec2f(abs(f.x) - 0.42, (f.y - 0.02) * 1.15)) < 0.27 || (f.y < -0.32 && f.y > -0.62 && abs(f.x) < (-0.32 - f.y) * 0.5 + 0.03)) { alb = vec3f(0.08, 0.06, 0.08); }
  } else if (paint == 2u && an.z < 0.5 && fract(pl.z / 0.024 + 0.5) < 0.2) {
    alb *= 0.62;
  } else if (paint == 3u) {
    // metal: a wide glint and a thin one slanting across it
    let g = fract((pl.z + pl.y * 0.7) / 0.13 + 0.38);
    if (g < 0.09 || (g > 0.13 && g < 0.16)) { alb *= 1.18; }
  }
  o.alb = alb;
  // ink a pixel or so wide: where the next part is that near, and halfway round an edge rounded by under a centimetre
  let w = t / focal;
  let dl = 0.75 * w / max(b.w, 1e-4);
  o.line = max(1.0 - smoothstep(0.7 * w, 1.6 * w, h.z), smoothstep(1.0 - 2.6 * dl, 1.0 - 1.3 * dl, turn) * (1.0 - smoothstep(0.008, 0.014, b.w)) * step(a.w, 1.99));
  return o;
}
`;
