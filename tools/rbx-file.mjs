// A Roblox place or model file read into its instances, with no Node in it:
// tools/roblox.mjs runs it on a file for the build, and the map editor
// (client/map-editor.mjs) on one dropped into the page. Both of Roblox
// Studio's formats: binary (.rbxl, .rbxm) and XML (.rbxlx, .rbxmx). The
// binary layout is rbx-dom's unofficial spec (github.com/rojo-rbx/rbx-dom,
// docs/binary.md); terrain's SmoothGrid is the draft in its pull request 444.
//
// readRoblox(bytes, { zstd }) gives { instances, roots, meta }: each instance
// { ref, class, name, props, parent, children }, props under their
// serialized names (Part's size is "size", its colour "Color3uint8") as
//   Vector3 [x, y, z]; CFrame { p: [x, y, z], r: [r00, r01, ... r22] }
//   (rows: r[0..2] the first row, so the part's own x axis is r[0], r[3], r[6]);
//   Color3 [r, g, b] in 0..1; Color3uint8 [r, g, b] in 0..255; enums and
//   BrickColors numbers; Ref the instance or null; strings strings, except
//   BINARY's, which stay bytes.
// A chunk compressed with zstd needs `zstd` (bytes in, bytes out): Node's
// zlib.zstdDecompressSync, which tools/roblox.mjs passes. LZ4 is decoded here.

// String properties that hold bytes, not text
export const BINARY = new Set(['SmoothGrid', 'PhysicsGrid', 'MaterialColors', 'AttributesSerialize', 'Tags', 'PhysicalConfigData',
  'MeshData', 'ChildData', 'ChildData2', 'MeshData2', 'PhysicsData', 'InitialSize', 'ModelMeshData', 'LevelOfDetail']);

const utf8 = new TextDecoder('utf-8');

export function readRoblox(bytes, opts = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = String.fromCharCode(...b.subarray(0, 8));
  if (head === '<roblox!') return readBinary(b, opts);
  const text = utf8.decode(b);
  if (/^\s*(<\?xml[^>]*>\s*)?<roblox[\s>]/.test(text)) return readXml(text);
  throw new Error('not a Roblox file: save the place from Studio (File, Save to File As) as .rbxl or .rbxlx');
}

// ---- the binary format

// An LZ4 block (no frame), as Roblox writes a compressed chunk.
export function lz4(src, size) {
  const out = new Uint8Array(size);
  let i = 0, o = 0;
  while (i < src.length) {
    const tok = src[i++];
    let n = tok >> 4;
    if (n === 15) { let c; do { c = src[i++]; n += c; } while (c === 255); }
    out.set(src.subarray(i, i + n), o);
    i += n; o += n;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);
    i += 2;
    let m = tok & 15;
    if (m === 15) { let c; do { c = src[i++]; m += c; } while (c === 255); }
    m += 4;
    if (!off || off > o) throw new Error('a broken LZ4 chunk');
    for (let k = 0; k < m; k++) out[o + k] = out[o - off + k];
    o += m;
  }
  if (o !== size) throw new Error(`an LZ4 chunk came to ${o} B, not ${size}`);
  return out;
}

// A cursor over a chunk's bytes.
class Reader {
  constructor(b) { this.b = b; this.i = 0; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  get left() { return this.b.length - this.i; }
  u8() { return this.b[this.i++]; }
  u32() { const v = this.dv.getUint32(this.i, true); this.i += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.i, true); this.i += 4; return v; }
  bytes(n) { if (n > this.left) throw new Error('a chunk ends early'); const v = this.b.subarray(this.i, this.i + n); this.i += n; return v; }
  string() { return utf8.decode(this.bytes(this.u32())); }
  // n values of w bytes each, stored a byte column at a time: back to rows, big-endian per value
  interleaved(n, w) {
    const src = this.bytes(n * w), out = new Uint8Array(n * w);
    for (let k = 0; k < n; k++) for (let j = 0; j < w; j++) out[k * w + j] = src[j * n + k];
    return new DataView(out.buffer);
  }
  i32s(n) { const d = this.interleaved(n, 4); return Array.from({ length: n }, (_, k) => untransform(d.getUint32(4 * k))); }
  u32s(n) { const d = this.interleaved(n, 4); return Array.from({ length: n }, (_, k) => d.getUint32(4 * k)); }
  // Roblox's floats: big-endian, the sign bit moved to the bottom
  floats(n) {
    const d = this.interleaved(n, 4), f = new DataView(new ArrayBuffer(4));
    return Array.from({ length: n }, (_, k) => { const v = d.getUint32(4 * k); f.setUint32(0, (v >>> 1) | (v << 31)); return f.getFloat32(0); });
  }
  refs(n) { let at = 0; return this.i32s(n).map((v) => (at += v)); }
}
const untransform = (v) => (v >>> 1) ^ -(v & 1);

