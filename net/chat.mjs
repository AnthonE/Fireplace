// Chat's rules, as pure functions the relay and the page share. A line rides
// beside the ticks as looks and names do (net/wire.mjs T_CHAT): no tick,
// record, replay or hash holds one, and the sim never hears of it. The relay
// is the gate, since anyone can write a client: every line it sends on has
// been through cleanLine (control characters out, cut to CHAT_MAX bytes on a
// character's boundary, the words in net/chat-words.mjs masked) and its
// slot's bucket (a line a second, a burst of three; the rest dropped, with no
// answer). The page cleans its own line the same way before it sends it, and
// what it hears again before it shows it, so a relay that isn't ours can't
// put a control character or a longer line on the screen.
import { WORDS } from './chat-words.mjs';

export const CHAT_MAX = 120; // bytes of UTF-8 in a line, after cleaning
export const CHAT_PER_S = 1; // lines a second a slot may send, once its burst is spent
export const CHAT_BURST = 3;

// Control and format characters out (C0, C1, the bidi overrides, zero-width
// marks, the line and paragraph separators), each run of them or of white
// space one space, the ends trimmed. A joined emoji comes apart into its
// members: the joiner is a format character too.
export const stripControls = (s) => String(s ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();

// s cut to at most max bytes of UTF-8, never through a character.
export function cutUtf8(s, max = CHAT_MAX) {
  const b = new TextEncoder().encode(s);
  if (b.length <= max) return s;
  let n = max;
  while (n > 0 && (b[n] & 0xc0) === 0x80) n--;
  return new TextDecoder().decode(b.subarray(0, n));
}

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LETTER = '[\\p{L}\\p{N}]';
// one pattern for a list: each word whole (no letter or digit either side), an entry ending in * with any ending
export const wordPattern = (words) => (words.length
  ? new RegExp(`(?<!${LETTER})(?:${words.map((w) => (w.endsWith('*') ? `${esc(w.slice(0, -1))}${LETTER}*` : esc(w))).join('|')})(?!${LETTER})`, 'giu') : null);
const HOUSE = wordPattern(WORDS);
// Each listed word in s as that many `*`.
export function maskWords(s, pattern = HOUSE) {
  return pattern ? s.replace(pattern, (m) => '*'.repeat([...m].length)) : s;
}

// A line as the relay sends it on: '' for one with nothing left to say.
export const cleanLine = (s, pattern = HOUSE) => maskWords(cutUtf8(stripControls(s), CHAT_MAX).trim(), pattern);

// A slot's rate limit, a token bucket: `burst` lines at once, then `perS` a
// second. take(now ms) is true if a line sent now may go on.
export function chatBucket(perS = CHAT_PER_S, burst = CHAT_BURST) {
  let tokens = burst, at = -Infinity;
  return {
    take(now) {
      if (at !== -Infinity) tokens = Math.min(burst, tokens + Math.max(0, now - at) * perS / 1000);
      at = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}

// A line for the HUD's font (its 64 characters, codes 32 to 95, so upper case), wrapped at
// words into at most `rows` lines of `cols` characters, the last ending in
// ... if there was more: what a bubble over a speaker's head shows. A line
// with nothing the font can draw (another script, emoji) is ... alone; the
// log has the words.
export function bubbleLines(s, cols = 24, rows = 2) {
  const text = String(s).toUpperCase().replace(/[`‘’]/g, "'").replace(/[“”]/g, '"').replace(/\{/g, '(').replace(/\}/g, ')').replace(/~/g, '-')
    .replace(/[^\x20-\x5f]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return ['...'];
  const out = [];
  let rest = text;
  while (rest && out.length < rows) {
    if (rest.length <= cols) { out.push(rest); rest = ''; break; }
    // the last space that fits, or a word too long for a line cut where the line ends
    let at = rest.lastIndexOf(' ', cols);
    if (at <= 0) at = cols;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out[out.length - 1] = `${out[out.length - 1].slice(0, cols - 3).trim()}...`;
  return out;
}
