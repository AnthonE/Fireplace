// PNG in and out, for the maps (tools/map.mjs): no dependencies, zlib only.
// The codec is tools/png-codec.mjs, which a page can import too; this gives it
// Node's zlib. decodePng gives { width, height, channels, depth, data };
// encodePng writes 8- or 16-bit grey and 8-bit RGB, as a Buffer.
import { deflateSync, inflateSync } from 'node:zlib';
import { decode, encode } from './png-codec.mjs';

export const decodePng = (buf) => decode(buf, (z) => inflateSync(z));
export const encodePng = (img) => Buffer.from(encode(img, (raw) => deflateSync(raw, { level: 9 })));
