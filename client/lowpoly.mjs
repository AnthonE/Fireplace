// The look golf, the arena and Dogfight share, in WGSL each renderer
// declares beside its own: the ground drawn low-poly (flat triangles, each
// lit by its own normal and given a small tint of its own, over the heights
// the march follows, so the outline stays the world's), surfaces with crisp
// smooth edges, a blue sky with clouds that far things fade into, and the
// light. A renderer brings `hgt(x, z)`, the surface texture `smap` and FOG
// (metres); the box half (BOXES_WGSL) also wants `boxes`, `groups` and
// u.map. Drawing only, like everything a renderer does.

// The HUD's frame on a W x H screen: the 320 x 200 grid these games' HUDs
// are laid out on (text in cells of 4 x 6, every bar and mark in the same
// units), scaled to fit the screen whole and centred on it: hudScale screen
// px a unit, its corner at (hudX, hudY).
export function hudFrame(W, H) {
  const hudScale = Math.min(W / 320, H / 200);
  return { hudScale, hudX: (W - 320 * hudScale) / 2, hudY: (H - 200 * hudScale) / 2 };
}
// The focal length (px) a W x H screen sees through, k of its width up to a
// 16:10 screen and of 1.6 times its height past that, so a wide screen
// shows more at the sides, not less up and down (party's rule).
export const focalFor = (W, H, k = 0.62) => Math.min(W, H * 1.6) * k;

export const LOWPOLY_WGSL = /* wgsl */ `
const SKY_HOR = vec3f(0.74, 0.87, 0.98);
const SKY_TOP = vec3f(0.22, 0.5, 0.92);
const SUN = vec3f(0.5528, 0.6634, 0.5025); // unit
const SUNC = vec3f(1.0, 0.96, 0.86);
const AMB = vec3f(0.46, 0.52, 0.62);

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let k = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), k.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), k.x), k.y);
}

// The ground's facet at w: flat triangles on a 4 m grid, the normal (xyz)
// and a tint (w, 0..1) of the triangle w is on.
fn facet(w: vec2f) -> vec4f {
  let g = w / 4.0;
  let c = floor(g);
  let f = g - c;
  let p = c * 4.0;
  let h00 = hgt(p.x, p.y);
  let h10 = hgt(p.x + 4.0, p.y);
  let h01 = hgt(p.x, p.y + 4.0);
  let h11 = hgt(p.x + 4.0, p.y + 4.0);
  if (f.x + f.y < 1.0) { return vec4f(normalize(vec3f(h00 - h10, 4.0, h00 - h01)), hash2(c * 2.0)); }
  return vec4f(normalize(vec3f(h01 - h11, 4.0, h10 - h11)), hash2(c * 2.0 + 1.0));
}

// The facet as seen from z metres off: its tint fades out with distance, where
// a tint a triangle would only shimmer.
fn facetAt(w: vec2f, z: f32) -> vec4f {
  let f = facet(w);
  return vec4f(f.xyz, mix(f.w, 0.5, smoothstep(80.0, 300.0, z)));
}

// The surface at w with crisp, smooth edges: of the four surfaces around it,
// the one with the most bilinear weight (x), and how sure it is (y, 0.25..1).
fn surfAt(w: vec2f) -> vec2f {
  let g = clamp(w * 0.5 - 0.5, vec2f(0.0), vec2f(510.0));
  let i = vec2i(g);
  let f = g - vec2f(i);
  let s = array<u32, 4>(textureLoad(smap, i, 0).r, textureLoad(smap, i + vec2i(1, 0), 0).r, textureLoad(smap, i + vec2i(0, 1), 0).r, textureLoad(smap, i + vec2i(1, 1), 0).r);
  let k = array<f32, 4>((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  var best = s[0];
  var bw = 0.0;
  for (var a = 0; a < 4; a++) {
    var sum = 0.0;
    for (var b = 0; b < 4; b++) { if (s[b] == s[a]) { sum += k[b]; } }
    if (sum > bw) { bw = sum; best = s[a]; }
  }
  return vec2f(f32(best), bw);
}

// Close up the ground has a soft grain, gone by 40 m (z metres off).
fn grain(w: vec2f, z: f32) -> f32 { return 1.0 + (vnoise(w * 2.5) + vnoise(w * 0.9) - 1.0) * 0.07 * (1.0 - smoothstep(10.0, 40.0, z)); }

// Sun and sky on a surface facing n, the sun's share by k (0 in a shadow).
fn light(n: vec3f, k: f32) -> vec3f { return AMB * (0.8 + 0.2 * n.y) + SUNC * 0.78 * max(dot(n, SUN), 0.0) * k; }

// The sky along unit d from the eye e at time (s): pale at the horizon and
// deep overhead, the sun, and puffy clouds on a layer 300 m up, white on top
// and grey-blue under, drifting.
fn sky(d: vec3f, e: vec3f, time: f32) -> vec3f {
  var c = mix(SKY_HOR, SKY_TOP, pow(clamp(d.y, 0.0, 1.0), 0.6));
  let sd = max(dot(d, SUN), 0.0);
  c += SUNC * (pow(sd, 8.0) * 0.12 + smoothstep(0.9993, 0.9996, sd) * 2.0);
  if (d.y > 0.01 && e.y < 300.0) {
    let q = e.xz + d.xz * ((300.0 - e.y) / d.y) + vec2f(time * 2.0, 0.0);
    let n = vnoise(q / 160.0) * 0.6 + vnoise(q / 55.0) * 0.28 + vnoise(q / 19.0) * 0.12;
    let cl = smoothstep(0.52, 0.62, n) * smoothstep(0.0, 0.12, d.y);
    c = mix(c, mix(vec3f(0.78, 0.84, 0.94), vec3f(1.0), smoothstep(0.55, 0.75, n)), cl * 0.92);
  }
  return c;
}

// Far things go the colour of the horizon (z metres off).
fn fogged(c: vec3f, z: f32) -> vec3f { return mix(c, SKY_HOR, 1.0 - exp(-z / FOG)); }
`;

