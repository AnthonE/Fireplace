// The assembler's half that needs no disk: the preprocessor (#include through
// a reader the caller gives, #if, comments, (!macros), @constants), the
// checks the determinism rules ask for, the prefixer Fireplace builds with,
// and wabt's text to binary. tools/asm.mjs runs it on the repo in Node; the
// studio (client/studio.html) runs it in the page on files it fetched and
// files being edited, so what the page builds is what npm run build builds.
// wabt is passed in: Node imports the package, a page evaluates its script.
import { dataSegment } from './map-compile.mjs';

export const FEATURES = {
  simd: true, threads: true, bulk_memory: true, mutable_globals: true,
  sat_float_to_int: true, sign_extension: true, multi_value: true,
};

// Paths are '/'-separated, as Node's are here and a page's URLs are.
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
export function joinPath(dir, rel) {
  const out = [];
  for (const part of `${dir}/${rel}`.split('/')) {
    if (part === '..' && out.length && out.at(-1) !== '..' && out.at(-1) !== '') out.pop();
    else if (part !== '.' && (part !== '' || !out.length)) out.push(part);
  }
  return out.join('/');
}

// file with its #includes spliced in, each read by read(path) (the path joined
// to the including file's directory)
export function includeWith(read, file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`include cycle at ${file}`);
  seen.add(file);
  const out = read(file).split('\n').map((line) => {
    const m = line.match(/^\s*#include\s+"([^"]+)"\s*$/);
    return m ? includeWith(read, joinPath(dirOf(file), m[1]), seen) : line;
  });
  seen.delete(file);
  return out.join('\n');
}
// the files text names in its #includes, as written: what a reader must hold
export function includesOf(text) {
  return [...text.matchAll(/^\s*#include\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);
}

export function conditionals(src, flags) {
  const out = [];
  const stack = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    let m;
    if ((m = t.match(/^#if\s+(!?)(\w+)$/))) {
      const on = Boolean(flags[m[2]]) !== (m[1] === '!');
      stack.push({ on, parent: stack.every((s) => s.on) });
    } else if (t === '#else') {
      const top = stack.at(-1);
      if (!top) throw new Error('#else without #if');
      top.on = !top.on;
    } else if (t === '#endif') {
      if (!stack.pop()) throw new Error('#endif without #if');
    } else if (stack.every((s) => s.on)) {
      out.push(line);
    } else {
      out.push('');
    }
  }
  if (stack.length) throw new Error('unterminated #if');
  return out.join('\n');
}

// Index just past the string literal that opens at src[i] === '"', honouring escapes.
function closeString(src, i) {
  for (let k = i + 1; k < src.length; k++) {
    if (src[k] === '\\') k++;
    else if (src[k] === '"') return k + 1;
  }
  throw new Error(`unterminated string at ${i}`);
}

export function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      const j = closeString(src, i);
      out += src.slice(i, j);
      i = j - 1;
    } else if (c === ';' && src[i + 1] === ';') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (c === '(' && src[i + 1] === ';') {
      // block comments nest in WAT
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === '(' && src[j + 1] === ';') { depth++; j++; }
        else if (src[j] === ';' && src[j + 1] === ')') { depth--; j++; if (depth === 0) break; }
      }
      if (depth !== 0) throw new Error('unterminated block comment');
      out += src.slice(i, j + 1).replace(/[^\n]/g, ' ');
      i = j;
    } else {
      out += c;
    }
  }
  return out;
}

// Index just past the s-expression that opens at src[i] === '('.
function closeParen(src, i) {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '"') k = closeString(src, k) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k + 1;
  }
  throw new Error(`unbalanced parens at ${i}: ${src.slice(i, i + 60)}`);
}

// Top-level whitespace split, keeping parenthesised groups whole.
export function splitArgs(s) {
  const args = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '(' || (s[i] === '@' && s[i + 1] === '(')) {
      const start = i;
      const j = closeParen(s, s[i] === '@' ? i + 1 : i);
      args.push(s.slice(start, j));
      i = j;
    } else {
      let j = i;
      while (j < s.length && !/[\s()]/.test(s[j])) j++;
      args.push(s.slice(i, j));
      i = j;
    }
  }
  return args;
}

export function expandMacros(src, macros, depth = 0) {
  if (depth > 64) throw new Error('macro expansion too deep');
  let out = '';
  let i = 0;
  let changed = false;
  while (i < src.length) {
    const k = src.indexOf('(!', i);
    if (k < 0) { out += src.slice(i); break; }
    out += src.slice(i, k);
    const end = closeParen(src, k);
    const [name, ...args] = splitArgs(src.slice(k + 2, end - 1));
    const fn = macros[name];
    if (!fn) throw new Error(`unknown macro !${name}`);
    out += fn(...args);
    i = end;
    changed = true;
  }
  return changed ? expandMacros(out, macros, depth + 1) : out;
}

