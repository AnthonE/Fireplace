// A MagicaVoxel file (.vox) read, with no Node in it: the models' voxels,
// the palette, the materials and the scene that places the models, from the
// format's own description (github.com/ephtracy/voxel-model, MIT). Used by
// tools/vox-map.mjs, the CLI (tools/vox.mjs) and the map editor.
//
// A file is "VOX " and a version, then chunks: four letters, the content's
// bytes, the children's bytes, the content, the children. MAIN's children
// are SIZE and XYZI for each model, the scene (nTRN a transform, nGRP a
// group, nSHP a shape: a model placed), RGBA the palette, MATL a colour's
// material, LAYR the layers, and others this skips (rOBJ, rCAM, NOTE, IMAP).

// The palette a file without RGBA has: by colour index, 1-215 the 6x6x6
// cube from white (black left out), then ramps of red, green, blue and grey,
// ee down to 11. Index 0 is empty.
export const DEFAULT_PALETTE = (() => {
  const p = new Uint8Array(256 * 4);
  const set = (i, r, g, b) => p.set([r, g, b, 255], 4 * i);
  for (let i = 1; i < 216; i++) { const k = i - 1; set(i, 255 - 51 * Math.floor(k / 36), 255 - 51 * (Math.floor(k / 6) % 6), 255 - 51 * (k % 6)); }
  const ramp = [0xee, 0xdd, 0xbb, 0xaa, 0x88, 0x77, 0x55, 0x44, 0x22, 0x11];
  ramp.forEach((v, k) => { set(216 + k, v, 0, 0); set(226 + k, 0, v, 0); set(236 + k, 0, 0, v); set(246 + k, v, v, v); });
  return p;
})();

