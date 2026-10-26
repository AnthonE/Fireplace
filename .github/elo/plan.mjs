#!/usr/bin/env node
// The plumbing around "Plan my game" (.github/workflows/elo-plan.yml): the
// issue form's answers read into JSON, the files Claude writes checked against
// the rules .github/elo/plan-prompt.md gives it, the first tasks opened as
// issues, and the prompt's eval. No model runs here and nothing is fetched.
//
//   node .github/elo/plan.mjs form <event.json | eval.json> <answers.json>
//       the issue's answers (the form in .github/ISSUE_TEMPLATE/plan.yml) and
//       the kit they point to, by the rules Elo Pros' plan generator uses
//   node .github/elo/plan.mjs check <dir> --answers <answers.json> [--issues <issues.json>] [--pr <pr.md>]
//       a plan in <dir> (docs/design.md, docs/plan.md, elo.json; or the three
//       side by side, as the eval's fixtures are): every required section,
//       every task with its files and a check command that can run here
//   node .github/elo/plan.mjs issues <issues.json> --plan <issue number> [--pr <url>]
//       opens each first task as an issue (gh, with GH_TOKEN), prints the links
//   node .github/elo/plan.mjs evals
//       the five sample interviews in .github/elo/evals/: each read, its kit
//       as expected, its sample plan passing check; run before changing the prompt
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..');
const FORM = join(ROOT, '.github', 'ISSUE_TEMPLATE', 'plan.yml');

// each dropdown's options, in the form's order, as the answers' keys
export const KEYS = {
  players: ['2-4', '5-16', '17-100', '100+'],
  session: ['short', 'medium', 'long', 'endless'],
  stakes: ['no', 'yes'],
  persist: ['no', 'yes'],
  secrets: ['no', 'yes'],
  where: ['browser', 'desktop', 'both'],
  agents: ['yes', 'no', 'unsure'],
  money: ['free', 'copies', 'coin'],
  have: ['nothing', 'code', 'art', 'repo'],
};

// The form's fields from plan.yml: [{ id, type, label, options }]. Its shape
// is fixed (GitHub's issue forms), so a few patterns read it; no YAML library.
export function formFields(text = readFileSync(FORM, 'utf8')) {
  const fields = [];
  let cur = null, inOptions = false;
  const unq = (s) => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  for (const line of text.split('\n')) {
    let m;
    if ((m = line.match(/^ {2}- type: (\w+)/))) { cur = { type: m[1], options: [] }; fields.push(cur); inOptions = false; }
    else if (!cur) continue;
    else if ((m = line.match(/^ {4}id: (\S+)/))) cur.id = m[1];
    else if ((m = line.match(/^ {6}label: (.+)$/))) cur.label = unq(m[1]);
    else if (/^ {6}options:/.test(line)) inOptions = true;
    else if (inOptions && (m = line.match(/^ {8}- (?:label: )?(.+)$/))) cur.options.push(unq(m[1]));
    else if (/^ {4}\S/.test(line)) inOptions = false;
  }
  return fields.filter((f) => f.id);
}

export function slugOf(name) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 41).replace(/-+$/, '');
  return s.length >= 3 ? s : (s + '-game').replace(/^-/, '').slice(0, 41);
}

// Which kit, and why: the world kit (an authoritative server) on any one
// reason, else the party kit. The same rules as Elo Pros' plan generator
// (meter/designdoc.py pick_kit) and BUILD-A-GAME.md §2c.
export function pickKit(a) {
  const why = [];
  if (a.stakes === 'yes') why.push('cheating pays, so one server has to hold the truth');
  if (a.persist === 'yes') why.push('the world remembers, so something has to keep it between games');
  if (a.secrets === 'yes') why.push('players see different things, and a shared simulation shows everyone everything');
  if (a.players === '100+') why.push('more than 100 at once is past what one room carries');
  if (a.session === 'endless') why.push('a game that never ends needs somewhere to live while nobody is on');
  if (why.length) return { kit: 'world', why };
  return { kit: 'party', why: ['nobody gains by cheating, every game starts fresh and everyone sees the same board, so the rules can run on every player\'s machine and a relay is all the server it needs'] };
}

