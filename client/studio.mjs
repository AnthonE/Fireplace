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

const st = {
  key: '', mg: 0, tab: 'wat',
  served: { wat: '', consts: '' }, // as this site serves them
  wat: '', consts: '', rust: false,
  built: null, // { bytes, debug, ms, size, wat, consts } of the last good build
  buildError: '', checked: null, checkError: '', busy: '',
  blobUrl: '',
};

const say = (s) => { foot.textContent = s; };
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const hint = (s) => el('p', { className: 'hint', textContent: s });
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
  say(`opening ${L.MINIGAMES[k].name}…`);
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
  say(draft ? `opened ${L.MINIGAMES[k].name}: your draft, kept in this browser` : `opened ${L.MINIGAMES[k].name}`);
}

function save() {
  if (!st.key) return;
  const same = st.wat === st.served.wat && st.consts === st.served.consts;
  put(DRAFT + st.key, same ? null : JSON.stringify({ wat: st.wat, consts: st.consts }));
}

function showTab(tab) {
  st.tab = tab;
  $('tab-wat').classList.toggle('on', tab === 'wat');
  $('tab-consts').classList.toggle('on', tab === 'consts');
  text.value = tab === 'wat' ? st.wat : st.consts;
  text.readOnly = st.rust;
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
  playBox.replaceChildren(el('p', { textContent: 'Build, then play: your minigame with AI balls, here.' }));
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

// ---- the panel
function render() {
  const g = L.MINIGAMES[st.mg];
  const c = changed();
  const out = [h3(g ? g.name : '')];
  if (g) out.push(hint(`src/mg/${g.key}.wat, its hooks under $${g.prefix}_; src/mg/${g.key}.mjs, its constants (literal numbers). MG ${st.mg}.`));
  if (st.rust) out.push(el('p', { className: 'bad', textContent: `${g.name} is written in Rust (rust/mg/${g.key}/): its WAT is generated, so the studio shows it but edits WAT minigames only.` }));
  out.push(hint(c.wat || c.consts ? `changed: ${[c.wat && 'the minigame', c.consts && 'its constants'].filter(Boolean).join(' and ')}` : 'unchanged from this site\'s'));

  out.push(h3('Build'));
  if (st.busy === 'build') out.push(hint('building…'));
  else if (st.buildError) out.push(el('p', { className: 'bad', textContent: st.buildError }));
  else if (st.built) out.push(el('p', { className: stale() ? 'hint' : 'ok', textContent: `${stale() ? 'built before your last edit' : 'built'}: game.wasm ${st.built.size} B, in ${st.built.ms} ms (and the debug build)` }));
  else out.push(hint('Ctrl+Enter builds party with your minigame in it, as npm run build would.'));

  out.push(h3('Check'));
  const k = st.checked;
  if (st.busy === 'check') out.push(hint('checking…'));
  else if (st.checkError) out.push(el('p', { className: 'bad', textContent: st.checkError }));
  else if (k) {
    out.push(el('p', { className: k.scored ? 'ok' : 'bad', textContent: `${k.ticks} ticks, ${k.bots} AI balls on the debug build: no trap; ${k.rounds} rounds over, ${k.scored} balls scored${k.scored ? '' : ': nobody did'}` }));
    out.push(el('p', { className: k.splitEqual ? 'ok' : 'bad', textContent: k.splitEqual ? 'split two ways, every tick\'s hash equal' : `split two ways, the hashes differ from tick ${k.differ}: something reads a ball another thread may be writing` }));
  } else out.push(hint('Plays the debug build (it traps on a NaN or an infinity) with AI balls on your minigame alone, then replays it with the balls\' work split two ways: the same bits or a bug.'));

  out.push(h3('Send it in'));
  out.push(hint('Downloads the files you changed and opens GitHub\'s upload page for src/mg/: drop them there and propose the change. That is the pull request; CI runs the tests, the determinism matrix and the online gate. CONTRIBUTING.md, "A minigame", has the rest.'));
  const send = el('p');
  repo.then((r) => { if (r) send.append(el('a', { href: `https://github.com/${r}/generate`, target: '_blank', rel: 'noopener', textContent: 'or make a game of your own from this repo' })); });
  out.push(send);
  out.push(hint('Edits reach the sim only: the AI and the drawing read this site\'s constants until the change is merged.'));
  panel.replaceChildren(...out);
  for (const [id, off] of [['build', !!st.busy], ['check', !!st.busy], ['play-btn', !!st.busy], ['send', !(c.wat || c.consts)], ['download', !(c.wat || c.consts)], ['reset', !(c.wat || c.consts)]]) $(id).disabled = off;
}

// ---- wiring
async function main() {
  const pick = $('pick');
  for (const [k, g] of L.MINIGAMES.entries()) pick.append(el('option', { value: g.key, textContent: `${k} ${g.name}` }));
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
  $('build').onclick = build;
  $('check').onclick = check;
  $('play-btn').onclick = play;
  $('send').onclick = sendIn;
  $('download').onclick = () => download(changedFiles());
  $('reset').onclick = () => {
    if (!confirm(`Back to ${L.MINIGAMES[st.mg].name} as this site serves it? Your draft goes.`)) return;
    st.wat = st.served.wat;
    st.consts = st.served.consts;
    save();
    showTab(st.tab);
    render();
  };
  const first = q.get('mg') && L.MINIGAMES.some((m) => m.key === q.get('mg')) ? q.get('mg') : L.MINIGAMES[0].key;
  pick.value = first;
  await open(first);
  window.__studio = { st, build, check, play, open };
}

main().catch((e) => { say(String(e?.message || e)); });
