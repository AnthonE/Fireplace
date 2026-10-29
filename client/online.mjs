// The quiet line along the bottom of the arena's and flight's pages, as
// Fireplace's page has its own (client/fireplace.mjs). In a local room, on a
// page with no relay of its own and a room pool to ask: play online with
// friends, which asks the kit's pool for a room on this page's wasm and map
// (client/kit.mjs) and reloads into it, the address the invite. In the
// pool's room: its id, and copy invite link. Nothing otherwise.
//   host: client/host.mjs's; wasm: the page's sim, as createHost was given it
import { room as pool, canGoOnline, goOnline } from './kit.mjs';

export async function onlineLine(host, q, wasm) {
  const line = document.getElementById('line');
  const [invite, online] = ['invite', 'online'].map((id) => document.getElementById(id));
  const offer = !host.watch && (await canGoOnline(q).catch(() => false));
  invite.addEventListener('click', () => {
    const done = (ok) => { invite.textContent = ok ? 'copied' : pool.invite; setTimeout(() => { invite.textContent = 'copy invite link'; }, ok ? 2000 : 15000); };
    navigator.clipboard?.writeText(pool.invite).then(() => done(true), () => done(false)) ?? done(false);
  });
  online.addEventListener('click', () => {
    if (online.disabled) return;
    online.disabled = true;
    online.textContent = 'finding a room…';
    goOnline(q, { wasm, bytes: host.bytes, map: host.map }).then((to) => { location.href = to; }, (err) => {
      pool.why = String(err.message || err);
      online.disabled = false;
      online.textContent = 'play online with friends';
      show();
    });
  });
  let shown = null;
  function show() {
    const local = host.connected ? host.local === true : !q.get('room');
    const offering = !pool.id && offer && local;
    const text = pool.id ? `online room ${pool.id}${pool.why ? ` (${pool.why})` : ''}`
      : offering || pool.why ? `playing here with AI players${pool.why ? `: ${pool.why}` : ''}` : '';
    if (text === shown) return;
    shown = text;
    line.firstElementChild.textContent = text;
    invite.hidden = !pool.id;
    online.hidden = !offering;
    line.hidden = !text;
  }
  show();
  setInterval(show, 500);
  return { pool: () => ({ ...pool, local: !!host.local }) };
}
