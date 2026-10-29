// What a fighter holds, seen from its own eyes: the gun, or what a carrier
// carries (a flag, the skull, the bomb), as a handful of boxes in camera
// space (x right, y up, z ahead, metres from the eye) that the arena's HUD
// pass ray-traces with the figures' blockRay (client/rider.mjs), so a gun
// is as blocky as the fighter holding it. Each box is 12 floats: its centre
// and turn (yaw, as blockRay's: its front toward (cos, 0, sin)), its half
// sizes (across, up, front) and pitch (its front up), its colour and its
// part (client/rider.mjs PART) times 2 plus how much it glows (0..1).
// Drawing only.
import * as L from '../src/layout.mjs';

export const MAX_VM = 16;
const SKIN = [1.0, 0.8, 0.66];

// a box's axes as blockRay turns them: across (to the left at a yaw near a
// quarter turn, so right is its opposite), up and front
function axes(yaw, pitch) {
  const f0 = [Math.cos(yaw), 0, Math.sin(yaw)];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { r: [f0[2], 0, -f0[0]], u: [-f0[0] * sp, cp, -f0[2] * sp], f: [f0[0] * cp, sp, f0[2] * cp] };
}

// A held thing's boxes, from its parts in its own frame ([x right, y up, z
// ahead] centre, [across, up, front] half sizes, colour, glow, part), held at
// o turned by yaw and pitch.
function place(parts, o, yaw, pitch) {
  const { r, u, f } = axes(yaw, pitch);
  const out = new Float32Array(Math.min(parts.length, MAX_VM) * 12);
  parts.slice(0, MAX_VM).forEach(([c, h, col, glow = 0, part = 0], k) => {
    const p = [0, 1, 2].map((i) => o[i] + r[i] * c[0] + u[i] * c[1] + f[i] * c[2]);
    out.set([p[0], p[1], p[2], yaw, h[0], h[1], h[2], pitch, col[0], col[1], col[2], part * 2 + glow], k * 12);
  });
  return out;
}

// Where the hands are this frame: m = { t (s), bob (320 x 200 units, as the
// old gun's), drop, lunge (0..1), kick (0..1) }.
function hold(m) {
  const o = [0.19 + m.bob * 0.002 - m.lunge * 0.08, -0.215 - (Math.abs(m.bob) + m.drop) * 0.002 - m.kick * 0.012, 0.44 - m.kick * 0.035 + m.lunge * 0.14];
  return { o, yaw: Math.PI / 2 + 0.16, pitch: 0.06 + m.kick * 0.09 };
}