// The arena's and Dogfight's ground: grass a tint a facet, rock, the sand
// track, the bases' metal plates; steep ground rock whatever it's painted.
export const GROUND_WGSL = /* wgsl */ `
fn groundColor(w: vec2f, fc: vec4f) -> vec3f {
  let sw = surfAt(w);
  var c: vec3f;
  switch u32(sw.x) {
    case 0u: { c = vec3f(0.3, 0.62, 0.22) * (0.93 + 0.12 * fc.w); }
    case 1u: { c = vec3f(0.58, 0.55, 0.5) * (0.88 + 0.2 * fc.w); }
    case 2u: { c = vec3f(0.9, 0.78, 0.52); }
    default: {
      let seam = min(abs(fract(w.x / 4.0) - 0.5), abs(fract(w.y / 4.0) - 0.5)) < 0.04;
      c = select(vec3f(0.6, 0.64, 0.7), vec3f(0.38, 0.42, 0.48), seam);
    }
  }
  return select(c, vec3f(0.58, 0.55, 0.5) * (0.88 + 0.2 * fc.w), fc.y < 0.72 && u32(sw.x) != 3u);
}
`;

// The map's boxes, ray-traced (both renderers' map: a slab test per box, a
// group's bounds first) and coloured: plastic with studs on top, as the
// bricks people build with have, metal in panels, rock in strata, the lights
// glowing. A box's lo.w is its look (tools/map.mjs's MATERIALS: metal, rock,
// dark metal, red, blue, light, plain), plus 128 when hi.w holds a colour of
// its own (0xrrggbb), and that is plastic too.
export const BOXES_WGSL = /* wgsl */ `
var<private> MATERIAL: array<vec3f, 7> = array<vec3f, 7>(vec3f(0.6, 0.64, 0.7), vec3f(0.56, 0.53, 0.48), vec3f(0.27, 0.3, 0.35),
  vec3f(0.82, 0.2, 0.16), vec3f(0.16, 0.4, 0.86), vec3f(0.75, 0.95, 1.0), vec3f(0.72, 0.72, 0.74));

struct Hit { t: f32, n: vec3f, k: u32 };

// The nearest box the ray o + t d enters past t = 0 and before tmax (k = 0xffffffff for none).
// A box the ray starts inside isn't seen, so a camera in a wall sees out.
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

// 0 where a box stands between p and the sun, else 1.
fn sunlit(p: vec3f) -> f32 {
  if (u.map.x < 0.5) { return 1.0; }
  return select(1.0, 0.0, traceBoxes(p, SUN, 400.0).k != 0xffffffffu);
}

// Box k's face at w (normal n), pw metres to a pixel there: its colour, a dark line on every edge.
fn boxColor(k: u32, w: vec3f, n: vec3f, pw: f32) -> vec3f {
  let lo = boxes[2u * k];
  let hw = boxes[2u * k + 1u];
  let hi = hw.xyz;
  let m = min(u32(lo.w) & 127u, 6u);
  let own = (u32(lo.w) & 128u) != 0u;
  // the two axes across the face
  var uv = w.xy;
  var e = min(min(w.x - lo.x, hi.x - w.x), min(w.y - lo.y, hi.y - w.y));
  if (abs(n.x) > 0.5) { uv = w.zy; e = min(min(w.z - lo.z, hi.z - w.z), min(w.y - lo.y, hi.y - w.y)); }
  if (abs(n.y) > 0.5) { uv = w.xz; e = min(min(w.x - lo.x, hi.x - w.x), min(w.z - lo.z, hi.z - w.z)); }
  var c = MATERIAL[m];
  if (own) { let rgb = u32(hw.w); c = vec3f(f32(rgb >> 16u), f32((rgb >> 8u) & 255u), f32(rgb & 255u)) / 255.0; }
  if (m == 1u && !own) {
    // rock: strata a metre and a bit deep, each its own shade
    c *= 0.86 + 0.2 * hash2(vec2f(floor(w.y / 1.3), floor(dot(uv, vec2f(1.0)) / 9.0) + f32(k)));
  } else if ((m == 0u || m == 2u) && !own) {
    // panels 2 m by 1, their seams never thinner than a pixel
    let sw = max(0.06, pw);
    let seam = max(abs(fract(uv.x / 2.0) - 0.5) * 2.0 - 1.0 + sw / 2.0, abs(fract(uv.y) - 0.5) * 2.0 - 1.0 + sw) > 0.0;
    c *= select(1.0, 0.84, seam);
  } else if (m != 5u && n.y > 0.5) {
    // plastic: a stud every half metre on top, lit on the sun's side, faded out once it's a few pixels
    let g = fract(uv / 0.5) - 0.5;
    let r = length(g) * 0.5;
    let near = 1.0 - smoothstep(0.05, 0.1, pw);
    if (r < 0.14) { c *= 1.0 + 0.07 * near; }
    else if (r < 0.18) { c *= 1.0 - 0.22 * near * (0.5 + 0.5 * dot(g / max(length(g), 1e-4), -normalize(SUN.xz))); }
  }
  return c * select(1.0, 0.6, e < max(0.05, pw * 0.8));
}
`;