export function constants(src, scope) {
  const keys = Object.keys(scope);
  const vals = keys.map((k) => scope[k]);
  const evaluate = (expr) => {
    const v = new Function(...keys, `return (${expr});`)(...vals);
    if (typeof v !== 'number' && typeof v !== 'string') throw new Error(`@(${expr}) is not a number`);
    return String(v);
  };
  let out = '';
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '@') { out += src[i]; continue; }
    if (src[i + 1] === '(') {
      const end = closeParen(src, i + 1);
      out += evaluate(src.slice(i + 2, end - 1));
      i = end - 1;
    } else {
      const m = src.slice(i + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!m) throw new Error(`bare @ at ${i}`);
      if (!(m[0] in scope)) throw new Error(`unknown constant @${m[0]}`);
      out += String(scope[m[0]]);
      i += m[0].length;
    }
  }
  return out;
}

export function forbid(wat, where = 'source') {
  const rules = [
    [/\bmemory\.grow\b/, 'memory.grow'],
    [/\brelaxed_/, 'relaxed SIMD'],
    [/\(\s*mut\b/, 'mutable global'],
  ];
  for (const [re, what] of rules) {
    const m = wat.match(re);
    if (m) throw new Error(`forbidden in the sim (${where}): ${what} (${m[0]})`);
  }
  // a segment with an offset (or a memory) before its bytes is active; a
  // passive one has only its name (or wabt's (;n;) index) before its string
  for (const m of wat.matchAll(/\(\s*data\b(?!\.)/g)) {
    const rest = wat.slice(m.index + m[0].length).replace(/^\s*(\$[^\s()"]+|\(;[^;]*;\))?\s*/, '');
    if (rest[0] !== '"' && rest[0] !== ')') throw new Error(`forbidden in the sim (${where}): active data segment (${wat.slice(m.index, m.index + 40)})`);
  }
}

// The sim's source as the assembler takes it: file read through read(), its
// conditionals, comments, macros and constants worked, the rules checked. The
// arena's map (map, from tools/map-compile.mjs's compileSpec) is the caller's.
export function expandWith(read, file, { DEBUG = false, ARENA = false, FLIGHT = false, BUMPER = false, PARTY = false, layout: lay, macros, map = null }) {
  if (ARENA && !map) throw new Error('the arena builds on a map: pass one');
  const scope = { ...lay, ...lay.PHYS, ...(lay.BPHYS || {}), ...(lay.MG_CONSTS || {}), ...(lay.AM_CONSTS || {}), ...(lay.FLIGHT_CONSTS || {}), DEBUG: DEBUG ? 1 : 0, ...(map ? map.consts : {}) };
  let src = includeWith(read, file);
  // the arena's mode is a layout constant, so #if FIESTA picks its rules at build time
  src = conditionals(src, { DEBUG, ARENA, FLIGHT: ARENA && FLIGHT, BUMPER, PARTY, FIESTA: ARENA && !!lay.FIESTA });
  src = stripComments(src);
  const m = macros({ DEBUG });
  if (map) m.mapdata = () => dataSegment(map.bytes);
  src = expandMacros(src, m);
  src = constants(src, scope);
  forbid(src);
  return src;
}

export async function assembleWith(wabt, wat, name = 'game.wat', { debugNames = false, check = true } = {}) {
  const mod = wabt.parseWat(name, wat, FEATURES);
  let bin;
  try {
    mod.resolveNames();
    mod.validate(FEATURES);
    bin = new Uint8Array(mod.toBinary({ log: false, write_debug_names: debugNames }).buffer);
  } finally {
    mod.destroy();
  }
  // The source check can be dodged by spelling; the binary can't. Disassemble
  // to wabt's canonical text and apply the same rules there.
  if (check) forbid(canonicalWith(wabt, bin), 'binary');
  return bin;
}

export function canonicalWith(wabt, bin) {
  const mod = wabt.readWasm(bin, { readDebugNames: false, ...FEATURES });
  try {
    return mod.toText({ foldExprs: false, inlineExport: false });
  } finally {
    mod.destroy();
  }
}

// One game's expanded module as part of another: its every $identifier
// (outside strings) under `prefix.`, its exports made internal (an anonymous
// exported function takes its export's name), its module head and memory
// import dropped, so several can share one module and one memory.
export function prefixed(wat, prefix) {
  const head = wat.match(/^\s*\(module\s*\(import "env" "mem" \(memory \d+ \d+ shared\)\)/);
  if (!head) throw new Error('not a sim module');
  const body = wat.slice(head[0].length, wat.lastIndexOf(')'));
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') { const j = closeString(body, i); out += body.slice(i, j); i = j - 1; }
    else if (c === '$' && /[A-Za-z0-9_]/.test(body[i + 1] || '')) out += `$${prefix}.`;
    else out += c;
  }
  const names = new Set([...out.matchAll(/\(func (\$[\w.]+)/g)].map((m) => m[1]));
  out = out.replace(/\(func \(export "(\w+)"\)/g, (_, e) => {
    const name = `$${prefix}.${e}`;
    if (names.has(name)) throw new Error(`${name} is taken`);
    return `(func ${name}`;
  });
  return out.replace(/\(func (\$[\w.]+) \(export "\w+"\)/g, '(func $1');
}
