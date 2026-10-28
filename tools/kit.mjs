#!/usr/bin/env node
// Fireplace as a starter kit: the first run in a copy of this repo made with
// GitHub's "Use this template". init gives the copy its own game's name, so it
// no longer says it is Fireplace: the page's title and the TV's title card
// (client/kit.json), package.json, the README's heading, and elo.json, reset
// to a manifest for the new game (GAME-REPO.md in the Elo Pros docs: its
// slug, a listing, the page's address on GitHub Pages, the room themes as its
// mods; no wallet, no price, no jobs). Running it again with the same
// answers changes nothing. It leaves the playlist alone: src/layout.mjs's
// PLAYLIST is one line, but test/fireplace.test.mjs is written to the whole
// one (7 of its 10 tests fail on bumper and party alone), so trimming it is a
// change to make with those tests, not a switch here.
//
// It refuses to run in Fireplace's own repo (its git remote, or the Actions
// repo, is AnthonE/Fireplace) unless --force: there it would rename Fireplace.
//
//   node tools/kit.mjs init "<Game Name>" [--slug my-game] [--repo owner/name] [--blurb "..."]
//                      [--tagline "..."] [--force] [--root dir]
//   node tools/kit.mjs check     the build and the fast tests, what a copy's first run should pass
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './main.mjs';
import { withGenerated, readMaps } from './elo.mjs';
import { readThemes } from './themes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = /^(anthone)\/(fireplace|quake-golf)$/i; // Fireplace's own repo, by either name
export const HOME_SLUG = 'fireplace';
export const ENGINE = { name: 'Fireplace', license: 'CC0-1.0' };
// the store shows a community game on its shelves once it has a capsule (616x353): a copy starts with
// the kit's, a frame of bumper balls, and the README says to draw its own
export const CAPSULE = 'elo/capsule.png';
// the tests a copy's first run passes in seconds; npm test runs them all (about 10 min)
export const FAST = ['asm', 'themes', 'looks', 'new-mg', 'wire', 'achievements', 'kit', 'plan'];

// a name as a store slug: lower case, a-z 0-9 and -, 3 to 41 long (as the Elo Pros plan generator makes them)
export function slugOf(name) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 41).replace(/-+$/, '');
  return s.length >= 3 ? s : (s + '-game').replace(/^-/, '').slice(0, 41);
}

