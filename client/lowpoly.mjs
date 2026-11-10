// The look golf, the arena and Dogfight share, in WGSL each renderer
// declares beside its own: a cartoon's. Light comes in three flat tones (in
// the sun, turned from it, in shadow: warm, then cooler, then violet), with
// crisp edges between them; hills and cliffs cast shadows as the boxes do;
// the ground is painted in patches of a few colours with strokes of grass
// close up, rock in strata; the sky runs from cobalt overhead to a pale
// horizon, cumulus piled along it and flat clouds overhead, each white on
// its sunny side and lavender under, their shadows drifting over the ground;
// far things fade into the horizon's haze. The hour is a uniform (day, dusk
// or night: ENVS). Colours may go past 1: the frame is finished by
// client/post.mjs (ink lines, bloom, the roll-off). A renderer brings
// `hgt(x, z)`, the surface texture `smap`, FOG (metres) and `env`; the box
// half (BOXES_WGSL) also wants `boxes`, `groups` and u.map. Drawing only,
// like everything a renderer does.

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

// The hour: where the light comes from and every colour that follows from
// it, a uniform each renderer declares as \`env\` (ENV_WGSL is its struct) and
// writes each frame from envPack(name). In the WGSL below, and in the
// renderers' own once it has been through withEnv(), the names SUN, SUNC,
// SKY_TOP, SKY_HOR, HAZE, TONE_SHADE, TONE_MID, TONE_LIT, CLOUD_LIT and
// CLOUD_SHADE read it. Day is the look as first drawn; dusk has the sun 15
// degrees up in the west, so shadows run long and what is lit goes gold;
// night is the moon's, blue, with stars, and what glows shows the more.
// Drawing only: a match's hour comes from its seed (envOf), so a room sees
// one sky, but nothing in the sim knows it.
const dir = (az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)]; };
export const ENVS = {
  //        toward the light        its colour, its disc past white   the sky overhead        at the horizon          what far things fade to
  day: { sun: [0.5528, 0.6634, 0.5025], stars: 0, sunc: [1.0, 0.96, 0.86], disc: 6, skyTop: [0.09, 0.34, 0.86], skyHor: [0.72, 0.9, 1.0], haze: [0.78, 0.92, 1.0],
    // what a colour is multiplied by in shadow, turned from the light, and in it; a cloud's lit side and its other
    shade: [0.5, 0.53, 0.82], mid: [0.82, 0.85, 0.97], lit: [1.06, 1.03, 0.95], cloudLit: [1.04, 1.03, 1.0], cloudShade: [0.7, 0.78, 0.97] },
  dusk: { sun: dir(205, 15), stars: 0, sunc: [1.0, 0.72, 0.42], disc: 5, skyTop: [0.2, 0.26, 0.66], skyHor: [1.0, 0.7, 0.5], haze: [1.0, 0.78, 0.62],
    shade: [0.44, 0.42, 0.74], mid: [0.8, 0.7, 0.78], lit: [1.14, 0.98, 0.78], cloudLit: [1.12, 0.86, 0.68], cloudShade: [0.62, 0.5, 0.74] },
  night: { sun: dir(130, 50), stars: 1, sunc: [0.5, 0.58, 0.85], disc: 2.2, skyTop: [0.02, 0.04, 0.15], skyHor: [0.09, 0.16, 0.38], haze: [0.1, 0.17, 0.38],
    shade: [0.17, 0.25, 0.6], mid: [0.3, 0.44, 0.86], lit: [0.46, 0.66, 1.08], cloudLit: [0.44, 0.54, 0.86], cloudShade: [0.14, 0.2, 0.46] },
};
export const ENV_FLOATS = 40;
export const envPack = (name) => {
  const e = ENVS[name] || ENVS.day;
  // lit.w: how squarely a surface must face the light for the lit tone, level ground always making it
  return Float32Array.of(...e.sun, e.stars, ...e.sunc, e.disc, ...e.skyTop, 0, ...e.skyHor, 0, ...e.haze, 0, ...e.shade, 0, ...e.mid, 0, ...e.lit, e.sun[1] * 0.85, ...e.cloudLit, 0, ...e.cloudShade, 0);
};
// A match's hour, from its seed: day four times in six, dusk once, night once.
export const envOf = (seed) => ['day', 'dusk', 'day', 'night', 'day', 'day'][(Math.imul(seed >>> 0, 0x9e3779b1) >>> 0) % 6];
export const ENV_WGSL = /* wgsl */ `
struct Env { sun: vec4f, sunc: vec4f, skyTop: vec4f, skyHor: vec4f, haze: vec4f, shade: vec4f, mid: vec4f, lit: vec4f, cloudLit: vec4f, cloudShade: vec4f };
`;
const ENV_NAMES = { SUNC: 'env.sunc.rgb', SUN: 'env.sun.xyz', SKY_TOP: 'env.skyTop.rgb', SKY_HOR: 'env.skyHor.rgb', HAZE: 'env.haze.rgb', TONE_SHADE: 'env.shade.rgb',
  TONE_MID: 'env.mid.rgb', TONE_LIT: 'env.lit.rgb', CLOUD_LIT: 'env.cloudLit.rgb', CLOUD_SHADE: 'env.cloudShade.rgb' };
