// The HUD's rounder font: each of the 3x5 font's 64 characters drawn again,
// bold and smooth with a dark outline, from the system's own sans (a rounded
// one where there is one), into an atlas at startup. It rides in the
// renderers' font buffer after the 64 pixel glyphs, so no renderer needs a new
// binding: font[64] and font[65] are a glyph's width and height in texels (0:
// no atlas, the pixel font), then a texel a word, its fill in the low byte and
// its outline in the next, glyph by glyph. The text grid stays the pixel
// font's (a character 4 x 6 HUD pixels), so every layout is what it was; a
// glyph fills its whole cell. ?font=pixel keeps the 3x5 font.
import { FONT } from './font.mjs';

export const GW = 24, GH = 36; // a glyph's texels: a cell's 4 x 6, six to the HUD pixel
const FAMILY = '"Arial Rounded MT Bold", "Nunito Black", "Nunito", "Varela Round", ui-rounded, "Segoe UI", "Helvetica Neue", Arial, "DejaVu Sans", system-ui, sans-serif';

// The font buffer: the pixel glyphs, then (round, in a page) the atlas.
export function fontData({ round = true } = {}) {
  const atlas = round && typeof OffscreenCanvas !== 'undefined' ? drawAtlas() : null;
  const out = new Uint32Array(64 + 2 + (atlas ? atlas.length : 0));
  out.set(FONT);
  if (atlas) { out[64] = GW; out[65] = GH; out.set(atlas, 66); }
  return out;
}
// ?font=pixel on the page keeps the old one
export const roundWanted = () => { try { return new URLSearchParams(location.search).get('font') !== 'pixel'; } catch { return true; } };

// Text on a 2D canvas in the same font on the same grid (the TV's cards,
// client/room-render.mjs cardText): a character px * 4 wide and px * 6 tall,
// its top at y.
export function drawGlyphs(g, s, x, y, px, color) {
  const size = Math.round(6 * px * 1.02);
  g.save();
  g.font = `900 ${size}px ${FAMILY}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, px * 0.9);
  g.strokeStyle = 'rgba(8, 8, 12, 0.9)';
  g.fillStyle = color;
  const base = y + 3 * px + size * 0.36;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') continue;
    const sx = Math.min(0.92, (4 * px * 0.9) / Math.max(1, g.measureText(ch).width));
    g.save();
    g.translate(x + i * 4 * px + 2 * px, base);
    g.scale(sx, 1);
    g.strokeText(ch, 0, 0);
    g.fillText(ch, 0, 0);
    g.restore();
  }
  g.restore();
}

function drawAtlas() {
  const n = 64;
  const fill = new OffscreenCanvas(GW * n, GH), line = new OffscreenCanvas(GW * n, GH);
  const f = fill.getContext('2d', { willReadFrequently: true }), l = line.getContext('2d', { willReadFrequently: true });
  const size = Math.round(GH * 1.02); // capitals most of the cell's height, as the 3x5 font's are
  for (const g of [f, l]) {
    g.font = `900 ${size}px ${FAMILY}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
  }
  l.lineWidth = Math.max(3, GH * 0.15);
  const base = GH * 0.5 + size * 0.36; // the capitals centred in the cell
  for (let k = 1; k < n; k++) {
    const ch = String.fromCharCode(32 + k);
    const w = f.measureText(ch).width;
    const sx = Math.min(0.92, (GW * 0.9) / Math.max(1, w)); // condensed, a wide letter squeezed into its cell
    for (const [g, stroke] of [[f, false], [l, true]]) {
      g.save();
      g.translate(k * GW + GW / 2, base);
      g.scale(sx, 1);
      if (stroke) g.strokeText(ch, 0, 0);
      g.fillText(ch, 0, 0);
      g.restore();
    }
  }
  const a = f.getImageData(0, 0, GW * n, GH).data, b = l.getImageData(0, 0, GW * n, GH).data;
  const out = new Uint32Array(n * GW * GH);
  for (let k = 0; k < n; k++) for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = (y * GW * n + k * GW + x) * 4;
    out[(k * GH + y) * GW + x] = a[i + 3] | (b[i + 3] << 8);
  }
  return out;
}

// The WGSL a renderer's HUD declares beside its own `hud`, `font` and PALETTE:
// the text at hp (HUD pixels from the text block's corner, fractional) in the
// rounder font, its colour and alpha, or alpha 0 for none (and for every pixel
// when the buffer holds no atlas: the renderer draws the pixel font then).
export const HUD_FONT_WGSL = /* wgsl */ `
fn atlasTexel(g: u32, x: i32, y: i32) -> vec2f {
  let gw = i32(font[64u]);
  let gh = i32(font[65u]);
  let t = font[66u + (g * u32(gh) + u32(clamp(y, 0, gh - 1))) * u32(gw) + u32(clamp(x, 0, gw - 1))];
  return vec2f(f32(t & 255u), f32((t >> 8u) & 255u)) / 255.0;
}
// glyph g's fill and outline at uv (0..1 across its cell), bilinear
fn glyphSample(g: u32, uv: vec2f) -> vec2f {
  let st = uv * vec2f(f32(font[64u]), f32(font[65u])) - 0.5;
  let i = vec2i(floor(st));
  let fr = st - floor(st);
  return mix(mix(atlasTexel(g, i.x, i.y), atlasTexel(g, i.x + 1, i.y), fr.x),
             mix(atlasTexel(g, i.x, i.y + 1), atlasTexel(g, i.x + 1, i.y + 1), fr.x), fr.y);
}
// a sample as colour k over its dark outline
fn glyphColor(s: vec2f, k: u32) -> vec4f {
  let a = max(s.x, s.y * 0.9);
  if (a <= 0.01) { return vec4f(0.0); }
  return vec4f(mix(vec3f(0.04, 0.04, 0.06), PALETTE[k & 7u], s.x / max(a, 1e-3)), a);
}
fn roundText(hp: vec2f, cols: u32, rows: u32) -> vec4f {
  if (font[64u] == 0u || hp.x < 0.0 || hp.y < 0.0) { return vec4f(0.0); }
  let cell = vec2u(floor(hp / vec2f(4.0, 6.0)));
  if (cell.x >= cols || cell.y >= rows) { return vec4f(0.0); }
  let w = hud[cell.y * cols + cell.x];
  let ch = w & 255u;
  if (ch <= 32u || ch > 95u) { return vec4f(0.0); }
  return glyphColor(glyphSample(ch - 32u, fract(hp / vec2f(4.0, 6.0))), (w >> 8u) & 7u);
}
`;
