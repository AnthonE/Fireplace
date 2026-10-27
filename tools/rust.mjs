#!/usr/bin/env node
// Party minigames written in Rust. Each is a crate, rust/mg/<key>/, on the
// engine's bindings in rust/fp/; this builds it with cargo (no_std,
// wasm32-unknown-unknown) and turns the wasm into src/mg/<key>.wat, the
// minigame's WAT as the assembler takes any other's: its functions under the
// minigame's prefix, its calls to the engine linked to the engine's own
// functions. That file is checked in, so `npm run build` needs no Rust, and
// the build checks it (and the binary) as it checks every line of WAT.
//
//   node tools/rust.mjs [key...]          build each (all by default), write src/mg/<key>.wat
//   node tools/rust.mjs --check [key...]  build and compare with the checked-in file: CI's step
//   node tools/rust.mjs --gen             only write the Rust the crates include (gen/*.rs, from layout.mjs)
//
// A crate exports the nine hooks as `<prefix>_<hook>`, with the WAT's
// signatures, except spawn, `<prefix>_spawn(i, n, out: &mut [f32; 3])`, which
// the WAT's spawn calls with out at RS_OUT. What the sim can't have is
// refused here, by function: memory of its own (a static, a constant table:
// __data_end past __global_base, or a data segment), the stack (any global,
// __stack_pointer included), function pointers, memory.grow. The generated
// Rust is rust/fp/gen/layout.rs (every number of layout.mjs, PHYS and BPHYS)
// and rust/mg/<key>/gen/consts.rs (the minigame's src/mg/<key>.mjs): an
// integer as an i32, a fraction or a PHYS string as an f32. The Rust bakes
// those numbers in, so the WAT's head lists every one its source names, and
// test/rust.test.mjs fails when layout.mjs has moved one since.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { canonical } from './asm.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RUST = join(ROOT, 'rust');
const TARGET = 'wasm32-unknown-unknown';

// The hooks as the Rust exports them: [params, results].
export const HOOKS = {
  setup: [['i32'], []],
  spawn: [['i32', 'i32', 'i32'], []],
  start: [[], []],
  begin: [['i32', 'i32'], []],
  ground: [['i32', 'f32', 'f32', 'f32'], ['f32']],
  push: [['i32', 'i32'], []],
  tick: [[], []],
  over: [[], ['i32']],
  out: [['i32'], []],
};
const REQUIRED = ['setup', 'spawn', 'ground'];
// What a hook the crate leaves out does.
const DEFAULT_BODY = { start: '', begin: '', push: '', tick: '', out: '', over: ' (i32.const 0)' };
// Imports from "fp" that are one f32 instruction.
const OPS = {
  sqrt: ['f32.sqrt', ['f32'], ['f32']], floor: ['f32.floor', ['f32'], ['f32']], ceil: ['f32.ceil', ['f32'], ['f32']],
  trunc: ['f32.trunc', ['f32'], ['f32']], nearest: ['f32.nearest', ['f32'], ['f32']],
  fmin: ['f32.min', ['f32', 'f32'], ['f32']], fmax: ['f32.max', ['f32', 'f32'], ['f32']],
};

// ---- the Rust the crates include

// What @NAME sees in the WAT, less the minigames' own constants.
export function scopeOf(lay) {
  return { ...lay, ...lay.PHYS, ...(lay.BPHYS || {}) };
}

const FLOAT = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;
// One constant as Rust, or null for what isn't a number (lists, names, maps).
function rustConst(k, v) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(k)) return null;
  if (typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v < 2 ** 32) return `pub const ${k}: i32 = ${v >= 2 ** 31 ? v - 2 ** 32 : v};`;
  if (typeof v === 'number' && Number.isFinite(v)) return `pub const ${k}: f32 = ${String(v).includes('.') || /e/i.test(String(v)) ? String(v) : `${v}.0`}_f32;`;
  if (typeof v === 'string' && FLOAT.test(v)) return `pub const ${k}: f32 = ${v}_f32;`;
  return null;
}