// owner/name from a git remote URL (https or ssh), or null
export function repoOf(url) {
  const m = String(url || '').trim().match(/github\.com[:/]([A-Za-z0-9][\w.-]*)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// where GitHub Pages serves owner/name's site
// elo.json's tools row for the map editor (scry-forge GAME-REPO.md §4c), its url the copy's own
export const EDITOR = { id: 'map-editor', name: 'Map editor', makes: 'map', about: 'Draw a map for the arena or Dogfight in the browser, play it with bots, and send it in.' };
export const STUDIO = { id: 'studio', name: 'Studio', makes: 'minigame', about: 'Edit a Party minigame in the browser, build and check it there, play it against AI balls, and send it in.' };

export function pagesUrl(repo) {
  const [owner, name] = repo.split('/');
  const host = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}

function gitRepo(root) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try { return repoOf(execFileSync('git', ['-C', root, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return null; }
}

// The edits init makes, as { file: text after }, without writing anything.
export function plan(name, { root = ROOT, slug, repo, blurb, tagline, force = false } = {}) {
  name = String(name || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 60) throw new Error('give your game a name, up to 60 characters: node tools/kit.mjs init "My Game"');
  slug = slug ? String(slug) : slugOf(name);
  if (!/^[a-z0-9][a-z0-9-]{1,39}[a-z0-9]$/.test(slug)) throw new Error(`--slug ${slug}: 3 to 41 of a-z, 0-9 and -, not starting or ending with -`);
  repo ??= gitRepo(root);
  if (!force && repo && HOME.test(repo)) throw new Error(`this is ${repo}, Fireplace's own repo: init would rename Fireplace (--force if you mean it)`);
  if (!force && slug === HOME_SLUG) throw new Error(`"${HOME_SLUG}" is Fireplace's own store slug: pick another name, or --slug`);
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const out = {};

  // elo.json: from Fireplace's, a fresh manifest; from the game's own, its name and page moved, the rest kept
  const was = JSON.parse(read('elo.json'));
  const listing = { ...(was.game === HOME_SLUG ? {} : was.listing), name };
  if (blurb !== undefined || !listing.blurb) listing.blurb = blurb ?? `${name}: a party game for a room of friends in the browser, made from Fireplace.`;
  listing.made_with ??= { parts: [] };
  listing.engine ??= ENGINE;
  if (repo && !HOME.test(repo)) listing.play_url = pagesUrl(repo);
  const art = existsSync(join(root, CAPSULE)) ? { art: { capsule: CAPSULE } } : {};
  // the map editor and the studio on the copy's own site, which the store links beside its mods
  const tools = listing.play_url ? { tools: [{ ...EDITOR, url: `${listing.play_url}client/map-editor.html` }, { ...STUDIO, url: `${listing.play_url}client/studio.html` }] } : {};
  const elo = was.game === HOME_SLUG
    ? { elo: 1, game: slug, multiplayer: 'match', listing, ...art, ...tools }
    : { ...was, game: slug, listing, ...(was.tools ? {} : tools) };
  const themes = readThemes(join(root, 'client', 'themes'));
  out['elo.json'] = JSON.stringify(withGenerated(elo, themes, readMaps(join(root, 'maps'))), null, 2) + '\n';

  const pkg = JSON.parse(read('package.json'));
  out['package.json'] = JSON.stringify({ ...pkg, name: slug }, null, 2) + '\n';

  // the repo the map editor sends maps to: this one, or (unknown) the one its Pages site serves
  const { repo: _home, ...kit } = JSON.parse(read('client/kit.json'));
  const mine = repo && !HOME.test(repo) ? { repo } : {};
  out['client/kit.json'] = JSON.stringify({ ...kit, name, ...(tagline !== undefined ? { tagline } : {}), ...mine }, null, 2) + '\n';

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  out['client/fireplace.html'] = read('client/fireplace.html').replace(/<title>[^<]*<\/title>/, `<title>${esc(name)}</title>`);
  out['client/room.html'] = read('client/room.html').replace(/<title>[^<]*<\/title>/, `<title>${esc(name)} Room</title>`);

  // the README's heading, and a line under it saying where it came from
  const MADE = `${name} is made from [Fireplace](https://github.com/AnthonE/Fireplace), a party-game engine in the public domain.`;
  const readme = read('README.md').split('\n');
  readme[0] = `# ${name}`;
  const at = readme.findIndex((l) => l.includes('is made from [Fireplace](https://github.com/AnthonE/Fireplace)'));
  if (at >= 0) readme[at] = MADE;
  else readme.splice(1, 0, '', MADE);
  out['README.md'] = readme.join('\n');

  // CONTRIBUTING.md is Fireplace's guide: true here but for who pays
  const NOTE = `> This guide came with Fireplace, which ${name} is made from. The how holds here too; the pay in "Getting paid" is for pull requests to [AnthonE/Fireplace](https://github.com/AnthonE/Fireplace), not to this repo.`;
  const contrib = read('CONTRIBUTING.md').split('\n');
  const n = contrib.findIndex((l) => l.startsWith('> This guide came with Fireplace'));
  if (n >= 0) contrib[n] = NOTE;
  else contrib.splice(1, 0, '', NOTE);
  out['CONTRIBUTING.md'] = contrib.join('\n');

  // only what changes
  for (const f of Object.keys(out)) if (out[f] === read(f)) delete out[f];
  return { name, slug, repo, edits: out };
}

export function init(name, opts = {}) {
  const root = opts.root ?? ROOT;
  const p = plan(name, { ...opts, root });
  for (const [f, text] of Object.entries(p.edits)) writeFileSync(join(root, f), text);
  return p;
}

function check() {
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  run(process.execPath, ['tools/asm.mjs']);
  run(process.execPath, ['--test', ...FAST.map((t) => `test/${t}.test.mjs`).filter((f) => existsSync(join(ROOT, f)))]);
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const cmd = argv[0];
  try {
    if (cmd === 'init') {
      const name = argv[1] && !argv[1].startsWith('--') ? argv[1] : '';
      const p = init(name, { slug: opt('slug'), repo: opt('repo'), blurb: opt('blurb'), tagline: opt('tagline'), force: argv.includes('--force'), root: opt('root') ? resolve(opt('root')) : ROOT });
      const files = Object.keys(p.edits);
      console.log(files.length ? `${p.name} (${p.slug}): wrote ${files.join(', ')}` : `${p.name} (${p.slug}): nothing to change`);
      if (files.length) console.log('next: npm run build && node tools/kit.mjs check, then commit and push; your page is on GitHub Pages once Settings > Pages > Source is "GitHub Actions"');
    } else if (cmd === 'check') {
      check();
    } else {
      console.log('node tools/kit.mjs init "<Game Name>" [--slug s] [--repo owner/name] [--blurb "..."] [--tagline "..."] [--force]\nnode tools/kit.mjs check');
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
