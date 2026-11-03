// The look: the reference board (board/board.json) in the page. Each view is
// drawn here, now, by the page that draws it for `node tools/board.mjs look`
// (party-render-demo.html's __demo.shot, room.html's __room.shot), beside the
// pictures it should look like and what has been said about it, with the
// sheet's own measurements read out in plain words. A new developer drops
// references here, says what to take from each, says whether a view looks
// right in their own words, and sends the board in as a pull request; an
// agent running the elo-look skill works from the same board. References,
// the last shot and verdicts made here are kept in this browser until sent.
const $ = (id) => document.getElementById(id);
const foot = $('foot'), viewsBox = $('views'), shooters = $('shooters');
const KEY = 'fireplace-look:';
const q = new URLSearchParams(location.search);
const say = (s) => { foot.textContent = s; };
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'style' || k.includes('-')) e.setAttribute(k, v);
    else e[k] = v;
  }
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
};
const get = (k, d) => { try { const v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch { say('this browser would not keep that (its storage is full): send the board in to keep it'); return false; } };

// Rec.601 luma (whole, sky band = top 25% of rows, near band = bottom 35%)
// and chroma (max - min channel), each 0-255: tools/board.mjs's measure(),
// the same source (test/look.test.mjs holds them equal), so a number here and
// a number on the sheet are one estimator.
export function measure(rgba, w, h) {
  let all = 0, sky = 0, near = 0, chroma = 0, nAll = 0, nSky = 0, nNear = 0;
  const skyEnd = Math.floor(h * 0.25), nearStart = Math.ceil(h * 0.65);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      all += l; nAll++;
      chroma += Math.max(r, g, b) - Math.min(r, g, b);
      if (y < skyEnd) { sky += l; nSky++; }
      if (y >= nearStart) { near += l; nNear++; }
    }
  }
  const r1 = (s, n) => (n ? Math.round((s / n) * 10) / 10 : null);
  return { luma: r1(all, nAll), sky: r1(sky, nSky), near: r1(near, nNear), chroma: r1(chroma, nAll) };
}
const KEYS = ['luma', 'sky', 'near', 'chroma'];
const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// The numbers in words. A difference under SAME levels (of 255) is called
// the same: about what an eye notices side by side.
const SAME = 6;
const WORDS = {
  luma: ['darker overall', 'brighter overall'],
  sky: ['darker at the top', 'brighter at the top'],
  near: ['darker at the bottom', 'brighter at the bottom'],
  chroma: ['less colourful', 'more colourful'],
};
export function inWords(d) {
  if (!d) return '';
  const parts = KEYS.filter((k) => d[k] != null && Math.abs(d[k]) >= SAME).map((k) => `${WORDS[k][d[k] > 0 ? 1 : 0]} (${d[k] > 0 ? '+' : ''}${Math.round(d[k])})`);
  return parts.length ? `Than your references: ${parts.join(', ')}.` : 'Close to your references in light and colour.';
}
const numbers = (s) => (s ? `brightness ${Math.round(s.luma)} · top ${Math.round(s.sky)} · bottom ${Math.round(s.near)} · colour ${Math.round(s.chroma)} (each 0 to 255)` : '');

