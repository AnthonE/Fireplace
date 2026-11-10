// Flight's page: a host on flight's sim and its frontend
// (client/flight-game.mjs) mounted alone, a frame per display refresh.
//   ?bot=1 hands the controls to an AI pilot (client/flight-bot.mjs)
//   ?watch=1 spectates; ?cam=x,y,z,yaw,pitch (degrees) holds a spectator's camera
//   there, for looking over the map; ?url=, ?hash=, ?impair=, ?sens=, ?res= as golf's
//   ?map=<name> a map the site publishes (build/maps/<name>.qgmap), ?map=<url> any packed map;
//   the line along the bottom offers to take it online (client/online.mjs)
import { createHost, fitSize } from './host.mjs';
import { pageWardrobe } from './wardrobe.mjs';
import { onlineLine } from './online.mjs';
import { mount } from './flight-game.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const note = document.getElementById('note');

async function main() {
  [canvas.width, canvas.height] = fitSize(q);
  const fixed = q.has('cam') ? q.get('cam').split(',').map(Number) : null;
  const h = await createHost({ wasm: '../build/flight/game.wasm', q, watch: q.get('watch') === '1' || !!fixed, arena: true });
  const game = await mount(h, { canvas, bot: q.get('bot') === '1', skill: Number(q.get('skill') || 0.7), sens: Number(q.get('sens') || 3), fixed,
    present: q.get('present') !== '0', showGraph: q.get('net') === '1' });
  const line = await onlineLine(h, q, '../build/flight/game.wasm');
  // a picture for the reference board (client/look.html, tools/board.mjs, tools/arena-shot.mjs): this page's view once
  // its room has played for `after` s. The frames are stepped from here, since a hidden page gets none of its own.
  const playing = { since: 0 };
  async function shot(_name, after = 2) {
    for (;;) {
      game.frame(performance.now());
      if (game.state().clState === 2) playing.since ||= performance.now();
      if (playing.since && performance.now() - playing.since > after * 1000) { const png = await game.capture(1); if (png) return png; }
      await new Promise((ok) => setTimeout(ok, 50));
    }
  }
  window.__qf = { hashes: h.hashes, keys: h.keys, desyncs: h.desyncs, state: () => ({ ...game.state(), pool: line.pool() }), capture: game.capture, ready: true, shot };
  note.remove();
  const wardrobe = pageWardrobe(h, { canvas, q, watch: !!fixed }); // your look while the mouse is free (client/wardrobe.mjs), none on a fixed camera
  const loop = (now) => { requestAnimationFrame(loop); game.frame(now); wardrobe?.frame(now); };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  note.textContent = String(e?.message || e);
  window.__qf = { error: String(e?.stack || e) };
});
