// A person, drawn as a cartoon's: the arena's fighter and golf's golfer, in
// WGSL each renderer declares beside its own. Where client/rider.mjs's
// blocky figure is seven boxes, this is a distance field marched along the
// pixel's ray in the figure's own frame (x to its right, y up from its feet,
// z the way it faces): legs with knees that lift as it runs, a torso, arms
// with elbows out to the gun in its hands, a big head with hair (one of
// three cuts), two tall eyes and a small mouth. A zombie reaches with empty
// hands and stares; a robot has a box for a head, a visor and an aerial.
// One that is down (the arena's Evade and Escape) is the same figure on its
// front, propped on its elbows with its head up, crawling as it goes.
// The renderer gives the colours (Kit: a body's skin, an avatar's six parts,
// a side's shirt) and lights what comes back as it lights anything else.
// 1.83 m tall, as the blocky one was. Drawing only, like everything here.

export const FIGURE_WGSL = /* wgsl */ `
struct Kit {
  skin: vec3f, hair: vec3f, torso: vec3f, larm: vec3f, rarm: vec3f, lleg: vec3f, rleg: vec3f, eye: vec3f,
  kind: u32,  // 0 a person, 1 a zombie, 2 a robot
  gun: u32,   // 0 none, 1 a rifle in both hands, 2 a launcher on the shoulder
  cut: u32,   // the hair: 0 short, 1 long, 2 a tail
  lie: u32,   // 0 standing, 1 down on its front (fgCrawl)
};
// where the joints are this frame
struct Rig {
  hipL: vec3f, kneeL: vec3f, footL: vec3f, hipR: vec3f, kneeR: vec3f, footR: vec3f,
  shL: vec3f, elL: vec3f, haL: vec3f, shR: vec3f, elR: vec3f, haR: vec3f,
  head: vec3f, gun: vec3f, tail: vec3f, aim: vec2f, bob: f32,
  nod: vec2f, // the head tipped back about its middle: the angle's cos and sin (1, 0 standing)
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

// Down on its front, in the frame figureRay lays over for it: y still runs
// from its feet to its head, now along the ground the way it heads, and z
// from its back to its chest, now into the ground, the head's end 0.2 rad
// up so the hips rest on the ground and the chest is off it. LIE_A is that
// tilt, LIE its cos and sin; fgFloor(y) the ground's z under y.
const LIE_A = 0.2;
const LIE = vec2f(0.98007, 0.19867);
fn fgFloor(y: f32) -> f32 { return (0.14 + (y - 0.85) * LIE.y) / LIE.x; }
// One leg down there: the thigh out from the body's line by a, the shin
// folded back toward it the more the knee is drawn up, both on the ground.
fn fgSprawl(hip: vec3f, side: f32, a: f32) -> array<vec3f, 2> {
  let b = a - 1.9 * (a - 0.22);
  var knee = hip + 0.39 * vec3f(side * sin(a), -cos(a), 0.0);
  knee.z = fgFloor(knee.y) - 0.1;
  var foot = knee + 0.39 * vec3f(side * sin(b), -cos(b), 0.0);
  foot.z = fgFloor(foot.y) - 0.07;
  return array<vec3f, 2>(knee, foot);
}
// The joints of one that is down: propped on its elbows, forearms ahead,
// the head up and tipped back to look where it goes. Crawling (pose.w, 0
// lying still to 1), one arm reaches as the other pulls, and the knee
// across from the reaching arm is drawn up.
fn fgCrawl(pose: vec4f) -> Rig {
  var r: Rig;
  let sw = pose.w * sin(pose.z);
  r.bob = 0.0;
  r.aim = vec2f(1.0, 0.0);
  r.hipL = vec3f(-0.105, 0.85, 0.0);
  r.hipR = vec3f(0.105, 0.85, 0.0);
  let l = fgSprawl(r.hipL, -1.0, 0.22 + 0.7 * max(-sw, 0.0));
  let rr = fgSprawl(r.hipR, 1.0, 0.22 + 0.7 * max(sw, 0.0));
  r.kneeL = l[0]; r.footL = l[1];
  r.kneeR = rr[0]; r.footR = rr[1];
  r.shL = vec3f(-0.25, 1.26, 0.0);
  r.shR = vec3f(0.25, 1.26, 0.0);
  r.elL = vec3f(-0.42, 1.3 + 0.09 * sw, fgFloor(1.3 + 0.09 * sw) - 0.07);
  r.elR = vec3f(0.42, 1.3 - 0.09 * sw, fgFloor(1.3 - 0.09 * sw) - 0.07);
  r.haL = vec3f(-0.3, 1.64 + 0.16 * sw, fgFloor(1.64 + 0.16 * sw) - 0.07);
  r.haR = vec3f(0.3, 1.64 - 0.16 * sw, fgFloor(1.64 - 0.16 * sw) - 0.07);
  r.head = vec3f(0.03 * sw, 1.53, -0.1);
  r.nod = vec2f(0.5403, 0.8415);
  r.tail = r.head + vec3f(0.0, -0.3, -0.26);
  return r;
}

// pose: (heading, the aim's pitch (rad, up), the stride's phase, its length 0..1), as the blocky figure's
fn fgRig(pose: vec4f, kit: Kit) -> Rig {
  if (kit.lie == 1u) { return fgCrawl(pose); }
  var r: Rig;
  r.nod = vec2f(1.0, 0.0);
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

// p as the head has it: turned about the head's middle by the nod, so its
// crown comes back and its face up. Standing, p itself.
fn fgNod(p: vec3f, r: Rig) -> vec3f {
  if (r.nod.y == 0.0) { return p; }
  let q = p - r.head;
  return r.head + vec3f(q.x, q.y * r.nod.x - q.z * r.nod.y, q.y * r.nod.y + q.z * r.nod.x);
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
  // the head and what grows on it, where the nod has turned them
  let ph = fgNod(p, r);
  let hl = ph - r.head;
  if (kit.kind == 2u) {
    o = fgMin(o, fgBox(hl, vec3f(0.22, 0.2, 0.2), 0.05), 0.0);
    o = fgMin(o, min(fgCap(ph, r.head + vec3f(0.11, 0.19, 0.0), r.head + vec3f(0.13, 0.27, 0.0), 0.014), length(hl - vec3f(0.13, 0.28, 0.0)) - 0.03), 8.0);
  } else {
    o = fgMin(o, length(hl * vec3f(1.0, 0.95, 1.0)) - 0.245, 0.0);
    // hair: a shell over the head, opened over the face under a ragged fringe
    var dh = length(hl - vec3f(0.0, 0.028, -0.025)) - 0.268;
    let fringe = 0.095 + 0.055 * abs(fract(hl.x * 7.0 + 0.25) - 0.5) - 0.25 * abs(hl.x);
    dh = max(dh, min(hl.z - 0.05, fringe - hl.y));
    if (kit.cut == 1u) { dh = min(dh, fgBox(hl - vec3f(0.0, -0.2, -0.15), vec3f(0.2, 0.22, 0.075), 0.07)); }
    if (kit.cut == 2u) { dh = min(dh, fgCap(ph, r.head + vec3f(0.0, 0.09, -0.24), r.tail, 0.08)); }
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
// normal in the world, and ink where the surface turns from the eye. One
// that is down (kit.lie) lies over the same spot, its hips on it, along a
// ground that rises pose.y the way it heads.
fn figureRay(e: vec3f, d: vec3f, fwd: vec3f, pw: f32, feet: vec3f, pose: vec4f, kit: Kit) -> Fig {
  var o: Fig;
  o.hit = false;
  let f = vec3f(cos(pose.x), 0.0, sin(pose.x));
  let side = vec3f(-f.z, 0.0, f.x);
  // the frame's y and z in the world: up and the way it faces, or laid over on its front (fgCrawl)
  var up = vec3f(0.0, 1.0, 0.0);
  var front = f;
  var w = e - feet;
  var hips = 0.0;
  if (kit.lie == 1u) {
    let tilt = vec2f(cos(LIE_A + pose.y), sin(LIE_A + pose.y));
    up = f * tilt.x + vec3f(0.0, tilt.y, 0.0);
    front = f * tilt.y - vec3f(0.0, tilt.x, 0.0);
    w.y -= 0.14;
    hips = 0.85;
  }
  let lo = vec3f(dot(w, side), dot(w, up) + hips, dot(w, front));
  let ld = vec3f(dot(d, side), dot(d, up), dot(d, front));
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
  o.n = normalize(side * n.x + up * n.y + front * n.z);
  o.glow = vec3f(0.0);
  let hl = fgNod(p, r) - r.head;
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
    if (abs(ring) < 0.013 && n.y * r.nod.x - n.z * r.nod.y > 0.25 && hl.z > -0.05) { c = mix(c, vec3f(1.0), 0.35); }
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
  if (kit.kind == 2u && part != 8.0) { c = mix(c, vec3f(0.75, 0.8, 0.9), 0.25) * (1.0 + 0.25 * step(0.75, select(n.y, o.n.y, kit.lie == 1u))); }
  o.alb = c;
  // ink where it turns from the eye, close enough that a line is narrower than the limb
  o.ink = 1.0 - smoothstep(0.3, 0.22, dot(n, -ld)) * (1.0 - smoothstep(0.004, 0.012, pw * t));
  return o;
}
`;

// Hair and eye colours a slot's hash picks from, as WGSL array bodies.
export const HAIRS = [[0.13, 0.13, 0.22], [0.38, 0.23, 0.15], [0.98, 0.83, 0.38], [1.0, 0.55, 0.72], [0.3, 0.55, 0.96], [0.87, 0.89, 0.96], [0.86, 0.22, 0.2], [0.2, 0.74, 0.7], [0.6, 0.38, 0.85], [0.95, 0.5, 0.2]];
export const EYES = [[0.2, 0.5, 0.95], [0.25, 0.7, 0.4], [0.6, 0.35, 0.2], [0.7, 0.3, 0.85], [0.9, 0.3, 0.3], [0.95, 0.65, 0.2]];
