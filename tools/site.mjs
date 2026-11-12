#!/usr/bin/env node
// The static site: what a browser fetches to play, copied out of the repo
// into one folder a plain host can serve (GitHub Pages:
// .github/workflows/pages.yml). The pages and their modules (client/, the
// views and constants in src/, the wire and workers in net/ and harness/),
// the built wasm and themes (run npm run build first), coi.js at the root (the
// service worker that makes the pages cross-origin isolated where the host
// cannot send the headers), and an index.html that opens Fireplace's page,
// its query kept (an invite's ?room=), from which the corner's link goes to
// the shelf (client/games.html: every game, minigame, mode and map as a tile,
// its pictures in client/shelf/). The map editor's half too: the map compiler and the PNG
// codec it runs in the page (tools/map-compile.mjs, tools/png-codec.mjs), the
// readers that bring a Roblox place or a MagicaVoxel model in and the back
// half they share (tools/rbx-*.mjs, tools/vox-*.mjs, tools/scene-map.mjs, the
// port brief's tools/zip.mjs), and the maps it opens (maps/), each also
// packed for a sim to lay at run time (build/maps/<name>.qgmap,
// tools/map-compile.mjs packMap): what a page's
// ?map=<name> plays, and what the kit's room pool fetches to start a room on
// it (net/kit-rooms.mjs), with the list of them (build/maps/index.json) the
// shelf reads. And the studio's (client/studio.html): the sim's
// WAT (src/), the assembler's pure half and party's AI room (tools/asm-core.mjs,
// tools/party-play.mjs) and wabt's one script (node_modules/wabt/, with its
// licence). No sources the browser never reads: the relay, tests.
//   node tools/site.mjs [out]   (default site/)
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';
import { compileMap } from './map.mjs';
import { packMap } from './map-compile.mjs';
import { mapRow } from '../client/shelf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// [directory, which of its files, recursing?]
const PARTS = [
  ['client', () => true, true],
  ['src', (f) => f.endsWith('.mjs') || f.endsWith('.wat'), true],
  ['net', (f) => /\.m?js$/.test(f), false],
  ['harness', (f) => f === 'core.mjs' || f === 'worker.mjs', false],
  ['build', (f) => f === 'game.wasm' || f === 'themes.json' || f === 'manifest.json', true],
  ['tools', (f) => [
    'map-compile.mjs', 'png-codec.mjs', 'asm-core.mjs', 'party-play.mjs',
    'scene-map.mjs', 'rbx-file.mjs', 'rbx-map.mjs', 'rbx-brief.mjs', 'vox-file.mjs', 'vox-map.mjs', 'zip.mjs',
  ].includes(f), false],
  ['node_modules/wabt', (f) => f === 'index.js' || f === 'LICENSE', false],
  ['maps', (f) => f === 'map.json' || f.endsWith('.png'), true],
  // the reference board (client/look.html): the board, its marks and the references that are ours
  ['board', (f) => f === 'board.json' || f === 'marks.jsonl', false],
  ['board/refs', (f) => /\.(png|jpe?g|webp)$/i.test(f), false],
];

const INDEX = `<!doctype html>
<meta charset="utf-8">
<title>Loading…</title>
<script>location.replace('client/fireplace.html' + location.search + location.hash);</script>
<a href="client/fireplace.html">Play</a> · <a href="client/games.html">All games</a>
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

// Every map in maps/, packed into dir (<name>.qgmap), and the list of them a
// page can't read off a static host, index.json: each map as the shelf lists
// it (client/shelf.mjs mapRow) with its packed bytes' sha256, what the kit's
// pool names a room on it by. A map that doesn't compile is left out, and
// said. tools/shelf.mjs packs them into build/maps/ for a dev server.
export function packMaps(dir = join(ROOT, 'build', 'maps')) {
  const maps = join(ROOT, 'maps');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  let bytes = 0;
  for (const name of readdirSync(maps).sort()) {
    if (!existsSync(join(maps, name, 'map.json'))) continue;
    let m, packed;
    try { m = compileMap(join(maps, name)); packed = packMap(m); } catch (e) { console.error(`site: maps/${name} left out: ${e.message}`); continue; }
    writeFileSync(join(dir, `${name}.qgmap`), packed);
    rows.push({ ...mapRow(name, JSON.parse(readFileSync(join(maps, name, 'map.json'), 'utf8')), m), sha256: createHash('sha256').update(packed).digest('hex'), bytes: packed.length });
    bytes += packed.length;
  }
  const index = JSON.stringify({ maps: rows }, null, 1) + '\n';
  writeFileSync(join(dir, 'index.json'), index);
  return { rows, files: rows.length + 1, bytes: bytes + index.length };
}

export function buildSite(out = join(ROOT, 'site')) {
  if (!existsSync(join(ROOT, 'build', 'fireplace', 'game.wasm'))) throw new Error('no build/fireplace/game.wasm: run npm run build first');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let n = 0, bytes = 0;
  for (const [dir, keep, deep] of PARTS) {
    if (!existsSync(join(ROOT, dir))) continue; // board/refs/ before its first reference
    for (const path of files(join(ROOT, dir), keep, deep)) {
      // wabt's licence as LICENSE.txt: a file with no extension is one a
      // static host may refuse (Elo Pros' web builds do)
      const to = join(out, relative(ROOT, path) + (basename(path) === 'LICENSE' ? '.txt' : ''));
      mkdirSync(dirname(to), { recursive: true });
      cpSync(path, to);
      n++;
      bytes += statSync(path).size;
    }
  }
  const maps = packMaps(join(out, 'build', 'maps'));
  n += maps.files;
  bytes += maps.bytes;
  cpSync(join(ROOT, 'coi.js'), join(out, 'coi.js'));
  // (no .nojekyll: Pages deployed from Actions runs no Jekyll, and a hidden
  // file is one a static host may refuse, as Elo Pros' web builds do)
  writeFileSync(join(out, 'index.html'), INDEX);
  return { out, files: n + 2, bytes };
}

if (isMain(import.meta.url)) {
  const { out, files: n, bytes } = buildSite(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`${relative(process.cwd(), out) || out}: ${n} files, ${(bytes / 1024).toFixed(0)} KiB; open index.html from any static host`);
}
