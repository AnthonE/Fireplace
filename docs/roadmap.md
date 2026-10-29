# Roadmap: 128 games of 128 players

The plan for what comes after Party, written so a session can pick up any
part of it. Every number here was measured on this repo; where something is
not measured yet, it says so.

## Where it is

58 games, each gated online: golf, bumper balls, the arena's fifteen modes
(Grab Bag, Zombies, gun game, Juggernaut, Lucky Blocks, Evade, Escape, and red against blue: Team
Deathmatch, Capture the Flag, Keep Away, King of the Hill, Skull Hunt,
Territories, VIP, Assault) and Party's 41 minigames. Fireplace plays them in turn.
Dogfight ([docs/flight.md](flight.md)), the arena with every fighter a ship
over its own map, is gated online too (256 pilots, every hash equal) and is
on Fireplace's playlist between party and golf.

What a page downloads, gzipped, everything it imports included:

| Page | Files | Gzipped |
| --- | --- | --- |
| `client/party.html` | 54 | 275 KB (wasm 29 KB) |
| `client/fireplace.html` | 72 | 436 KB (wasm 85 KB, 68 KB of it Box Canyon's height map) |
| `client/bumper.html` | 38 | 114 KB |
| `client/arena.html` | 44 | 190 KB (the team modes: 6 files and 31 KB of it) |

No textures, models, sound files or fonts: sounds are synthesized, the font is
3x5 bitmaps, every shape is drawn on the GPU. A Party minigame adds about
10 KB of client code and 2 to 3 KB of wasm.

Cost a tick at 256 players: 0.2 to 0.4 ms of the sim's 8 ms. Cost a frame on
the main thread: 0.5 ms for 256 balls, 0.25 ms for 1,172 ice tiles, about
2 ms for 20,000 solids. Not measured: frame rate on a real GPU (headless
Chrome here is SwiftShader).

A Party minigame on the framework is about 1,200 to 1,500 lines (sim, client
module, tests) and about an hour of one agent; this 4-core machine runs two
to four at once. Twelve took four hours.

## The engine's limits

- 256 players a room; more watch through the relay tree (600 tested).
- 512 KiB of gameplay state, hashed and snapshotted. Paint Party's grid is the
  largest so far, 128 KiB.
- One u32 input word per player per tick. More bits go in frames over
  several ticks, as the arena's lag and reload bits do.
- The prediction moves your own body; whatever another player does to you
  arrives a round trip later.
- No secrets: every machine holds the whole world.
- Physics: spheres, Quake-style bodies against a heightfield and up to 2048
  boxes (512 until Roblox places needed more: [docs/roblox.md](roblox.md)),
  and whatever a minigame's ground and push hooks describe.
- 125 Hz. A lower rate (60 Hz halves CPU and bandwidth) means a per-sim tick
  length the relay reads at the hello; do it only for a game that measures
  over budget.

## Kits

A kit is a framework with hooks, as `src/party.wat` is for the ball: one
wave to build (framework, frontend, bot), then a game on it is one agent.

| Kit | Now | Target | Candidates |
| --- | --- | --- | --- |
| Party (the ball) | 40 | 60 | Mini Golf, Sumo Ring; with teams: Fall Ball, Egg Scramble, Tug o' War |
| Arena (the fighter) | 15 | 24 | Slayer at run time, Battle Royale (a zone and loot pads), Snipers, Swords, Grifball, Stockpile, Infection by teams, Floor is Lava, a Tower of Hell obby, a zombie horde |
| Champion (top-down, new) | 0 | 14 | FFA ARAM (below), team ARAM 128 v 128, co-op survivors against hordes, a boss raid of telegraphed patterns, Gem Grab, Showdown, Bounty |
| Grid (2D boards, new) | 0 | 16 | Tetris 99, Puyo 99, Dr. Mario 99, Bomberman 128, Snake, Pac-Man 99; races of Minesweeper, 2048, match-3, nonograms |
| Vehicle (new) | 0 | 12 | a kart race, balloon battle, bumper cars, car soccer 64 v 64, boats, hover racing, a demolition derby |
| Flight (the ship, `#if FLIGHT` on the arena) | 1 (4 modes) | 6 | capture the flag in the air, escort, a base raid, survival against waves |
| Golf, bumper balls | 2 | 2 | |

The grid kit is this engine's model at its plainest: your own board is
predicted exactly, the garbage and bombs others send arrive a round trip
later. A board of 10 x 20 cells is 200 B; 256 of them are 50 KB.

What doesn't fit without engine work: hidden information (poker, Among Us,
hide and seek: it needs the relay to hold secrets and reveal them as input),
1 v 1 twitch duels (a fighting game needs a rollback of the other player, not
only of your own body), physics sandboxes, open worlds.

