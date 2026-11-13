// The arena's renderer on synthetic scenes, no sim: a memory laid out as the
// sim's (flat grass, fighters written into their records), so a fighter can
// be looked at from 4 m, standing still, in every body, side and pose, which
// a match never holds still for. tools/arena-shot.mjs reads each scene back
// with shot() (headless Chrome, ?present=0) into traces/arena-demo-<scene>.png;
// in a browser it draws the one in ?scene=, moving; ?env=dusk or night for the hour, ?t= the still's moment (s).
//   figures: every body (client/looks.mjs), an avatar, a zombie and a juggernaut, standing, running and aiming
//   faces: four of them from 2.8 m
//   teams: red and blue facing each other, a flag and a skull between them
//   effects: blasts, sparks, tracers and bolts over the grass
//   downed: Evade's and Escape's downed beside the standing, every body lying still and crawling; downed~near
//     from 3.6 m; downed~over from a reviver's eyes; downed~hill on a hillside, heading up it, down it and across
//   hands: first person, what the eye holds: hands~ar, ~br, ~magnum, ~sniper, ~shotgun, ~rocket, ~plasma, ~seeker,
//     ~sword, ~fist, a carrier's ~flag, ~skull and ~bomb; then ~fire (the muzzle's flash), ~roof (under a slab, in
//     its shadow) and ~side (the light from the left), in any order; ~scope looks through the sniper's 5x in its
//     place (the black past the ring is the terrain pass's own, never traced: client/arena-render.mjs fs_terrain)
import * as L from '../src/layout.mjs';
import { createRenderer } from './arena-render.mjs';
import { gunModel, carryModel } from './viewmodel.mjs';
import { capturePng, fitSize } from './host.mjs';
import { BODIES } from './looks.mjs';
import { guestAvatar } from './avatar.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const note = document.getElementById('note');
const CX = 512, FLOOR = 20;
// the sun's side (client/lowpoly.mjs SUN), so what faces the camera is lit
const SUNWARD = Math.atan2(0.5025, 0.5528);

const u8 = new Uint8Array(L.PAGES * 65536);
const dv = new DataView(u8.buffer);
// The ground x metres east: flat, or for a scene that asks for a hill, rising 0.36 a metre past HILL for 12 m.
const HILL = 560;
const ground = (x, hill) => FLOOR + (hill ? Math.max(0, Math.min(12, (x - HILL) * 0.36)) : 0);
function lay(hill) {
  const h = new Uint16Array(u8.buffer, L.TERRAIN_H, L.GRID * L.GRID);
  for (let k = 0; k < h.length; k++) h[k] = ground((k % L.GRID) * 2, hill) * 256;
}
lay(false);
const tints = new Uint32Array(L.NPLAYER), looks = new Uint32Array(L.NPLAYER), avatars = new Uint32Array(L.NPLAYER);
const text = new Uint32Array(1 << 16);

// Fighter p at (x, z) on the grass, heading yaw (rad), aiming pitch up, moving at speed along its heading.
function fighter(p, x, z, yaw, { pitch = 0, speed = 0, flags = 0, body = 1, avatar = 0, y = FLOOR } = {}) {
  const a = L.PLAYERS + p * L.PSIZE;
  dv.setFloat32(a + L.P_PX, x, true); dv.setFloat32(a + L.P_PY, y, true); dv.setFloat32(a + L.P_PZ, z, true);
  dv.setFloat32(a + L.P_VX, Math.cos(yaw) * speed, true); dv.setFloat32(a + L.P_VX + 4, 0, true); dv.setFloat32(a + L.P_VX + 8, Math.sin(yaw) * speed, true);
  const turn = ((Math.round(yaw / (2 * Math.PI) * 2048) % 2048) + 2048) % 2048;
  dv.setUint32(a + L.P_IN, (turn | ((Math.round(pitch / Math.PI * 1024) + 512) << L.AW_PITCH)) >>> 0, true);
  dv.setUint32(a + L.P_FL, L.PF_LIVE | flags, true);
  looks[p] = body << 16;
  avatars[p] = avatar;
}
// what a hands scene holds, by its name in the scene's
const HELD = { ar: L.W_AR, br: L.W_BR, magnum: L.W_MAGNUM, sniper: L.W_SNIPER, shotgun: L.W_SHOTGUN, rocket: L.W_ROCKET, plasma: L.W_PLASMA, seeker: L.W_NEEDLER, sword: L.W_SWORD, fist: 0 };
const CARRIED = ['flag', 'skull', 'bomb'];
const NO_MAP = { boxes: [], groups: [] };
function clear() {
  u8.fill(0, L.PLAYERS, L.PLAYERS + L.NPLAYER * L.PSIZE);
  u8.fill(0, L.PROJ, L.PROJ + L.NPROJ * L.JSIZE);
  tints.fill(0); looks.fill(0); avatars.fill(0);
}
// the camera d metres from (x, y, z) on the sun's side, turned by `round` about it, looking at it
function look(s, at, d, { round = 0, lift = 0.2, pitch = -0.06 } = {}) {
  const a = SUNWARD + round;
  s.cam = [at[0] + Math.cos(a) * d, at[1] + lift, at[2] + Math.sin(a) * d];
  s.yaw = a + Math.PI;
  s.pitch = pitch;
}

