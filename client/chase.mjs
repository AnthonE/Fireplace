// The arena's third-person camera, as Roblox has one: behind the player's
// own fighter on a boom from its eye, back along the aim and leaning to the
// right and up, so the figure stands left of and under the screen's centre
// at every zoom and what it aims at shows past its shoulder. The boom stops
// short of the map's boxes (where they are this tick, the ones that move)
// and the ground, so the camera never sees through the world; pulled in
// under a metre, or under an aim too steep for it, it is the eye again.
// The sim still fires from the eye along the yaw and pitch, so the reticle
// goes where that ray lands (aimPoint, the sim's $a_ray), projected through
// the camera, not at the camera's own centre. Everything here is a function
// of what it is given: drawing only, never fed back.
import { slab, moverAt } from '../src/arena-view.mjs';

export const CHASE_MIN = 2; // the nearest the wheel leaves it (m back): one notch nearer is first person
export const CHASE_MAX = 12;
export const CHASE_START = 5; // where the key puts it the first time
export const CHASE_NEAR = 1; // pulled in under this, the camera is the eye: the figure would fill the screen
const STEP = 1.25; // a notch of the wheel
const SIDE = 0.25, RISE = 0.12; // the boom's lean, aiming level: metres right and up a metre back
// An aim steeper than this (rad) is seen through the eye: the renderer's lens is a shear (client/arena-render.mjs
// lens), which smears a figure seen from over its head, and under an aim far up the boom is in the ground
const DOWN = 0.87, UP = 0.7, SLACK = 0.09; // (and this much back before the camera goes out again)
// the renderer draws no figure a camera stands in: within this of its middle across the ground, and this over or under it
const IN_R = 0.75, IN_H = 1.45, MIDDLE = 0.68; // (its middle this far under its eye)
const SKIN = 0.3; // short of what the boom meets (m)
const CLEAR = 0.4; // and this far over the ground, as the frontend keeps every camera

// The distance a notch of the wheel leaves: out (dir > 0) from first person
// to CHASE_MIN, then by STEP to CHASE_MAX; in the same way back, to 0.
export function zoomStep(dist, dir) {
  if (dir > 0) return dist < CHASE_MIN ? CHASE_MIN : Math.min(CHASE_MAX, dist * STEP);
  return dist / STEP < CHASE_MIN - 1e-6 ? 0 : dist / STEP;
}

// The view kept in a browser, as a string: the distance now and the last
// third-person one (what the key goes back to). viewOf reads one back, null
// for none or one that makes no sense.
export const viewText = (v) => `${v.dist.toFixed(2)},${v.last.toFixed(2)}`;
export function viewOf(text) {
  const [dist, last] = String(text ?? '').split(',').map(Number);
  const ok = (d) => d >= CHASE_MIN && d <= CHASE_MAX;
  if (!(dist === 0 || ok(dist)) || !ok(last)) return null;
  return { dist, last };
}

// The view a page starts in: ?view=3 or ?view=1 (forced: nothing is kept from
// that visit; ?dist= with 3 says how far back, in metres), else what the
// player chose before (kept: viewOf's), else first person. A map with a
// Humanoid's movement asks for third person (mapView) until the player chooses.
export function startView(force, kept, dist = 0) {
  const last = kept?.last || CHASE_START;
  if (force === '3') return { dist: dist > 0 ? Math.max(CHASE_MIN, Math.min(CHASE_MAX, dist)) : kept?.dist || last, last, forced: true, chosen: true };
  if (force === '1') return { dist: 0, last, forced: true, chosen: true };
  if (kept) return { ...kept, forced: false, chosen: true };
  return { dist: 0, last, forced: false, chosen: false };
}
// What a map does to a view nobody chose: a View's map() whose rules give
// it a movement of its own (a Roblox place's Humanoid) is seen from behind.
export const mapView = (v, map) => (v.chosen ? v : { ...v, dist: map?.movement ? v.last : 0 });

// How far the ray o + t dir (dir a unit) goes before one of the map's boxes,
// out to tmax: src/arena-view.mjs's boxRay with a group that moves where it
// is on `tick` (its bounds are its whole path's).
export function boxHit(map, o, dir, tmax, tick = 0) {
  let best = tmax;
  for (const g of map.groups) {
    if (slab(g.box, o, dir, best) > best) continue;
    const by = g.move ? moverAt(g.move, tick) : null;
    const from = by ? [o[0] - by[0], o[1] - by[1], o[2] - by[2]] : o;
    for (let k = g.first; k < g.first + g.count; k++) best = Math.min(best, slab(map.boxes[k].box, from, dir, best));
  }
  return best;
}

