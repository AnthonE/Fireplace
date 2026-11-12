// Chat's rules (net/chat.mjs), which the relay gates every line with and the
// page applies again: the cap, the control characters, the word filter, the
// rate limit; and what a bubble shows and where it goes (client/chat.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CHAT_MAX, CHAT_PER_S, CHAT_BURST, stripControls, cutUtf8, wordPattern, maskWords, cleanLine, chatBucket, bubbleLines } from '../net/chat.mjs';
import { WORDS } from '../net/chat-words.mjs';
import { bubbleAt, CHAT_KEY } from '../client/chat.mjs';

const bytes = (s) => new TextEncoder().encode(s).length;

test('a line is cut to 120 bytes of UTF-8, never through a character', () => {
  assert.equal(CHAT_MAX, 120);
  assert.equal(cutUtf8('a'.repeat(300)), 'a'.repeat(120));
  assert.equal(cutUtf8('short'), 'short');
  // two bytes each: 60 fit; with one byte before them 59 do, and the odd byte is left
  assert.equal(cutUtf8('é'.repeat(100)), 'é'.repeat(60));
  assert.equal(cutUtf8(`a${'é'.repeat(100)}`), `a${'é'.repeat(59)}`);
  // three and four bytes: whole characters, no half of a pair
  assert.equal(cutUtf8('世'.repeat(100)), '世'.repeat(40));
  assert.equal(cutUtf8(`ab${'😀'.repeat(40)}`), `ab${'😀'.repeat(29)}`);
  for (const s of ['é'.repeat(100), `a${'世'.repeat(90)}`, `xyz${'😀'.repeat(50)}`]) {
    const c = cutUtf8(s);
    assert.ok(bytes(c) <= CHAT_MAX && bytes(c) > CHAT_MAX - 4);
    assert.ok(!c.includes('�') && s.startsWith(c));
  }
  assert.equal(cutUtf8('héllo', 2), 'h');
});

test('control and format characters go, each run of them or of white space one space', () => {
  assert.equal(stripControls('  hello\u0007 \u0000world\r\n\tagain \u007f '), 'hello world again');
  // the bidi overrides and zero-width marks a line could hide or reorder words with, and the C1 block
  assert.equal(stripControls('abc‮def⁦ghi​jkl\u0085mno﻿'), 'abc def ghi jkl mno');
  assert.equal(stripControls('line separators too'), 'line separators too');
  assert.equal(stripControls('\u0001\u0002\u0003'), '');
  assert.equal(stripControls(null), '');
  // what a person types stays: accents, other scripts, emoji
  assert.equal(stripControls('¡olé! 你好 😀'), '¡olé! 你好 😀');
});

test('the listed words are masked whole, whatever their case, and nothing inside another word', () => {
  assert.equal(maskWords('what a Bastard of a shot'), 'what a ******* of a shot');
  assert.equal(maskWords('SHIT. shit! (shit)'), '****. ****! (****)');
  // the Scunthorpe problem: a listed word inside a longer one is left alone
  for (const s of ['Scunthorpe', 'cockpit', 'dickens', 'a classic assassin', 'shiitake']) assert.equal(maskWords(s), s);
  // an entry ending in * takes any ending
  assert.equal(maskWords('fucking hell'), '******* hell');
  assert.equal(maskWords('no words here'), 'no words here');
  // a list of one's own: plain entries, a * entry, a character a pattern would read
  const p = wordPattern(['heck', 'dar*', 'a.b']);
  assert.equal(maskWords('Heck, darn it: darnation! a.b axb heckle', p), '****, **** it: *********! *** axb heckle');
  assert.equal(maskWords('anything', wordPattern([])), 'anything');
  // letters past ASCII bound a word as ASCII ones do
  assert.equal(maskWords('éheck hecké heck', p), 'éheck hecké ****');
});

test('the starter list is data: lower case, one word an entry, at most a * to end it', () => {
  assert.ok(WORDS.length >= 10);
  for (const w of WORDS) assert.match(w, /^[a-z0-9]+\*?$/, w);
  assert.equal(new Set(WORDS).size, WORDS.length);
  for (const w of WORDS) { const word = w.replace('*', ''); assert.equal(maskWords(`a ${word} b`), `a ${'*'.repeat(word.length)} b`, w); }
});

test('a line as the relay sends it on: cleaned, cut, masked; nothing left is no line', () => {
  assert.equal(cleanLine('  bells\u0007 and ‮turns\n\tgo '), 'bells and turns go');
  assert.equal(cleanLine('é'.repeat(200)), 'é'.repeat(60));
  assert.equal(cleanLine('you BASTARD'), 'you *******');
  assert.equal(cleanLine(' \u0000\n '), '');
  // a cut that ends on a space is trimmed, and the mask never makes a line longer
  assert.equal(cleanLine(`${'a'.repeat(119)} bcd`), 'a'.repeat(119));
  for (const s of [`${'x '.repeat(70)}shit`, `${'é'.repeat(55)} bastard bastard`]) assert.ok(bytes(cleanLine(s)) <= CHAT_MAX);
  // cleaning twice changes nothing: the page cleans again what the relay cleaned
  for (const s of ['what a Bastard\u0007 of a  shot', 'é'.repeat(200), 'plain']) assert.equal(cleanLine(cleanLine(s)), cleanLine(s));
});