// dollars as typed ("4.99", "$5") to cents, or null
export function centsOf(s) {
  const m = String(s || '').trim().match(/^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0')) : null;
}

// The issue body GitHub writes from the form ("### <label>" then the answer) as answers.
export function readForm({ title = '', body = '', number = 0 }, fields = formFields()) {
  const byLabel = new Map(fields.map((f) => [f.label, f]));
  const raw = {};
  for (const chunk of String(body).replace(/\r\n/g, '\n').split(/^### /m).slice(1)) {
    const nl = chunk.indexOf('\n');
    const label = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const value = (nl < 0 ? '' : chunk.slice(nl + 1)).trim();
    const f = byLabel.get(label);
    if (f) raw[f.id] = value === '_No response_' ? '' : value;
  }
  const a = { issue: Number(number) || 0 };
  for (const f of fields) {
    const v = raw[f.id] ?? '';
    if (f.type === 'dropdown') {
      const k = f.options.indexOf(v);
      if (k < 0) throw new Error(`"${f.label}": no answer from the list${v ? ` (got "${v}")` : ''}`);
      a[f.id] = KEYS[f.id][k];
    } else if (f.type === 'checkboxes') {
      const ticked = [...v.matchAll(/^- \[[xX]\] (.+)$/gm)].map((m) => f.options.indexOf(m[1].trim())).filter((k) => k >= 0);
      a[f.id] = ticked.length ? ticked.map((k) => KEYS[f.id][k]) : ['nothing'];
    } else a[f.id] = v.replace(/\s+/g, ' ').trim();
  }
  if (!a.name) a.name = String(title).replace(/^\[plan\]\s*/i, '').trim();
  if (!a.name) throw new Error('"What is your game called?": no name');
  a.name = a.name.slice(0, 60);
  a.slug = slugOf(a.name);
  if (a.slug === 'fireplace') a.slug = 'my-fireplace';
  a.price_cents = a.money === 'free' ? null : centsOf(a.price);
  delete a.price;
  Object.assign(a, pickKit(a));
  return a;
}

// ---- check

const SECTIONS = ['The game', 'Kit', 'First playable', 'Biggest risks'];

// a plan's files: the repo's layout (docs/…) or the eval's (side by side)
function planFiles(dir) {
  const docs = existsSync(join(dir, 'docs', 'plan.md'));
  const at = (f) => join(dir, docs ? join('docs', f) : f);
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
  return { design: read(at('design.md')), plan: read(at('plan.md')), elo: read(join(dir, 'elo.json')) };
}

// "## Heading" -> its text, up to the next "## "
function sections(md) {
  const out = new Map();
  let cur = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^## (.+?)\s*$/);
    if (m) { cur = m[1]; out.set(cur, []); } else if (cur) out.get(cur).push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join('\n').trim()]));
}
const findSection = (secs, name) => [...secs].find(([k]) => k.toLowerCase().startsWith(name.toLowerCase()))?.[1] ?? null;