## Engine work, in order

1. Teams: a side per record, friendly fire off, team scores; Party, the arena
   and the champion kit. It unlocks about ten games. The arena's is done: red
   against blue as a kit of team modes (`src/am/<key>.wat`, four hooks; a
   carrier bit for flags and the skull; the map's objectives in `MAP_OBJ`),
   with Team Slayer, Capture the Flag, Oddball and King of the Hill on it, a
   mode on the kit about an hour of one agent. Party's is done too: the same
   side bit, dealt from the round's seed, a score a side and the winners all
   first (`PGF_TEAMS`), with Dodgeball on it. The champion kit's is next.
2. The champion, grid and vehicle kits. The champion and vehicle kits draw
   with `client/party-render.mjs` (its decals are the telegraphs of a
   top-down game); the grid kit wants a small board renderer.
3. The arena: several maps in one build chosen at run time, boxes that move
   (obbies), new maps. A map now comes from the map editor
   (`client/map-editor.html`) and from a Roblox place (`tools/roblox.mjs`)
   as well as from code. Maps at run time are done (docs/arena.md, "Maps
   at run time"): a packed map laid by the `map_load` export, every number
   in it checked first, the page's `?map=`, the relay's and bot host's
   `--map`, and the hello's hash naming the map with the build. Left:
   - the kit's room pool by map: a room asked for by its wasm's and map's
     hashes, the map fetched by the pool as the wasm is;
   - a replay that names its map's bytes beside the wasm's (its prefix
     already covers both);
   - a map cycle: a list of map hashes the room walks, beside `PLAYLIST`,
     which means laying a map between matches, not only before the first
     init;
   - Fireplace taking one (its playlist builds each game's world itself).
4. Fireplace: a vote for the next game, then a board between games (dice,
   stars, coins) over the minigames.
5. Pipelines compiled before a Fireplace switch: on SwiftShader the first
   switch into Party held the page's GPU about 40 s while its shaders
   compiled (every hash still equal). Then a frame rate on a real laptop GPU.
6. Smaller debts: Musical Pads' ground is exact only while the prediction runs
   less than 125 ticks ahead (the host predicts up to 201), Seesaws' less
   than 256 (its ring is written 256 ticks ahead, `PRED_MAX` is 256); bumper's and the
   arena's pages load Party's constants through `layout.mjs`'s `MG_CONSTS`
   (26 KB gzipped).
7. People playing it. Everything so far is played by bots.

## Bringing maps and games in

Built: a Roblox place as an arena map, one command or one file dropped on
the map editor ([docs/roblox.md](roblox.md)). Of Roblox's 31 open-source
levels, 29 convert, 22 of them with every box kept. The converter is two
halves: a reader for the format (`tools/rbx-file.mjs`) and a core that takes
solids (convex shapes as planes, a union's parts less its negated ones, a
colour each), ground columns and markers (spawns, teams), and makes boxes, the
ground and the report (`tools/rbx-map.mjs`). Another engine is another
reader into the same solids. None of these is built yet; in order of how
mechanical each is and where its builders are:

1. **Minecraft** (`.schem`, Sponge's schematic; `.litematic`; a world's
   `.mca` regions): blocks are unit boxes, so nothing is approximated; the
   joins and the fit do the rest, and a block's colour comes from a table as
   BrickColor's does. The most builders of any engine, and their builds are
   already blocks.
2. **Quake and TrenchBroom** (`.map`, the Valve 220 format): a brush is a
   convex solid given by its planes, which is the converter's solid as it
   stands; `info_player_deathmatch` is a spawn, the weapons are pads, CTF's
   team spawns are the flags. Arena shooters' mappers, for an arena shooter.
3. **glTF 2.0** (`.glb`): what Unity (UnityGLTF, glTFast), Unreal (its own
   exporter), Godot and Blender all write. A mesh goes into the same columns:
   a vertical line's crossings with a closed mesh's triangles are its solid
   spans (a collision mesh is best). Nodes named `spawn`, `spawn_red`,
   `flag_blue`, `pad_rocket` are markers; `void` a height. One reader for every
   engine that exports glTF.
4. **MagicaVoxel** (`.vox`): voxels and a palette, exact as Minecraft's.
5. **Unity's colliders**: an editor script that writes a scene's box,
   sphere and capsule colliders as JSON. A BoxCollider is an arena box
   exactly (a turned one through the columns), with no mesh at all: what
   Unity itself collides with, which is the arena's whole concern.

What no reader brings is a game's code: Luau, C#, GDScript, Blueprints run on
their engine's API. A game's rules are written fresh on a kit here (a port,
by an agent). What the readers do for a port is the brief: the level done,
and the scripts listed with the engine services each calls, its network
messages and what it sells, so a port is one prompt on everything, not one
per question.

A whole game that is not a Fireplace game goes to Elo Pros as it is: the
store lists any web build from a repo (`elo.json`'s `web` block). Unity
(WebGL), Godot (HTML5), Defold, PlayCanvas, Babylon.js, three.js, Phaser,
Construct and GameMaker (HTML5) export one; Unreal has had no web export
since 4.24, so it lists as a desktop build. The mechanical step worth
building there is the store's: read an engine's export folder (Unity's
`Build/*.loader.js`, Godot's `.pck` beside its `index.html`) and write the
`elo.json` for it.

A converted map plays the minute it is made, in the editor's **play it
here** or online with `net/play.mjs --map`, laid at run time (Engine work,
3); what's left is the room pool taking maps by hash.

## FFA ARAM (the champion kit's first game)

- The Abyss: a round arena for 256, bushes; a long bridge later for team ARAM.
- Every life four random abilities (Q W E R) and two summoner spells (Flash
  and one drawn), from a table of about 30 kept in `layout.mjs` as the arena
  keeps `ARMS`: skillshots, delayed ground blasts behind a warning ring,
  dashes, blinks, shields, heals, hooks, knock-ups, slowing fields, turrets,
  a global ultimate. A death may spend a reroll.
- Cooldowns, no mana; levels from kills; 4 s respawns; 8 minutes; most kills
  wins.
- Buffs fall from the sky as bumper's orbs do, on landing rings: Baron
  (empowered abilities), Dragon (stats), Poro snax (heal, speed), health
  relics.
- The word: yaw 14 bits, cursor distance 6, WASD 4, the ability 3 (Q W E R D
  F), a cast counter 2, 3 spare. It changes only when you aim or cast.
- Predicted: your movement, dashes and blinks, your projectiles' launch.
  Late by a round trip: hits and crowd control from others.
- Drawn with `client/party-render.mjs`: a camera at three quarters overhead,
  champions as figures, abilities as glows, beams and decals.

## Mods: what people make for it

Built: room themes (`client/themes/`, a JSON file each, local to the viewer;
`client/room.html` to make one), a minigame scaffold (`tools/new-mg.mjs`),
CONTRIBUTING.md, issue forms and a PR template, CI on pull requests from
forks, and `elo.json`, which the Elo Pros store reads: picked jobs for the
board's `fireplace` lane, where an accepted PR is paid, and a `mods` list
crediting who made what (every theme is one). Next, in order:

1. Things in the room. The mantel holds two things today (pumpkins or
   baubles, a theme's pick). A shelf of slots (the mantel, the side table,
   the wall over it) that a theme fills from a fixed set (a candle, a trophy,
   a framed picture), each a few lines of the room's shader, so a theme still
   stays data. Then the wall shows the viewer's own Elo Pros achievements: a
   plaque drawn in the 3x5 font like the TV's cards, from
   `/api/face/{wallet}` once the page knows a wallet (below).
2. Skins. Built: looks (`client/looks.mjs`), a ball, a hat and a body each
   player picks, which the relay carries beside the sim to everyone in the
   room (hello flag 4), ten balls, seven hats and five bodies (the round
   rider, three blocky, a robot: `client/rider.mjs`, the arena's fighters the
   same figure), four of them earned with the page's achievements
   (`client/achievements.mjs`), and four emotes in the word's top byte.
   Built too: the Elo Pros avatar, a word any game can draw (a 32-colour
   palette and the figure's six parts at 5 bits each, a face bit), set on a
   player's profile and served on `/api/face/{wallet}`, which the relay reads
   at sign-in and sends beside the looks (`T_AVATAR`), so the figure a player
   is on Elo Pros is the one they ride a ball as here. Next, owned ones as Gates
   does them: an `EloItem` collection for Fireplace (one deploy, the
   operator's), catalog rows in scry-forge's `data/items/catalogs.json` with
   `title: "fireplace"`, and the relay reading
   `/api/items/of/{wallet}?title=fireplace` once a slot has a wallet (below)
   and refusing an owned look a slot doesn't hold. A theme is free, a look is
   free or earned, an item is owned.
3. The playlist as a list (`GAMESETS`, `!pick` and `fireplace.mjs` reading N
   games), so a whole new game joins Fireplace as one entry once the kits
   below exist.

## Accounts and persistence through Elo Pros

What `AnthonE/scry-forge` has today: the wallet is the whole identity;
`sdk/js/elo-3.js` (served at `https://elopros.com/sdk/elo-3.js`) gives a
third-party game `Elo.signIn({nonce})` (Sign-In With Ethereum, or Solana's),
which the game's own server checks with `POST /api/signin/check`; profiles at
`GET /api/face/{wallet}` (CORS on); friends and presence (`meter/friends.py`,
`meter/playtime.py` polling a game server's `online.json`); chat; items and
copies on chain (`/api/items/of/{wallet}`); a self-serve listing
(`meter/openlane.py`, `play_url`). It has no logins without a wallet (the
design is `docs/client/ACCOUNTS.md`); stats, achievements and boards any
game's servers report (`meter/gamestats.py`); Elo-scale ratings from the
match results they report (`meter/ratings.py`); and a rated queue that
matches parties by rating (`meter/lobbies.py`, op `queue`).

The wrapper, ours first:

1. List Party and Fireplace as free titles with `play_url` on these pages
   (the listing rules ask for the source to be public). Fireplace has its
   row and its board lane, `fireplace-pr`, in scry-forge since 2026-10-25.
   Its page says coming soon, with no play link: the play link comes back
   once nothing a player sees is named after Halo or Quake (the modes, guns,
   medals and map shown are renamed; the repo's own name is left) and the
   room pool is on the game box (scry-forge's NOW row 23). `elo.json`
   lands on the row once its steward signs it (`sign_manifest.py --game
   fireplace --seq 1`, scry-forge's `docs/store/GAME-REPO.md`).
2. Sign-in: built. The page's button calls `Elo.signIn({nonce})` with a
   nonce the relay hands out, and `net/relay.ts` has Elo Pros check it and
   keeps the wallet as the slot's player ([wire.md](wire.md)). Guests still play.
3. Names, faces and skins: the relay reads `/api/face/{wallet}` and
   `/api/items/of/{wallet}` and sends them beside the sim, never in it, so the
   hashed world is the same with or without them. Skins on chain become ball
   stripes and riders' hats.
4. Presence: the relay serves `online.json` (and the operator a
   `servers.json`), so playtime and friends' join links work.
5. Results: the relay's referee steps the room itself, so its standings and
   interval hashes are the room's truth, not any client's: the "replay"
   evidence tier of `docs/store/ACHIEVEMENTS.md`. Ratings are built: each
   game's places go to Elo Pros as a rated match ([hosting.md](hosting.md)).
   The page's achievements are
   already tests over those standings as the world holds them
   (`client/achievements.mjs` `readResult`, `record`), so the relay can run the
   same ones for each signed-in slot and publish them per wallet, the shape
   Gates' shards serve (`/achievements.json`), and they follow the player
   off one browser.

Then, in scry-forge: a key-value store per wallet for what lasts (party
points, marshmallows).

## Sessions

1. Teams; the champion kit and FFA ARAM; Team Slayer, CTF, Oddball and King of
   the Hill in the arena. The arena's half is done (its teams, the kit and the
   four modes: one session of about five and a half hours, up to four agents at once);
   Party's teams are in, with Dodgeball, Volleyball and Soccer; their other games
   (Fall Ball, Egg Scramble, Tug o' War), the champion kit and FFA ARAM are left.
2. The grid kit: Tetris 99, Bomberman 128, Snake, Puyo 99.
3. The vehicle kit and karts. A kart's handling exists already, as one
   Party minigame's push on the ball (Kart Grab, `src/mg/kart.wat`): a
   heading, a drift's charge and a spin-out packed in the record's `PG_M`,
   the gas, the grip and the drift worked along the heading, exact in the
   prediction. The kit makes the kart a body of its own (a box on wheels, not
   a ball) and puts a race, balloon battle and the rest of the list on it.
4. Then waves of 12 to 16 Party and arena games.
5. The Elo Pros wrapper, whenever: it depends on nothing above.

About seven to nine long sessions on this machine to reach 128. Each new game
keeps the repo's bar: its own test file, a recorded log equal in all 27
configurations of the matrix, and an online gate. To claim 128 games of 128
players, each game also gets a 128-bot gate, run nightly in CI (about two
hours for all of them).