// A renderer's whole WGSL with the hour's names read from its \`env\`.
export const withEnv = (wgsl) => wgsl.replace(/\b(SUNC|SUN|SKY_TOP|SKY_HOR|HAZE|TONE_SHADE|TONE_MID|TONE_LIT|CLOUD_LIT|CLOUD_SHADE)\b/g, (m) => ENV_NAMES[m]);

export const LOWPOLY_WGSL = /* wgsl */ `

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let k = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), k.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), k.x), k.y);
}
fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let k = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i), hash3(i + vec3f(1.0, 0.0, 0.0)), k.x), mix(hash3(i + vec3f(0.0, 1.0, 0.0)), hash3(i + vec3f(1.0, 1.0, 0.0)), k.x), k.y);
  let b = mix(mix(hash3(i + vec3f(0.0, 0.0, 1.0)), hash3(i + vec3f(1.0, 0.0, 1.0)), k.x), mix(hash3(i + vec3f(0.0, 1.0, 1.0)), hash3(i + vec3f(1.0, 1.0, 1.0)), k.x), k.y);
  return mix(a, b, k.z);
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

// The ground's own slope at w, over e metres each way: what the tones follow,
// so a hill's dark side has a curved edge and not a triangle's.
fn slopeN(w: vec2f, e: f32) -> vec3f {
  return normalize(vec3f(hgt(w.x - e, w.y) - hgt(w.x + e, w.y), 2.0 * e, hgt(w.x, w.y - e) - hgt(w.x, w.y + e)));
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

// The three tones, by how squarely a surface faces the light (l, the cosine,
// 0 in a shadow): the edges between them a few hundredths wide. Level ground
// in the open is always in the lit one, however low the sun.
fn cel(l: f32) -> vec3f {
  return mix(mix(TONE_SHADE, TONE_MID, smoothstep(0.0, 0.05, l)), TONE_LIT, smoothstep(env.lit.w, env.lit.w + 0.05, l));
}
// Sun and sky on a surface facing n, the sun's share by k (0 in a shadow);
// what faces up is a little lighter in any tone, for the sky on it.
fn light(n: vec3f, k: f32) -> vec3f { return cel(dot(n, SUN) * k) * (0.93 + 0.07 * n.y); }

// How much of the sun reaches p past the ground: 0 behind a hill or under a
// cliff, a march toward the sun over the heights till it clears the highest
// (top), its steps growing; the edge of the shadow a little soft.
fn hillLit(p: vec3f, top: f32) -> f32 {
  var t = 2.0;
  var s = 1.0;
  for (var i = 0; i < 22; i++) {
    let q = p + SUN * t;
    if (q.y > top) { break; }
    let g = q.y - hgt(q.x, q.z);
    if (g < 0.0) { return 0.0; }
    s = min(s, 10.0 * g / t);
    t += 1.5 + t * 0.18;
  }
  return smoothstep(0.0, 0.3, s);
}

// A cliff's rock at w across and y up, z metres off, pw metres to a pixel:
// strata a couple of metres deep that wander a little, each one of three
// shades, a crack between them close up.
fn cliff(w: vec2f, y: f32, z: f32, pw: f32) -> vec3f {
  let band = y / 2.1 + (vnoise(w / 27.0) - 0.5) * 1.3;
  let c = vec3f(0.68, 0.62, 0.62) * (0.86 + 0.1 * floor(hash2(vec2f(floor(band), 7.0)) * 3.0));
  return c * (1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.04 + pw, fract(band))) * (1.0 - smoothstep(50.0, 130.0, z)));
}

// The flat clouds, a layer 300 m up: how thick at q across it (over 0.5 a cloud).
fn cloudAt(q: vec2f) -> f32 { return vnoise(q / 210.0) * 0.62 + vnoise(q / 70.0) * 0.3 + vnoise(q / 24.0) * 0.08; }
// And their shadows on the world at p, drifting with them: what to multiply a colour by.
fn cloudShade(p: vec3f, time: f32) -> vec3f {
  let q = p.xz + SUN.xz * ((300.0 - p.y) / SUN.y) + vec2f(time * 2.0, 0.0);
  return mix(vec3f(1.0), vec3f(0.86, 0.89, 0.97), smoothstep(0.56, 0.62, cloudAt(q)) * step(0.05, SUN.y));
}

// A cumulus's lumps at a round the horizon and el up it, 0 in a crease to 1 on a lump's crown.
fn puffs(a: vec2f, el: f32) -> f32 {
  return (1.0 - abs(2.0 * vnoise3(vec3f(a * 7.0, el * 7.0)) - 1.0)) * 0.65 + (1.0 - abs(2.0 * vnoise3(vec3f(a * 19.0, el * 19.0 + 5.0)) - 1.0)) * 0.35;
}

// The sky along unit d from the eye e at time (s): cobalt overhead down to a
// pale horizon, the sun (past white: it blooms), cumulus standing along the
// horizon all the way round, and flat clouds on a layer 300 m up, drifting.
// Every cloud is two flat colours: white where it faces the sun, lavender
// where it doesn't.
fn sky(d: vec3f, e: vec3f, time: f32) -> vec3f {
  let y = clamp(d.y, 0.0, 1.0);
  var c = mix(SKY_HOR, SKY_TOP, pow(y, 0.5));
  c = mix(c, HAZE, exp(-y * 10.0) * 0.8);
  let sd = max(dot(d, SUN), 0.0);
  c += SUNC * (pow(sd, 6.0) * 0.16 + pow(sd, 90.0) * 0.5 + smoothstep(0.9989, 0.9993, sd) * env.sunc.w);
  // stars, a night's: a dot in three cells in two hundred of the sky's
  if (env.sun.w > 0.0 && d.y > 0.0) {
    let g = d * 120.0;
    if (hash3(floor(g)) > 0.985 && length(fract(g) - 0.5) < 0.24) { c += vec3f(0.9, 0.95, 1.0) * env.sun.w * smoothstep(0.0, 0.15, d.y); }
  }
  // the cumulus: on a cylinder round the eye, a (round it) and el (up it); a skyline of big heaps, their edge in
  // round lumps (the noise folded, so it creases between them), finer ones on those
  let across = length(d.xz);
  if (d.y > -0.03 && across > 0.3) {
    let turn = time * 0.0015;
    let a0 = d.xz / across;
    let a = vec2f(a0.x * cos(turn) - a0.y * sin(turn), a0.x * sin(turn) + a0.y * cos(turn));
    let el = d.y / across;
    let heap = vnoise3(vec3f(a * 1.6, 3.0)) * 0.65 + vnoise3(vec3f(a * 4.1, 9.0)) * 0.35;
    let top = 0.03 + 0.62 * pow(max(heap - 0.3, 0.0), 1.25);
    let m = top * (0.55 + 0.75 * puffs(a, el * 0.3)) - el;
    if (m > 0.0) {
      // lit where the lumps stand out toward the sun's side, lavender in the body and under
      let s0 = normalize(SUN.xz);
      let rise = puffs(a, el) - puffs(a + s0 * 0.03, el + 0.035);
      let lit = smoothstep(-0.02, 0.02, rise + 0.05 - m * 0.9);
      var cl = mix(CLOUD_SHADE, CLOUD_LIT, lit);
      cl = mix(cl, HAZE, exp(-max(el, 0.0) * 26.0) * 0.7);
      c = mix(c, cl, smoothstep(0.0, 0.004, m));
    }
  }
  if (d.y > 0.01 && e.y < 300.0) {
    let q = e.xz + d.xz * ((300.0 - e.y) / d.y) + vec2f(time * 2.0, 0.0);
    let n = cloudAt(q);
    let cover = smoothstep(0.56, 0.575, n) * smoothstep(0.05, 0.2, d.y);
    // white on the side the sun is on (thinner that way), lavender on the other
    let lit = smoothstep(-0.01, 0.015, n - cloudAt(q + SUN.xz * 34.0) + 0.035);
    c = mix(c, mix(CLOUD_SHADE, CLOUD_LIT, lit), cover * 0.96);
  }
  return c;
}

// Far things go the colour of the horizon's haze (z metres off): hardly at
// all close by, wholly where the world stops being drawn.
fn fogged(c: vec3f, z: f32) -> vec3f { let f = z / (FOG * 0.75); return mix(c, HAZE, 1.0 - exp(-f * f)); }
`;