const SCENES = {
  figures(s) {
    // a front row turned to the camera, 1.6 m apart, and a row behind running across
    const rows = [
      { body: 1 }, { body: 2 }, { body: 3 }, { body: 4 }, { body: 2, avatar: guestAvatar(3) }, { body: 1, flags: L.PF_ZOMBIE }, { body: 2, flags: L.PF_JUGG },
    ];
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    rows.forEach((r, k) => {
      const o = (k - (rows.length - 1) / 2) * 1.6;
      fighter(k, CX + across[0] * o, CX + across[1] * o, SUNWARD + (k - 3) * 0.12, { ...r, pitch: k === 2 ? 0.5 : 0 });
    });
    for (let k = 0; k < 5; k++) {
      const o = (k - 2) * 2.4;
      fighter(16 + k, CX + across[0] * o - Math.cos(SUNWARD) * 4, CX + across[1] * o - Math.sin(SUNWARD) * 4, SUNWARD + Math.PI / 2 + (k & 1) * Math.PI, { body: 1 + (k % 4), speed: 3 + k, avatar: k === 1 ? guestAvatar(9) : 0 });
    }
    look(s, [CX, FLOOR + 1.3, CX], 7.5, { round: 0.25 });
  },
  // three of them from 2.6 m: a face each
  faces(s) {
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    [{ body: 2 }, { body: 3, avatar: 0 }, { body: 4 }, { body: 1, flags: L.PF_ZOMBIE }].forEach((r, k) => {
      const o = (k - 1.5) * 0.95;
      fighter(k * 3 + 1, CX + across[0] * o, CX + across[1] * o, SUNWARD + (k - 1.5) * 0.25, { ...r, pitch: k === 0 ? 0.3 : 0 });
    });
    look(s, [CX, FLOOR + 1.35, CX], 2.8, { round: 0.15, lift: 0.1, pitch: 0 });
  },
  teams(s) {
    s.sides = 2;
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    for (let k = 0; k < 4; k++) {
      const o = 1.5 + k * 1.5;
      fighter(k, CX + across[0] * o, CX + across[1] * o, SUNWARD - 0.9, { body: 1 + (k % 4), speed: k === 1 ? 5 : 0 });
      fighter(8 + k, CX - across[0] * o, CX - across[1] * o, SUNWARD + 0.9, { body: 1 + ((k + 2) % 4), flags: L.PF_BLUE, pitch: k === 2 ? 0.4 : 0 });
    }
    s.solid.push({ pos: [CX, FLOOR + 1.2, CX], size: 1.2, color: [0.92, 0.22, 0.16], kind: 7, minpx: 2 });
    s.solid.push({ pos: [CX - Math.cos(SUNWARD) * 2, FLOOR + 0.6, CX - Math.sin(SUNWARD) * 2], size: 0.5, color: [0.95, 0.93, 0.85], kind: 8, minpx: 2 });
    look(s, [CX, FLOOR + 1.2, CX], 9, { round: 0.1, lift: 0.8, pitch: -0.1 });
  },
  effects(s) {
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    const at = (o, up, back = 0) => [CX + across[0] * o - Math.cos(SUNWARD) * back, FLOOR + up, CX + across[1] * o - Math.sin(SUNWARD) * back];
    fighter(0, ...[at(-4, 0)[0], at(-4, 0)[2]], SUNWARD + 1.2, { body: 2 });
    fighter(1, ...[at(4, 0)[0], at(4, 0)[2]], SUNWARD - 1.2, { body: 3 });
    // a blast at five ages, left to right, as the frontend draws one (client/arena-game.mjs)
    for (let k = 0; k < 5; k++) s.glow.push({ pos: at(-5 + k * 2.5, 1.2, 3), size: 0.8 + k * 0.5, color: [1, 0.6, 0.2, 1 - k / 5], kind: 3, minpx: 1 });
    for (let k = 0; k < 12; k++) s.glow.push({ pos: at(-3 + (k * 0.618 % 1) * 6, 0.4 + (k * 0.37 % 1) * 2, 1), size: 0.12, color: [1, 0.9, 0.5, 0.9], kind: 5, minpx: 1 });
    s.beams.push({ a: at(-4, 1.24), b: at(4, 1.3), width: 0.03, color: [1, 0.9, 0.6, 0.9] });
    s.beams.push({ a: at(-4, 1.5, 6), b: at(6, 2.4, 1), width: 0.06, color: [0.4, 0.8, 1, 0.9] });
    s.solid.push({ pos: at(0, 1.4, -1), size: 0.25, color: [0.35, 0.75, 1], kind: 2, minpx: 1.5 });
    s.solid.push({ pos: at(1.5, 0.9, 2), size: 0.5, color: [0.3, 0.9, 0.5], kind: 4, aspect: 0.6, minpx: 2 });
    look(s, [CX, FLOOR + 1.3, CX], 10, { round: 0.05, lift: 0.6, pitch: -0.08 });
  },
  // a front row of pairs, each body standing with the next slot's downed beside it, lying still; behind them a
  // row crawling across at the 2 m/s a downed fighter makes, and a stunned hunter in its gold
  downed(s, near) {
    if (near === 'hill') {
      // from the side: one heading up the hill, one down it, one crawling across it, and one standing on it
      s.hill = true;
      const on = (p, x, yaw, o) => fighter(p, x, 600, yaw, { ...o, y: ground(x, true) });
      on(0, 573.5, 0, { body: 2, flags: L.PF_DOWN });
      on(1, 576.5, Math.PI, { body: 3, flags: L.PF_DOWN });
      on(2, 579, -Math.PI / 2, { body: 4, flags: L.PF_DOWN, speed: 2 });
      on(3, 581, Math.PI / 2, { body: 1 });
      s.cam = [577, ground(577, true) + 1.1, 605.5];
      s.yaw = -Math.PI / 2;
      s.pitch = -0.08;
      return;
    }
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    const at = (o, back = 0) => [CX + across[0] * o - Math.cos(SUNWARD) * back, CX + across[1] * o - Math.sin(SUNWARD) * back];
    const rows = [{ body: 1 }, { body: 2 }, { body: 3 }, { body: 4 }, { body: 2, avatar: guestAvatar(3) }];
    rows.forEach((r, k) => {
      const o = (k - (rows.length - 1) / 2) * 3.2;
      fighter(2 * k, ...at(o - 0.7), SUNWARD + 0.1, r);
      fighter(2 * k + 1, ...at(o + 0.7), SUNWARD + (k - 2) * 0.5, { ...r, flags: L.PF_DOWN });
    });
    for (let k = 0; k < 4; k++) fighter(16 + k, ...at((k - 1.5) * 3.4, 3.5), SUNWARD + Math.PI / 2 + (k & 1) * Math.PI, { body: 1 + ((k + 1) % 4), speed: 2, flags: L.PF_DOWN, avatar: k === 2 ? guestAvatar(9) : 0 });
    fighter(24, ...at(0, -2.2), SUNWARD + 2.2, { body: 2, speed: 2, flags: L.PF_DOWN | L.PF_JUGG });
    if (near === 'near') look(s, [CX, FLOOR + 0.4, CX], 3.6, { round: 0.5, lift: 1.2, pitch: -0.3 });
    // a reviver's eyes: standing 1.4 m from the middle one, looking down at it
    else if (near === 'over') look(s, [...at(0.7), FLOOR].map((v, k, a) => [a[0], a[2], a[1]][k]), 1.4, { round: -0.9, lift: 1.6, pitch: -0.85 });
    else look(s, [CX, FLOOR + 0.6, CX], 9, { round: 0.2, lift: 1.6, pitch: -0.2 });
  },
  hands(s, ...arg) {
    const held = arg.find((a) => a in HELD || CARRIED.includes(a)) ?? 'ar';
    const across = [-Math.sin(SUNWARD), Math.cos(SUNWARD)];
    [{ body: 2 }, { body: 3 }, { body: 4 }].forEach((r, k) => fighter(k + 1, CX + across[0] * (k - 1) * 1.8, CX + across[1] * (k - 1) * 1.8, SUNWARD + (k - 1) * 0.3, r));
    look(s, [CX, FLOOR + 1.0, CX], 7, { round: arg.includes('side') ? 1.9 : 0.12, lift: 0.6, pitch: -0.04 });
    // a slab over the eye and the ground in front of it
    if (arg.includes('roof')) {
      const box = [s.cam[0] - 5, FLOOR + 3, s.cam[2] - 5, s.cam[0] + 5, FLOOR + 3.4, s.cam[2] + 5];
      s.map = { boxes: [{ box, material: 0 }], groups: [{ box, first: 0, count: 1 }] };
    }
    const m = { t: s.time, bob: 0, drop: 0, lunge: 0, kick: arg.includes('fire') ? 0.6 : 0 };
    s.viewmodel = CARRIED.includes(held) ? carryModel(held, [0.22, 0.42, 1.0], m) : gunModel(HELD[held], m, arg.includes('fire'));
    s.crosshair = 0;
    // scoped, as the frontend draws it: the lens at 5x, the ring and its cross, nothing in the hands
    if (arg.includes('scope')) { s.zoom = 5; s.scope = true; s.viewmodel = null; }
  },
};

