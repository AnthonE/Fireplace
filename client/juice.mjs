// What makes a hit and a win feel like one in party's frontend:
// riders that jolt when their balls meet, the camera shaking when yours does,
// and a winner who cheers in a shower of confetti. Drawing only, from what the
// frontends already see (the confirmed world's FX and the round's end); the
// confetti are boxes (client/rider.mjs BLOCK), falling and turning.
import { BLOCK, EMOTE, EMOTE_S } from './rider.mjs';

const CONFETTI = [[1, 0.25, 0.3], [1, 0.8, 0.15], [0.25, 0.75, 1], [0.35, 0.9, 0.35], [0.85, 0.4, 1], [1, 1, 1]];
const JOLT_MS = 350;
const BITS = 600; // confetti at once, at most

export function createJuice() {
  const bits = [];
  const jolts = new Map(); // slot -> [when, how hard 0..1]
  const cheers = new Map(); // slot -> when it started, while the round's end is held
  const showered = new Set(); // slots whose confetti went off
  let shake = 0, seed = 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return {
    // two balls met (FX_BUMP: owner and shot), size the impact (m/s); mine: yours is one of them
    bump(a, b, size, mine, now) {
      const k = Math.min(1, size / 12);
      for (const p of [a, b]) if (p < 256) jolts.set(p, [now, Math.max(k, this.jolt(p, now))]);
      if (mine) shake = Math.min(1, shake + size / 18);
    },
    // how hard slot p is jolted now, 0..1
    jolt(p, now) {
      const j = jolts.get(p);
      if (!j) return 0;
      const a = (now - j[0]) / JOLT_MS;
      if (a >= 1) { jolts.delete(p); return 0; }
      return j[1] * (1 - a) * (1 - a);
    },
    // the round is over: these slots won; each cheers, and its confetti goes off once it is drawn
    win(slots, now) { cheers.clear(); showered.clear(); for (const p of slots) cheers.set(p, now); },
    // a new round
    reset() { cheers.clear(); showered.clear(); },
    // what slot p acts out at now while its win is held (rider.mjs's { id, t }), or null; top the top of its head, for the confetti
    cheer(p, now, top) {
      const at = cheers.get(p);
      if (at === undefined) return null;
      if (!showered.has(p) && showered.size < 8) { showered.add(p); this.burst(top, 90); }
      return { id: EMOTE.CHEER, t: ((now - at) / 1000) % EMOTE_S };
    },
    // n bits of confetti thrown up from pos
    burst(pos, n) {
      for (let k = 0; k < n && bits.length < BITS; k++) {
        const a = rnd() * Math.PI * 2, out = 1.5 + rnd() * 4;
        bits.push({
          pos: [pos[0], pos[1], pos[2]], vel: [Math.cos(a) * out, 6 + rnd() * 7, Math.sin(a) * out],
          spin: [rnd() * 6, rnd() * 6], rate: [(rnd() - 0.5) * 14, (rnd() - 0.5) * 14], color: CONFETTI[k % CONFETTI.length], life: 3 + rnd() * 1.5,
        });
      }
    },
    // the camera, shaken as hard as your last bump was (in place); ms since the last frame
    shake(cam, ms, now) {
      shake *= Math.exp(-ms / 140);
      if (shake < 0.01) return cam;
      const t = now / 1000, a = shake * shake * 0.35;
      cam[0] += a * Math.sin(t * 71.3); cam[1] += a * Math.sin(t * 83.1 + 1); cam[2] += a * Math.sin(t * 67.7 + 2);
      return cam;
    },
    // the confetti, moved on ms and drawn into out (a renderer's solid sprites)
    draw(out, ms) {
      const dt = ms / 1000, drag = Math.exp(-dt * 1.6);
      for (let k = bits.length - 1; k >= 0; k--) {
        const b = bits[k];
        b.life -= dt;
        if (b.life <= 0) { bits.splice(k, 1); continue; }
        b.vel[1] -= 9.8 * dt;
        for (let i = 0; i < 3; i++) { b.vel[i] *= drag; b.pos[i] += b.vel[i] * dt; }
        b.spin[0] += b.rate[0] * dt; b.spin[1] += b.rate[1] * dt;
        out.push({ pos: b.pos.slice(), size: 0.1, color: [...b.color, 1024], kind: BLOCK, minpx: 0.5, vel: [0.07, 0.07, 0.012], roll: b.spin[0], seed: b.spin[1] });
      }
    },
  };
}