// The arena's and Dogfight's ground, painted: grass in patches of three
// greens with strokes and a few flowers close up, rock in strata on anything
// steep (and under the grass's lip), the sand track, the bases' metal plates.
// At w across and y up, z metres off, pw metres to a pixel there: its colour
// before the light, and the normal the light goes by.
export const GROUND_WGSL = /* wgsl */ `
struct Ground { c: vec3f, n: vec3f };
fn groundPaint(w: vec2f, y: f32, z: f32, pw: f32) -> Ground {
  var g: Ground;
  // the light goes by the slope over a wider span the farther off it is, so far hills are a few broad shapes
  let sn = slopeN(w, 3.0);
  g.n = normalize(mix(facet(w).xyz, slopeN(w, clamp(z / 25.0, 3.0, 12.0)), mix(0.8, 1.0, smoothstep(60.0, 160.0, z))));
  let kind = u32(surfAt(w).x);
  let lean = sn.y + (vnoise(w / 3.1) - 0.5) * 0.05;
  var c: vec3f;
  if (lean < 0.74 && kind != 3u) {
    c = cliff(w, y, z, pw);
  } else if (kind == 1u) {
    // rock underfoot: slabs, a few lighter
    let p = vnoise(w / 7.0) * 0.7 + vnoise(w / 2.3) * 0.3;
    c = mix(vec3f(0.64, 0.6, 0.61), vec3f(0.69, 0.65, 0.65), smoothstep(0.52, 0.55, p));
  } else if (kind == 2u) {
    let p = vnoise(w / 9.0) * 0.65 + vnoise(w / 2.7) * 0.35;
    c = mix(vec3f(0.93, 0.8, 0.55), vec3f(1.0, 0.9, 0.66), smoothstep(0.5, 0.53, p));
  } else if (kind == 3u) {
    let seam = min(abs(fract(w.x / 4.0) - 0.5), abs(fract(w.y / 4.0) - 0.5)) < 0.04;
    c = select(vec3f(0.62, 0.67, 0.76), vec3f(0.36, 0.4, 0.5), seam);
  } else {
    let p = vnoise(w / 26.0) * 0.6 + vnoise(w / 9.0) * 0.3 + vnoise(w / 3.3) * 0.1;
    c = vec3f(0.38, 0.74, 0.22);
    c = mix(c, vec3f(0.335, 0.695, 0.225), 1.0 - smoothstep(0.4, 0.43, p));
    c = mix(c, vec3f(0.45, 0.79, 0.235), smoothstep(0.58, 0.61, p));
    // the lip of the grass over a cliff, darker
    if (lean < 0.79) { c *= vec3f(0.7, 0.8, 0.78); }
    // close up: strokes of grass in drifts, one to a cell of a 0.8 m grid, each turned its own way, and now and then a flower
    let near = 1.0 - smoothstep(16.0, 40.0, z);
    if (near > 0.0) {
      let cell = floor(w / 0.8);
      let r = vec2f(hash2(cell), hash2(cell + 17.3));
      let o = w - (cell + 0.2 + 0.6 * r) * 0.8;
      let t = (r.x - 0.5) * 1.6;
      let q = vec2f(o.x * cos(t) - o.y * sin(t), o.x * sin(t) + o.y * cos(t));
      let pick = hash2(cell + 3.1);
      if (pick < 0.6 && vnoise(w / 4.3) > 0.42 && abs(q.x) < 0.028 + pw * 0.5 && abs(q.y) < 0.07 + 0.13 * r.y) { c = mix(c, c * vec3f(0.66, 0.8, 0.74), near); }
      if (pick > 0.965 && length(o) < 0.075 + pw * 0.5) { c = mix(c, select(vec3f(1.0, 0.98, 0.9), vec3f(1.0, 0.86, 0.3), r.y > 0.5), near); }
    }
  }
  g.c = c;
  return g;
}
`;

