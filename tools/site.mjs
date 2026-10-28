#!/usr/bin/env node
// The static site: what a browser fetches to play, copied out of the repo
// into one folder a plain host can serve (GitHub Pages:
// .github/workflows/pages.yml). The pages and their modules (client/, the
// views and constants in src/, the wire and workers in net/ and harness/),
// the built wasm and themes (run npm run build first), coi.js at the root (the
// service worker that makes the pages cross-origin isolated where the host
// cannot send the headers), and an index.html that opens Fireplace's page,
// its query kept. The map editor's half too: the map compiler and the PNG
// codec it runs in the page (tools/map-compile.mjs, tools/png-codec.mjs) and
// the maps it opens (maps/). No sources the browser never reads: WAT, the
// relay, tests.
//   node tools/site.mjs [out]   (default site/)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// [directory, which of its files, recursing?]
const PARTS = [
  ['client', () => true, true],
  ['src', (f) => f.endsWith('.mjs'), true],
  ['net', (f) => /\.m?js$/.test(f), false],
  ['harness', (f) => f === 'core.mjs' || f === 'worker.mjs', false],
  ['build', (f) => f === 'game.wasm' || f === 'themes.json' || f === 'manifest.json', true],
  ['tools', (f) => f === 'map-compile.mjs' || f === 'png-codec.mjs', false],
  ['maps', (f) => f === 'map.json' || f.endsWith('.png'), true],
];

const INDEX = `<!doctype html>
<meta charset="utf-8">
<title>Loading…</title>
<script>location.replace('client/fireplace.html' + location.search + location.hash);</script>
<a href="client/fireplace.html">Play</a>
`;

function files(dir, keep, deep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (deep) out.push(...files(path, keep, deep)); }
    else if (keep(name)) out.push(path);
  }
  return out;
}

export function buildSite(out = join(ROOT, 'site')) {
  if (!existsSync(join(ROOT, 'build', 'fireplace', 'game.wasm'))) throw new Error('no build/fireplace/game.wasm: run npm run build first');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let n = 0, bytes = 0;
  for (const [dir, keep, deep] of PARTS) {
    for (const path of files(join(ROOT, dir), keep, deep)) {
      const to = join(out, relative(ROOT, path));
      mkdirSync(dirname(to), { recursive: true });
      cpSync(path, to);
      n++;
      bytes += statSync(path).size;
    }
  }
  cpSync(join(ROOT, 'coi.js'), join(out, 'coi.js'));
  writeFileSync(join(out, 'index.html'), INDEX);
  writeFileSync(join(out, '.nojekyll'), ''); // Pages serves the files as they are
  return { out, files: n + 3, bytes };
}

if (isMain(import.meta.url)) {
  const { out, files: n, bytes } = buildSite(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`${relative(process.cwd(), out) || out}: ${n} files, ${(bytes / 1024).toFixed(0)} KiB; open index.html from any static host`);
}