// Gun w's boxes, its muzzle flashing for a frame or two after a shot.
export function gunBoxes(w, m, flash = false) {
  const dark = [0.15, 0.16, 0.15];
  const hand = [[0, -0.055, -0.045], [0.03, 0.032, 0.04], SKIN];
  let parts, tip, glow = [1, 0.85, 0.4];
  switch (w) {
    case L.W_AR: {
      const body = [0.3, 0.36, 0.28];
      parts = [[[0, 0, 0], [0.035, 0.05, 0.16], body], [[0, 0.015, 0.22], [0.015, 0.015, 0.07], dark], [[0, -0.085, 0.05], [0.024, 0.045, 0.03], [0.2, 0.22, 0.2]],
        [[0, -0.02, -0.2], [0.03, 0.045, 0.06], body.map((v) => v * 0.8)], [[0, 0.054, -0.06], [0.012, 0.006, 0.018], [0.3, 0.9, 1], 1], hand];
      tip = [0, 0.015, 0.3];
      break;
    }
    case L.W_BR: {
      const body = [0.46, 0.48, 0.5];
      parts = [[[0, 0, 0], [0.033, 0.048, 0.17], body], [[0, 0.012, 0.23], [0.014, 0.014, 0.07], [0.2, 0.2, 0.22]], [[0, 0.072, 0.02], [0.02, 0.02, 0.07], [0.12, 0.12, 0.14]],
        [[0, -0.08, 0.05], [0.022, 0.04, 0.03], [0.2, 0.2, 0.22]], [[0, -0.02, -0.2], [0.03, 0.045, 0.06], body.map((v) => v * 0.8)], hand];
      tip = [0, 0.012, 0.31];
      break;
    }
    case L.W_MAGNUM:
      parts = [[[0, 0, 0.06], [0.024, 0.034, 0.09], [0.74, 0.76, 0.8]], [[0, 0.008, 0.18], [0.014, 0.018, 0.04], [0.55, 0.57, 0.6]], [[0, -0.065, -0.01], [0.022, 0.05, 0.026], [0.3, 0.24, 0.2]],
        [[0, -0.07, -0.01], [0.032, 0.034, 0.038], SKIN]];
      tip = [0, 0.008, 0.22];
      break;
    case L.W_SNIPER:
      parts = [[[0, 0, 0], [0.03, 0.045, 0.2], [0.19, 0.21, 0.21]], [[0, 0.012, 0.36], [0.012, 0.012, 0.16], [0.1, 0.1, 0.1]], [[0, 0.075, 0.03], [0.022, 0.022, 0.1], [0.06, 0.06, 0.07]],
        [[0, -0.025, -0.24], [0.028, 0.05, 0.07], [0.15, 0.16, 0.16]], hand];
      tip = [0, 0.012, 0.52];
      break;
    case L.W_SHOTGUN: {
      const wood = [0.46, 0.3, 0.17];
      parts = [[[0, -0.02, -0.18], [0.03, 0.045, 0.08], wood], [[0, 0, 0.02], [0.035, 0.045, 0.1], [0.32, 0.32, 0.34]], [[0, 0.022, 0.21], [0.022, 0.022, 0.12], [0.3, 0.3, 0.32]],
        [[0, -0.032, 0.17], [0.03, 0.025, 0.06], wood.map((v) => v * 0.75)], hand];
      tip = [0, 0.022, 0.33];
      break;
    }
    case L.W_ROCKET:
      parts = [[[0, 0.03, 0.05], [0.07, 0.07, 0.32], [0.3, 0.36, 0.24]], [[0, 0.03, 0.37], [0.08, 0.08, 0.02], [0.16, 0.18, 0.13]], [[0, 0.03, -0.27], [0.075, 0.075, 0.02], [0.16, 0.18, 0.13]],
        [[0, -0.08, 0], [0.02, 0.05, 0.025], [0.12, 0.12, 0.12]], [[0, 0.11, 0.1], [0.012, 0.02, 0.03], [0.12, 0.12, 0.12]], [[0, -0.085, 0.0], [0.032, 0.032, 0.04], SKIN]];
      tip = [0, 0.03, 0.4];
      break;
    case L.W_PLASMA:
      parts = [[[0, 0, 0.02], [0.05, 0.05, 0.13], [0.48, 0.34, 0.7]], [[0.03, 0, 0.19], [0.012, 0.012, 0.07], [0.4, 0.85, 1], 1], [[-0.03, 0, 0.19], [0.012, 0.012, 0.07], [0.4, 0.85, 1], 1], hand];
      tip = [0, 0, 0.26];
      glow = [0.5, 0.9, 1];
      break;
    case L.W_NEEDLER:
      parts = [[[0, 0, 0.02], [0.05, 0.045, 0.12], [0.42, 0.24, 0.5]], hand];
      for (let i = 0; i < 6; i++) parts.push([[0, 0.065, -0.07 + i * 0.03], [0.008, 0.025, 0.008], [1, 0.45, 0.9], 1]);
      tip = [0, 0, 0.15];
      glow = [1, 0.5, 0.9];
      break;
    case L.W_SWORD: {
      const { o } = hold(m);
      const blade = [0.55, 0.95, 1];
      return place([[[0, 0, 0], [0.025, 0.025, 0.07], [0.3, 0.3, 0.33]], [[0, 0, 0], [0.032, 0.032, 0.04], SKIN],
        [[0.03, 0, 0.24], [0.008, 0.022, 0.17], blade, 1], [[-0.03, 0, 0.24], [0.008, 0.022, 0.17], blade, 1]], o, Math.PI / 2 + 0.3, 0.55 + m.kick * 0.2);
    }
    default:
      // empty hands: a forearm in a sleeve, its fist out front
      parts = [[[0, -0.02, -0.08], [0.036, 0.036, 0.12], [0.26, 0.32, 0.45]], [[0, 0, 0.08], [0.042, 0.042, 0.045], SKIN]];
      tip = null;
  }
  if (flash && tip) parts.push([tip, [0.04, 0.04, 0.025], glow, 1]);
  const { o, yaw, pitch } = hold(m);
  return place(parts, o, yaw, pitch);
}

