// The HUD's rounder font (client/hudfont.mjs): an atlas after the 64 pixel
// glyphs in the font buffer, read by bumper's and party's HUD shaders; with
// none (Node, or ?font=pixel) the buffer is the pixel font and a 0 header.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fontData, HUD_FONT_WGSL, GW, GH } from '../client/hudfont.mjs';
import { FONT } from '../client/font.mjs';

test('with no canvas to draw it, the font buffer is the pixel font and a header of 0 (the shaders draw 3x5)', () => {
  const f = fontData({ round: true });
  assert.equal(f.length, 66);
  assert.deepEqual([...f.subarray(0, 64)], [...FONT]);
  assert.deepEqual([...f.subarray(64)], [0, 0]);
  assert.equal(fontData({ round: false }).length, 66);
  assert.ok(GW * 3 === GH * 2, 'a glyph is its cell, 4 by 6');
});

test('bumper, party and golf draw HUD text in it, and fall back to the pixel font on a 0 header', () => {
  assert.match(HUD_FONT_WGSL, /fn roundText\(/);
  assert.match(HUD_FONT_WGSL, /font\[64u\] == 0u/);
  for (const f of ['client/bumper-render.mjs', 'client/party-render.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /\$\{HUD_FONT_WGSL\}/, f);
    assert.match(src, /roundText\(hp, \$\{COLS\}u, u32\(u\.hud\.x\)\)/, f);
    assert.match(src, /fontData\(\{ round: roundWanted\(\) \}\)/, f);
  }
  const golf = readFileSync('client/render.mjs', 'utf8');
  assert.match(golf, /\$\{HUD_FONT_WGSL\}/);
  assert.match(golf, /roundText\(hp, \$\{COLS\}u, u\.me\.z\)/);
  assert.match(golf, /fontData\(\{ round: roundWanted\(\) \}\)/);
  assert.match(readFileSync('client/room-render.mjs', 'utf8'), /drawGlyphs\(g2, s, x0, y, px, color\)/, "the TV's cards too");
});
