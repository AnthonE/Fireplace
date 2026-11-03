// The look: the reference board (board/board.json) in the page. Each view is
// drawn here, now, by the page that draws it for `node tools/board.mjs look`
// (party-render-demo.html's __demo.shot, room.html's __room.shot), beside the
// pictures it should look like and the marks said about it, with the same
// measurements under every picture. A new developer drops references here,
// says what to take from each, marks a view right or wrong in their own
// words, and sends the board in as a pull request; an agent running the
// elo-look skill works from it the same way. References, the last shot and
// marks made here are kept in this browser until sent.
const $ = (id) => document.getElementById(id);
const foot = $('foot'), viewsBox = $('views'), shooters = $('shooters');
const KEY = 'fireplace-look:';
const say = (s) => { foot.textContent = s; };
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter((k) => k != null)); return e; };
const get = (k, d) => { try { const v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch { say('this browser would not keep that (storage full): send the board in to keep it'); return false; } };

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
const st = { board: null, served: [], now: {}, stats: {}, repo: '' };
const localRefs = (id) => get(`refs:${id}`, []);
const localMarks = () => get('marks', []);
const allMarks = () => [...st.served, ...localMarks()];
function verdict(id) {
  let v = null;
  const notes = [];
  for (const m of allMarks()) if (m.view === id) { if (m.verdict === 'note') notes.push(m); else v = m; }
  return { v, notes };
}

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
      if (performance.now() - t0 > 120000) return no(new Error(`${page.src} never got ready`));
      setTimeout(poll, 200);
    };
    frame.onload = poll;
  });
  pages.set(page.src, ready);
  return ready;
}
async function shootView(v) {
  if (!v.page) return { why: 'shot by node tools/board.mjs look only' };
  const api = await shooter(v.page);
  const r = await api.shot(v.page.shot);
  return { src: `data:image/png;base64,${typeof r === 'string' ? r : r.png}` };
}
async function shootAll() {
  $('shoot').disabled = true;
  for (const v of st.board.views) {
    say(`shooting ${v.id}…`);
    try {
      const r = await shootView(v);
      if (r.src) {
        if (st.now[v.id]) put(`last:${v.id}`, st.now[v.id]);   // the previous shot becomes the last one
        st.now[v.id] = r.src;
        st.stats[`${v.id}:now`] = await stats(r.src);
      } else st.now[v.id] = null;
      st.why = { ...st.why, [v.id]: r.why };
    } catch (e) { st.why = { ...st.why, [v.id]: String(e.message || e) }; }
    render();
  }
  $('shoot').disabled = false;
  say('shot every view: compare, then mark');
}

// ---- marks and references made here
function addMark(id, verdict, note) {
  const ms = localMarks();
  ms.push({ at: new Date().toISOString(), view: id, verdict, note: note.trim(), by: 'this browser' });
  put('marks', ms);
  render();
}
async function addRefs(id, files) {
  const refs = localRefs(id);
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    const data = await shrink(f);
    refs.push({ file: f.name.replace(/\.[^.]+$/, '') + '.jpg', take: '', licence: 'ours', data });
  }
  if (put(`refs:${id}`, refs)) render();
}
function editRef(id, k, patch) {
  const refs = localRefs(id);
  Object.assign(refs[k], patch);
  if (patch === null) refs.splice(k, 1);
  put(`refs:${id}`, refs);
}

// ---- drawing
const statLine = (s, d) => el('span', { className: 'st', innerHTML: s ? KEYS.map((k) => `${k} ${s[k]}` + (d && d[k] != null ? ` <span class="d">(${d[k] > 0 ? '+' : ''}${Math.round(d[k] * 10) / 10})</span>` : '')).join(' · ') : '' });
function figure(src, caption, s, d) {
  return el('figure', {}, src ? el('img', { src, alt: caption }) : el('div', { className: 'empty', textContent: 'none yet' }), el('figcaption', {}, caption, statLine(s, d)));
}
function servedRefs(v) {
  return (v.refs || []).filter((r) => !r.private).map((r) => ({ ...r, src: `../board/${st.board.refs || 'refs'}/${r.file}` }));
}

async function measureRefs() {
  for (const v of st.board.views) {
    const refs = [...servedRefs(v).map((r) => r.src), ...localRefs(v.id).map((r) => r.data)];
    for (const [k, src] of refs.entries()) {
      const key = `${v.id}:ref:${k}`;
      if (!st.stats[key]) st.stats[key] = await stats(src).catch(() => null);
    }
    const last = get(`last:${v.id}`, null);
    if (last && !st.stats[`${v.id}:last`]) st.stats[`${v.id}:last`] = await stats(last).catch(() => null);
  }
}