// A rotation byte as a matrix, row-major: bits 0-1 the column of row 0's
// one, bits 2-3 row 1's, row 2's the column left; bits 4-6 their signs.
export function rotation(r) {
  const c0 = r & 3, c1 = (r >> 2) & 3, c2 = 3 - c0 - c1;
  const m = new Array(9).fill(0);
  if (c0 > 2 || c1 > 2 || c0 === c1) throw new Error(`a rotation that is not one (${r})`);
  [c0, c1, c2].forEach((c, i) => { m[3 * i + c] = (r >> (4 + i)) & 1 ? -1 : 1; });
  return m;
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// { version, models: [{ size: [x, y, z], voxels: Uint8Array (x, y, z,
// colour) 4 a voxel }], palette: Uint8Array RGBA by colour index, materials:
// Map colour -> { type: 'diffuse' | 'metal' | 'glass' | 'emit' | ..., ...the
// rest of its dict }, instances: [{ model, r (9, row-major), t: [x, y, z],
// name, layer }], scene (whether the file had one), notes }. z is up.
// A hidden node or layer's models are left out.
export function readVox(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (at) => String.fromCharCode(u8[at], u8[at + 1], u8[at + 2], u8[at + 3]);
  if (u8.length < 20 || tag(0) !== 'VOX ') throw new Error('not a MagicaVoxel file (no "VOX " at its start)');
  const version = dv.getInt32(4, true);
  if (tag(8) !== 'MAIN') throw new Error('a .vox file with no MAIN chunk');
  const end = Math.min(u8.length, 20 + dv.getInt32(12, true) + dv.getInt32(16, true));

  const models = [], nodes = new Map(), materials = new Map(), layers = new Map(), notes = [];
  let palette = null, size = null;
  for (let at = 20 + dv.getInt32(12, true); at + 12 <= end;) {
    const id = tag(at), n = dv.getInt32(at + 4, true), kids = dv.getInt32(at + 8, true);
    const c = at + 12;
    if (n < 0 || kids < 0 || c + n > end) throw new Error(`a ${id} chunk that runs past the file`);
    let p = c;
    const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
    const str = () => { const k = i32(); if (k < 0 || p + k > c + n) throw new Error(`a string past its ${id} chunk`); const s = new TextDecoder().decode(u8.subarray(p, p + k)); p += k; return s; };
    const dict = () => { const out = {}; for (let k = i32(); k > 0; k--) { const key = str(); out[key] = str(); } return out; };
    if (id === 'SIZE') size = [i32(), i32(), i32()];
    else if (id === 'XYZI') {
      const k = i32();
      if (!size) throw new Error('voxels (XYZI) before their model\'s SIZE');
      if (k < 0 || 4 * k > n - 4) throw new Error('an XYZI chunk with more voxels than bytes');
      models.push({ size, voxels: u8.slice(p, p + 4 * k) });
      size = null;
    } else if (id === 'RGBA') {
      palette = new Uint8Array(256 * 4);
      palette.set(u8.subarray(c, c + 255 * 4), 4); // colour i is the chunk's entry i - 1
    } else if (id === 'nTRN') {
      const node = i32(), attr = dict(), child = i32();
      i32(); // reserved
      const layer = i32(), frames = i32();
      const f = frames > 0 ? dict() : {};
      const t = (f._t || '0 0 0').split(/\s+/).map(Number);
      nodes.set(node, { kind: 'trn', attr, child, layer, r: f._r != null ? rotation(Number(f._r)) : IDENTITY, t });
    } else if (id === 'nGRP') {
      const node = i32(), attr = dict(), kids = [];
      for (let k = i32(); k > 0; k--) kids.push(i32());
      nodes.set(node, { kind: 'grp', attr, kids });
    } else if (id === 'nSHP') {
      const node = i32(), attr = dict(), k = i32();
      nodes.set(node, { kind: 'shp', attr, model: k > 0 ? i32() : -1 });
    } else if (id === 'MATL') {
      const k = i32(), d = dict();
      materials.set(k, { ...d, type: (d._type || '_diffuse').replace(/^_/, '') });
    } else if (id === 'LAYR') {
      const k = i32(), d = dict();
      layers.set(k, { name: d._name || '', hidden: d._hidden === '1' });
    }
    at = c + n + kids;
  }
  if (!models.length) throw new Error('a .vox file with no models in it');

  // the scene: from the root transform down, each shape's model placed by
  // the transforms over it, composed (outer * inner)
  const instances = [];
  const scene = nodes.has(0);
  if (scene) {
    const mul = (a, b) => { const m = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]; return m; };
    const apply = (r, v) => [0, 1, 2].map((i) => r[3 * i] * v[0] + r[3 * i + 1] * v[1] + r[3 * i + 2] * v[2]);
    const seen = new Set();
    const walk = (id, r, t, name, layer) => {
      const nd = nodes.get(id);
      if (!nd || seen.has(id)) return;
      seen.add(id);
      if (nd.kind === 'trn') {
        if (nd.attr._hidden === '1' || layers.get(nd.layer)?.hidden) return;
        const t2 = apply(r, nd.t).map((v, i) => v + t[i]);
        walk(nd.child, mul(r, nd.r), t2, nd.attr._name || name, nd.layer >= 0 ? nd.layer : layer);
      } else if (nd.kind === 'grp') for (const k of nd.kids) walk(k, r, t, name, layer);
      else if (nd.model >= 0 && nd.model < models.length) instances.push({ model: nd.model, r, t, name, layer });
    };
    walk(0, IDENTITY, [0, 0, 0], '', -1);
  } else {
    instances.push({ model: 0, r: IDENTITY, t: [0, 0, 0], name: '', layer: -1 });
    if (models.length > 1) notes.push(`${models.length} models and no scene to place them (an older file's animation frames): the first one`);
  }
  return { version, models, palette: palette || DEFAULT_PALETTE.slice(), defaultPalette: !palette, materials, layers, instances, scene, notes };
}

// Each instance's voxels where the scene puts them, whole numbers, z up:
// calls each(x, y, z, colour, instance index). A model turns about its
// middle (floor(size / 2)), as MagicaVoxel places it.
export function eachVoxel(vox, each) {
  vox.instances.forEach((ins, k) => {
    const { size, voxels } = vox.models[ins.model];
    const piv = size.map((v) => Math.floor(v / 2));
    const r = ins.r, t = ins.t;
    for (let i = 0; i < voxels.length; i += 4) {
      const a = voxels[i] - piv[0], b = voxels[i + 1] - piv[1], c = voxels[i + 2] - piv[2];
      each(r[0] * a + r[1] * b + r[2] * c + t[0], r[3] * a + r[4] * b + r[5] * c + t[1], r[6] * a + r[7] * b + r[8] * c + t[2], voxels[i + 3], k);
    }
  });
}

