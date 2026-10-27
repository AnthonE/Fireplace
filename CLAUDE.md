# Fireplace

One engine, hand-written WebAssembly (no compiler), deterministic lockstep at
125 Hz: only inputs cross the network, and every machine steps the same bits.
Five games build from `src/`: golf (`build/game.wasm`), the arena with
`ARENA` set (`build/arena/`), bumper balls with `BUMPER` set
(`build/bumper/`), and party, a minigame a round, with `BUMPER` and `PARTY`
(`build/party/`); and flight, the arena with every fighter a ship, with
`ARENA` and `FLIGHT` (`build/flight/`, "Dogfight", its own page and map). **Fireplace** (`build/fireplace/`) is the party game made
of them: all five in one module, a playlist the room plays through, a living
room for a menu (`client/fireplace.html`). README.md is the front page; the
long-form docs are `docs/<game>.md` (golf, arena, bumper, party, fireplace)
and `docs/netcode.md` (flight's is `docs/flight.md`): read the one for whatever you touch. `docs/wire.md` is
the protocol for writing a client, `docs/hosting.md` the room pool
(`net/rooms.mjs`), and `docs/roadmap.md` the plan for what comes next.

## Commands

```sh
npm ci && sh tools/install-deno.sh   # once: wabt, binaryen, Deno 2.9.7 in .tools/
npm run build                        # every sim; prints each wasm's sha256
npm test                             # node --test test/*.test.mjs, about 10 min; prints its own count
node --test test/bumper.test.mjs     # one file
node harness/matrix.mjs --ticks 20000 --log logs/x.qgl --wasm build/<sim>/game.wasm   # Node, Deno, Chrome x JIT tiers x 1/2/4 threads
node net/play.mjs [--arena [--mode k] | --flight [--mode k] | --bumper | --party [--mg k] | --fireplace] [--bots N]   # relay + page + bots; open the URL it prints
node net/run-arena.mjs / run-flight.mjs / run-bumper.mjs / run-party.mjs / run-fireplace.mjs / run-n1.mjs ...   # online gates: relay, bot host, headless Chrome, every hash checked
node net/rooms.mjs net/rooms.example.json   # the room pool: one relay per room, opened and closed as players need
node tools/film.mjs record | plan | shoot   # the trailer, filmed from a replay (film/*.json are the cut lists)
node net/run-pages.mjs                      # the GitHub Pages site (tools/site.mjs) with no isolation headers: coi.js, a local room
node net/kit-rooms.mjs net/kit-rooms.example.json   # rooms on demand for the kit's copies, each on its own wasm; node net/run-kit-rooms.mjs is its gate
node tools/kit.mjs init "<Game Name>"       # a copy made from this template takes its game's name (refuses this repo)
node tools/serve.mjs                        # then /client/map-editor.html: draw a map into maps/<name>/
node net/play.mjs --arena --map <name>      # build the arena on it and play (--flight --map for Dogfight's)
```

Logs for the matrix come from `tools/genlog.mjs`, `gengame.mjs`,
`genarena.mjs`, `genflight.mjs`, `genbumper.mjs`, `genparty.mjs`, `genfireplace.mjs`. Gates write `traces/`
(screenshots included). Headless Chrome is Playwright's preinstalled Chromium
on SwiftShader: pictures are right, frame rates mean nothing, and drawing to an
on-screen canvas destroys the GPU device, so gate pages run with `?present=0`
(renderers then draw only into capture textures). Don't `pkill -f <name>` in a
shell whose own command line contains the name: it kills that shell.

## The sim's rules (the build refuses some; the rest are on you)

- No `memory.grow`, relaxed SIMD, mutable globals or active data segments
  (`tools/asm.mjs` checks source and binary).
- Floats: explicit multiply then add (`(!madd a b c)`), never fused; angles
  through `$sincos` (1/16384 turn), never JS math; `f32.sqrt` is fine.
- `$rand` (the header's PRNG) only from serial code. Everything gameplay is
  serial and in slot order; only ball contacts and integration run on threads,
  and those are Jacobi so any split gives the same bits.
- All gameplay state lives in the 512 KiB region (`src/layout.mjs`), which is
  hashed in 128 slices and snapshotted whole. Scratch outside it must be
  rebuilt from the region (or be per-call), never carried tick to tick.
- Player and projectile accesses take a bank offset `d`: 0 the confirmed
  world, `PRED_D` the prediction's copy. Code the prediction runs (`$move`,
  `$b_move`, ...) writes only its own record and its bank's FX ring; anything
  that touches other players is confirmed-only (`if d == 0`).
- Debug builds (`game.debug.wasm`) trap on any NaN/infinity (`(!chk ...)`):
  test on them.
- JS that mirrors sim math (views, bots, renderers) is for drawing and
  steering only, never fed back. Mirror the sim's integer semantics, e.g. i32
  subtraction wraps (`(a - b) | 0`).

## Layout and the games

- `src/layout.mjs` is the one memory map for the WAT (`@NAME`, `@(expr)`),
  the harness, the net code and the clients. Physics literals sit in `PHYS`
  (and `BPHYS` for bumper) as strings, inlined as `f32.const`.
- Mode code goes in its own file (`arena.wat`, `bumper.wat`); shared files keep
  their differences behind `#if ARENA` / `#if BUMPER` (nesting works, `#if !X`
  too). Changing a mode must leave the other builds bit-identical: compare the
  sha256s `npm run build` prints before and after.
- Party (`src/party.wat`) is bumper's ball with bumper.wat's cheese and round
  behind `#if !PARTY`. Each minigame is `src/mg/<key>.wat` (nine hooks under
  its prefix, called through `(!mg)`), its constants in `src/mg/<key>.mjs`
  (literal numbers, no imports; the WAT sees them through layout.mjs's
  `MG_CONSTS`, JS imports the file itself), its client module
  `client/mg/<key>.mjs`, its tests `test/mg-<key>.test.mjs`. State only in
  `PG_H` (header, in the prediction's copy), `PG_S`, `PG_BIG` and the record's
  party fields. `begin` (a ball's own start), `ground` and `push` run on the
  prediction's bank too: they read bank d's header, confirmed state fixed at
  least as far ahead as the prediction runs (the host's 201 ticks), and bank
  d's FX ring (what its own ball did this run: Thin Ice's own cracks), and
  write only that ball's record and that ring. A seed whose top byte is 0xA7
  forces a minigame (`--mg k`). `node tools/new-mg.mjs <key> <prefix> NAME`
  writes a new one and appends it to every list that names them
  (`test/new-mg.test.mjs` holds its anchors); ids are append-only. A
  minigame may be Rust (`rust/mg/<key>/`, `--rust`, `docs/rust.md`):
  `node tools/rust.mjs` writes its `src/mg/<key>.wat`, checked in; never edit
  that file by hand. A minigame plays red against blue by setting `PGF_TEAMS`
  in setup: the framework deals the sides (`PF_BLUE`), keeps `PG_TSCORE`, and
  places the winning side first (Dodgeball, Volleyball, Soccer).
- The arena's match modes (`M_*`: Fiesta, Infection, gun game, Juggernaut,
  and the team modes Team Slayer, Capture the Flag, Oddball, King of the
  Hill, Headhunter, Territories, VIP, Assault, and the kit modes without
  sides Lucky Blocks, Evade and Escape) are picked per match at run
  time, not built: `AH_MODE` to `AH_END`
  at `REGION + 0x48..0x74` (the team modes' scores, target and winner
  included), a side in `P_FL` (`PF_ZOMBIE`, `PF_JUGG`, `PF_BLUE`, and
  `PF_CARRY` for a flag's, the skull's or the bomb's carrier, `PF_FAST` for
  a zombie's legs, both together `PF_DOWN`, Evade's and Escape's downed:
  `P_FL` has no bit left), per-fighter state at
  `MODE_REC`, a team mode's objective in `AO` (`REGION + 0xcc00`, 1 KiB).
  A Fiesta must leave all of it 0, so its region stays what it was;
  `forcedSeed(m)` (`arena-view.mjs`) makes a room play one mode. The team
  modes are a kit: the core in `arena.wat` (sides, spawns, scores, the end,
  carrying), each mode `src/am/<key>.wat` (four hooks under its prefix,
  `start`, `tick`, `kill`, `bar`, called through `(!am)`, all on the
  confirmed world), its constants and AO fields in `src/am/<key>.mjs`
  (literal numbers; gathered into `AM_CONSTS` for the assembler as
  `MG_CONSTS` is, and read in JS from `src/am/consts.mjs`), its
  client module `client/am/<key>.mjs` (drawing, HUD, news, board, the AI
  fighter's goal), its tests `test/arena-<key>.test.mjs`. The map's
  objectives (flags, skull, hills) are `MAP_OBJ`, from `map.json`. The
  map compiler's core (`tools/map-compile.mjs`, with `tools/png-codec.mjs`)
  imports nothing from Node, because the map editor
  (`client/map-editor.html`) runs it in the page to check a map as it is
  drawn; `tools/map.mjs` and `tools/png.mjs` give it the disk and zlib.
  fighter's goal), its tests `test/arena-<key>.test.mjs`. A kit mode with
  `team: 0` in `MODES` has no sides; an AM entry may name optional hooks
  (`strike`, `spawn`, `hurt`). The map's
  objectives (flags, skull, hills) are `MAP_OBJ`, from `map.json`.
- Flight (`src/flight.wat`) is the arena build with `#if FLIGHT` where a
  ship differs: `$move` hands its tick to `$f_move`, charge shots and bombs
  fly in `$f_proj`, `$a_spawn` ends in `$f_spawn`, no pads, the match picks
  from `FLIGHT_MODES`. Its constants are `src/flight.mjs` (`FLIGHT_CONSTS`
  to the assembler, as `MG_CONSTS`); a ship's own fields (`F_*`) sit over
  the arena's gun bytes in the record, so arena code that arms a fighter
  (`$a_arm`, pickups) must stay off a ship. A ship's position is its
  centre. It builds on its own map (`FLIGHT_MAP`, `maps/skyways/`,
  drawn by `tools/skyways.mjs`; `--flight-map` gives it another); `MAP_CEILING` holds its ceiling. Its own
  mode, Ring Race (`M_RACE`, 12), sits past the arena's `MODES` so the
  centre. It always builds on its own map (`FLIGHT_MAP`, `maps/skyways/`,
  drawn by `tools/skyways.mjs`); `MAP_CEILING` holds its ceiling. Its own
  mode, Ring Race (`M_RACE`, 15: `MODES.length`, its news past every kit
  mode's MX codes, which `test/flight.test.mjs` checks), sits past the arena's `MODES` so the
  arena's build never sees it: its clock is `FLIGHT_TICKS`, its course the
  map's `race` gates (`MAP_RACE`), its progress `MODE_REC` points. Ships
  meeting (`$f_collide`) touch two records, so they are confirmed-only.
- Fireplace (`src/fireplace.wat`): each game is its own build under a prefix
  (`tools/asm.mjs` `prefixed()`, `GAMESETS`), so a change to a game changes
  Fireplace too. The playlist's state is the header's last 16 bytes
  (`FP_GAME`...) and `REGION + 0xe000` (8 KiB no game uses: marshmallows,
  `FP_NEXT`, `FP_MODE`): keep games out of both. `PLAYLIST` goes by position
  (games played mod its length), so a game may come twice; the next seed is
  drawn as a game ends (the arena's and Dogfight's force a mode, party's
  never a minigame). A seed with `FP_START` on top starts at an entry
  (`--start k` on `play.mjs` and `run-fireplace.mjs`).
  A game's static world (terrain, map) is rebuilt by `regrid` when a keyframe
  from another game arrives (`FP_WORLD`, `FP_STASH` at `0x360000`); the map
  area is cleared first, so two maps never mix.
- Inputs are one u32 word per player per tick (golf's layout in
  `src/view.mjs`; the arena's in `arena-view.mjs`; bumper and party reuse golf's).
  Keep fields that rarely change still: wire v4 codes deltas.

## Clients

- `client/host.mjs` owns what a page shares (memory, net and sim workers, the
  prediction's instance, sound, one GPU device); each game's frontend
  (`client/<game>-game.mjs`) exports `mount(host, opts)` returning
  `{ frame(now, target), unmount(), capture(), state() }`, with every listener
  on an AbortController. `bumper.html`, `arena.html` and `flight.html` mount one alone
  (flight's renderer, `client/flight-render.mjs`, has a full camera basis and ray-traces its ships);
  Fireplace mounts each in turn. Golf's own page, `client/main.mjs`, is
  separate (the CI gates drive its `window.__qg` hooks); `golf-game.mjs` is
  the lean frontend for Fireplace.
- The room is a relay's (`client/net.mjs`): one named, or on a copy's
  GitHub Pages site, once someone presses play online with friends or opens
  an invite (`?room=`), one the kit's room pool starts on that copy's wasm
  (`net/kit-rooms.mjs`, `relay.pool`). Otherwise (`client/kit.mjs`:
  `?local=1`, or no relay and no invite) it is a local one: `client/local.mjs` in the net
  worker's place closes every tick itself, the page's player in slot 0 and AI
  players after. Both sample the input slots through `client/input.mjs`.
  `coi.js` makes a page cross-origin isolated where the host can't send the
  headers.
- Renderers take `{ device }` to share the page's GPU device, and draw into
  `target` (a texture) when given one: that is how the TV shows a game.
- The room's look is a theme (`client/themes/<id>.json`, `client/themes.mjs`):
  data only the room's shader reads, local to the viewer, never the sim.
  Grandma's writes out every default. A new colour goes in `COLORS`, the
  shader and CONTRIBUTING.md's table (`test/themes.test.mjs` checks all
  three); `elo.json`'s mods are written from the themes (`node tools/elo.mjs`).
- A player's look (`client/looks.mjs`: a ball and a hat) is drawing only: the
  relay carries each slot's word beside the ticks (hello flag 4, `T_LOOK`),
  never in a tick, record or hash. The lists are append-only (a look's number
  goes on the wire); look 0 draws exactly as the riders always have, and a new
  pattern or hat style goes in both bumper's and party's shaders
  (`test/looks.test.mjs` checks). Achievements (`client/achievements.mjs`)
  test results read from the confirmed world while a game's end is held, and
  are kept in the browser, like the look.
- `elo.json` is Fireplace's manifest for its Elo Pros store row (jobs, mods);
  CONTRIBUTING.md is the outside contributor's guide, pay included.

## Style

- Comments are prose, terse and concrete, saying what and why in the code's
  own terms; match the density around them. The docs follow the same
  voice, with measured numbers, not adjectives.
- No new npm dependencies; the whole stack is wabt, binaryen (measurement
  only), Node, Deno and Chrome. The gates load `playwright` or
  `playwright-core`, whichever resolves; CI adds the latter with `--no-save`.
- Tests use `node:test` with helpers in `test/helpers.mjs` (`newSim`,
  `newArena`, `newBumper`, `newParty`, `newFireplace`); a new mode gets its own test file, a recorded
  log for the matrix, a CI step in `.github/workflows/determinism.yml`, and an
  online gate.
