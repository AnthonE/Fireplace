// "Plan my game" (.github/elo/): the issue form read into answers, the kit the
// answers point to, the rules a plan is checked against, and the prompt's
// eval, the five sample interviews and their sample plans. Offline: no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formFields, readForm, KEYS, pickKit, centsOf, check, commandProblems, evals } from '../.github/elo/plan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, '.github/elo/evals');

test('the form: every dropdown and checkbox has the keys the answers use, and the plan title', () => {
  const fields = formFields();
  for (const f of fields.filter((x) => x.type === 'dropdown' || x.type === 'checkboxes')) {
    assert.equal(f.options.length, KEYS[f.id]?.length, `${f.id}: ${f.options.length} options, ${KEYS[f.id]?.length} keys`);
  }
  assert.deepEqual(fields.map((f) => f.id), ['name', 'pitch', 'players', 'session', 'stakes', 'persist', 'secrets', 'where', 'agents', 'money', 'price', 'have', 'more']);
  assert.match(readFileSync(join(ROOT, '.github/ISSUE_TEMPLATE/plan.yml'), 'utf8'), /^title: "\[plan\] "$/m);
});

test('answers from an issue body, the kit they point to, and prices', () => {
  const e = JSON.parse(readFileSync(join(EVALS, 'marble-mayhem.json'), 'utf8'));
  const a = readForm(e);
  assert.equal(a.name, 'Marble Mayhem');
  assert.equal(a.slug, 'marble-mayhem');
  assert.equal(a.players, '2-4');
  assert.equal(a.money, 'copies');
  assert.equal(a.price_cents, 499);
  assert.deepEqual(a.have, ['art']);
  assert.equal(a.kit, 'party');
  assert.throws(() => readForm({ body: e.body.replace('### How many people play at once?\n\n2 to 4', '### How many people play at once?\n\n_No response_') }), /How many people/);
  assert.equal(pickKit({ ...a, secrets: 'yes' }).kit, 'world');
  assert.equal(pickKit({ ...a, players: '100+' }).kit, 'world');
  assert.equal(centsOf('$5'), 500);
  assert.equal(centsOf('4.9'), 490);
  assert.equal(centsOf('free'), null);
  assert.equal(readForm({ ...e, body: e.body.replace('Marble Mayhem', 'Fireplace') }).slug, 'my-fireplace');
});

test('check commands: only what can run here, and files the repo has or a task makes', () => {
  assert.deepEqual(commandProblems('npm ci && node tools/kit.mjs check'), []);
  assert.deepEqual(commandProblems('npm run build && node --test test/mg-zz.test.mjs', { made: new Set(['test/mg-zz.test.mjs']) }), []);
  assert.equal(commandProblems('node --test test/mg-zz.test.mjs').length, 1);
  assert.equal(commandProblems('npm run lint').length, 1);
  assert.equal(commandProblems('python3 x.py').length, 1);
  assert.equal(commandProblems('curl http://x').length, 1);
  assert.deepEqual(commandProblems('curl -fsS "https://elopros.com/api/store/repo-check?repo=a/b"'), []);
});

test('the five sample plans pass, and each sample interview points to the kit it should', () => {
  const r = evals();
  assert.equal(r.length, 5);
  for (const x of r) assert.deepEqual(x.problems, [], x.name);
  assert.deepEqual(r.map((x) => x.kit).sort(), ['party', 'party', 'party', 'world', 'world']);
});

test('a plan that breaks the rules is told which ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  try {
    cpSync(join(EVALS, 'snow-fort'), dir, { recursive: true });
    const a = readForm(JSON.parse(readFileSync(join(EVALS, 'snow-fort.json'), 'utf8')));
    const edit = (f, from, to) => writeFileSync(join(dir, f), readFileSync(join(dir, f), 'utf8').replace(from, to));
    edit('design.md', 'Kit: party', 'Kit: world');
    edit('design.md', '## Biggest risks', '## Risks');
    edit('plan.md', 'check: `npm ci && node tools/kit.mjs check`', 'check: `npm run setup`');
    edit('plan.md', '- [ ] Teach the bots to build, then throw — files: `client/mg/fort.mjs` — check: `node --test test/mg-fort.test.mjs`', '- [ ] Teach the bots');
    edit('elo.json', '"elo": 1,', '"elo": 1, "wallet": "0xabc", "terms": "2026-10-26",');
    const p = check(dir, a, { issues: '[]', pr: 'merge it' });
    const has = (re) => assert.ok(p.some((x) => re.test(x)), `${re} in:\n${p.join('\n')}`);
    has(/Kit: world, but the answers point to the party kit/);
    has(/no "## Biggest risks" section/);
    has(/npm run setup/);
    has(/first run, checked by `npm ci && node tools\/kit.mjs check`/);
    has(/"- \[ \] Teach the bots…" is not/);
    has(/no wallet line/);
    has(/no terms line/);
    has(/one issue per milestone-1 task, 5, not 0/);
    has(/pr.md: says how to have Claude/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the prompt, the workflow and the template agree on the first run and the Rust spot', () => {
  const prompt = readFileSync(join(ROOT, '.github/elo/plan-prompt.md'), 'utf8');
  const flow = readFileSync(join(ROOT, '.github/workflows/elo-plan.yml'), 'utf8');
  const tpl = JSON.parse(readFileSync(join(ROOT, 'elo.template.json'), 'utf8'));
  assert.match(prompt, /<!-- RUST MINIGAMES\./, 'a marked place for the Rust paragraph');
  assert.match(prompt, /node tools\/new-mg\.mjs/);
  assert.match(prompt, /node \.github\/elo\/plan\.mjs check \. --answers \.elo-plan\/answers\.json/);
  assert.match(flow, /anthropics\/claude-code-action@v\d+\.\d+\.\d+/, 'the action pinned to a release');
  assert.match(flow, /ANTHROPIC_API_KEY/);
  assert.match(flow, /CLAUDE_CODE_OAUTH_TOKEN/);
  assert.match(flow, /startsWith\(github\.event\.issue\.title, '\[plan\]'\)/);
  assert.ok(flow.includes(tpl.first_run), "the workflow runs the template's first_run");
});
