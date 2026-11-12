// The way to the shelf (client/games.html) from a page that plays: one small
// link in the top left corner, there while the pointer is free (the couch,
// Esc in a game, a phone) and gone while a game holds it. The living room,
// where the site's front door lands, shows it plainer; a phone gets the
// arrow alone, clear of a game's own corner. Not in a frame (the studio plays
// a build in one) nor over a replay or the film.
//   ?pool= goes with it, so the shelf asks the pool this page did
const q = new URLSearchParams(location.search);
if (window.top === window && !q.has('replay') && !q.has('film')) {
  const to = new URL('./games.html', import.meta.url);
  if (q.has('pool')) to.searchParams.set('pool', q.get('pool'));
  const room = location.pathname.endsWith('/fireplace.html');
  const small = !room && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const a = Object.assign(document.createElement('a'), { id: 'shelf-link', href: to.href, textContent: small ? '‹' : '‹ ALL GAMES', title: 'every game, minigame, mode and map' });
  a.setAttribute('aria-label', 'all games');
  const style = document.createElement('style');
  style.textContent = `
#shelf-link { position: fixed; left: 12px; top: 10px; z-index: 30; padding: 3px 8px; border: 1px solid currentColor; border-radius: 4px; background: rgba(8, 6, 4, 0.55);
  color: inherit; font: 11px/1.4 ui-monospace, monospace; letter-spacing: 1px; text-decoration: none; opacity: ${room ? 0.85 : 0.55}; }
#shelf-link:hover, #shelf-link:focus-visible { opacity: 1; }
#shelf-link[hidden] { display: none; }
#signin.on ~ #shelf-link { top: 54px; left: 16px; }`;
  document.head.append(style);
  document.body.append(a);
  // a click here is the link's alone: Fireplace's stage and the games' canvases sit down on any other
  a.addEventListener('click', (e) => e.stopPropagation());
  const show = () => { a.hidden = !!document.pointerLockElement; };
  document.addEventListener('pointerlockchange', show);
  show();
}