// The 24 rotations a binary CFrame names by one byte: the id is 6 x + y + 1
// for the part's own x and y axes' directions (0 +X, 1 +Y, 2 +Z, 3 -X, 4 -Y, 5 -Z).
const NORMAL = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
export function basicRotation(id) {
  const x = NORMAL[Math.floor((id - 1) / 6)], y = NORMAL[(id - 1) % 6];
  if (!x || !y) throw new Error(`no basic rotation ${id}`);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

function readBinary(b, { zstd } = {}) {
  if (b.length < 32 || b[8] !== 0x89 || b[9] !== 0xff) throw new Error('a damaged Roblox file (its header is wrong)');
  const hv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const nInst = hv.getInt32(20, true);
  const classes = new Map(), byRef = new Map(), meta = {};
  let shared = [];
  let i = 32;
  for (;;) {
    if (i + 16 > b.length) throw new Error('a Roblox file that ends early (no END chunk)');
    const name = String.fromCharCode(...b.subarray(i, i + 4)).replace(/\0+$/, '');
    const clen = hv.getUint32(i + 4, true), ulen = hv.getUint32(i + 8, true);
    i += 16;
    let data;
    if (!clen) { data = b.subarray(i, i + ulen); i += ulen; }
    else {
      const z = b.subarray(i, i + clen);
      i += clen;
      if (z[0] === 0x28 && z[1] === 0xb5 && z[2] === 0x2f && z[3] === 0xfd) {
        if (!zstd) throw new Error('this file has zstd chunks: open it with tools/roblox.mjs, or save it from Studio again');
        data = new Uint8Array(zstd(z));
      } else data = lz4(z, ulen);
    }
    if (name === 'END') break;
    const r = new Reader(data);
    if (name === 'META') { for (let n = r.u32(); n--;) meta[r.string()] = r.string(); }
    else if (name === 'SSTR') { r.u32(); shared = Array.from({ length: r.u32() }, () => (r.bytes(16), r.bytes(r.u32()))); }
    else if (name === 'INST') {
      const id = r.u32(), cls = r.string(), service = r.u8(), n = r.u32();
      const refs = r.refs(n);
      const list = refs.map((ref) => {
        const inst = { ref, class: cls, name: '', props: {}, parent: null, children: [] };
        byRef.set(ref, inst);
        return inst;
      });
      classes.set(id, { cls, list, service });
    } else if (name === 'PROP') {
      const c = classes.get(r.u32());
      const prop = r.string(), type = r.u8();
      if (!c) continue;
      let vals;
      try { vals = readValues(r, type, c.list.length, prop, shared); } catch { vals = null; } // a type we don't read, or a malformed one: skip the property
      if (vals) c.list.forEach((inst, k) => { inst.props[prop] = vals[k]; });
    } else if (name === 'PRNT') {
      r.u8();
      const n = r.u32(), kids = r.refs(n), parents = r.refs(n);
      kids.forEach((k, j) => { const inst = byRef.get(k); if (inst) inst.parent = byRef.get(parents[j]) || null; });
    }
  }
  // refs to instances, names out of props, children in file order
  const instances = [...byRef.values()];
  for (const inst of instances) {
    if (typeof inst.props.Name === 'string') inst.name = inst.props.Name;
    for (const [k, v] of Object.entries(inst.props)) if (v && v.ref !== undefined) inst.props[k] = byRef.get(v.ref) || null;
  }
  return link(instances, meta, nInst);
}

function readValues(r, type, n, prop, shared) {
  switch (type) {
    case 0x01: return Array.from({ length: n }, () => (BINARY.has(prop) ? r.bytes(r.u32()).slice() : r.string()));
    case 0x02: return Array.from(r.bytes(n), (v) => v !== 0);
    case 0x03: return r.i32s(n);
    case 0x04: return r.floats(n);
    case 0x05: return Array.from({ length: n }, () => { const v = r.dv.getFloat64(r.i, true); r.i += 8; return v; });
    case 0x0b: case 0x12: return r.u32s(n);
    case 0x0c: case 0x0e: { const x = r.floats(n), y = r.floats(n), z = r.floats(n); return x.map((v, k) => [v, y[k], z[k]]); }
    case 0x10: {
      const rots = Array.from({ length: n }, () => {
        const id = r.u8();
        return id ? basicRotation(id) : Array.from({ length: 9 }, () => r.f32());
      });
      const x = r.floats(n), y = r.floats(n), z = r.floats(n);
      return rots.map((rot, k) => ({ p: [x[k], y[k], z[k]], r: rot }));
    }
    case 0x13: return r.refs(n).map((ref) => (ref === -1 ? null : { ref }));
    case 0x1a: { const R = r.bytes(n), G = r.bytes(n), B = r.bytes(n); return Array.from(R, (v, k) => [v, G[k], B[k]]); }
    case 0x1b: {
      const d = r.interleaved(n, 8);
      return Array.from({ length: n }, (_, k) => { const v = d.getBigUint64(8 * k); return Number((v >> 1n) ^ -(v & 1n)); });
    }
    case 0x1c: return r.u32s(n).map((k) => shared[k]);
    default: return null;
  }
}

// ---- the XML format

// The elements of an XML document as { tag, attrs, kids, text }: enough of
// XML for what Studio writes (no DTDs, entities only the five and numeric).
export function parseXml(s) {
  const root = { tag: '', attrs: {}, kids: [], text: '' }, stack = [root];
  const ent = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()];
  });
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) { top.text += ent(s.slice(i)); break; }
    if (lt > i) top.text += ent(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { i = s.indexOf('-->', lt) + 3; if (i < 3) break; continue; }
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt); top.text += s.slice(lt + 9, e); i = e + 3; continue; }
    if (s[lt + 1] === '?' || s[lt + 1] === '!') { i = s.indexOf('>', lt) + 1; continue; }
    const gt = s.indexOf('>', lt);
    if (gt < 0) throw new Error('XML that ends inside a tag');
    if (s[lt + 1] === '/') { if (stack.length > 1) stack.pop(); i = gt + 1; continue; }
    const body = s.slice(lt + 1, s[gt - 1] === '/' ? gt - 1 : gt);
    const tag = body.match(/^[^\s/>]+/)[0];
    const attrs = {};
    for (const m of body.slice(tag.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1]] = ent(m[3] ?? m[4]);
    const el = { tag, attrs, kids: [], text: '' };
    top.kids.push(el);
    if (s[gt - 1] !== '/') stack.push(el);
    i = gt + 1;
  }
  return root;
}

