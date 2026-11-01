// A banner across the top of a studio page on Safari. The editors draw every
// frame on the CPU and the GPU at once, and Safari runs them at a frame or
// two a second where Chrome runs them smooth, so the page says so before
// anyone spends an hour in it. Desktop Safari is told to switch to Chrome; an
// iPhone or iPad (every browser there is Safari underneath) to use a
// computer. The close button hides it for that browser from then on.

const KEY = 'fireplace.safariNote';

export function safariKind(ua = navigator.userAgent, touch = navigator.maxTouchPoints) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Firefox\//.test(ua)) return 'mac';
  return null;
}

export function safariNote(doc = document) {
  const kind = safariKind();
  if (!kind) return null;
  try { if (localStorage.getItem(KEY) === 'closed') return null; } catch {}
  const bar = doc.createElement('div');
  bar.id = 'safari-note';
  bar.setAttribute('role', 'alert');
  const msg = doc.createElement('p');
  const b = doc.createElement('b');
  b.textContent = kind === 'ios' ? 'This editor needs a computer.' : 'You’re on Safari, and this editor runs very slowly in it.';
  msg.append(b, ' ', kind === 'ios' ? 'Open this page in Chrome on a Mac or PC.' : 'Open this page in Chrome for a smooth editor.');
  const copy = doc.createElement('button');
  copy.textContent = 'copy link';
  copy.onclick = () => navigator.clipboard?.writeText(location.href).then(() => { copy.textContent = 'copied'; }, () => {});
  const close = doc.createElement('button');
  close.textContent = '×';
  close.title = 'hide this';
  close.setAttribute('aria-label', 'hide this');
  close.onclick = () => { bar.remove(); try { localStorage.setItem(KEY, 'closed'); } catch {} };
  bar.append(msg, copy, close);
  doc.body.prepend(bar);
  return bar;
}

// loaded on its own <script> tag, apart from the page's module, so the note
// still shows when something else on the page fails to load
if (typeof document !== 'undefined') safariNote();