function render() {
  const out = [];
  for (const v of st.board.views) {
    const { v: last, notes } = verdict(v.id);
    const served = servedRefs(v), mine = localRefs(v.id);
    const refStats = [...served, ...mine].map((_, k) => st.stats[`${v.id}:ref:${k}`]).filter(Boolean);
    const med = Object.fromEntries(KEYS.map((k) => [k, median(refStats.map((s) => s[k]))]));
    const nowS = st.stats[`${v.id}:now`];
    const d = nowS && refStats.length ? Object.fromEntries(KEYS.map((k) => [k, med[k] == null ? null : nowS[k] - med[k]])) : null;

    const refs = served.map((r, k) => figure(r.src, `ref: take ${r.take}${r.ignore ? ' · ignore ' + r.ignore : ''}`, st.stats[`${v.id}:ref:${k}`]));
    mine.forEach((r, k) => {
      const take = el('input', { type: 'text', value: r.take, placeholder: 'what to take from it (light, colour, how busy…)' });
      take.onchange = () => editRef(v.id, k, { take: take.value });
      const lic = el('select', {}, ...['ours', 'CC0', 'CC-BY', 'private'].map((x) => el('option', { value: x, textContent: x === 'private' ? 'not mine (stays in this browser)' : x, selected: r.licence === x })));
      lic.onchange = () => editRef(v.id, k, { licence: lic.value });
      const rm = el('button', { className: 'x', textContent: '×', title: 'remove this reference' });
      rm.onclick = () => { editRef(v.id, k, null); st.stats = {}; measureRefs().then(render); };
      const f = figure(r.data, 'your reference', st.stats[`${v.id}:ref:${served.length + k}`]);
      f.append(take, el('div', { className: 'act' }, lic, rm));
      refs.push(f);
    });
    const drop = el('label', { className: 'drop', textContent: 'drop a picture of how this should look, or click to pick one' });
    const pickFile = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    pickFile.onchange = () => addRefs(v.id, [...pickFile.files]).then(measureRefs).then(render);
    drop.append(pickFile);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); addRefs(v.id, [...e.dataTransfer.files]).then(measureRefs).then(render); };

    const note = el('input', { type: 'text', placeholder: 'what you see: "the fire outshines the TV", "keep this"' });
    const markBtn = (verdictName, label) => { const b = el('button', { textContent: label }); b.onclick = () => { if (verdictName !== 'right' && !note.value.trim()) { note.focus(); say('say what is wrong, or what to try, in your own words'); return; } addMark(v.id, verdictName, note.value); }; return b; };
    const why = st.why && st.why[v.id];
    out.push(el('section', {},
      el('h2', { textContent: v.id }),
      el('p', { className: 'what', textContent: v.what || '' }),
      v.take ? el('p', { className: 'aim', textContent: `aim: ${v.take}` }) : null,
      el('div', { className: 'marks' },
        last ? el('span', { className: last.verdict, textContent: `${last.verdict}: ${last.note || ''} (${(last.at || '').slice(0, 10)})` }) : el('span', { textContent: 'no mark yet' }),
        ...notes.slice(-2).map((n) => el('div', { className: 'note', textContent: `note: ${n.note}` }))),
      el('div', { className: 'row' }, ...refs, drop,
        figure(st.now[v.id], why ? `now: ${why}` : 'now', nowS, d),
        figure(get(`last:${v.id}`, null), 'the shot before', st.stats[`${v.id}:last`])),
      el('div', { className: 'act' }, note, markBtn('right', 'mark right'), markBtn('wrong', 'mark wrong'), markBtn('note', 'add a note'))));
  }
  viewsBox.replaceChildren(...out);
}

// ---- out of the page: a brief for an agent, and the pull request
function brief() {
  const lines = [`Use the elo-look skill on ${st.repo || 'this repo'}: the board is board/board.json, run with node tools/board.mjs look.`];
  for (const v of st.board.views) {
    const { v: last } = verdict(v.id);
    if (last && last.verdict === 'right') continue;
    const refs = [...servedRefs(v), ...localRefs(v.id)].map((r) => r.take).filter(Boolean);
    lines.push(`- ${v.id} (${v.what}). Aim: ${v.take}.${last ? ` Marked wrong: "${last.note}".` : ' Not marked yet.'}${refs.length ? ` References say: ${refs.join('; ')}.` : ''}`);
  }
  lines.push('Change one thing at a time toward the references, shoot again, and show me the sheet. Stop on a view when I mark it right; never mark one yourself.');
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
      if (!r.take.trim()) { say(`say what to take from each reference first (${v.id})`); return; }
      v.refs = [...(v.refs || []), r.licence === 'private'
        ? { file: r.file, take: r.take, private: true }
        : { file: r.file, take: r.take, licence: r.licence }];
      if (r.licence !== 'private') pics.push([r.file, r.data]);
    }
  }
  const marks = localMarks();
  if (!pics.length && !marks.length) { say('nothing new to send: drop a reference or make a mark first'); return; }
  if (st.repo) window.open(`https://github.com/${st.repo}/upload/main/board`, '_blank', 'noopener');
  download('board.json', JSON.stringify(board, null, 2) + '\n', 'application/json');
  if (marks.length) download('marks.jsonl', allMarks().map((m) => JSON.stringify(m)).join('\n') + '\n');
  for (const [name, data] of pics) download(name, data);
  say(`downloaded board.json${marks.length ? ', marks.jsonl' : ''}${pics.length ? ` and ${pics.length} picture(s)` : ''}: board.json and marks.jsonl go in board/, the pictures in board/refs/, as a pull request${st.repo ? ` on ${st.repo}` : ''}`);
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
  say(`${st.board.views.length} views. Shoot draws them all here; it takes a few seconds each.`);
  window.__look = { st, shootAll, brief, measure };
  if (new URLSearchParams(location.search).get('shoot') === '1') await shootAll();
}

main().catch((e) => { say(String(e?.message || e)); viewsBox.textContent = String(e?.message || e); });
