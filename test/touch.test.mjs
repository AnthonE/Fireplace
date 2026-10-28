// Touch controls (client/touch.mjs): on with ?touch=1, off with ?touch=0, and
// otherwise on a coarse pointer (none in Node); every player frontend wires them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { touchWanted } from '../client/touch.mjs';

test('?touch=1 turns them on, ?touch=0 off, and with neither a page with no coarse pointer has none', () => {
  assert.equal(touchWanted(new URLSearchParams('touch=1')), true);
  assert.equal(touchWanted(new URLSearchParams('touch=0')), false);
  assert.equal(touchWanted(new URLSearchParams('')), false);
});

test('golf, the arena, Dogfight, bumper balls and party each put them up for a player, and take them down', () => {
  for (const g of ['golf', 'arena', 'flight', 'bumper', 'party']) {
    const src = readFileSync(`client/${g}-game.mjs`, 'utf8');
    assert.match(src, /touch = touchControls\(\{ held, writeKeys/, g);
    assert.match(src, /if \(TOUCH\) locked = true;/, g);
    assert.match(src, /unmount\(\) \{ off\(\); touch\?\.remove\(\);/, g);
  }
});