export function rustConsts(obj, what) {
  const lines = [`// Written by node tools/rust.mjs from ${what}: don't edit.`, '#[allow(dead_code)]', 'mod consts {'];
  const body = [];
  for (const [k, v] of Object.entries(obj)) { const l = rustConst(k, v); if (l) body.push(`    ${l}`); }
  // a module, so one #[allow] covers them all; pub use brings them out
  return `${lines.join('\n')}\n${body.join('\n')}\n}\n#[allow(unused_imports)]\npub use consts::*;\n`;
}

function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}

export async function gen(keys, lay) {
  writeIfChanged(join(RUST, 'fp', 'gen', 'layout.rs'), rustConsts(scopeOf(lay), 'src/layout.mjs (its numbers, PHYS and BPHYS)'));
  for (const key of keys) {
    const own = await import(pathToFileURL(join(ROOT, 'src', 'mg', `${key}.mjs`)).href);
    writeIfChanged(join(RUST, 'mg', key, 'gen', 'consts.rs'), rustConsts(own, `src/mg/${key}.mjs`));
  }
}

// ---- the engine's functions a crate may call

// Every function in src/*.wat, by name: its params and results.
export function engineFuncs(src = join(ROOT, 'src')) {
  const out = new Map();
  for (const f of readdirSync(src)) {
    if (!f.endsWith('.wat')) continue;
    for (const line of readFileSync(join(src, f), 'utf8').split('\n')) {
      const m = line.match(/^\(func \$([\w.]+)((?:\s*\((?:export|param|result)[^()]*\))*)/);
      if (!m) continue;
      const params = [...m[2].matchAll(/\(param ([^)]*)\)/g)].flatMap((p) => p[1].trim().split(/\s+/).filter((w) => !w.startsWith('$')));
      const results = [...m[2].matchAll(/\(result ([^)]*)\)/g)].flatMap((p) => p[1].trim().split(/\s+/));
      out.set(m[1], { params, results, file: f });
    }
  }
  return out;
}

// ---- wasm to the minigame's WAT

function closeParen(s, i) {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"') { for (k++; k < s.length && s[k] !== '"'; k++) if (s[k] === '\\') k++; }
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k + 1;
  }
  throw new Error('unbalanced wasm text');
}

function fields(text) {
  const start = text.indexOf('(module');
  const end = closeParen(text, start);
  const inner = text.slice(start + '(module'.length, end - 1);
  const out = [];
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') { const j = closeParen(inner, i); out.push(inner.slice(i, j)); i = j - 1; }
  }
  return out;
}

const sig = (s) => ({
  params: [...s.matchAll(/\(param ([^)]*)\)/g)].flatMap((m) => m[1].trim().split(/\s+/)),
  results: [...s.matchAll(/\(result ([^)]*)\)/g)].flatMap((m) => m[1].trim().split(/\s+/)),
});
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const show = ({ params, results }) => `(${params.join(' ')}) -> (${results.join(' ')})`;
const typeText = ({ params, results }) => `${params.length ? ` (param ${params.join(' ')})` : ''}${results.length ? ` (result ${results.join(' ')})` : ''}`;

const BANNED = [
  [/^global\./, 'the stack (a local array, anything whose address is taken, or a tuple or struct handed back by a function not inlined: mark it #[inline(always)]), or a global'],
  [/^(call_indirect|return_call_indirect|table\.|ref\.|elem\.)/, 'a function pointer or a `dyn` call'],
  [/^return_call\b/, 'a tail call'],
  [/^memory\.(grow|size)\b/, 'memory.grow or memory.size: the memory is the engine\'s, 64 pages, never grown'],
  [/^(memory\.init|data\.drop)\b/, 'memory of its own (constant data)'],
  [/atomic/, 'an atomic'],
];

// The crate's wasm as the minigame's WAT, its functions $<prefix>_<hook> and
// $<prefix>__f<n>, its engine calls the engine's.
// The wasm less its custom sections (names, producers, target features):
// none of them is code, and wabt's reader trips on some rustc writes.
export function stripCustom(bin) {
  const out = [bin.subarray(0, 8)];
  let i = 8;
  while (i < bin.length) {
    const id = bin[i];
    let n = 0, shift = 0, j = i + 1;
    for (;;) { const b = bin[j++]; n |= (b & 0x7f) << shift; shift += 7; if (b < 0x80) break; }
    if (id !== 0) out.push(bin.subarray(i, j + n));
    i = j + n;
  }
  return new Uint8Array(Buffer.concat(out));
}

