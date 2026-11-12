// Golf's page on a host: golf's sim and the frontend Fireplace plays it with
// (client/golf-game.mjs) mounted alone, as party's and the arena's pages are,
// so it has what they have and client/index.html (main.mjs, the page the
// gates drive, a relay's only) has not: a local room with AI golfers when
// there is no relay to join, and a static host (../coi.js). The shelf's golf
// tile opens it (client/games.html).
//   ?bot=1 hands the controls to the neural golfer (client/brain.mjs)
//   ?watch=1 spectates; ?local=1, ?bots=, ?seed=, ?url=, ?hash=, ?impair=, ?sens=, ?res=, ?music=0 as party's
import * as L from '../src/layout.mjs';
import { createHost, epoch, fitSize } from './host.mjs';
import { pageWardrobe } from './wardrobe.mjs';
import { readClock } from './clock.mjs';
import { BrainBot, GOLFER } from './brain.mjs';
import { mount } from './golf-game.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const note = document.getElementById('note');

async function main() {
  [canvas.width, canvas.height] = fitSize(q);
  const BOT = q.get('bot') === '1';
  const h = await createHost({ wasm: '../build/game.wasm', q, watch: q.get('watch') === '1', kind: 'golf' });
  const game = await mount(h, { canvas, bot: BOT, external: BOT, sens: Number(q.get('sens') || 3), present: q.get('present') !== '0' });
  // ?bot=1: the golfer's word into the input slots, as keys and a mouse would (client/fireplace.mjs drive)
  const golfer = BOT ? new BrainBot(0, GOLFER, { lag: 8, skill: Number(q.get('skill') || 0.8), seed: (Math.random() * 1e9) | 0 }) : null;
  let lastWord = 0;
  function drive() {
    const slot = h.get(L.CL_SLOT);
    if (!golfer || slot < 0 || h.get(L.CL_STATE) !== 2) return;
    golfer.slot = slot;
    const now = epoch();
    golfer.lag = Math.max(2, Math.round(readClock(h.i32, h.f64, L.CL_PRED, now) - readClock(h.i32, h.f64, L.CL_PLAY, now)));
    const w = golfer.think(h.view);
    h.set(L.CL_YAW, w & 0x3fff); h.set(L.CL_PITCH, (w >>> 14) & 0x3ff); h.set(L.CL_MOVE, ((w >>> 24) & 15) | (((w >>> 28) & 1) << 4)); h.set(L.CL_WEAPON, w >>> 31);
    if (((w >>> 29) & 3) !== ((lastWord >>> 29) & 3)) h.press(L.CL_PRESSES);
    lastWord = w;
  }
  window.__qa = { hashes: h.hashes, keys: h.keys, desyncs: h.desyncs, state: () => ({ ...game.state(), local: !!h.local }), capture: game.capture };
  note.remove();
  const wardrobe = pageWardrobe(h, { canvas, q }); // your look, while the mouse is free (client/wardrobe.mjs)
  const loop = (now) => { requestAnimationFrame(loop); drive(); game.frame(now); wardrobe?.frame(now); };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  note.textContent = String(e?.message || e);
  window.__qa = { error: String(e?.stack || e) };
});