// What glows, drawn flat as a cartoon draws it (the arena's and Dogfight's
// blended sprites and beams), premultiplied and past white so it blooms:
// uv across the sprite's square, col its colour with an alpha that runs from
// its start down to 0 over its life. Kind 3 is a blast (a muzzle's flash, a
// kill, an explosion): a spiked burst in three flat bands, white-hot inside,
// breaking up in holes from its rim as it ages. 5 a glint, four points. 6 a
// ring of dashes going round (a shield, a spawn, a teleporter).
export const FX_WGSL = /* wgsl */ `
fn celGlow(uv: vec2f, kind: u32, col: vec4f, time: f32) -> vec4f {
  let r = length(uv);
  let ang = atan2(uv.y, uv.x);
  if (kind == 5u) {
    let s = sqrt(abs(uv.x)) + sqrt(abs(uv.y));
    if (s > 1.0) { return vec4f(0.0); }
    let k = min(col.a * 2.0, 1.0);
    return vec4f(select(col.rgb * 1.8, vec3f(2.4, 2.4, 2.1), s < 0.6) * k, k);
  }
  if (kind == 6u) {
    if (r > 1.0) { return vec4f(0.0); }
    let ring = step(0.8, r) * step(r, 0.96) * step(0.35, fract(ang / 6.2832 * 12.0 + time * 0.8));
    let k = clamp(col.a * 1.5, 0.0, 1.0) * (ring * 0.9 + 0.14);
    return vec4f(mix(col.rgb, vec3f(1.0), ring * 0.4) * 1.6 * k, k);
  }
  let age = 1.0 - col.a;
  let rim = 0.66 + 0.3 * abs(fract(ang / 6.2832 * 9.0 + 0.11 * sin(ang * 4.0) + age * 0.4) - 0.5) * 2.0;
  if (r > rim) { return vec4f(0.0); }
  let k = r / rim;
  if (vnoise(uv * 3.5 + vec2f(age * 3.0, -age)) < age * 1.6 - 0.55 + k * 0.5) { return vec4f(0.0); }
  let c = select(select(col.rgb * 0.8, col.rgb * 1.5 + 0.15, k < 0.76), vec3f(2.6, 2.5, 2.1), k < 0.34 - 0.25 * age);
  return vec4f(c, 1.0);
}
// A beam's pixel, across from -1 to 1 over its width: a white-hot core in its colour's sheath.
fn celBeam(across: f32, col: vec4f) -> vec4f {
  let a = col.a * step(abs(across), 0.92);
  return vec4f(select(col.rgb * 1.5, vec3f(2.4, 2.4, 2.2), abs(across) < 0.42) * a, a);
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

// Box k's face at w (normal n), pw metres to a pixel there: its colour, an
// ink line on every edge, a wall darker toward its foot, metal with the
// slanting glints a cartoon gives it, a light past white so it blooms.
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
    c *= select(1.0, 0.8, seam);
    // two glints, a wide and a thin, slanting across every 9 m of metal
    let gl = fract((uv.x + uv.y * 0.7) / 9.0 + hash2(vec2f(f32(k), 3.0)));
    if (gl < 0.07 || (gl > 0.1 && gl < 0.125)) { c *= 1.16; }
  } else if (m != 5u && n.y > 0.5) {
    // plastic: a stud every half metre on top, lit on the sun's side, faded out once it's a few pixels
    let g = fract(uv / 0.5) - 0.5;
    let r = length(g) * 0.5;
    let near = 1.0 - smoothstep(0.05, 0.1, pw);
    if (r < 0.14) { c *= 1.0 + 0.07 * near; }
    else if (r < 0.18) { c *= 1.0 - 0.22 * near * (0.5 + 0.5 * dot(g / max(length(g), 1e-4), -normalize(SUN.xz))); }
  }
  if (m == 5u) { c *= 1.7; }
  else if (abs(n.y) < 0.5) { c *= 0.84 + 0.16 * smoothstep(0.0, 1.0, (w.y - lo.y) / min(hi.y - lo.y, 5.0)); }
  return mix(c, vec3f(0.1, 0.09, 0.2) * (0.5 + c), select(0.0, 0.78, e < max(0.05, pw * 0.9)));
}
`;
