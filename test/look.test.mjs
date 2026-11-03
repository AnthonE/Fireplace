// client/look.html: the reference board in the page. Its numbers must be the
// sheet's numbers, so its measure() is tools/board.mjs's own source; every
// view names the page that draws it in a browser; and the site ships the
// board for the page to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../tools/board.mjs';

const fnSource = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} is in the file`);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 2);
};

test("the page's measure() is the sheet's, character for character", () => {
  assert.equal(fnSource(readFileSync('client/look.mjs', 'utf8'), 'measure'), fnSource(readFileSync('tools/board.mjs', 'utf8'), 'measure'));
});

test('every view on the board names the page that draws it, and that page exposes the shot', () => {
  const b = B.readBoard('board/board.json');
  for (const v of b.views) {
    assert.ok(v.page, `${v.id} has a page`);
    const file = v.page.src.split('?')[0];
    const mod = readFileSync(`client/${file.replace(/\.html$/, '.mjs')}`, 'utf8');
    assert.match(mod, new RegExp(`window\\.${v.page.api} = \\{`), `${file} sets window.${v.page.api}`);
    assert.match(mod, /shot\(/, `${file}'s ${v.page.api} has shot()`);
  }
});

test('the studio pages link to each other, look included, and the site ships the board', () => {
  for (const f of ['studio.html', 'map-editor.html', 'look.html']) assert.match(readFileSync(`client/${f}`, 'utf8'), /<a href="look\.html"[^>]*>look<\/a>/, f);
  assert.match(readFileSync('tools/site.mjs', 'utf8'), /\['board', \(f\) => f === 'board\.json' \|\| f === 'marks\.jsonl', false\]/);
});