export async function convert(bin, { key, prefix, name, engine = engineFuncs(), rustc = '', against = [] }) {
  const text = await canonical(stripCustom(bin));
  const types = [], imports = [], funcs = [], globals = [], exports = new Map();
  for (const f of fields(text)) {
    const head = f.match(/^\((\w+)/)[1];
    if (head === 'type') types.push(sig(f));
    else if (head === 'import') {
      const m = f.match(/^\(import "([^"]*)" "([^"]*)" \(func \(;\d+;\) \(type (\d+)\)\)\)$/);
      if (!m) throw new Error(`${key}: an import the sim can't have: ${f}`);
      if (m[1] !== 'fp') throw new Error(`${key}: imports ${m[1]}.${m[2]}; only the engine's ("fp", through the fp crate) are there`);
      imports.push({ name: m[2], type: types[+m[3]] });
    } else if (head === 'func') {
      const nl = f.indexOf('\n');
      const header = nl < 0 ? f.slice(0, -1) : f.slice(0, nl);
      const m = header.match(/^\(func \(;(\d+);\) \(type (\d+)\)/);
      funcs.push({ index: +m[1], type: types[+m[2]], body: nl < 0 ? '' : f.slice(nl + 1, -1) });
    } else if (head === 'global') globals.push(f);
    else if (head === 'export') {
      const m = f.match(/^\(export "([^"]*)" \((func|global|memory|table) (\d+)\)\)$/);
      exports.set(m[1], { kind: m[2], index: +m[3] });
    } else if (head === 'data') throw new Error(`${key}: constant data in memory (a table, a string, a const array indexed at run time): ${f.slice(0, 80)}`);
    else if (head === 'elem' || head === 'start') throw new Error(`${key}: a ${head} section (function pointers, or a start function)`);
  }
  // __data_end past __global_base: a static, or bytes the wasm expects in memory
  const gval = (n) => {
    const e = exports.get(n);
    if (!e || e.kind !== 'global') throw new Error(`${key}: no ${n} export (rust/.cargo/config.toml asks the linker for it)`);
    return +globals[e.index].match(/\(i32\.const (-?\d+)\)/)[1];
  };
  const base = gval('__global_base'), dataEnd = gval('__data_end');
  if (dataEnd !== base) throw new Error(`${key}: ${dataEnd - base} B of statics or constant data at ${base}: a \`static\` (or a table) would live in the engine's memory; put state in PG_H, PG_S or PG_BIG`);

  const nimp = imports.length;
  const names = new Map();
  const hooks = new Map();
  for (const [n, e] of exports) {
    if (e.kind !== 'func') continue;
    const m = n.match(new RegExp(`^${prefix}_(\\w+)$`));
    if (!m || !(m[1] in HOOKS)) throw new Error(`${key}: exports ${n}; a minigame exports only its hooks, ${Object.keys(HOOKS).map((h) => `${prefix}_${h}`).join(', ')}`);
    const fn = funcs.find((f) => f.index === e.index);
    const want = { params: HOOKS[m[1]][0], results: HOOKS[m[1]][1] };
    if (!same(fn.type.params, want.params) || !same(fn.type.results, want.results)) throw new Error(`${key}: ${n} is ${show(fn.type)}, the hook is ${show(want)}`);
    names.set(e.index, m[1] === 'spawn' ? `$${prefix}__spawn` : `$${prefix}_${m[1]}`);
    hooks.set(m[1], e.index);
  }
  for (const h of REQUIRED) if (!hooks.has(h)) throw new Error(`${key}: no ${prefix}_${h}`);
  for (const f of funcs) if (!names.has(f.index)) names.set(f.index, `$${prefix}__f${f.index}`);

  // the engine's functions: a call by name, a packed pair, or an instruction
  const shims = [];
  const calls = imports.map(({ name: n, type }) => {
    if (OPS[n]) {
      const [op, params, results] = OPS[n];
      if (!same(type.params, params) || !same(type.results, results)) throw new Error(`${key}: fp.${n} is ${show(type)}, not ${show({ params, results })}`);
      return op;
    }
    const pk = n.endsWith('__pk');
    const base = pk ? n.slice(0, -4) : n;
    const e = engine.get(base);
    if (!e) throw new Error(`${key}: calls fp.${n}, and the engine has no $${base}`);
    if (!same(type.params, e.params)) throw new Error(`${key}: fp.${n} takes (${type.params}), $${base} (${e.params})`);
    if (!pk) {
      if (!same(type.results, e.results)) throw new Error(`${key}: fp.${n} returns (${type.results}), $${base} (${e.results})${e.results.length === 2 ? `: call it as fp.${base}__pk` : ''}`);
      return `call $${base}`;
    }
    if (e.results.length !== 2 || !e.results.every((r) => r === 'i32' || r === 'f32') || !same(type.results, ['i64'])) throw new Error(`${key}: fp.${n} packs two 32-bit results into an i64; $${base} returns (${e.results})`);
    const P = e.params.length;
    const word = (k) => `    local.get ${P + k}\n${e.results[k] === 'f32' ? '    i32.reinterpret_f32\n' : ''}    i64.extend_i32_u\n`;
    const sname = `$${prefix}__pk_${base}`;
    shims.push(`;; $${base}'s two results in one i64, the first in the low half\n(func ${sname}${typeText({ params: e.params, results: ['i64'] })}\n    (local ${e.results.join(' ')})\n`
      + e.params.map((_, k) => `    local.get ${k}\n`).join('') + `    call $${base}\n    local.set ${P + 1}\n    local.set ${P}\n`
      + word(0) + word(1) + '    i64.const 32\n    i64.shl\n    i64.or)\n');
    return `call ${sname}`;
  });

  const body = (f) => {
    const out = [];
    for (const raw of f.body.split('\n')) {
      let line = raw.replace(/\(;[^;]*;\)/g, '').replace(/;;.*$/, '').trimEnd();
      const t = line.trim();
      if (!t) continue;
      for (const [re, what] of BANNED) if (re.test(t)) throw new Error(`${key}: ${names.get(f.index)} uses ${what} (${t})`);
      let m;
      if ((m = t.match(/^call (\d+)$/))) {
        const n = +m[1];
        line = line.replace(t, n < nimp ? calls[n] : `call ${names.get(n)}`);
      } else if ((m = t.match(/^(block|loop|if) \(type (\d+)\)$/))) {
        line = line.replace(t, `${m[1]}${typeText(types[+m[2]])}`);
      } else if (/^select \(result \w+\)$/.test(t)) {
        line = line.replace(t, 'select');
      }
      out.push(line.replace(/^ {4}/, '  '));
    }
    return out.join('\n');
  };

  const lines = [
    `;; ${name} (MG_${key.toUpperCase()}, prefix ${prefix}), written in Rust: rust/mg/${key}/. This is`,
    `;; what it compiles to (${rustc || 'rustc'}, ${TARGET}), turned into the assembler's WAT by`,
    ';; node tools/rust.mjs: edit the Rust and run that, never this file. CI checks the two',
    ';; agree (node tools/rust.mjs --check). The numbers the Rust names, as it was built',
    ';; (test/rust.test.mjs fails when layout.mjs or the constants file has moved one):',
  ];
  for (let i = 0; i < against.length; i += 6) lines.push(`;;   ${against.slice(i, i + 6).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  lines.push('');
  lines.push(`;; spawn: the Rust writes x, y, z at RS_OUT (serial, per call).`);
  lines.push(`(func $${prefix}_spawn (param $i i32) (param $n i32) (result f32 f32 f32)`);
  lines.push(`  (call $${prefix}__spawn (local.get $i) (local.get $n) (i32.const @RS_OUT))`);
  lines.push('  (f32.load (i32.const @RS_OUT)) (f32.load (i32.const @(RS_OUT + 4))) (f32.load (i32.const @(RS_OUT + 8))))');
  for (const h of Object.keys(HOOKS)) {
    if (hooks.has(h)) continue;
    lines.push(`(func $${prefix}_${h}${typeText({ params: HOOKS[h][0], results: HOOKS[h][1] })}${DEFAULT_BODY[h]})`);
  }
  lines.push('');
  for (const f of funcs) {
    const b = body(f);
    lines.push(`(func ${names.get(f.index)}${typeText(f.type)}${b ? `\n${b}` : ''})`);
  }
  if (shims.length) lines.push('', ...shims.map((s) => s.trimEnd()));
  return `${lines.join('\n')}\n`;
}

// ---- the crates

export function rustKeys() {
  const dir = join(RUST, 'mg');
  return existsSync(dir) ? readdirSync(dir).filter((k) => existsSync(join(dir, k, 'Cargo.toml'))).sort() : [];
}

// The constants a crate's source names, with their values now: what its WAT was built against.
export async function against(key, lay) {
  const own = await import(pathToFileURL(join(ROOT, 'src', 'mg', `${key}.mjs`)).href);
  const scope = { ...scopeOf(lay), ...own };
  const srcs = [join(RUST, 'fp', 'src'), join(RUST, 'mg', key, 'src')];
  const named = new Set();
  for (const dir of srcs) {
    for (const f of readdirSync(dir, { recursive: true })) {
      if (!String(f).endsWith('.rs')) continue;
      const text = readFileSync(join(dir, String(f)), 'utf8').replace(/\/\/[^\n]*/g, '');
      for (const m of text.matchAll(/\b[A-Z][A-Z0-9_]+\b/g)) if (rustConst(m[0], scope[m[0]])) named.add(m[0]);
    }
  }
  return [...named].sort().map((k) => [k, String(scope[k])]);
}

// The names and values a generated WAT says it was built against.
export function builtAgainst(wat) {
  const out = [];
  for (const line of wat.split('\n')) {
    if (!line.startsWith(';;   ')) continue;
    for (const w of line.slice(5).trim().split(/\s+/)) { const i = w.indexOf('='); out.push([w.slice(0, i), w.slice(i + 1)]); }
  }
  return out;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: RUST, encoding: 'utf8' });
  if (r.error) throw new Error(`${cmd}: ${r.error.code === 'ENOENT' ? 'not found (Rust: https://rustup.rs, then rustup target add wasm32-unknown-unknown)' : r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

// Builds one crate and returns the WAT it makes.
export async function build(key, lay) {
  const m = lay.MINIGAMES.find((x) => x.key === key);
  if (!m) throw new Error(`rust/mg/${key}: no minigame called ${key} in layout.mjs's MINIGAMES`);
  await gen([key], lay);
  run('cargo', ['build', '--release', '--quiet', '-p', key]);
  const bin = readFileSync(join(RUST, 'target', TARGET, 'release', `${key}.wasm`));
  return convert(bin, { key, prefix: m.prefix, name: m.name, rustc: run('rustc', ['-V']).split(' (')[0], against: await against(key, lay) });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const only = args.includes('--gen');
  const lay = await import('../src/layout.mjs');
  const keys = args.filter((a) => !a.startsWith('--'));
  const all = keys.length ? keys : rustKeys();
  try {
    if (only) { await gen(all, lay); console.log(`wrote rust/fp/gen/layout.rs${all.map((k) => `, rust/mg/${k}/gen/consts.rs`).join('')}`); process.exit(0); }
    let bad = 0;
    for (const key of all) {
      const wat = await build(key, lay);
      const file = join(ROOT, 'src', 'mg', `${key}.wat`);
      const was = existsSync(file) ? readFileSync(file, 'utf8') : null;
      const n = wat.split('\n').filter((l) => l.startsWith('(func ')).length;
      if (check) {
        if (was === wat) console.log(`src/mg/${key}.wat is what rust/mg/${key} builds to (${n} functions)`);
        else { bad++; console.error(`src/mg/${key}.wat is not what rust/mg/${key} builds to: run node tools/rust.mjs ${key} and commit it${was ? '' : ' (there is none)'}`); }
      } else {
        writeIfChanged(file, wat);
        console.log(`${was === wat ? 'unchanged' : 'wrote'} src/mg/${key}.wat (${n} functions)`);
      }
    }
    if (bad) process.exit(1);
  } catch (e) { console.error(e.message); process.exit(1); }
}
