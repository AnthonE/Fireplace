#!/usr/bin/env node
// Plays a flight match with AI pilots (client/flight-bot.mjs) on a local sim
// (no network) and records it as a .qgl event log, as tools/genarena.mjs
// does the arena's: each pilot's words land `delay` ticks after it decides
// them, it sees the world that old and says so in its frames, so its lasers
// are checked where it saw its targets. The determinism matrix replays it.
// --mode k forces every match to mode k (layout.mjs FLIGHT_MODES: 0 a
// free-for-all, 4 Team Slayer, 3 Juggernaut, 12 Ring Race) through the seed.
//   node tools/genflight.mjs [--seed 7] [--bots 8] [--ticks 20000] [--delay 6] [--mode k] [--out logs/flight.qgl]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { newMemory, instantiate, Sim, encodeLog } from '../harness/core.mjs';
import { View, forcedSeed } from '../src/flight-view.mjs';
import { Pilot } from '../client/flight-bot.mjs';
import * as L from '../src/layout.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pilots join 25 ticks apart; one leaves at `leaveAt` and comes back 500 ticks later.
export async function playFlight({ bytes, seed = 7, bots = 8, ticks = 20000, delay = 6, leaveAt = 0, onTick } = {}) {
  const memory = newMemory();
  const sim = new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory);
  sim.init(seed);
  const view = new View(memory.buffer);
  const pilots = Array.from({ length: bots }, (_, k) => ({ f: new Pilot(k, seed, 0.3 + 0.6 * ((k * 5) % bots) / bots), join: 25 * k, queue: [], last: -1, live: false }));
  const recs = [];
  for (let t = 0; t < ticks; t++) {
    const now = [];
    for (const p of pilots) {
      const k = p.f.slot;
      if (t === p.join || (leaveAt && k === 1 && t === leaveAt + 500)) { now.push([L.EV_JOIN, k]); p.live = true; p.queue = []; p.last = -1; }
      if (leaveAt && k === 1 && t === leaveAt) { now.push([L.EV_LEAVE, k]); p.live = false; }
      if (!p.live) continue;
      p.queue.push(p.f.think(view, t + delay, 2 * delay));
      if (p.queue.length > delay) {
        const w = p.queue.shift();
        if (w !== p.last) { now.push([L.EV_INPUT, k, w]); p.last = w; }
      }
    }
    for (const [kind, slot, word] of now) recs.push([t, kind, slot, word]);
    sim.feedPlayers(now);
    sim.x.step();
    onTick?.(t, view);
  }
  const scores = pilots.map((p) => { const f = view.ship(p.f.slot); return { slot: p.f.slot, kills: f.kills, deaths: f.deaths, points: f.points, place: f.place, team: f.team, jugg: f.jugg }; });
  return { log: encodeLog({ courseSeed: seed, ticks, recs }), scores, matches: view.hole().hole, state: view.hole().state, mode: view.mode() };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  execFileSync(process.execPath, [join(ROOT, 'tools/asm.mjs')], { stdio: 'ignore' });
  const bytes = readFileSync(join(ROOT, 'build/flight/game.wasm'));
  const out = opt('out', 'logs/flight.qgl');
  const mode = opt('mode', '');
  const seed = mode === '' ? Number(opt('seed', 7)) : forcedSeed(Number(mode), Number(opt('seed', 7)));
  const { log, scores, matches, mode: md } = await playFlight({ bytes, seed, bots: Number(opt('bots', 8)), ticks: Number(opt('ticks', 20000)), delay: Number(opt('delay', 6)), leaveAt: 3000 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, log);
  const team = md.teamed ? `; ${md.name} ${md.score.join('-')}${md.teamWin ? ` (${['', 'red won', 'blue won', 'a draw'][md.teamWin]})` : ''}` : '';
  console.log(`${out}: ${log.length} B, seed ${seed}, ${matches} matches over; kills/deaths ${scores.map((s) => `${s.kills}/${s.deaths}${md.teamed ? 'rb'[s.team] ?? '' : ''}`).join(' ')}${team}`);
}
