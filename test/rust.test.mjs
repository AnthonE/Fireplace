// tools/rust.mjs: a Party minigame written in Rust becomes src/mg/<key>.wat.
// The checked-in WAT must be what its crate builds to (here when cargo and
// the wasm32 target are on this machine, and in CI's own step), built against
// the numbers layout.mjs has now; and the converter refuses, by name, what
// the sim can't have, on wasm made here the way rustc makes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import wabtInit from 'wabt';
import * as L from '../src/layout.mjs';
import { rustKeys, against, builtAgainst, build, convert, rustConsts, scopeOf, RUST } from '../tools/rust.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const wat = (key) => readFileSync(`${ROOT}src/mg/${key}.wat`, 'utf8');

test('every Rust minigame is in MINIGAMES, and its WAT was built against the numbers layout.mjs and its constants have now', async () => {
  const keys = rustKeys();
  assert.ok(keys.includes('sumo'));
  for (const key of keys) {
    assert.ok(L.MINIGAMES.some((m) => m.key === key), key);
    const was = builtAgainst(wat(key));
    assert.ok(was.length > 10, `${key}: ${was.length} numbers`);
    assert.deepEqual(was, await against(key, L), `${key}: a number its Rust names has moved since src/mg/${key}.wat was built: node tools/rust.mjs ${key}`);
  }
});

const cargo = spawnSync('cargo', ['--version'], { cwd: RUST }).status === 0
  && spawnSync('rustc', ['--print', 'target-libdir', '--target', 'wasm32-unknown-unknown'], { cwd: RUST, encoding: 'utf8' }).status === 0;
test('each checked-in WAT is what its crate builds to (with the rustc it names)', { skip: cargo ? false : 'no cargo with the wasm32-unknown-unknown target here' }, async (t) => {
  for (const key of rustKeys()) {
    const got = await build(key, L);
    const rustc = wat(key).match(/\((rustc [^,]+),/)?.[1];
    const here = got.match(/\((rustc [^,]+),/)?.[1];
    if (rustc !== here) { t.diagnostic(`${key}: built with ${rustc}, this is ${here}: not compared`); continue; }
    assert.equal(got, wat(key), `${key}: node tools/rust.mjs ${key}`);
  }
});

test('the generated Rust: an integer an i32, a fraction or a PHYS string an f32 written as the WAT sees it, the rest left out', () => {
  const rs = rustConsts({ A: 3, B: 0.55, C: '0.008', D: -1, E: 0xffffffff, F: [1, 2], G: 'canyon', lower: 1, H: 1e-7 }, 'x');
  assert.match(rs, /pub const A: i32 = 3;/);
  assert.match(rs, /pub const B: f32 = 0\.55_f32;/);
  assert.match(rs, /pub const C: f32 = 0\.008_f32;/);
  assert.match(rs, /pub const D: i32 = -1;/);
  assert.match(rs, /pub const E: i32 = -1;/);
  assert.match(rs, /pub const H: f32 = 1e-7_f32;/);
  assert.doesNotMatch(rs, /const (F|G|lower)\b/);
  const all = rustConsts(scopeOf(L), 'layout');
  assert.match(all, /pub const PLAT_Y: f32 = 40_f32;/);
  assert.match(all, new RegExp(`pub const PG_H: i32 = ${L.PG_H};`));
});

// A module as rustc lays one out: the "fp" imports, the hooks exported, the
// linker's globals and their exports.
async function wasmOf(body, { imports = '', globals = '', base = 1048576, end = 1048576, extra = '' } = {}) {
  const wabt = await wabtInit();
  const text = `(module
    ${imports}
    (memory 17)
    (global $__stack_pointer (mut i32) (i32.const 1048576))
    (global $end i32 (i32.const ${end}))
    (global $base i32 (i32.const ${base}))
    ${globals}
    (func $setup (export "zz_setup") (param i32) ${body})
    (func $spawn (export "zz_spawn") (param i32 i32 i32))
    (func $ground (export "zz_ground") (param i32 f32 f32 f32) (result f32) (f32.const 40))
    (export "__data_end" (global $end))
    (export "__global_base" (global $base))
    ${extra})`;
  const m = wabt.parseWat('t.wat', text, { mutable_globals: true, bulk_memory: true, reference_types: true });
  m.resolveNames();
  m.validate();
  const bin = new Uint8Array(m.toBinary({}).buffer);
  m.destroy();
  return bin;
}
const conv = (bin) => convert(bin, { key: 'zz', prefix: 'zz', name: 'ZZ' });

test('the converter: hooks under the prefix, the ones left out written, the engine\'s calls linked, a pair packed, an f32 import the instruction itself', async () => {
  const bin = await wasmOf(`(drop (call $pk (i32.const 5))) (drop (call $sq (f32.const 2))) (drop (call $r))`, {
    imports: `(import "fp" "sincos__pk" (func $pk (param i32) (result i64))) (import "fp" "sqrt" (func $sq (param f32) (result f32))) (import "fp" "rand" (func $r (result i32)))`,
  });
  const out = await conv(bin);
  for (const h of ['setup', 'spawn', 'start', 'begin', 'ground', 'push', 'tick', 'over', 'out']) assert.match(out, new RegExp(`^\\(func \\$zz_${h}\\b`, 'm'), h);
  assert.match(out, /\(func \$zz__spawn \(param i32 i32 i32\)\)/);
  assert.match(out, /\(func \$zz_over \(result i32\) \(i32\.const 0\)\)/);
  assert.match(out, /call \$zz__pk_sincos/);
  assert.match(out, /call \$sincos\n/);
  assert.match(out, /f32\.sqrt/);
  assert.match(out, /call \$rand\b/);
  assert.doesNotMatch(out, /global|\(mut|memory\.grow|\(data/);
});

test('the converter refuses, by name, what the sim can\'t have', async () => {
  const refuse = async (bin, want) => assert.rejects(conv(bin), (e) => e.message.includes(want), want);
  await refuse(await wasmOf('(global.set $__stack_pointer (i32.sub (global.get $__stack_pointer) (i32.const 16)))'), 'the stack');
  await refuse(await wasmOf('', { end: 1048580 }), 'statics or constant data');
  await refuse(await wasmOf('', { extra: '(data (i32.const 1048576) "abcd")' }), 'constant data in memory');
  await refuse(await wasmOf('(drop (memory.grow (i32.const 1)))'), 'memory.grow');
  await refuse(await wasmOf('(call_indirect (param i32) (local.get 0) (i32.const 0))', { extra: '(table 1 funcref) (elem (i32.const 0) $setup)' }), 'function pointer');
  await refuse(await wasmOf('', { imports: '(import "env" "abort" (func (param i32)))' }), 'only the engine\'s');
  await refuse(await wasmOf('(call $no (i32.const 1))', { imports: '(import "fp" "no_such_thing" (func $no (param i32)))' }), 'the engine has no $no_such_thing');
  await refuse(await wasmOf('(drop (call $h (f32.const 0) (f32.const 0) (f32.const 1)))', { imports: '(import "fp" "p_hex" (func $h (param f32 f32 f32) (result i32)))' }), 'call it as fp.p_hex__pk');
  await refuse(await wasmOf('', { extra: '(func (export "zz_push") (param i32))' }), 'zz_push is (i32)');
  await refuse(await wasmOf('', { extra: '(func (export "helper"))' }), 'exports only its hooks');
});
