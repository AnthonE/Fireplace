// The studio: a Party minigame made in the page. Pick one, edit its WAT
// (src/mg/<key>.wat) and its constants (src/mg/<key>.mjs), build party with it
// in a worker (client/studio-worker.mjs, the assembler npm run build uses),
// check the debug build with AI balls and split two ways, and play it here
// against AI balls (party.html on the build). Send it in downloads the
// changed files and opens GitHub's upload page for src/mg/ in this site's
// repo, which makes the pull request; CI runs the rest of the bar there.
// Drafts are kept in this browser (localStorage), a minigame each.
//
// The sim is the only thing the edit reaches: the minigame's client module
// (client/mg/<key>.mjs: its drawing and the AI's sense of it) imports the
// constants as this site serves them, so what the edited numbers move, the
// AI and the drawing don't know of until the change is merged.
import * as L from '../src/layout.mjs';

const $ = (id) => document.getElementById(id);
const text = $('text'), panel = $('panel'), foot = $('foot'), playBox = $('play');
const DRAFT = 'fireplace-studio:';
const q = new URLSearchParams(location.search);

const TAB = 'fireplace-studio-tab';
// the numbers first: the easiest change to make, and the one most changes are
const st = {
  key: '', mg: 0, tab: (() => { try { return localStorage.getItem(TAB) === 'wat' ? 'wat' : 'consts'; } catch { return 'consts'; } })(),
  served: { wat: '', consts: '' }, // as this site serves them
  wat: '', consts: '', rust: false,
  built: null, // { bytes, debug, ms, size, wat, consts } of the last good build
  buildError: '', checked: null, checkError: '', busy: '',
  blobUrl: '',
};

const say = (s) => { foot.textContent = s; };
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
const hint = (s) => el('p', { className: 'hint', textContent: s });
// a minigame's name as a person reads it: THIN ICE -> Thin Ice
export const nice = (name) => String(name).toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
const h3 = (s) => el('h3', { textContent: s });
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };

// the repo a change goes to: client/kit.json's (node tools/kit.mjs init writes a copy's own), or the one its Pages site serves
const pagesRepo = () => {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname), name = location.pathname.split('/')[1];
  return m && name ? `${m[1]}/${name}` : '';
};
const repo = fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {})).then((k) => k.repo || pagesRepo()).catch(() => pagesRepo());
export const uploadUrl = (r) => `https://github.com/${r}/upload/main/src/mg`;

// ---- the worker
const worker = new Worker(new URL('./studio-worker.mjs', import.meta.url), { type: 'module' });
let pending = null;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.progress) { say(m.progress.stage === 'play' ? `checking: tick ${m.progress.t} of ${m.progress.ticks}` : 'checking: the log split two ways'); return; }
  const done = pending;
  pending = null;
  done?.(m);
};
worker.onerror = (e) => { pending?.({ error: String(e.message || e) }); pending = null; };
const ask = (msg) => new Promise((ok) => { pending = ok; worker.postMessage(msg); });

