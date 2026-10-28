#!/usr/bin/env node
// elo.json, Fireplace's manifest for its store row on Elo Pros
// (elopros.com, scry-forge's docs/store/GAME-REPO.md): what the store reads
// from this repo. Its "mods" credit what people made for the game; every room
// theme is one, written here from client/themes/ so the store's list and the
// themes never disagree. Other mods (a minigame someone sent, say) are added
// by hand and kept. Its "stats" block declares the room's achievements, the
// stats they are counted from and the marshmallow board, written here from
// client/achievements.mjs, the list the page and the relay both test against.
//   node tools/elo.mjs           rewrite the themes in elo.json's mods, and its stats
//   node tools/elo.mjs --check   exit 1 if they're out of date (test/themes.test.mjs runs this)
//   node tools/elo.mjs --server-key <id>   a new key for the relay's reports
//     (net/relay.ts --elo-key): the private half to certs/elo-<id>.key, which
//     git ignores, and the public half into elo.json's server_keys under <id>
//     (a new row, or the old one rotated), which Elo Pros takes from the repo
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readThemes } from './themes.mjs';
import { isMain } from './main.mjs';
import { eloStats } from '../client/achievements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = join(ROOT, 'elo.json');

const themeMod = (t) => ({ id: t.id, kind: 'theme', name: t.name, by: t.by, ...(t.about ? { about: t.about } : {}), path: `client/themes/${t.id}.json` });

// elo.json as it should be: its theme mods from the themes (a theme's own pr
// link, added when it was merged, kept), its stats from the achievements,
// everything else as it is.
export function withGenerated(manifest = JSON.parse(readFileSync(FILE, 'utf8')), themes = readThemes()) {
  const old = new Map((manifest.mods || []).filter((m) => m.kind === 'theme').map((m) => [m.id, m]));
  const others = (manifest.mods || []).filter((m) => m.kind !== 'theme');
  const mods = [...themes.map((t) => ({ ...themeMod(t), ...(old.get(t.id)?.pr ? { pr: old.get(t.id).pr } : {}) })), ...others];
  return { ...manifest, mods, stats: eloStats() };
}

// elo.json with a server key's public half (raw 32 bytes, base64) under id:
// the row replaced if the id is there, added after the rest if not.
export function withServerKey(manifest, id, pub) {
  if (!/^[a-z0-9-]{1,31}$/.test(id)) throw new Error(`a server key's id is lowercase letters, digits and '-', up to 31: not ${JSON.stringify(id)}`);
  const keys = (manifest.server_keys || []).filter((k) => k.id !== id);
  const at = (manifest.server_keys || []).findIndex((k) => k.id === id);
  keys.splice(at < 0 ? keys.length : at, 0, { id, pub });
  return { ...manifest, server_keys: keys };
}

if (isMain(import.meta.url) && process.argv.includes('--server-key')) {
  const id = process.argv[process.argv.indexOf('--server-key') + 1] || '';
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
  const next = withServerKey(JSON.parse(readFileSync(FILE, 'utf8')), id, pub);
  const keyPath = join(ROOT, 'certs', `elo-${id}.key`);
  mkdirSync(join(ROOT, 'certs'), { recursive: true });
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`certs/elo-${id}.key: the private half, for the relay (--elo-key certs/elo-${id}.key --elo-key-id ${next.game}/${id}); keep it on the relay's disk only`);
  console.log(`elo.json: server_keys ${id} = ${pub}; commit it, and Elo Pros takes it with the manifest`);
} else if (isMain(import.meta.url)) {
  const now = readFileSync(FILE, 'utf8');
  const want = JSON.stringify(withGenerated(JSON.parse(now)), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (now !== want) { console.error('elo.json\'s mods are not the themes in client/themes/, or its stats not the achievements: run node tools/elo.mjs'); process.exit(1); }
    console.log('elo.json: its mods are the themes, its stats the achievements');
  } else {
    writeFileSync(FILE, want);
    console.log(now === want ? 'elo.json: no change' : 'elo.json: its themes and stats rewritten');
  }
}
