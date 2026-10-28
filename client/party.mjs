// Party's page: a host on party's sim and its frontend
// (client/party-game.mjs) mounted alone, a frame per display refresh.
// Which minigame a room plays is the relay's seed's (net/play.mjs --party --mg k).
//   ?bot=1 hands the controls to an AI ball (client/party-bot.mjs)
//   ?watch=1 spectates; ?url=, ?hash=, ?impair=, ?sens=, ?res=, ?hud=, ?music=0 as golf's
//   ?wasm=blob:... plays a build the studio made in this origin (client/studio.html), in a local room
import { createHost, fitSize } from './host.mjs';
import { mount } from './party-game.mjs';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('screen');
const note = document.getElementById('note');

async function main() {
  [canvas.width, canvas.height] = fitSize(q);
  if (canvas.width > 640) canvas.style.imageRendering = 'auto';
  // a studio build: only a blob this origin made, and only in a local room, never a relay's
  const built = q.get('wasm') || '';
  if (built && !built.startsWith(`blob:${location.origin}/`)) throw new Error('?wasm= takes a build the studio made on this site');
  if (built) q.set('local', '1');
  const h = await createHost({ wasm: built || '../build/party/game.wasm', q, watch: q.get('watch') === '1', kind: built ? 'party' : '' });
  const game = await mount(h, { canvas, bot: q.get('bot') === '1', skill: Number(q.get('skill') || 0.8), sens: Number(q.get('sens') || 3),
    hud: Number(q.get('hud')) || 0, present: q.get('present') !== '0', showGraph: q.get('net') === '1' });
  window.__qa = { hashes: h.hashes, keys: h.keys, desyncs: h.desyncs, state: game.state, capture: game.capture };
  note.remove();
  const loop = (now) => { requestAnimationFrame(loop); game.frame(now); };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  note.textContent = String(e?.message || e);
  window.__qa = { error: String(e?.stack || e) };
});
