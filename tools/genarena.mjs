#!/usr/bin/env node
// Plays an arena match with AI fighters on a local sim (no network) and
// records it as a .qgl event log: joins, leaves and every input word that
// changed. Each fighter's words land `delay` ticks after it decides them and
// it sees the world that old, as over a network, and says so in its frames,
// so the shots it takes are checked where it saw its targets. The log replays
// in the harness like any other, so the determinism matrix covers the
// arena's guns, grenades, melee, pickups and respawns. --mode k forces every
// match to mode k (layout.mjs, M_*: 1 Infection, 2 gun game, 3 Juggernaut, and
// red against blue: 4 Team Slayer, 5 Capture the Flag, 6 Oddball, 7 King of the
// Hill) through the seed, which the log carries, so its replays play it too.
// --late r: each tick, each fighter's words go late with chance r, for 1 to
// 12 ticks, closed as the relay closes them: its last word repeated (jump
// cleared), marked EV_LATE at the start and EV_ONTIME at the end, and the
// fighter sends a frame they fell in again; the matrix then covers the marks.
//   node tools/genarena.mjs [--seed 7] [--bots 8] [--ticks 20000] [--delay 6] [--mode k] [--late 0.004] [--out logs/arena.qgl]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { newMemory, instantiate, Sim, encodeLog } from '../harness/core.mjs';
import { View, forcedSeed } from '../src/arena-view.mjs';
import { Fighter } from '../client/arena-bot.mjs';
import * as L from '../src/layout.mjs';
import * as W from '../net/wire.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fighters join 25 ticks apart; one leaves at `leaveAt` and comes back 500 ticks later.
export async function playArena({ bytes, seed = 7, bots = 8, ticks = 20000, delay = 6, leaveAt = 0, onTick, map = null, late = 0 } = {}) {
  const memory = newMemory();
  const sim = new Sim(await instantiate(await WebAssembly.compile(bytes), memory), memory);
  // a packed map laid before init (map_load), as a room on one has it
  if (map) sim.loadMap(map);
  sim.init(seed);
  const view = new View(memory.buffer);
  const fighters = Array.from({ length: bots }, (_, k) => ({ f: new Fighter(k, seed, 0.3 + 0.6 * ((k * 5) % bots) / bots), join: 25 * k, queue: [], last: -1, live: false, lateTo: -1, lateFrom: -1 }));
  let r = (seed ^ 0x5bd1e995) >>> 0 || 1;
  const rand = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  const recs = [];
  for (let t = 0; t < ticks; t++) {
    const now = [];
    for (const p of fighters) {
      const k = p.f.slot;
      if (t === p.join || (leaveAt && k === 1 && t === leaveAt + 500)) { now.push([L.EV_JOIN, k]); p.live = true; p.queue = []; p.last = -1; p.lateTo = -1; }
      if (leaveAt && k === 1 && t === leaveAt) { now.push([L.EV_LEAVE, k]); p.live = false; }
      if (!p.live) continue;
      p.queue.push(p.f.think(view, t + delay, 2 * delay));
      // a burst of late words ends: the relay's mark, the fighter's own word, and its frame over them again
      if (p.lateTo === t) { now.push([L.EV_ONTIME, k]); p.f.lost(p.lateFrom, t - 1); p.lateTo = -1; }
      if (late && p.lateTo < 0 && p.last >= 0 && rand() < late) {
        p.lateFrom = t;
        p.lateTo = t + 1 + Math.floor(rand() * 12);
        now.push([L.EV_LATE, k]);
        const w = (p.last & ~W.JUMP_BIT) >>> 0;
        if (w !== p.last) { now.push([L.EV_INPUT, k, w]); p.last = w; }
      }
      if (p.queue.length > delay) {
        const w = p.queue.shift();
        if (p.lateTo < 0 && w !== p.last) { now.push([L.EV_INPUT, k, w]); p.last = w; }
      }
    }
    for (const [kind, slot, word] of now) recs.push([t, kind, slot, word]);
    sim.feedPlayers(now);
    sim.x.step();
    onTick?.(t, view);
  }
  const scores = fighters.map((p) => { const f = view.fighter(p.f.slot); return { slot: p.f.slot, kills: f.kills, deaths: f.deaths, zombie: f.zombie, rung: f.rung, points: f.points, place: f.place, team: f.team, aux: f.aux }; });
  return { log: encodeLog({ courseSeed: seed, ticks, recs }), scores, matches: view.hole().hole, state: view.hole().state, mode: view.mode() };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  execFileSync(process.execPath, [join(ROOT, 'tools/asm.mjs')], { stdio: 'ignore' });
  const bytes = readFileSync(join(ROOT, 'build/arena/game.wasm'));
  const out = opt('out', 'logs/arena.qgl');
  const mode = opt('mode', '');
  const seed = mode === '' ? Number(opt('seed', 7)) : forcedSeed(Number(mode), Number(opt('seed', 7)));
  const { log, scores, matches, mode: md } = await playArena({ bytes, seed, bots: Number(opt('bots', 8)), ticks: Number(opt('ticks', 20000)), delay: Number(opt('delay', 6)), leaveAt: 3000, late: Number(opt('late', 0)) });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, log);
  // a team mode's: the scores red-blue, and each fighter's side (r, b)
  const team = md.teamed ? `; ${md.name} ${md.score.join('-')}${md.teamWin ? ` (${['', 'red won', 'blue won', 'a draw'][md.teamWin]})` : ''}` : '';
  console.log(`${out}: ${log.length} B, seed ${seed}, ${matches} matches over; kills/deaths ${scores.map((s) => `${s.kills}/${s.deaths}${md.teamed ? 'rb'[s.team] ?? '' : ''}`).join(' ')}${team}`);
}
