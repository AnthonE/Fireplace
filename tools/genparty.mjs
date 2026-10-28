#!/usr/bin/env node
// Plays Party with AI balls (client/party-bot.mjs) on a local sim (no network)
// and records it as a .qgl event log: joins, leaves and every input word that
// changed. Each ball's words land `delay` ticks after it decides them and it
// sees the world that old, as over a network. The log replays in the harness
// like any other, so the determinism matrix covers the rotation, every
// minigame it reaches, the bumps and the outs. --mg k plays only minigame k,
// through the seed as the framework reads it (top byte 0xA7, k in the next).
//   node tools/genparty.mjs [--seed 7] [--mg k] [--bots 16] [--ticks 20000] [--delay 6] [--out logs/party.qgl] [--debug]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as L from '../src/layout.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export { partySeed, playParty } from './party-play.mjs';
import { playParty } from './party-play.mjs';

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  execFileSync(process.execPath, [join(ROOT, 'tools/asm.mjs')], { stdio: 'ignore' });
  const bytes = readFileSync(join(ROOT, argv.includes('--debug') ? 'build/party/game.debug.wasm' : 'build/party/game.wasm'));
  const out = opt('out', 'logs/party.qgl');
  const mg = opt('mg', null);
  const ticks = Number(opt('ticks', 20000));
  const { log, scores, rounds, games, playMs } = await playParty({ bytes, seed: Number(opt('seed', 7)), mg: mg === null ? null : Number(mg), bots: Number(opt('bots', 16)), ticks, delay: Number(opt('delay', 6)), leaveAt: 3000 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, log);
  console.log(`${out}: ${log.length} B, ${rounds} rounds over (${games.map((g) => L.MINIGAMES[g].name).join(', ')}); bots ${playMs.toFixed(3)} ms a tick in play`);
  console.log(`points/wins/KOs ${scores.map((s) => `${s.pts}/${s.wins}/${s.kos}`).join(' ')}`);
}