// a command line's words, quotes honoured
function words(s) {
  const out = [];
  for (const m of s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// Problems with one check command: only npm, node, sh and curl, an npm script
// package.json has, and files that exist here or that a task in the plan makes.
export function commandProblems(cmd, { root = ROOT, made = new Set() } = {}) {
  const problems = [];
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts || {};
  const there = (p) => existsSync(join(root, p)) || made.has(p);
  for (const part of cmd.split(/&&|\|\||;/).map((s) => s.trim()).filter(Boolean)) {
    const [prog, ...args] = words(part);
    if (prog === 'npm') {
      if (args[0] === 'ci' || args[0] === 'test') continue;
      if (args[0] === 'run' && scripts[args[1]]) continue;
      problems.push(`\`${part}\`: npm ci, npm test or npm run <a script in package.json>`);
    } else if (prog === 'node' || prog === 'sh') {
      const pos = args.filter((x) => !x.startsWith('-'));
      const files = prog === 'node' && args.includes('--test') ? pos : pos.slice(0, 1);
      if (!files.length) problems.push(`\`${part}\`: names no file`);
      for (const f of files) if (!there(f)) problems.push(`\`${part}\`: ${f} is not in the repo and no task makes it`);
    } else if (prog === 'curl') {
      if (!args.some((x) => /^https:\/\//.test(x))) problems.push(`\`${part}\`: curl an https address`);
    } else problems.push(`\`${part}\`: a check runs npm, node, sh or curl`);
  }
  return problems;
}

// Every problem with a plan, as sentences; none means it passes.
export function check(dir, answers, { issues = null, pr = null, root = ROOT } = {}) {
  const p = [];
  const { design, plan, elo } = planFiles(dir);
  const template = JSON.parse(readFileSync(join(root, 'elo.template.json'), 'utf8'));
  const sells = answers.money !== 'free';

  if (!design) p.push('docs/design.md is missing');
  else {
    if (!/^# \S/.test(design)) p.push('design.md: starts with "# <the game\'s name>"');
    const secs = sections(design);
    for (const s of [...SECTIONS, ...(sells ? ['Money'] : [])]) if (!findSection(secs, s)) p.push(`design.md: no "## ${s}" section`);
    const kit = (findSection(secs, 'Kit') || '').match(/\bKit:\s*\**\s*(party|world)\b/i)?.[1]?.toLowerCase();
    if (!kit) p.push('design.md: the Kit section says "Kit: party" or "Kit: world"');
    else if (kit !== answers.kit) p.push(`design.md: Kit: ${kit}, but the answers point to the ${answers.kit} kit (${answers.why.join('; ')})`);
    const risks = (findSection(secs, 'Biggest risks') || '').split('\n').filter((l) => /^\d+\.\s+\S/.test(l)).length;
    if (risks !== 3) p.push(`design.md: three numbered risks, not ${risks}`);
  }

  let first = [];
  if (!plan) p.push('docs/plan.md is missing');
  else {
    if (!/^# \S/.test(plan)) p.push('plan.md: starts with "# <the game\'s name> — the plan"');
    const ms = [...sections(plan)].map(([head, text]) => ({ head, text, m: head.match(/^Milestone (\d+)\s*[·:—-]\s*(.+)$/) })).filter((x) => x.m);
    if (ms.length < 2) p.push('plan.md: at least two "## Milestone <n> · <title>" sections');
    ms.forEach((x, k) => { if (Number(x.m[1]) !== k + 1) p.push(`plan.md: milestones numbered 1, 2, 3…; "${x.head}" is ${k + 1}th`); });
    const tasks = ms.map((x) => x.text.split('\n').filter((l) => /^- \[ \] /.test(l)).map((l) => {
      const t = l.match(/^- \[ \] (.+?) — files: (.+?) — check: `([^`]+)`\s*$/);
      if (!t) { p.push(`plan.md: "${l.slice(0, 70)}…" is not "- [ ] <task> — files: \`a\`, \`b\` — check: \`<command>\`"`); return null; }
      const files = t[2].trim() === 'none' ? [] : [...t[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      return { text: t[1], files, check: t[3] };
    }).filter(Boolean));
    ms.forEach((x, k) => { if (!tasks[k].length) p.push(`plan.md: "${x.head}" has no tasks`); });
    const made = new Set(tasks.flat().flatMap((t) => t.files));
    for (const t of tasks.flat()) for (const q of commandProblems(t.check, { root, made })) p.push(`plan.md: "${t.text}": ${q}`);
    first = tasks[0] || [];
    if (first.length && first[0].check !== template.first_run) p.push(`plan.md: milestone 1's first task is the first run, checked by \`${template.first_run}\``);
    if (first.length > 6) p.push(`plan.md: milestone 1 has ${first.length} tasks; a weekend holds 6 at most`);
    if (sells && ms.length && !(/sell/i.test(ms.at(-1).head) && /wallet/i.test(ms.at(-1).text))) p.push('plan.md: it sells, so the last milestone is selling, and says when the wallet line goes in');
  }

  if (!elo) p.push('elo.json is missing');
  else {
    let e = null;
    try { e = JSON.parse(elo); } catch (err) { p.push(`elo.json: not JSON (${err.message})`); }
    if (e) {
      if (e.elo !== 1) p.push('elo.json: "elo": 1');
      if (!/^[a-z0-9][a-z0-9-]{1,39}[a-z0-9]$/.test(e.game || '') || e.game === 'fireplace') p.push(`elo.json: "game" is the game's own slug, not "${e.game}"`);
      if (!e.listing?.name || !e.listing?.blurb) p.push('elo.json: listing.name and listing.blurb');
      if ('wallet' in e) p.push('elo.json: no wallet line until the developer adds their own');
      if ('terms' in e) p.push('elo.json: no terms line; accepting the community terms is the developer\'s own commit');
      if (/AnthonE\/Fireplace/.test(JSON.stringify(e.jobs || []))) p.push('elo.json: jobs still name Fireplace\'s');
      if (sells && answers.price_cents && e.sell?.usd_cents !== answers.price_cents) p.push(`elo.json: "sell": {"usd_cents": ${answers.price_cents}}, the price asked`);
      if (!sells && e.sell) p.push('elo.json: a free game has no "sell"');
    }
  }

  if (issues !== null) {
    let list = null;
    try { list = JSON.parse(issues); } catch (err) { p.push(`issues.json: not JSON (${err.message})`); }
    if (list && !Array.isArray(list)) p.push('issues.json: a list of { title, body, check }');
    else if (list) {
      if (list.length !== first.length) p.push(`issues.json: one issue per milestone-1 task, ${first.length}, not ${list.length}`);
      list.forEach((x, k) => {
        if (!x.title || x.title.length > 80) p.push(`issues.json: issue ${k + 1} needs a title of 80 characters at most`);
        if (first[k] && x.check !== first[k].check) p.push(`issues.json: issue ${k + 1}'s check is its task's, \`${first[k].check}\``);
        if (!String(x.body || '').includes('@claude')) p.push(`issues.json: issue ${k + 1} says to comment @claude to have it built`);
        if (x.check && !String(x.body || '').includes(x.check)) p.push(`issues.json: issue ${k + 1}'s body shows its check`);
      });
    }
  }
  if (pr !== null) {
    if (pr.split('\n').length > 40) p.push('pr.md: 40 lines at most');
    if (!/@claude/.test(pr)) p.push('pr.md: says how to have Claude build a task (@claude on its issue)');
  }
  return p;
}

// ---- issues

export function openIssues(list, { plan, pr = '' }) {
  const urls = [];
  for (const x of list) {
    const body = `${x.body.trim()}\n\n---\nFrom the plan in #${plan}${pr ? ` (${pr})` : ''}.`;
    urls.push(execFileSync('gh', ['issue', 'create', '--title', x.title, '--body', body], { encoding: 'utf8' }).trim());
  }
  return urls;
}

// ---- evals

export function evals(dir = join(HERE, 'evals')) {
  const results = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const name = f.slice(0, -5);
    const e = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const problems = [];
    let a = null;
    try { a = readForm(e); } catch (err) { problems.push(`the form: ${err.message}`); }
    if (a) {
      if (e.expect?.kit && a.kit !== e.expect.kit) problems.push(`kit ${a.kit}, expected ${e.expect.kit}`);
      if (e.expect?.sells !== undefined && (a.money !== 'free') !== e.expect.sells) problems.push(`sells: ${a.money}, expected ${e.expect.sells}`);
      const out = join(dir, name);
      const read = (p) => (existsSync(join(out, p)) ? readFileSync(join(out, p), 'utf8') : null);
      problems.push(...check(out, a, { issues: read('issues.json') ?? '[]', pr: read('pr.md') ?? '' }));
    }
    results.push({ name, kit: a?.kit, problems });
  }
  return results;
}

// ---- the command line

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const [cmd, a1, a2] = argv;
  try {
    if (cmd === 'form') {
      const ev = JSON.parse(readFileSync(a1, 'utf8'));
      const answers = readForm(ev.issue ? { title: ev.issue.title, body: ev.issue.body, number: ev.issue.number } : ev);
      mkdirSync(dirname(resolve(a2)), { recursive: true });
      writeFileSync(a2, JSON.stringify(answers, null, 2) + '\n');
      console.log(`${answers.name} (${answers.slug}): the ${answers.kit} kit, because ${answers.why.join('; ')}`);
    } else if (cmd === 'check') {
      const answers = JSON.parse(readFileSync(opt('answers'), 'utf8'));
      const read = (p) => (p ? (existsSync(p) ? readFileSync(p, 'utf8') : '') : null);
      const problems = check(resolve(a1), answers, { issues: read(opt('issues')), pr: read(opt('pr')) });
      for (const q of problems) console.log(`- ${q}`);
      console.log(problems.length ? `the plan has ${problems.length} problem${problems.length > 1 ? 's' : ''}` : 'the plan passes its checks');
      process.exit(problems.length ? 1 : 0);
    } else if (cmd === 'issues') {
      const list = JSON.parse(readFileSync(a1, 'utf8'));
      for (const u of openIssues(list, { plan: opt('plan'), pr: opt('pr') })) console.log(u);
    } else if (cmd === 'evals') {
      const r = evals();
      for (const x of r) console.log(`${x.problems.length ? 'FAIL' : 'ok  '} ${x.name} (${x.kit} kit)${x.problems.map((q) => `\n       - ${q}`).join('')}`);
      const bad = r.filter((x) => x.problems.length).length;
      console.log(`${r.length - bad} of ${r.length} sample plans pass`);
      process.exit(bad ? 1 : 0);
    } else {
      console.log('node .github/elo/plan.mjs form|check|issues|evals (see the top of this file)');
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