const kid = (el, tag) => el.kids.find((k) => k.tag === tag);
const num = (t) => { const v = t.trim(); return v === 'INF' ? Infinity : v === '-INF' ? -Infinity : v === 'NAN' ? NaN : Number(v); };
const b64 = (t) => {
  const s = t.replace(/\s+/g, '');
  if (typeof atob === 'function') return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new Uint8Array(globalThis.Buffer.from(s, 'base64'));
};

function readXml(text) {
  const doc = parseXml(text);
  const top = doc.kids.find((k) => k.tag === 'roblox') || doc;
  const shared = {};
  for (const ss of (kid(top, 'SharedStrings') || { kids: [] }).kids) shared[ss.attrs.md5 ?? ss.attrs.key] = b64(ss.text);
  const byRef = new Map(), instances = [], refProps = [];
  const walk = (el, parent) => {
    const inst = { ref: el.attrs.referent, class: el.attrs.class, name: '', props: {}, parent, children: [] };
    instances.push(inst);
    if (inst.ref) byRef.set(inst.ref, inst);
    for (const p of (kid(el, 'Properties') || { kids: [] }).kids) {
      const v = xmlValue(p, shared);
      if (v === undefined) continue;
      if (p.tag === 'Ref') refProps.push([inst, p.attrs.name, v]);
      else inst.props[p.attrs.name] = v;
    }
    if (typeof inst.props.Name === 'string') inst.name = inst.props.Name;
    for (const k of el.kids) if (k.tag === 'Item') walk(k, inst);
  };
  for (const k of top.kids) if (k.tag === 'Item') walk(k, null);
  for (const [inst, name, ref] of refProps) inst.props[name] = ref === 'null' ? null : byRef.get(ref) || null;
  const meta = {};
  for (const m of top.kids) if (m.tag === 'Meta') meta[m.attrs.name] = m.text;
  return link(instances, meta, instances.length);
}

function xmlValue(p, shared) {
  const t = p.text, name = p.attrs.name;
  const f = (tag) => num(kid(p, tag)?.text ?? '0');
  switch (p.tag) {
    case 'string': case 'ProtectedString': return t;
    case 'BinaryString': return BINARY.has(name) ? b64(t) : t;
    case 'Content': { const u = kid(p, 'url') || kid(p, 'uri'); return u ? u.text : ''; }
    case 'bool': return t.trim() === 'true';
    case 'int': case 'int64': case 'float': case 'double': case 'token': case 'BrickColor': return num(t);
    case 'Vector3': return [f('X'), f('Y'), f('Z')];
    case 'CoordinateFrame': case 'CFrame':
      return { p: [f('X'), f('Y'), f('Z')], r: ['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'].map(f) };
    case 'Color3':
      if (!p.kids.length) { const v = num(t); return [(v >>> 16) & 255, (v >>> 8) & 255, v & 255].map((c) => c / 255); }
      return [f('R'), f('G'), f('B')];
    case 'Color3uint8': { const v = num(t); return [(v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }
    case 'Ref': return t.trim();
    case 'SharedString': return shared[t.trim()];
    default: return undefined;
  }
}

// Parents' children lists and the roots.
function link(instances, meta, declared) {
  for (const inst of instances) if (inst.parent) inst.parent.children.push(inst);
  return { instances, roots: instances.filter((x) => !x.parent), meta, declared };
}

// An instance's path from the root, for what a report names: Workspace.Map.Tower.Part
export const path = (inst) => { const out = []; for (let x = inst; x; x = x.parent) out.unshift(x.name || x.class); return out.join('.'); };

// The first ancestor (or the instance) of class `cls`, or null.
export function ancestor(inst, cls) {
  for (let x = inst; x; x = x.parent) if (x.class === cls) return x;
  return null;
}