test('a slot may send a burst of three lines, then one a second', () => {
  assert.deepEqual([CHAT_PER_S, CHAT_BURST], [1, 3]);
  const b = chatBucket();
  // a flood: three go on, the rest are dropped
  assert.deepEqual([0, 1, 2, 3, 4, 5, 50, 400, 900].map((t) => b.take(1000 + t)), [true, true, true, false, false, false, false, false, false]);
  // a second after the burst was spent, one more; then one a second, never more
  assert.equal(b.take(2001), true);
  assert.equal(b.take(2002), false);
  let sent = 0;
  for (let t = 2100; t < 12100; t += 100) if (b.take(t)) sent++;
  assert.ok(sent >= 9 && sent <= 10, `${sent} lines in 10 s`);
  // quiet for a while: the burst is back, and no bigger than it was
  assert.deepEqual([60000, 60001, 60002, 60003].map((t) => b.take(t)), [true, true, true, false]);
  // each slot has its own, and a clock that steps back gives nothing away
  const c = chatBucket(1, 3);
  assert.deepEqual([500, 400, 300, 200, 100].map((t) => c.take(t)), [true, true, true, false, false]);
  const slow = chatBucket(0.5, 1);
  assert.deepEqual([0, 1000, 2000, 3000].map((t) => slow.take(t)), [true, false, true, false]);
});

test("a bubble's lines are the HUD font's: upper case, wrapped at words, cut with ...", () => {
  assert.deepEqual(bubbleLines('ok'), ['OK']);
  assert.deepEqual(bubbleLines('hello there this is a fairly long line of chat that goes on and on'), ['HELLO THERE THIS IS A', 'FAIRLY LONG LINE OF C...']);
  assert.deepEqual(bubbleLines('exactly twenty four chrs'), ['EXACTLY TWENTY FOUR CHRS']);
  assert.deepEqual(bubbleLines('averyveryverylongwordwithnospacesatallinitanywhere'), ['AVERYVERYVERYLONGWORDWIT', 'HNOSPACESATALLINITANY...']);
  // what the 3x5 font can't draw is left out; a line with nothing left still shows that someone spoke
  assert.deepEqual(bubbleLines('olé {ok} ~ `quoted`'), ["OL (OK) - 'QUOTED'"]);
  assert.deepEqual(bubbleLines('你好 😀'), ['...']);
  for (const s of ['x'.repeat(120), 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(3), 'word '.repeat(24)]) {
    const l = bubbleLines(s);
    assert.ok(l.length <= 2 && l.every((x) => x.length <= 24 && /^[\x20-\x5f]+$/.test(x)), JSON.stringify(l));
  }
  assert.deepEqual(bubbleLines('one two three four five six', 8, 3), ['ONE TWO', 'THREE', 'FOUR...']);
});

test('a bubble sits over the point it is given, inside the text block, clear of the top two rows', () => {
  const hud = { hudX: 0, hudY: 0, hs: 2, cols: 80, rows: 33 };
  // (160, 100) px is HUD (80, 50): column 20, row 8; two lines end a row over it
  const b = bubbleAt(160, 100, ['HELLO', 'YO'], hud);
  assert.deepEqual([b.col, b.row, b.w], [18, 6, 5]);
  assert.deepEqual(b.rect, [(18 * 4 - 2) * 2, (6 * 6 - 2) * 2, (23 * 4 + 1) * 2, 8 * 6 * 2]);
  // kept inside the columns at either edge
  assert.equal(bubbleAt(2, 100, ['A LONG LINE AT THE EDGE'], hud).col, 1);
  assert.equal(bubbleAt(638, 100, ['A LONG LINE AT THE EDGE'], hud).col, 80 - 1 - 23);
  // none where it would cover the clock's rows or leave the screen
  assert.equal(bubbleAt(160, 30, ['HELLO'], hud), null);
  assert.equal(bubbleAt(160, 500, ['HELLO'], hud), null);
  // a HUD whose frame sits in from the screen's corner (the arena's on a wide screen)
  assert.equal(bubbleAt(260, 100, ['HI'], { ...hud, hudX: 100 }).col, 19);
});

test('the chat key is free: no frontend, page or room reads it, and each page has the one chat', () => {
  assert.equal(CHAT_KEY, 'Slash');
  for (const f of readdirSync('client').filter((f) => f.endsWith('.mjs') && f !== 'chat.mjs')) {
    assert.doesNotMatch(readFileSync(`client/${f}`, 'utf8'), /['"]Slash['"]|key === '\/'/, f);
  }
  // the host makes it for every page it serves; golf's own page makes its own
  assert.match(readFileSync('client/host.mjs', 'utf8'), /h\.chat = createChat\(/);
  assert.match(readFileSync('client/main.mjs', 'utf8'), /const chat = createChat\(/);
  // the arena and Party draw the bubbles, through the one hook
  for (const g of ['arena', 'party']) assert.match(readFileSync(`client/${g}-game.mjs`, 'utf8'), /chat\?\.bubbles\(\)/, g);
});

test('the sim never hears of chat: no WAT, layout or tick code names it', () => {
  for (const f of readdirSync('src').filter((f) => f.endsWith('.wat') || f === 'layout.mjs')) {
    assert.doesNotMatch(readFileSync(`src/${f}`, 'utf8'), /T_CHAT|HELLO_CHAT|chat\.mjs/, f);
  }
  for (const f of ['net/inbox.mjs', 'net/referee.mjs', 'net/referee-worker.mjs', 'net/replay.mjs', 'client/sim.mjs']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /chat/i, f);
  }
});