// How far it goes before it is under the ground (or within `clear` of it),
// out to tmax: half-metre steps, then bisection, as the sim's $a_ray, the
// ray's end looked at too.
export function groundHit(height, o, dir, tmax, clear = 0) {
  const under = (t) => o[1] + dir[1] * t < height(o[0] + dir[0] * t, o[2] + dir[2] * t) + clear;
  for (let t = 0.5; ; t += 0.5) {
    const s = Math.min(t, tmax);
    if (under(s)) {
      let lo = Math.max(0, t - 0.5), hi = s;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (under(m)) hi = m; else lo = m; }
      return lo;
    }
    if (t >= tmax) return tmax;
  }
}

// How far it goes before a fighter standing with its feet at q: the sim's
// shapes, a head (a ball of 0.22 m at 1.62 m) and a body (an upright
// cylinder 0.45 m in radius from the feet to 1.45 m).
export function bodyHit(q, o, dir, tmax) {
  let best = tmax;
  const fx = o[0] - q[0], fz = o[2] - q[2];
  const fy = o[1] - (q[1] + 1.62);
  const hb = fx * dir[0] + fy * dir[1] + fz * dir[2];
  const hd = hb * hb - (fx * fx + fy * fy + fz * fz - 0.0484);
  if (hd >= 0 && -hb + Math.sqrt(hd) > 0) best = Math.min(best, Math.max(-hb - Math.sqrt(hd), 0));
  const a = dir[0] * dir[0] + dir[2] * dir[2];
  if (a > 1e-8) {
    const b = fx * dir[0] + fz * dir[2];
    const disc = b * b - a * (fx * fx + fz * fz - 0.2025);
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      let lo = (-b - sq) / a, hi = (-b + sq) / a;
      if (dir[1] !== 0) {
        const ya = (q[1] - o[1]) / dir[1], yb = (q[1] + 1.45 - o[1]) / dir[1];
        lo = Math.max(lo, Math.min(ya, yb)); hi = Math.min(hi, Math.max(ya, yb));
      } else if (o[1] < q[1] || o[1] > q[1] + 1.45) hi = -1e9;
      lo = Math.max(lo, 0);
      if (lo <= hi) best = Math.min(best, lo);
    }
  }
  return best;
}

// Whether an aim is too steep for the camera behind (was: whether the last
// one was, so a pitch at the edge doesn't flicker between the views).
export const steepAim = (pitch, was = false) => pitch > UP - (was ? SLACK : 0) || pitch < -DOWN + (was ? SLACK : 0);

const aimDir = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

// The camera `dist` metres back from a fighter's eye that aims along yaw and
// pitch (rad). world: { map (a View's map()), height(x, z), tick (the one
// drawn, for the boxes that move) }. Returns where it is, how far back it
// got (0: it is the eye, first person) and back, the boom a metre of dist,
// so a caller easing its own distance (no further than this one) can place
// the camera at eye + back * d.
export function chase({ eye, yaw, pitch, dist }, world) {
  const [ax, ay, az] = aimDir(yaw, pitch);
  // right of the aim is (-sin yaw, 0, cos yaw), as the renderer's. The lean shrinks with the aim's cosine as the
  // camera's distance across the ground does: through a sheared lens that holds the figure's place on the screen.
  const side = SIDE * Math.cos(pitch), rise = RISE * Math.cos(pitch);
  const back = [-ax - side * Math.sin(yaw), -ay + rise, -az + side * Math.cos(yaw)];
  const first = { cam: eye.slice(), dist: 0, back };
  if (!(dist > 0)) return first;
  const len = Math.hypot(...back), u = back.map((v) => v / len);
  const reach = dist * len;
  let t = Math.min(boxHit(world.map, eye, u, reach, world.tick), groundHit(world.height, eye, u, reach, CLEAR));
  if (t < reach) t = Math.max(0, t - SKIN);
  const d = t / len;
  const cam = eye.map((v, k) => v + back[k] * d);
  if (d < CHASE_NEAR || (Math.hypot(cam[0] - eye[0], cam[2] - eye[2]) < IN_R && Math.abs(cam[1] - eye[1] + MIDDLE) < IN_H)) return first;
  return { cam, dist: d, back };
}

// Where a shot from `eye` along yaw and pitch lands, as the sim's $a_ray
// finds it: the ground, the map's boxes, then the bodies ([x, y, z] feet of
// every live fighter but the one aiming), out to range. pos is the point
// (the ray's end when nothing is in the way), t how far.
export function aimPoint({ eye, yaw, pitch, range }, world, bodies = []) {
  const dir = aimDir(yaw, pitch);
  let t = groundHit(world.height, eye, dir, range);
  t = boxHit(world.map, eye, dir, t, world.tick);
  for (const q of bodies) t = bodyHit(q, eye, dir, t);
  return { pos: eye.map((v, k) => v + dir[k] * t), t, hit: t < range };
}