async function main() {
  [canvas.width, canvas.height] = fitSize(q, [1280, 800]);
  const present = q.get('present') !== '0';
  const r = await createRenderer(canvas, { present });
  r.setTerrain(u8);
  // what is laid in the renderer now: the map (as text, a scene making its own afresh each frame) and the ground
  let laid = '', hilly = false;
  // name: a scene, then whatever it takes after a ~ each (hands~sniper~roof)
  const build = (name, t) => {
    const [scene, ...arg] = name.split('~');
    clear();
    const s = {
      cam: [CX, FLOOR + 2, CX], yaw: 0, pitch: 0, zoom: 1, time: t, tick: 0, dt: 0, dtPred: 0, proj: L.PROJ, slot: 999,
      solid: [], glow: [], beams: [], rects: [], tracker: null, text, graph: null, marker: 0, hurt: 0, scope: false, sides: 0, zone: null, crosshair: 7, gap: 0,
      tints, looks, avatars, env: q.get('env') || 'day',
    };
    SCENES[scene](s, ...arg);
    if (JSON.stringify(s.map ?? NO_MAP) !== laid) { laid = JSON.stringify(s.map ?? NO_MAP); r.setMap(s.map ?? NO_MAP); }
    if (!!s.hill !== hilly) { hilly = !!s.hill; lay(hilly); r.setTerrain(u8); }
    return s;
  };
  // a still for the board and the shooter: the scene at 2.2 s, a stride's middle (?t= for another moment)
  window.__demo = { ready: true, names: Object.keys(SCENES), shot(name) { return capturePng(r, u8, build(name, Number(q.get('t') || 2.2)), 1); } };
  note.remove();
  if (!present) return;
  const name = SCENES[(q.get('scene') || '').split('~')[0]] ? q.get('scene') : 'figures';
  const loop = (now) => { requestAnimationFrame(loop); r.frame(u8, build(name, now / 1000)); };
  requestAnimationFrame(loop);
}
main().catch((e) => { note.textContent = String(e?.message || e); window.__demo = { error: String(e?.stack || e) }; });