// ---- the minigame
async function open(key) {
  const k = L.MINIGAMES.findIndex((m) => m.key === key);
  if (k < 0) return;
  save();
  Object.assign(st, { key, mg: k, built: null, buildError: '', checked: null, checkError: '' });
  stopPlay();
  say(`opening ${nice(L.MINIGAMES[k].name)}…`);
  const fetchText = async (f) => { const r = await fetch(new URL(`../src/mg/${f}`, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(`src/mg/${f}: ${r.status}`); return r.text(); };
  const [wat, consts] = await Promise.all([fetchText(`${key}.wat`), fetchText(`${key}.mjs`)]);
  st.served = { wat, consts };
  st.rust = /written in Rust/.test(wat.slice(0, 400));
  const draft = JSON.parse(get(DRAFT + key) || 'null');
  st.wat = draft?.wat ?? wat;
  st.consts = draft?.consts ?? consts;
  const u = new URL(location.href);
  u.searchParams.set('mg', key);
  history.replaceState(null, '', u);
  showTab(st.tab);
  render();
  say(draft ? `opened ${nice(L.MINIGAMES[k].name)}: your draft, kept in this browser` : `opened ${nice(L.MINIGAMES[k].name)}`);
}

function save() {
  if (!st.key) return;
  const same = st.wat === st.served.wat && st.consts === st.served.consts;
  put(DRAFT + st.key, same ? null : JSON.stringify({ wat: st.wat, consts: st.consts }));
}

function showTab(tab) {
  st.tab = tab;
  try { localStorage.setItem(TAB, tab); } catch { /* this visit only */ }
  $('tab-wat').classList.toggle('on', tab === 'wat');
  $('tab-consts').classList.toggle('on', tab === 'consts');
  text.value = tab === 'wat' ? st.wat : st.consts;
  text.readOnly = st.rust;
  const g = L.MINIGAMES[st.mg];
  $('tab-hint').textContent = tab === 'consts'
    ? `${st.rust ? 'Read only here: this minigame is written in Rust. ' : ''}Each line is one setting: how long a round is, how fast, how big. Change a number, then press play. (src/mg/${g ? g.key : ''}.mjs)`
    : `${st.rust ? `Read only: written in Rust (rust/mg/${g.key}/), this text is generated from it. ` : ''}The rules, in WebAssembly text: nine hooks under $${g ? g.prefix : ''}_ that the round calls. CONTRIBUTING.md, "A minigame", walks through them. (src/mg/${g ? g.key : ''}.wat)`;
}

const changed = () => ({ wat: st.wat !== st.served.wat, consts: st.consts !== st.served.consts });

// ---- build, check, play
async function build() {
  if (st.busy) return;
  st.busy = 'build';
  render();
  say('building party with your minigame…');
  const m = await ask({ build: { key: st.key, wat: st.wat, consts: st.consts } });
  st.busy = '';
  if (m.error) { st.buildError = m.error; st.built = null; say('the build refused it'); }
  else {
    st.buildError = '';
    st.built = { ...m.built, wat: st.wat, consts: st.consts };
    st.checked = null;
    say(`built in ${m.built.ms} ms: game.wasm ${m.built.size} B`);
  }
  render();
  return !m.error;
}

const stale = () => !st.built || st.built.wat !== st.wat || st.built.consts !== st.consts;

async function check() {
  if (st.busy) return;
  if (stale() && !(await build())) return;
  st.busy = 'check';
  render();
  const m = await ask({ check: { debug: st.built.debug, mg: st.mg, ticks: 4000, bots: 12 } });
  st.busy = '';
  if (m.error) { st.checkError = m.error; st.checked = null; say('the check failed'); }
  else { st.checkError = ''; st.checked = m.checked; say(m.checked.splitEqual && m.checked.scored ? 'the check passed' : 'the check found something'); }
  render();
}

function stopPlay() {
  const go = el('button', { className: 'primary big', textContent: '▶ play it here' });
  go.onclick = () => play();
  playBox.replaceChildren(el('div', { className: 'start' }, go, el('span', { textContent: 'Your minigame, as it is in the editor, against AI balls. Click the game to steer.' })));
  if (st.blobUrl) { URL.revokeObjectURL(st.blobUrl); st.blobUrl = ''; }
}

async function play() {
  if (st.busy) return;
  if (stale() && !(await build())) return;
  stopPlay();
  st.blobUrl = URL.createObjectURL(new Blob([st.built.bytes], { type: 'application/wasm' }));
  // the studio's own ?present=, ?res=, ?bot= and ?music= go on to the game it plays
  const pass = ['present', 'res', 'bot', 'music'].filter((k) => q.has(k)).map((k) => `&${k}=${encodeURIComponent(q.get(k))}`).join('');
  const src = `./party.html?mg=${st.mg}&bots=${q.get('bots') || 7}${pass}&wasm=${encodeURIComponent(st.blobUrl)}`;
  const frame = el('iframe', { src, allow: 'cross-origin-isolated; fullscreen; gamepad', title: 'your minigame' });
  playBox.replaceChildren(frame);
  frame.focus();
  render();
  say('playing your build: click the game to steer, as party.html');
}

// ---- send it in
function download(files) {
  for (const [name, body] of files) {
    const a = el('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/plain' })), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
const changedFiles = () => {
  const c = changed();
  return [...(c.wat ? [[`${st.key}.wat`, st.wat]] : []), ...(c.consts ? [[`${st.key}.mjs`, st.consts]] : [])];
};

async function sendIn() {
  const r = await repo;
  const files = changedFiles();
  if (!files.length) { say('nothing changed to send'); return; }
  if (!r) { say('this page doesn\'t know which repo it sends to: set "repo" in client/kit.json'); return; }
  if (!st.checked?.splitEqual) { say('check it first: CI will, and a change that fails there waits'); return; }
  // opened first, while the click still counts as the person's, so it isn't blocked as a pop-up
  window.open(uploadUrl(r), '_blank', 'noopener');
  download(files);
  say(`downloaded ${files.map(([n]) => n).join(' and ')}: drop them on the GitHub page that opened (${r}, src/mg/) and propose the change`);
}

// ---- the panel: where this change is, as five steps, each with its state and its button
function render() {
  const g = L.MINIGAMES[st.mg];
  const c = changed(), dirty = c.wat || c.consts;
  const btn = (label, fn, opts = {}) => { const b = el('button', { textContent: label, className: opts.primary ? 'primary' : '', title: opts.title || '', disabled: !!(opts.off || st.busy) }); b.onclick = fn; return b; };
  const step = (state, n, title, ...body) => el('li', { className: state }, el('span', { className: 'mark', textContent: state === 'done' ? '✓' : state === 'fail' ? '✗' : String(n) }), el('div', {}, el('b', { textContent: title }), ...body));
  const line = (t, cls = 'state') => el('div', { className: cls, textContent: t });
  const act = (...b) => el('div', { className: 'act' }, ...b);
  const k = st.checked;
  const built = st.built && !stale(), checked = !!k && !stale() && k.splitEqual && k.scored;
  const checkFailed = st.checkError || (k && !stale() && !(k.splitEqual && k.scored));

  const steps = el('ol', { className: 'steps' },
    step(dirty ? 'done' : 'now', 1, 'Change it',
      line(dirty ? `changed: ${[c.consts && 'the numbers', c.wat && 'the code'].filter(Boolean).join(' and ')}, kept in this browser` : 'Start with the numbers in the editor: change one, then play.'),
      dirty ? act(btn('undo all my changes', reset, { title: 'back to the minigame as this site serves it' })) : null),
    step(st.busy === 'build' ? 'now' : st.buildError ? 'fail' : built ? 'done' : '', 2, 'Build',
      st.busy === 'build' ? line('building…')
        : st.buildError ? el('div', {}, line('The build refused it:', 'bad'), el('pre', { className: 'bad', textContent: st.buildError, style: 'white-space:pre-wrap;margin:2px 0;font-size:12px' }))
          : built ? line(`built in ${st.built.ms} ms: game.wasm ${st.built.size.toLocaleString()} B`)
            : line(st.built ? 'built before your last edit' : 'Play builds it for you, or press Ctrl+Enter.'),
      act(btn('build', build, { title: 'assemble party with this minigame (Ctrl+Enter)' }))),
    step(st.busy === 'check' ? 'now' : checkFailed ? 'fail' : checked ? 'done' : '', 3, 'Check',
      st.busy === 'check' ? line('checking: AI balls are playing it…')
        : st.checkError ? line(st.checkError, 'bad')
          : k && !stale() ? el('div', {},
            line(k.scored ? `${k.bots} AI balls played ${k.ticks.toLocaleString()} ticks with no trap; ${k.scored} scored` : `${k.bots} AI balls played ${k.ticks.toLocaleString()} ticks and nobody scored: can a round be won?`, k.scored ? 'state' : 'bad'),
            line(k.splitEqual ? 'the same result when the work is split two ways' : `the result changed when the work was split two ways (from tick ${k.differ}): something reads a ball another thread may be writing`, k.splitEqual ? 'state' : 'bad'))
            : line('AI balls play the debug build, then again with the work split two ways: the same bits, or a bug. CI runs the same.'),
      act(btn('check', check, { title: 'the debug build played by AI balls, then split two ways' }))),
    step(st.blobUrl ? 'done' : '', 4, 'Play it',
      line(st.blobUrl ? 'playing below: click the game to steer' : 'Your build against AI balls, below.'),
      act(btn('▶ play', play, { primary: !st.blobUrl }))),
    step('', 5, 'Send it in',
      line(!dirty ? 'Change something first.' : !checked ? 'Check it first: CI will, and a change that fails there waits.' : 'Downloads your changed files and opens GitHub\'s upload page for src/mg/: drop them there and propose the change.'),
      act(btn('send it in', sendIn, { primary: dirty && checked, off: !dirty || !checked }), btn('just download', () => download(changedFiles()), { off: !dirty }))));

  const out = [el('h2', { textContent: g ? nice(g.name) : '' }), steps];
  if (st.rust) out.splice(1, 0, el('p', { className: 'bad', textContent: `${nice(g.name)} is written in Rust (rust/mg/${g.key}/): the studio shows it, and edits minigames written in WAT.` }));
  const more = el('details', { className: 'more' }, el('summary', { textContent: 'about this minigame and the studio' }),
    hint(`src/mg/${g.key}.wat holds its rules, its hooks under $${g.prefix}_; src/mg/${g.key}.mjs its numbers. Minigame ${st.mg} of ${L.MINIGAMES.length}.`),
    hint('Edits reach the game\'s rules only: the AI and the drawing read this site\'s numbers until the change is merged.'));
  repo.then((r) => { if (r) more.append(el('p', {}, el('a', { href: `https://github.com/${r}/generate`, target: '_blank', rel: 'noopener', textContent: 'make a game of your own from this repo ▸' }))); });
  out.push(more);
  panel.replaceChildren(...out);
  $('play-btn').disabled = !!st.busy;
  $('send').disabled = !dirty || !checked;
  $('send').title = !dirty ? 'change something first' : !checked ? 'check it first' : 'download the changed files and open GitHub\'s upload page';
}

function reset() {
  if (!confirm(`Back to ${nice(L.MINIGAMES[st.mg].name)} as this site serves it? Your changes go.`)) return;
  st.wat = st.served.wat;
  st.consts = st.served.consts;
  save();
  showTab(st.tab);
  render();
}

// ---- wiring
async function main() {
  const pick = $('pick');
  for (const g of L.MINIGAMES) pick.append(el('option', { value: g.key, textContent: nice(g.name) }));
  pick.onchange = () => open(pick.value);
  $('tab-wat').onclick = () => showTab('wat');
  $('tab-consts').onclick = () => showTab('consts');
  text.oninput = () => {
    if (st.tab === 'wat') st.wat = text.value; else st.consts = text.value;
    save();
    render();
  };
  // a tab key types two spaces, as the files are indented
  text.onkeydown = (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !text.readOnly) { e.preventDefault(); document.execCommand('insertText', false, '  '); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(); }
  };
  $('play-btn').onclick = play;
  $('send').onclick = sendIn;
  stopPlay();
  const first = q.get('mg') && L.MINIGAMES.some((m) => m.key === q.get('mg')) ? q.get('mg') : L.MINIGAMES[0].key;
  pick.value = first;
  await open(first);
  window.__studio = { st, build, check, play, open };
}

main().catch((e) => { say(String(e?.message || e)); });
