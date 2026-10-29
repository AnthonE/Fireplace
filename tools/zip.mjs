// A zip of files, stored (not compressed), with no Node in it: for the map
// editor to hand over a Roblox place's port brief (tools/rbx-brief.mjs) as
// one download. zip({ 'a/b.txt': 'text' or bytes }) gives the archive's bytes.
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let at = 0;
  for (const [name, data] of Object.entries(files)) {
    const body = typeof data === 'string' ? enc.encode(data) : data, nm = enc.encode(name), crc = crc32(body);
    // the local header, then the file; the central directory entry says where it is
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x800, true); // UTF-8 names
    head.setUint32(14, crc, true); head.setUint32(18, body.length, true); head.setUint32(22, body.length, true); head.setUint16(26, nm.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x800, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, body.length, true); dir.setUint32(24, body.length, true); dir.setUint16(28, nm.length, true); dir.setUint32(42, at, true);
    parts.push(new Uint8Array(head.buffer), nm, body);
    central.push(new Uint8Array(dir.buffer), nm);
    at += 30 + nm.length + body.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length / 2, true); end.setUint16(10, central.length / 2, true);
  end.setUint32(12, size, true); end.setUint32(16, at, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  all.reduce((o, p) => (out.set(p, o), o + p.length), 0);
  return out;
}
