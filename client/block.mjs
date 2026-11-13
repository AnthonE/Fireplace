// A box as one sprite: party's confetti (client/juice.mjs), golf's trees in the
// rough (client/render.mjs) and the gun in your hands in the arena
// (client/viewmodel.mjs). The sprite's square covers the box's bounding
// sphere and each pixel casts its own ray at the box, so a box costs one quad
// and is exact at any size, with a bevel and an ink line on its edges like
// party's solids. Drawing only. (The players themselves are the cartoon
// figure, client/figure.mjs, in every game.)
//
// As a party sprite of kind BLOCK: pos the centre, size the bounding radius,
// vel the half sizes (across, up, front), roll its yaw (the front toward
// (cos, 0, sin)), seed its pitch (turned about its across axis), color.a its
// part (PART) plus 16 times its splay, turned about its front first (a
// twentieth of a radian a step, 64 none).

export const BLOCK = 12; // the sprite kind in party's renderer
// what a box's faces show: 0 plain plastic, 3 metal, 5 lit from inside
export const PART = { PLAIN: 0, METAL: 3, GLOW: 5 };

// A box's pixel, in WGSL any renderer can declare: blockRay casts a ray from e
// along unit d at a box, fwd the camera's forward axis and focal its focal
// length (px), for the view depth z and a pixel's width there. n is the world
// normal, bent over the bevel; cover is the edge's coverage where the face
// beyond it turns away (the silhouette, for alpha to coverage); ink darkens
// every edge; glow is light of its own.
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
  if (part == 3u) { b.shine = 2.5; }                         // metal
  if (part == 5u) { b.glow = c * 1.1; b.shine = 2.0; }       // lit from inside
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
