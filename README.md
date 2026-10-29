# Fireplace

A party game for up to 256 people in one room, in the browser. You sit down in
a living room at night, the fire going, snow at the window, and the TV is
playing whatever the room is on: bumper balls, a Party minigame, an arena
match, a Dogfight, a hole of golf. Click and the camera closes in until the
TV fills the screen and you're in it. When a game ends it pulls back to the
room, hands out marshmallows to the top three and tunes in the next. Come and
go as you like.

![The living room: the fire going, the TV on, Fireplace's title card](docs/f1-fireplace.png)

Fireplace is on the [Elo Pros](https://elopros.com) store. This repository is
all of it, released into the public domain (CC0).

## Make your own game from this

Fireplace is also a starter kit: start your own multiplayer browser game from
it, with a GitHub account and nothing installed. You get your own copy with
its own web page, a plan for your game, and Claude to help build it.

1. **Copy it.** Press **Use this template** at the top of this page, then
   **Create a new repository**, named after your game.
2. **Add Claude (optional).** Either sign in with GitHub on
   [Elo Pros](https://elopros.com/login.html) and add credits on the
   [dev console](https://elopros.com/dev-console.html#credits): Claude is
   paid by the token from your balance, with nothing to paste here. Or use
   your own Claude: in your new repo, **Settings > Secrets and variables >
   Actions > New repository secret**: `ANTHROPIC_API_KEY` (a key from
   [console.anthropic.com](https://console.anthropic.com)) or
   `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`, if you have a Claude
   plan). Either way, **Settings > Actions > General**, tick "Allow GitHub
   Actions to create and approve pull requests".
3. **Plan your game.** **Issues > New issue > Plan my game**, and answer the
   questions. Claude names your copy after your game, writes its design and a
   step-by-step plan as a pull request, and opens your first steps as issues.
   Comment `@claude` on one and Claude builds it as a pull request. Without
   Claude: `node tools/kit.mjs init "My Game"` renames it, and
   `node tools/new-mg.mjs` starts a minigame ([CONTRIBUTING.md](CONTRIBUTING.md)).
4. **See it live.** **Settings > Pages > Source: GitHub Actions**, then
   **Actions > pages > Run workflow**. When it finishes, your game is at
   `https://<you>.github.io/<repo>/`: you and AI players, no server needed.
   Every push updates it. To play with friends, press **play online with
   friends** at the foot of the room: Elo Pros' room pool starts a room
   running your game, the page moves into it, and its address is the
   invite to send (**copy invite link**). An online room has no AI players;
   if the pool can't give one, the page says why and you stay with the AI
   players ([docs/hosting.md](docs/hosting.md)).
5. **Put it on Elo Pros.** On the [dev console](https://elopros.com/dev-console.html),
   list your game straight from your repo; no wallet needed. A `sell` line
   in `elo.json` sells copies, 100% of the price to you; we hold the money
   until a `wallet` line says where to send it. The store's shelves show a
   game by its capsule, `elo/capsule.png` (616×353): a copy starts with a
   frame of bumper balls, so draw your own.

## The games

The room plays a playlist, round and round: bumper balls (two rounds), Party
(three minigames), the arena (one three-minute match), Party again, a
three-minute Dogfight, a hole of golf. The top three of each game get 3, 2 and
1 marshmallows.

| | |
| --- | --- |
| [**Bumper balls**](docs/bumper.md) | Every player a ball on a wheel of Swiss cheese. Bump the others into the holes and keep out yourself; the rim crumbles, the holes widen, power-ups drop from the sky. Last ball rolling wins. |
| [**Party**](docs/party.md) | Bumper balls' ball and a different minigame every round, 41 of them: Thin Ice, Color Call, Sweeper, Red Light, Bomb Rain, The Wall, Musical Pads, King of the Hill, Hot Potato, Coin Rush, Paint Party, Downhill, Fruit Chute, Tag, Snowball, Tilt Table, Rising Lava, Gale Force, Drum Roll, Hoopla, Pinball, Light Trails, Maze Run, Bullseye, Cannonade, Jump Rope, Glass Bridge, Gate Crash, Stompin' Ground, Seesaws, Kart Grab, Disaster Island, Slap Happy, Trap Run, Parry Ball, Mingle, Honeycomb, Dodgeball, Volleyball, Soccer, Sumo Ring. |
| [**The arena**](docs/arena.md) | A shooter on Box Canyon, a map with two bases, a cave and teleporters, and fifteen modes: Grab Bag, Zombies, Gun Game, Juggernaut, Lucky Blocks, Evade, Escape, and red against blue, Team Deathmatch, Capture the Flag, Keep Away, King of the Hill, Skull Hunt, Territories, VIP and Assault. |
| [**Dogfight**](docs/flight.md) | The arena with wings: every fighter a ship over Skyways, a valley with a river canyon, spires, arches and ring gates. Lasers, a homing charge shot, bombs, boost, brake and barrel rolls, in a free-for-all, red against blue, the juggernaut or Ring Race, three laps through the gates. |
| [**Golf**](docs/golf.md) | One course for everyone, rockets and grenades for clubs: a blast just behind your ball drives it 200 m, and every ball ever hit stays in play. |


<p>
<img src="docs/b1-bumper-256.png" width="49%" alt="Bumper balls with 256 players">
<img src="docs/p1-chute-128.png" width="49%" alt="Party's Fruit Chute with 128 balls">
<img src="docs/a5-ctf.png" width="49%" alt="Capture the Flag in the arena">
<img src="docs/a3-box-canyon.png" width="49%" alt="Box Canyon">
</p>

Each player picks a ball and a hat on the couch, which everyone in the room
sees, and earns achievements across the games. The room itself can be
reskinned: a theme is one JSON file of colours, ornaments and weather
(`client/themes/`), and four ship with it.

## Play it

You need Node 22 and the newest Chrome (WebGPU, WebTransport).

```sh
npm ci && sh tools/install-deno.sh       # once: wabt, binaryen, Deno 2.9.7 into .tools/
node net/play.mjs --fireplace            # the relay, the page and 15 AI guests; open the URL it prints
node net/play.mjs --fireplace --bots 0   # just people
```

Click (or Enter) to sit down; then each game's own controls. While the room is
in view, T changes the theme, B and H your ball and hat, L your achievements.
`?watch=1` spectates, `?bot=1` sits an AI guest at your controls, F goes
fullscreen. Each game also runs alone, with its own page:

```sh
node net/play.mjs --bumper               # client/bumper.html, 15 AI balls
node net/play.mjs --party [--mg k]       # client/party.html, the rotation or minigame k
node net/play.mjs --arena [--mode k]     # client/arena.html, the modes in turn or mode k
node net/play.mjs --flight [--mode k]    # client/flight.html, Dogfight
node net/play.mjs --fireplace --start 4  # Fireplace from the playlist's entry 4 (Dogfight) on
node net/play.mjs                        # golf, client/index.html
```

With no relay, a page plays a local room: you and AI players (`?bots=`, 7 by
default), nothing on the network. That is what a copy's GitHub Pages site
plays until someone presses **play online with friends** or opens an invite
(`?room=`), which take it to a room from the kit's room pool;
`node tools/serve.mjs` and `client/fireplace.html?local=1` show it here.

Every room is saved as a replay when it ends (`replays/`), a few kilobytes a
minute, and plays back in the page with `?replay=../replays/<file>`.

## How it works

- **Hand-written WebAssembly.** The whole simulation, every game, is WAT
  written by hand (`src/`), folded by a small macro assembler
  (`tools/asm.mjs`) and assembled with wabt. No compiler, no engine. All five
  games build into one 698 KB module, `build/fireplace/game.wasm`, 213 KB
  gzipped, of which 35 KB is Box Canyon's height map and 80 KB Skyways'.
- **Deterministic lockstep at 125 Hz.** Only input words cross the network,
  one 32-bit word per player per tick. Every machine steps the same bits, so
  bandwidth follows players, never balls or bullets: about 9 KB/s down per
  player with 256 in the room.
- **A referee checks everyone.** The relay (Deno, WebTransport) runs the same
  wasm as the clients, hashes the world every 128 ticks, and resyncs anyone
  who differs. Late joiners start from a keyframe; spectators fan out through
  trees of relays; a standby relay takes a room over if its relay dies.
- **Prediction.** Your own movement and shots are stepped ahead on a copy of
  the world with the same code, so they show on the next frame.
- **No assets.** No textures, models, sound files or fonts: every shape is
  drawn on the GPU (WebGPU), sounds and music are synthesized, the font is
  3x5 bitmaps. The whole page is 436 KB gzipped.

The long form, with what each part measured, is
[docs/netcode.md](docs/netcode.md); [docs/wire.md](docs/wire.md) is the
protocol, for writing a client in any language, and
[docs/hosting.md](docs/hosting.md) runs a pool of rooms.

## The repository

| | |
| --- | --- |
| `src/` | the sim: the engine and golf (`game.wat` and friends), the arena (`arena.wat`, its team modes in `am/`), flight (`flight.wat`), bumper balls (`bumper.wat`), Party (`party.wat`, a minigame a file in `mg/`), the playlist (`fireplace.wat`), and `layout.mjs`, the one memory map everything reads |
| `client/` | the browser: `fireplace.html` and the room, each game's frontend (`<game>-game.mjs`) and WebGPU renderer, the AI guests, sound, themes, looks and achievements, and the map editor (`map-editor.html`) |
| `net/` | the relay and its referee, the bot host, the room pool, and the online gates (`run-*.mjs`) |
| `harness/` | replays one recorded match in Node, Deno and Chrome, every JIT tier and thread count, and compares every tick |
| `tools/` | the assembler, the map compiler, a Roblox place's and a MagicaVoxel model's converters (`roblox.mjs`, `vox.mjs`), match recorders (`gen*.mjs`), a minigame generator, the trailer renderer, the starter kit's first run (`kit.mjs`) and the static site for GitHub Pages (`site.mjs`) |
| `maps/` | Box Canyon and Skyways: two images and a JSON file each |
| `test/` | `node:test`, one file per game, mode and minigame |
| `docs/` | each game's long-form doc, the netcode, the wire, the roadmap |

## Develop

```sh
npm run build                            # every sim; prints each wasm's sha256
npm test                                 # 644 tests, about 9 minutes
node --test test/bumper.test.mjs         # one file
node tools/genfireplace.mjs --bots 12 --ticks 145000 --out logs/fireplace.qgl
node harness/matrix.mjs --ticks 145000 --log logs/fireplace.qgl --wasm build/fireplace/game.wasm
node net/run-fireplace.mjs               # online: relay, bots, headless Chrome, every hash checked
```

CI (`.github/workflows/determinism.yml`) runs the tests, every game's
recorded match in every runtime, configuration and thread count, and every
online gate, on each push. [CLAUDE.md](CLAUDE.md) is the short guide to the
engine's rules; [docs/roadmap.md](docs/roadmap.md) is what comes next.

## Contributing

Anyone can change Fireplace, people and agents alike, and an accepted pull
request is paid through Elo Pros. A room theme is one JSON file and no code;
a ball or a hat is one line; a Party minigame starts from
`node tools/new-mg.mjs`, which writes one that already plays.
[CONTRIBUTING.md](CONTRIBUTING.md) has the how and the pay.

## Licence

[CC0 1.0](LICENSE): no rights reserved.
