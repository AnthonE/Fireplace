// tools/board.mjs: the reference board. What is checked here is what a person
// relies on without looking: a board that is wrong says why, one shooter run
// serves every view it draws, the numbers are the same estimator on both
// sides, and the operator's marks are read back as they were written. The
// sheet itself (Chromium) is run by `node tools/board.mjs look`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as B from '../tools/board.mjs';

const view = (id, extra = {}) => ({ id, shoot: ['node', 'x.mjs'], png: `traces/${id}.png`, refs: [], ...extra });

test("Fireplace's own board is a valid board", () => {
  const b = B.readBoard('board/board.json');
  assert.ok(b.views.length >= 1);
  for (const v of b.views) assert.ok(v.what && v.take, `${v.id} says what it is and what it aims at`);
});

test('a board that is wrong says why', () => {
  assert.throws(() => B.checkBoard({ views: [] }), /no views/);
  assert.throws(() => B.checkBoard({ views: [view('a'), view('a')] }), /view a twice/);
  assert.throws(() => B.checkBoard({ views: [view('Bad Id')] }), /id of/);
  assert.throws(() => B.checkBoard({ views: [view('a', { shoot: 'node x.mjs' })] }), /array of strings/);
  assert.throws(() => B.checkBoard({ views: [view('a', { refs: [{ file: 'r.png' }] })] }), /what to take/);
  assert.throws(() => B.checkBoard({ views: [view('a', { refs: [{ file: 'r.png', take: 'light' }] })] }), /licence/,
    'a reference in the repo names its licence');
  assert.doesNotThrow(() => B.checkBoard({ views: [view('a', { refs: [{ file: 'r.png', take: 'light', private: true }] })] }),
    'a private one does not: only its name is in the repo');
});

test('views that share a shooter are shot by one run of it; a view list picks, and an unknown name is refused', () => {
  const b = { views: [view('a'), view('b'), view('c', { shoot: ['node', 'y.mjs'] })] };
  assert.deepEqual(B.groupShots(b.views).map((g) => g.views.map((v) => v.id)), [['a', 'b'], ['c']]);
  assert.deepEqual(B.pick(b, 'c,a').map((v) => v.id), ['a', 'c']);
  assert.throws(() => B.pick(b, 'a,zz'), /no view zz/);
});

test('luma by band and chroma, 0-255, one estimator', () => {
  // 4x4: the top row white, the bottom two rows pure red, the rest black
  const w = 4, h = 4, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    px.set(y === 0 ? [255, 255, 255, 255] : y >= 2 ? [255, 0, 0, 255] : [0, 0, 0, 255], i);
  }
  const m = B.measure(px, w, h);
  assert.equal(m.sky, 255, 'the sky band is the top quarter of rows');
  assert.equal(m.near, 76.2, 'the near band is the bottom 35%: here the two red rows, luma 0.299 x 255');
  assert.equal(m.luma, Math.round(((255 + 2 * 76.245) / 4) * 10) / 10);
  assert.equal(m.chroma, Math.round((2 * 255 / 4) * 10) / 10, 'chroma is max minus min channel; white and black have none');
});

test("now's distance from the references is from their median, and missing is null, never zero", () => {
  assert.equal(B.median([3, 1, 2]), 2);
  assert.equal(B.median([1, 2]), 1.5);
  assert.equal(B.median([]), null);
  const d = B.delta({ luma: 100, sky: 90, near: 80, chroma: 30 }, [{ luma: 120, sky: 100, near: 70, chroma: 20 }, { luma: 110, sky: 100, near: 90, chroma: 40 }]);
  assert.deepEqual(d, { luma: -15, sky: -10, near: 0, chroma: 0 });
  assert.deepEqual(B.delta({ luma: 1, sky: 1, near: 1, chroma: 1 }, []), { luma: null, sky: null, near: null, chroma: null });
});

test("the operator's marks: appended, read back, and the latest right or wrong is the verdict", () => {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  const f = join(dir, 'marks.jsonl');
  B.mark(f, 'couch', 'wrong', 'the fire outshines the TV', 'op', new Date('2026-11-03T01:00:00Z'));
  B.mark(f, 'couch', 'note', 'try a dimmer hearth', 'op', new Date('2026-11-03T02:00:00Z'));
  B.mark(f, 'looks', 'right', 'keep it', null, new Date('2026-11-03T03:00:00Z'));
  writeFileSync(f, readFileSync(f, 'utf8') + 'not json\n{"view":"x","verdict":"maybe"}\n');
  assert.throws(() => B.mark(f, 'couch', 'great', ''), /right, wrong, note/);
  const marks = B.readMarks(f);
  assert.equal(marks.length, 3, 'a line that is not a mark is skipped');
  const v = B.lastVerdicts(marks);
  assert.equal(v.couch.verdict, 'wrong', 'a note never changes the verdict');
  assert.equal(v.couch.notes[0].note, 'try a dimmer hearth');
  assert.equal(v.looks.verdict, 'right');
  const passes = ['20261103T003000Z', '20261103T013000Z', '20261103T033000Z'];
  const rows = B.statusRows({ views: [view('couch'), view('looks'), view('crowd')] }, marks, passes);
  assert.deepEqual(rows.map((r) => [r.view, r.verdict, r.passes_since]), [['couch', 'wrong', 2], ['looks', 'right', 1], ['crowd', null, 3]]);
});

test('a pass runs each shooter once, keeps what it wrote, and says which view it could not get', () => {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  mkdirSync(join(dir, 'board'));
  const writer = (names) => ['node', '-e', `const fs=require('fs');fs.mkdirSync('traces',{recursive:true});for(const n of ${JSON.stringify(names)})fs.writeFileSync('traces/'+n+'.png','png '+n)`];
  const board = { views: [view('a', { shoot: writer(['a', 'b']) }), view('b', { shoot: writer(['a', 'b']) }), view('c', { shoot: writer([]) }), view('d', { shoot: ['node', '-e', 'process.exit(3)'] })] };
  writeFileSync(join(dir, 'board', 'board.json'), JSON.stringify(board));
  const s = B.shoot(join(dir, 'board', 'board.json'), board, null);
  assert.equal(readFileSync(join(s.dir, 'a.png'), 'utf8'), 'png a');
  assert.equal(readFileSync(join(s.dir, 'b.png'), 'utf8'), 'png b');
  assert.deepEqual(s.failed, ['c', 'd']);
  assert.match(s.got.c.why, /was not written/);
  assert.match(s.got.d.why, /exited 3/);
  assert.ok(existsSync(join(s.dir, 'pass.json')));
  assert.deepEqual(B.listPasses(join(dir, 'board', 'passes')), [s.dir.split('/').pop()]);
});