const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('not a picture')); i.src = src; });
async function stats(src) {
  const img = await loadImg(src);
  const w = 256, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * 256));
  const c = el('canvas', { width: w, height: h }), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return measure(g.getImageData(0, 0, w, h).data, w, h);
}
// a dropped picture, kept small enough for this browser to hold
async function shrink(file, width = 1280) {
  const img = await loadImg(URL.createObjectURL(file));
  const s = Math.min(1, width / img.naturalWidth);
  const c = el('canvas', { width: Math.round(img.naturalWidth * s), height: Math.round(img.naturalHeight * s) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88);
}

// ---- the board, as this site serves it, plus what this browser holds
const st = { board: null, served: [], now: {}, stats: {}, repo: '', why: {}, busy: new Set(), refPick: {}, notes: {} };
const localRefs = (id) => get(`refs:${id}`, []);
const localMarks = () => get('marks', []);
const allMarks = () => [...st.served, ...localMarks()];
const title = (v) => v.name || v.id;
function verdict(id) {
  let v = null;
  const notes = [];
  for (const m of allMarks()) if (m.view === id) { if (m.verdict === 'note') notes.push(m); else v = m; }
  return { v, notes };
}
const pending = () => localMarks().length + st.board.views.reduce((n, v) => n + localRefs(v.id).length, 0);
const servedRefs = (v) => (v.refs || []).filter((r) => !r.private).map((r) => ({ ...r, src: `../board/${st.board.refs || 'refs'}/${r.file}`, served: true }));
const refsOf = (v) => [...servedRefs(v), ...localRefs(v.id).map((r) => ({ ...r, src: r.data }))];

// ---- shooting: one hidden page per shooter, asked for each view it draws
const pages = new Map();
function shooter(page) {
  if (pages.has(page.src)) return pages.get(page.src);
  const frame = el('iframe', { src: page.src, allow: 'cross-origin-isolated' });
  shooters.append(frame);
  const ready = new Promise((ok, no) => {
    const t0 = performance.now();
    const poll = () => {
      const api = frame.contentWindow && frame.contentWindow[page.api];
      if (api && api.error) return no(new Error(String(api.error).split('\n')[0]));
      if (api && api.ready) return ok(api);
      if (performance.now() - t0 > 120000) return no(new Error('the game page never got ready'));
      setTimeout(poll, 200);
    };
    frame.onload = poll;
  });
  pages.set(page.src, ready);
  return ready;
}
async function shootView(v) {
  if (!v.page) return { why: 'this view is drawn by node tools/board.mjs look only' };
  const api = await shooter(v.page);
  const r = await api.shot(v.page.shot);
  return { src: `data:image/png;base64,${typeof r === 'string' ? r : r.png}` };
}
let shooting = false;
async function shootAll() {
  if (shooting) return;
  shooting = true;
  $('shoot').disabled = true;
  const views = st.board.views;
  for (const v of views) st.busy.add(v.id);
  render();
  for (const [k, v] of views.entries()) {
    say(`drawing ${title(v)} (${k + 1} of ${views.length})…`);
    try {
      const r = await shootView(v);
      if (r.src) {
        if (st.now[v.id]) { put(`last:${v.id}`, st.now[v.id]); st.stats[`${v.id}:last`] = st.stats[`${v.id}:now`]; }
        st.now[v.id] = r.src;
        st.stats[`${v.id}:now`] = await stats(r.src);
        delete st.why[v.id];
      } else st.why[v.id] = r.why;
    } catch (e) { st.why[v.id] = `couldn't draw it: ${String(e.message || e)}`; }
    st.busy.delete(v.id);
    render();
  }
  shooting = false;
  $('shoot').disabled = false;
  say('every view is drawn as the game draws it now');
}

// ---- verdicts and references made here
function addMark(id, verdictName, note) {
  const ms = localMarks();
  ms.push({ at: new Date().toISOString(), view: id, verdict: verdictName, note: note.trim(), by: 'this browser' });
  if (put('marks', ms)) { st.notes[id] = ''; render(); say(verdictName === 'right' ? 'saved: looks right' : verdictName === 'wrong' ? 'saved: not yet, with what you said' : 'note saved'); }
}
async function addRefs(id, files) {
  const refs = localRefs(id);
  let added = 0;
  for (const f of files) {
    if (!/^image\//.test(f.type)) { say(`${f.name} isn't a picture`); continue; }
    refs.push({ file: f.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') + '.jpg', take: '', licence: 'ours', data: await shrink(f) });
    added++;
  }
  if (added && put(`refs:${id}`, refs)) {
    st.refPick[id] = servedRefs(st.board.views.find((v) => v.id === id)).length + refs.length - 1;
    await measureRefs();
    render();
    say('added: now say what to take from it');
    const box = viewsBox.querySelector(`section[data-view="${CSS.escape(id)}"] .refnote input`);
    if (box) box.focus();
  }
}
function editRef(id, k, patch) {
  const refs = localRefs(id);
  if (patch === null) refs.splice(k, 1); else Object.assign(refs[k], patch);
  put(`refs:${id}`, refs);
}

async function measureRefs() {
  for (const v of st.board.views) {
    for (const [k, r] of refsOf(v).entries()) {
      const key = `${v.id}:ref:${k}`;
      if (!st.stats[key]) st.stats[key] = await stats(r.src).catch(() => null);
    }
    const last = get(`last:${v.id}`, null);
    if (last && !st.stats[`${v.id}:last`]) st.stats[`${v.id}:last`] = await stats(last).catch(() => null);
  }
}

// ---- the compare view: a reference beside now, large
const zoom = { view: null, k: 0 };
function openZoom(v, k = 0) {
  zoom.view = v;
  zoom.k = k;
  drawZoom();
  $('zoom').hidden = false;
  $('zoom-close').focus();
}
function drawZoom() {
  const v = zoom.view, refs = refsOf(v);
  const k = refs.length ? ((zoom.k % refs.length) + refs.length) % refs.length : 0;
  zoom.k = k;
  const r = refs[k], now = st.now[v.id] || get(`last:${v.id}`, null);
  $('zoom-title').textContent = title(v);
  $('zoom-a').src = r ? r.src : '';
  $('zoom-ac').textContent = r ? `reference ${k + 1} of ${refs.length}${r.take ? `: take ${r.take}` : ''}` : 'no reference yet';
  $('zoom-b').src = now || '';
  $('zoom-bc').textContent = st.now[v.id] ? 'now' : now ? 'the shot before' : 'not drawn yet';
  const d = deltaFor(v);
  $('zoom-f').replaceChildren(el('b', { textContent: inWords(d) || (refs.length ? '' : 'Add a reference to compare against it.') }), numbers(st.stats[`${v.id}:now`]) ? `now: ${numbers(st.stats[`${v.id}:now`])}` : '');
  $('zoom-prev').disabled = $('zoom-next').disabled = refs.length < 2;
}
const closeZoom = () => { $('zoom').hidden = true; zoom.view = null; };

function deltaFor(v) {
  const refStats = refsOf(v).map((_, k) => st.stats[`${v.id}:ref:${k}`]).filter(Boolean);
  const now = st.stats[`${v.id}:now`];
  if (!now || !refStats.length) return null;
  return Object.fromEntries(KEYS.map((k) => { const m = median(refStats.map((s) => s[k])); return [k, m == null ? null : now[k] - m]; }));
}

// ---- drawing
function pic(src, alt, onOpen, overlay) {
  const box = el('div', { className: 'pic' });
  if (src) { const img = el('img', { src, alt }); img.onclick = onOpen; box.append(img); }
  if (overlay) box.append(overlay);
  return box;
}

function referenceColumn(v) {
  const refs = refsOf(v), served = servedRefs(v).length;
  const col = el('div', {}, el('div', { className: 'colh', textContent: refs.length ? `references (${refs.length})` : 'references' }));
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  input.onchange = () => addRefs(v.id, [...input.files]);
  const dropZone = (small) => {
    const d = el('label', { className: small ? 'drop small' : 'drop', textContent: small ? '+ add another' : 'Drop a picture of how this should look, or click to choose one. A photo, concept art, another game: anything that shows the feel.' }, input);
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); addRefs(v.id, [...e.dataTransfer.files]); };
    return d;
  };
  if (!refs.length) { col.append(dropZone(false)); return col; }
  const k = Math.min(st.refPick[v.id] ?? 0, refs.length - 1);
  const r = refs[k];
  col.append(pic(r.src, `reference ${k + 1}`, () => openZoom(v, k)));
  if (refs.length > 1) {
    col.append(el('div', { className: 'thumbs' }, ...refs.map((x, i) => {
      const b = el('button', { className: i === k ? 'on' : '', title: x.take || `reference ${i + 1}` }, el('img', { src: x.src, alt: `reference ${i + 1}` }));
      b.onclick = () => { st.refPick[v.id] = i; render(); };
      return b;
    })));
  }
  if (r.served) {
    col.append(el('div', { className: 'readout' }, `take: ${r.take}`, r.ignore ? ` · ignore: ${r.ignore}` : ''));
  } else {
    const mine = k - served;
    const take = el('input', { type: 'text', value: r.take, placeholder: 'what to take from it: the light, the colours, how busy it is…', 'aria-label': 'what to take from this reference' });
    take.onchange = () => { editRef(v.id, mine, { take: take.value }); render(); };
    const lic = el('select', { 'aria-label': 'whose picture this is' }, ...[['ours', 'mine to share'], ['CC0', 'CC0'], ['CC-BY', 'CC-BY'], ['private', 'not mine: keep it in this browser']].map(([x, label]) => el('option', { value: x, textContent: label, selected: r.licence === x })));
    lic.onchange = () => { editRef(v.id, mine, { licence: lic.value }); render(); };
    const rm = el('button', { className: 'x', textContent: 'remove', title: 'remove this reference' });
    rm.onclick = () => { editRef(v.id, mine, null); st.refPick[v.id] = 0; st.stats = Object.fromEntries(Object.entries(st.stats).filter(([key]) => !key.startsWith(`${v.id}:ref:`))); measureRefs().then(render); };
    col.append(el('div', { className: 'refnote' }, take, el('div', { style: 'display:flex;gap:6px' }, lic, rm)));
  }
  col.append(dropZone(true));
  return col;
}

function render() {
  const out = [];
  let right = 0;
  for (const v of st.board.views) {
    const { v: last, notes } = verdict(v.id);
    if (last && last.verdict === 'right') right++;
    const d = deltaFor(v);
    const busy = st.busy.has(v.id), why = st.why[v.id];
    const lastShot = get(`last:${v.id}`, null);
    const badge = last ? el('span', { className: `badge ${last.verdict}`, textContent: last.verdict === 'right' ? 'looks right' : 'not yet' }) : el('span', { className: 'badge', textContent: 'no verdict yet' });
    const said = last && last.note ? el('div', { className: `said ${last.verdict}` }, `“${last.note}”`, el('span', { className: 'when', textContent: (last.at || '').slice(0, 10) })) : null;

    const nowCol = el('div', {}, el('div', { className: 'colh', textContent: 'now' }),
      pic(st.now[v.id], 'now', () => openZoom(v, st.refPick[v.id] ?? 0),
        busy ? el('div', { className: 'busy', textContent: 'drawing…' })
          : !st.now[v.id] ? el('div', { className: 'empty', textContent: why || 'not drawn yet: press draw again' }) : null),
      el('div', { className: 'readout', title: numbers(st.stats[`${v.id}:now`]) },
        d ? el('span', { className: 'diff', textContent: inWords(d) }) : st.now[v.id] ? 'Add a reference to compare against it.' : ''));
    const beforeCol = el('div', {}, el('div', { className: 'colh', textContent: 'the shot before' }),
      pic(lastShot, 'the shot before', () => openZoom(v, st.refPick[v.id] ?? 0),
        lastShot ? null : el('div', { className: 'empty', textContent: 'After a change, press draw again: this picture moves here so you can see what changed.' })),
      el('div', { className: 'readout', title: numbers(st.stats[`${v.id}:last`]) }));

    const note = el('input', { type: 'text', value: st.notes[v.id] || '', placeholder: 'what you see, in your words (“too dark”, “the riders get lost”, “keep this”)', 'aria-label': `what you see in ${title(v)}` });
    note.oninput = () => { st.notes[v.id] = note.value; };
    const btn = (cls, label, fn) => { const b = el('button', { className: cls, textContent: label }); b.onclick = fn; return b; };
    const need = (verdictName) => () => {
      if (!note.value.trim()) { note.focus(); say(verdictName === 'wrong' ? 'say what isn’t right yet, so whoever works on it knows what to change' : 'write the note first'); return; }
      addMark(v.id, verdictName, note.value);
    };
    out.push(el('section', { className: 'view', dataset: { view: v.id } },
      el('div', { className: 'vhead' }, el('h2', { textContent: title(v) }), badge),
      el('p', { className: 'what', textContent: v.what || '' }),
      v.take ? el('p', { className: 'aim' }, el('span', { textContent: 'aiming for: ' }), v.take) : null,
      said,
      ...notes.slice(-2).map((n) => el('div', { className: 'said' }, `note: “${n.note}”`, el('span', { className: 'when', textContent: (n.at || '').slice(0, 10) }))),
      el('div', { className: 'grid' }, referenceColumn(v), nowCol, beforeCol),
      el('div', { className: 'verdict' }, note,
        btn('good', 'looks right', () => addMark(v.id, 'right', note.value)),
        btn('notyet', 'not yet', need('wrong')),
        btn('link', 'just a note', need('note')))));
  }
  viewsBox.replaceChildren(...out);
  const n = st.board.views.length;
  $('progress').replaceChildren(el('b', { textContent: `${right} of ${n}` }), ` look${right === 1 ? 's' : ''} right`);
  const p = pending();
  $('send').textContent = p ? `send it in (${p})` : 'send it in';
  $('send').disabled = !p;
  if (zoom.view) drawZoom();
}

// ---- out of the page: a brief for an agent, and the pull request
function brief() {
  const lines = [`Use the elo-look skill on ${st.repo || 'this repo'}: the board is board/board.json, run with node tools/board.mjs look.`];
  for (const v of st.board.views) {
    const { v: last } = verdict(v.id);
    if (last && last.verdict === 'right') continue;
    const refs = refsOf(v).map((r) => r.take).filter(Boolean);
    lines.push(`- ${title(v)} (view ${v.id}: ${v.what}). Aim: ${v.take}.${last ? ` Not right yet: "${last.note}".` : ' No verdict yet.'}${refs.length ? ` References say: ${refs.join('; ')}.` : ''}`);
  }
  lines.push('Change one thing at a time toward the references, shoot again, and show me the sheet. Stop on a view when I say it looks right; never mark one yourself.');
  return lines.join('\n');
}
function download(name, body, type = 'text/plain') {
  const href = typeof body === 'string' && body.startsWith('data:') ? body : URL.createObjectURL(new Blob([body], { type }));
  const a = el('a', { href, download: name });
  a.click();
  if (!href.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(href), 5000);
}
function sendIn() {
  const board = JSON.parse(JSON.stringify(st.board));
  const pics = [];
  for (const v of board.views) {
    for (const r of localRefs(v.id)) {
      if (!r.take.trim()) { say(`say what to take from each reference first (${title(v)})`); viewsBox.querySelector(`section[data-view="${CSS.escape(v.id)}"]`)?.scrollIntoView({ block: 'center' }); return; }
      v.refs = [...(v.refs || []), r.licence === 'private' ? { file: r.file, take: r.take, private: true } : { file: r.file, take: r.take, licence: r.licence }];
      if (r.licence !== 'private') pics.push([r.file, r.data]);
    }
  }
  const marks = localMarks();
  if (!pics.length && !marks.length) { say('nothing new to send: add a reference or say whether a view looks right first'); return; }
  if (st.repo) window.open(`https://github.com/${st.repo}/upload/main/board`, '_blank', 'noopener');
  download('board.json', JSON.stringify(board, null, 2) + '\n', 'application/json');
  if (marks.length) download('marks.jsonl', allMarks().map((m) => JSON.stringify(m)).join('\n') + '\n');
  for (const [name, data] of pics) download(name, data);
  say(`downloaded board.json${marks.length ? ', marks.jsonl' : ''}${pics.length ? ` and ${pics.length} picture${pics.length === 1 ? '' : 's'}` : ''}: drop board.json and marks.jsonl in board/ and the pictures in board/refs/, then propose the change${st.repo ? ` on ${st.repo}` : ''}`);
}

async function main() {
  const r = await fetch(new URL('../board/board.json', import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`board/board.json: ${r.status}`);
  st.board = await r.json();
  const m = await fetch(new URL('../board/marks.jsonl', import.meta.url), { cache: 'no-cache' }).then((x) => (x.ok ? x.text() : '')).catch(() => '');
  st.served = m.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((x) => x && x.view && x.verdict);
  st.repo = await fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' }).then((x) => (x.ok ? x.json() : {})).then((k) => k.repo || '').catch(() => '');
  render();
  await measureRefs();
  render();
  $('shoot').onclick = shootAll;
  $('brief').onclick = async () => { const t = brief(); try { await navigator.clipboard.writeText(t); say('copied: paste it to your agent'); } catch { download('brief.txt', t); say('downloaded brief.txt: paste it to your agent'); } };
  $('send').onclick = sendIn;
  $('zoom-close').onclick = closeZoom;
  $('zoom-prev').onclick = () => { zoom.k--; drawZoom(); };
  $('zoom-next').onclick = () => { zoom.k++; drawZoom(); };
  $('zoom').onclick = (e) => { if (e.target.id === 'zoom') closeZoom(); };
  addEventListener('keydown', (e) => {
    if (!zoom.view) return;
    if (e.key === 'Escape') closeZoom();
    else if (e.key === 'ArrowLeft') { zoom.k--; drawZoom(); } else if (e.key === 'ArrowRight') { zoom.k++; drawZoom(); }
  });
  window.__look = { st, shootAll, brief, measure, inWords };
  // the page draws every view on its own when it opens (?shoot=0 to skip)
  if (q.get('shoot') !== '0') await shootAll();
  else say(`${st.board.views.length} views: press draw again to draw them as the game does now`);
}

main().catch((e) => { say(String(e?.message || e)); viewsBox.textContent = String(e?.message || e); });