// A .vox file (version 200, as MagicaVoxel saves it) from { models: [{ size,
// voxels }], palette (RGBA by colour index; index 0 unused), instances:
// [{ model, r, t, name, hidden, layer }], materials (Map colour -> dict with
// _type), layers: [{ name, hidden }] }: the root transform, a group, and a
// transform and shape for each instance.
export function writeVox({ models, palette = DEFAULT_PALETTE, instances = null, materials = new Map(), layers = [] }) {
  const out = [];
  const bytes = (n) => { const b = new Uint8Array(n); out.push(b); return new DataView(b.buffer); };
  const i32s = (...v) => { const d = bytes(4 * v.length); v.forEach((x, k) => d.setInt32(4 * k, x, true)); };
  const enc = new TextEncoder();
  const content = (fn) => { const start = out.length; fn(); return out.splice(start); };
  const dictParts = (d) => { const e = Object.entries(d); return content(() => { i32s(e.length); for (const [k, v] of e) for (const s of [k, String(v)]) { const t = enc.encode(s); i32s(t.length); out.push(t); } }); };
  const size = (parts) => parts.reduce((n, p) => n + p.byteLength, 0);
  const chunks = [];
  const chunk = (id, parts) => { const head = new Uint8Array(12); head.set(enc.encode(id)); new DataView(head.buffer).setInt32(4, size(parts), true); chunks.push(head, ...parts); };
  const rbyte = (r) => {
    let b = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (r[3 * i + j]) { if (i < 2) b |= j << (2 * i); if (r[3 * i + j] < 0) b |= 1 << (4 + i); }
    return b;
  };
  for (const m of models) {
    chunk('SIZE', content(() => i32s(...m.size)));
    chunk('XYZI', content(() => { i32s(m.voxels.length / 4); out.push(Uint8Array.from(m.voxels)); }));
  }
  const ins = instances || models.map((_, k) => ({ model: k }));
  chunk('nTRN', content(() => { i32s(0); out.push(...dictParts({})); i32s(1, -1, -1, 1); out.push(...dictParts({})); }));
  chunk('nGRP', content(() => { i32s(1); out.push(...dictParts({})); i32s(ins.length, ...ins.map((_, k) => 2 + 2 * k)); }));
  ins.forEach((x, k) => {
    const attr = {};
    if (x.name) attr._name = x.name;
    if (x.hidden) attr._hidden = '1';
    const frame = { _t: (x.t || [0, 0, 0]).join(' ') };
    if (x.r) frame._r = rbyte(x.r);
    chunk('nTRN', content(() => { i32s(2 + 2 * k); out.push(...dictParts(attr)); i32s(3 + 2 * k, -1, x.layer ?? 0, 1); out.push(...dictParts(frame)); }));
    chunk('nSHP', content(() => { i32s(3 + 2 * k); out.push(...dictParts({})); i32s(1, x.model); out.push(...dictParts({})); }));
  });
  layers.forEach((l, k) => chunk('LAYR', content(() => { i32s(k); out.push(...dictParts({ _name: l.name || '', ...(l.hidden ? { _hidden: '1' } : {}) })); i32s(-1); })));
  chunk('RGBA', [palette.slice(4, 256 * 4), new Uint8Array(4)]);
  for (const [c, d] of materials) chunk('MATL', content(() => { i32s(c); out.push(...dictParts(d)); }));
  const body = size(chunks);
  const head = new Uint8Array(20);
  head.set(enc.encode('VOX '));
  const dv = new DataView(head.buffer);
  dv.setInt32(4, 200, true);
  head.set(enc.encode('MAIN'), 8);
  dv.setInt32(16, body, true);
  const file = new Uint8Array(20 + body);
  file.set(head);
  let at = 20;
  for (const p of chunks) { file.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at); at += p.byteLength; }
  return file;
}
