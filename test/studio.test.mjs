// The studio (client/studio.html): party built in the page from fetched WAT
// with tools/asm-core.mjs. Here the same half runs on the repo's files, with a
// reader of its own as the page's is, and must make npm run build's bytes;
// the page itself is net/run-pages.mjs's to check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import wabtInit from 'wabt';
import * as L from '../src/layout.mjs';
import { makeMacros } from '../src/macros.mjs';
import { expandWith, assembleWith, includesOf, joinPath } from '../tools/asm-core.mjs';
import { expand, assemble } from '../tools/asm.mjs';

const ROOT = new URL('../', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('paths join as the page joins them, and an include list is what the file names', () => {
  assert.equal(joinPath('src', 'mg/thinice.wat'), 'src/mg/thinice.wat');
  assert.equal(joinPath('src/mg', '../party.wat'), 'src/party.wat');
  assert.equal(joinPath('/a/src', './x.wat'), '/a/src/x.wat');
  assert.deepEqual(includesOf('  #include "util.wat"\n;; #include "no.wat"\n#include "mg/a.wat"\n'), ['util.wat', 'mg/a.wat']);
});

test("party built by the page's half on relative paths is npm run build's party, and an edit is the page's to make", async () => {
  // relative paths from the root, as the page fetches them
  const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
  const wabt = await wabtInit();
  const bytes = await assembleWith(wabt, expandWith(read, 'src/game.wat', { BUMPER: true, PARTY: true, layout: L, macros: makeMacros }), 'game.wat');
  const npm = await assemble(expand('src/game.wat', { BUMPER: true, PARTY: true }));
  assert.equal(sha(bytes), sha(npm));
  assert.equal(sha(bytes), sha(readFileSync(new URL('build/party/game.wasm', ROOT))), 'build/party/game.wasm, as npm run build left it');
  // the minigame's file read from the edit, its constants from the edit's
  const edited = (p) => (p === 'src/mg/sweep.wat' ? read(p).replace('(func $sw_', '(func $sw_unused (result i32) (i32.const @SW_STUDIO))\n(func $sw_') : read(p));
  assert.throws(() => expandWith(edited, 'src/game.wat', { BUMPER: true, PARTY: true, layout: L, macros: makeMacros }), /unknown constant @SW_STUDIO/);
  const layout = { ...L, MG_CONSTS: { ...L.MG_CONSTS, SW_STUDIO: 7 } };
  const changed = await assembleWith(wabt, expandWith(edited, 'src/game.wat', { BUMPER: true, PARTY: true, layout, macros: makeMacros }), 'game.wat');
  assert.notEqual(sha(changed), sha(bytes));
});