// What a carrier holds (its kit module's carry), in the colour of the side
// it was taken from for a flag: the flag on its pole over the shoulder, the
// skull held out, or the bomb held out, its light blinking twice a second.
export function carryBoxes(kind, color, m) {
  const { o } = hold(m);
  if (kind === 'skull') {
    const bone = [0.92, 0.89, 0.8];
    return place([[[0, 0.03, 0.06], [0.08, 0.075, 0.08], bone, 0, 1], [[0, -0.065, 0.07], [0.055, 0.03, 0.06], bone], [[0, -0.085, -0.01], [0.034, 0.034, 0.04], SKIN]], o, -Math.PI / 2 + 0.2, 0.1);
  }
  if (kind === 'bomb') {
    const lit = m.t * 1000 % 500 < 250;
    return place([[[0, 0.03, 0.06], [0.085, 0.085, 0.085], [0.22, 0.22, 0.25]], [[0, 0.03, 0.06], [0.09, 0.014, 0.09], [0.55, 0.55, 0.5]],
      [[0, 0.125, 0.06], [0.03, 0.012, 0.03], [0.48, 0.48, 0.45]], [[0, 0.145, 0.06], [0.012, 0.01, 0.012], lit ? [1, 0.15, 0.1] : [0.35, 0.06, 0.05], lit ? 1 : 0],
      [[0, -0.08, 0.0], [0.034, 0.034, 0.04], SKIN]], o, Math.PI / 2 + 0.16, 0.06);
  }
  // the flag: the pole leaning in from the bottom right, the cloth off its top swinging a little
  const swing = Math.sin(m.t * 3) * 0.12;
  const base = [o[0] + 0.03, o[1] - 0.12, o[2] - 0.05], py = Math.PI / 2 + 0.55, pp = 1.05;
  const pole = place([[[0, 0, 0.3], [0.012, 0.012, 0.36], [0.8, 0.8, 0.76]], [[0, 0, 0.67], [0.02, 0.02, 0.02], [1, 0.82, 0.3]]], base, py, pp);
  const f = axes(py, pp).f;
  const top = [0, 1, 2].map((i) => base[i] + f[i] * 0.64);
  // the cloth flies off to the left and away, the end strip darker
  const cloth = place([[[0, -0.1, 0.13], [0.006, 0.1, 0.13], color], [[0, -0.09, 0.27], [0.006, 0.085, 0.02], color.map((v) => v * 0.8)]], top, 2.64 + swing, 0);
  const out = new Float32Array(pole.length + cloth.length);
  out.set(pole); out.set(cloth, pole.length);
  return out;
}

// The boxes' pixel, in WGSL beside BLOCK_RAY_WGSL and lowpoly's light: the
// nearest of n boxes (in `vm`) along the pixel's ray from an eye of focal
// length focal (px), lit from over the left shoulder; alpha 0 for none.
export const VIEWMODEL_WGSL = /* wgsl */ `
fn viewModel(px: vec2f, n: u32, focal: f32) -> vec4f {
  let d = normalize(vec3f((px.x - u.screen.x * 0.5) / focal, (u.screen.y * 0.5 - px.y) / focal, 1.0));
  var best: Block;
  best.hit = false;
  best.t = 1e9;
  var glow = 0.0;
  for (var i = 0u; i < n; i++) {
    let a = vm[3u * i];
    let b = vm[3u * i + 1u];
    let c = vm[3u * i + 2u];
    let part = u32(c.w * 0.5);
    let bl = blockRay(vec3f(0.0), d, vec3f(0.0, 0.0, 1.0), focal, a.xyz, b.xyz, a.w, b.w, part + 16u * 64u, c.rgb);
    if (bl.hit && bl.t < best.t) { best = bl; glow = c.w - f32(part) * 2.0; }
  }
  if (!best.hit || best.cover < 0.5) { return vec4f(0.0); }
  let lit = AMB * (0.85 + 0.15 * best.n.y) + SUNC * 0.8 * max(dot(best.n, normalize(vec3f(-0.4, 0.8, -0.45))), 0.0);
  return vec4f(mix(best.alb * lit, best.alb * 1.3, glow) * mix(1.0, best.ink, 0.6) + best.glow, 1.0);
}
`;
