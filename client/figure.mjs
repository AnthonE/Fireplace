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

export const FIGURE_WGSL = /* wgsl */ `
struct Kit {
  skin: vec3f, hair: vec3f, torso: vec3f, larm: vec3f, rarm: vec3f, lleg: vec3f, rleg: vec3f, eye: vec3f,
  kind: u32,  // 0 a person, 1 a zombie, 2 a robot
  gun: u32,   // 0 none, 1 a rifle in both hands, 2 a launcher on the shoulder
  cut: u32,   // the hair: 0 short, 1 long, 2 a tail
};
// where the joints are this frame
struct Rig {
  hipL: vec3f, kneeL: vec3f, footL: vec3f, hipR: vec3f, kneeR: vec3f, footR: vec3f,
  shL: vec3f, elL: vec3f, haL: vec3f, shR: vec3f, elR: vec3f, haR: vec3f,
  head: vec3f, gun: vec3f, tail: vec3f, aim: vec2f, bob: f32,
};
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
  if (kit.kind == 2u) {
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
  let oc = lo - vec3f(0.0, 0.95, 0.12);
  let b = dot(oc, ld);
  let disc = b * b - dot(oc, oc) + 1.25 * 1.25;
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
    // a collar, a line down the front and a belt
    if (p.y > 1.27 + r.bob) { c = mix(c, vec3f(1.0), 0.45); }
    else if (p.y < 0.955 + r.bob) { c = vec3f(0.14, 0.13, 0.2); }
    else if (abs(p.x) < 0.01 && p.z > 0.0) { c *= 0.6; }
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
    // the face: two tall eyes (a dark lid, the iris, a pupil, a white glint), a mouth, a blush
    let ex = (abs(hl.x) - 0.098) / 0.052;
    let ey = (hl.y + 0.015) / 0.078;
    let er = ex * ex + ey * ey;
    if (kit.kind == 1u) {
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
    } else if (abs(hl.y + 0.125 + 5.0 * hl.x * hl.x) < 0.0075 && abs(hl.x) < 0.045) { c = vec3f(0.55, 0.2, 0.2); }
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
