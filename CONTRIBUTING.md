# Contributing to Fireplace

Fireplace is a living room with a TV that plays a playlist of games: golf,
the arena, Dogfight and Party's minigames. It is on the Elo Pros store as
Fireplace, and this repo is its source (CC0). Anyone can change it, people and
agents alike, and an accepted pull request is paid.

Six ways in, from no code to the engine:

- **A theme**: a reskin of the living room, one JSON file. No code.
- **A ball, a hat or a body**: a new look players can pick, one entry in a
  list.
- **A Party minigame**: a new round for Party, and so for Fireplace. A tool
  writes one that already plays; you make it yours.
- **A map**: a place to fight in, for the arena or Dogfight, drawn in the
  browser. No code.
- **A Roblox game**: a place of yours (or one licensed for reuse) as a map,
  and its rules written fresh as an arena mode or a Party minigame.
- **Anything else**: bots, the renderers, the netcode, fixes. Read CLAUDE.md
  and the doc in docs/ for what you touch.

## Getting paid

Any pull request merged into this repo pays the Elo Pros board's posted price.
The board posts it in dollars and pays it in ELO at the pool's price on the
day it pays. Read the price and what's open with
`curl -s https://elopros.com/api/munus?game=fireplace`.

1. Put the wallet you want paid in the PR's description: `Wallet: 0x…`. If an
   agent made the change, fill in the `Agent:` line with its harness and
   model.
2. Put it on the record: sign this text with that wallet, then
   `POST https://elopros.com/api/munus/fireplace-pr/submit` with
   `{"wallet": "0x…", "url": "<the PR's url>", "signature": "0x…"}`.

   ```
   elo play
   action: submit
   wallet: <your address, lowercase>
   day: <today, UTC, YYYY-MM-DD>
   detail: fireplace-pr <first 16 hex of sha256(url)> #<your deliveries to fireplace-pr so far, from 0>
   ```

   `GET https://elopros.com/api/play/message?action=submit&wallet=…&detail=…`
   returns the same text. [elopros.com/build.html](https://elopros.com/build.html)
   lists the open work.

No wallet is fine: a PR is merged and credited the same, it just isn't paid.
Merging is a person's call. By opening a pull request you dedicate your work
to the public domain under this repo's licence (CC0), so it must be yours:
no other game's names, characters, art or sounds.

## A theme

A theme changes what the living room looks like on the screen of whoever
picks it, and nothing else: the sim never sees it, so it can't desync a room.
Grandma's (`client/themes/grandma.json`) is the room as it has always been
drawn, and every other theme changes some of it.

```sh
npm ci && npm run build                                  # once
node tools/themes.mjs new <id> <your-github-login>       # client/themes/<id>.json, every field at Grandma's
node tools/serve.mjs                                     # then open http://127.0.0.1:8080/client/room.html?theme=<id>
```

`room.html` reads the file again every second, so the room changes as you
save. A mistake shows at the bottom and the room keeps the last good one. T or
a click goes to the next theme. In Fireplace itself, `?theme=<id>` picks one
and T cycles them while the room is in view; each viewer's pick is their own.

The file:

| field | what it is |
|---|---|
| `theme` | `1`, the format |
| `name` | what the TV calls it: 24 characters, plain ASCII |
| `by` | your GitHub login, credited on the store |
| `about` | one line, 200 characters at most |
| `window` | `snow`, `rain` or `clear` (stars and the moon) |
| `mantel` | `pumpkins`, `baubles` or `none` |
| `colors` | any of the colours below; one you leave out stays Grandma's |

A colour is `"#rrggbb"` (what a colour picker shows) or `[r, g, b]` from 0
to 1. The lights (`lampGlow`, `fire`, `night`, `moon`, `flakes`, `outdoor`,
`ambient`) are colours too: a darker one is a dimmer light.

| colour | what it paints |
|---|---|
| `brick`, `mortar` | the chimney breast and the firebox, and between the bricks |
| `mantel` | the mantel shelf |
| `hearth` | the hearth stone in front of the fire |
| `wood` | the TV's cabinet and the side table |
| `couch` | the couch you sit on |
| `trim` | the window's frame |
| `ceiling` | the ceiling |
| `floor` | the floorboards |
| `wallpaper` | two colours: the stripes |
| `baseboard`, `cornice` | the band along the floor, and the one along the ceiling |
| `rug` | three colours: the braided rug's yarns |
| `rugEdge` | the rug's edge |
| `lamp`, `lampGlow` | the lamp's shade, and its light |
| `fire` | the flames, the embers and the firelight on everything |
| `paintSky` | two colours: the painting's sky at the horizon and at the top |
| `paintGround`, `paintHouse`, `paintFrame` | the painting's ground, its cabin, its frame |
| `night` | two colours: the sky through the window, low and high |
| `moon` | the moon, and the stars on a clear night |
| `flakes` | snowflakes or raindrops |
| `sill` | the ledge outside the window |
| `outdoor` | the light the window lets in |
| `ambient` | the light that bounces round the room: how dark the shadows are |
| `props` | two colours: the two things on the mantel |
| `propCap` | a pumpkin's stalk, a bauble's cap |

Before the PR:

```sh
node tools/themes.mjs                          # checks every theme
node tools/elo.mjs                             # credits it in elo.json, which the store reads
node --test test/themes.test.mjs
node tools/theme-shots.mjs --themes <id>       # traces/themes/<id>.png: put it in the PR
```

CI draws every theme the same way and keeps the pictures as an artifact.

## A Party minigame

A minigame is four files: its rules in WebAssembly text (`src/mg/<key>.wat`,
nine hooks the framework calls), its constants (`src/mg/<key>.mjs`), how it
looks and how the bots play it (`client/mg/<key>.mjs`), and its tests
(`test/mg-<key>.test.mjs`). The tool writes all four for a sumo ring (a round
platform over the sea; bump the others off, the last ball on wins) and wires
it into the lists that name every minigame:

```sh
node tools/new-mg.mjs <key> <prefix> "<NAME>"     # e.g. node tools/new-mg.mjs marbles mb "MARBLE RUN"
npm run build && node --test test/mg-<key>.test.mjs test/party.test.mjs
node net/play.mjs --party --mg <id> --bots 7      # play it: open the URL it prints
```

Rather not install anything? The studio works on a minigame in the browser:
`client/studio.html` (on the game's site, or `node tools/serve.mjs` here).
Pick one of the minigames, edit its rules and its constants, and press build:
it assembles party with your minigame in it in the page, with the same
assembler as `npm run build` (on a minigame you haven't changed, the same
bytes). **Check** plays the debug build with AI balls on your minigame and
replays it with the balls' work split two ways, the hashes equal tick by
tick; **play** puts your build in front of you against AI balls; **send it
in** downloads the files you changed and opens GitHub's upload page for
`src/mg/`, where proposing the change makes the pull request. Edits reach the
sim only: the AI and the drawing read the site's constants until the change
is merged. A new minigame, its client module and tests still start from the
tool below.

Rather write Rust than WebAssembly text? Add `--rust`: the rules are then a
crate, `rust/mg/<key>/src/lib.rs`, and `node tools/rust.mjs` turns it into
`src/mg/<key>.wat` after each change (docs/rust.md; SUMO RING is the worked
example).

Then make it yours. The forty-two in `src/mg/` are worked examples, and
the top of `src/party.wat` and `client/party-game.mjs` says what each hook is
given and may do. The rules every machine must agree on are CLAUDE.md's "The
sim's rules", and the build refuses some of them outright. The ones that bite
a minigame:

- `ground` and `push` also run in the prediction, on bank `d`: they write only
  their own ball's record and bank `d`'s FX ring, and read bank `d`'s header.
- State lives only in `PG_H`, `PG_S`, `PG_BIG` and the record's `PG_M` and
  `PG_SCORE`. Nothing carries over in a local.
- Floats: `(!madd a b c)` for `a * b + c`, never fused; angles through
  `$sincos`. `$rand` never in `begin`, `ground` or `push`, which the
  prediction runs too.
- The bots have to play it (`brain` in the client module): every gate is
  played by bots.

Ideas are in `docs/roadmap.md`'s kits table. The bar (CI runs the tests and
Party's rotation on your PR; run the two with `--mg` yourself, and say in the
PR that they passed):

```sh
npm test                                                   # its tests, and every other
node tools/genparty.mjs --mg <id> --out logs/mg.qgl        # a recorded match of it...
node harness/matrix.mjs --log logs/mg.qgl --wasm build/party/game.wasm   # ...equal in all 27 configurations
node net/run-party.mjs --mg <id>                           # online: a relay, bots and Chrome, every hash checked
```

Matrix and online runs need Deno (`sh tools/install-deno.sh`) and Chrome
(Playwright's).

A minigame changes the party and Fireplace builds; golf, the arena and
Dogfight must stay bit-identical (compare the sha256s `npm run build` prints
before and after).

## A ball, a hat or a body

A look is a ball, a hat and a body a player picks on the couch (B, H and P),
and the whole room sees it. It is drawing only: the relay carries it beside the game,
never in it, so a look can't desync a room either. Each is one entry in
`client/looks.mjs`:

- a ball: a `key`, a `name` (capitals, as the TV's font has them), one of
  the patterns (`BEACH`, `STRIPES`, `RIBS`, `SOLID`, `METAL`, `EIGHT`) and
  its two colours `a` and `b` (0 to 1 each);
- a hat: a `key`, a `name`, one of the styles (`CAP`, `BEANIE`, `BAND`,
  `HELMET`, `NONE`, `PUMPKIN`, `CROWN`) and its `color`;
- a body: a `key`, a `name`, `blocky: true`, its `skin` (the arms and head)
  and its `face` (1 a smile, 4 a robot's; `client/rider.mjs` `PART`).

Add it at the end of its list: a look's number is its place in the list, and
that number is what goes over the network. `unlock: '<achievement id>'` makes
it earned rather than free (`client/achievements.mjs` has the ids).

```sh
node tools/serve.mjs     # then /client/party-render-demo.html?scene=wardrobe: every ball and hat, rolling; ?scene=blocky, ?scene=outfits: the bodies
node --test test/looks.test.mjs test/rider.test.mjs
```

A new pattern or hat style is code: a case in the ball's or the head's
shader, in `client/party-render.mjs` (`lookBall`, `lookHat`), and the test
checks it has it. On a blocky body
a hat is boxes, in `rider()` in `client/rider.mjs`.

## A map

A map is where the arena's fighters (Box Canyon) or Dogfight's ships
(Skyways) play: a folder in `maps/` holding `map.json`, `height.png` and
`surface.png`. The map editor draws one in the browser:

```sh
npm ci && npm run build      # once
node tools/serve.mjs         # then open http://127.0.0.1:8080/client/map-editor.html
```

Start from Box Canyon, Skyways or an empty square. Raise, lower, flatten
and smooth the ground and paint it grass, rock, sand or metal; drag out
boxes for walls, floors and roofs; place spawns, weapon pads, teleporters,
the two flags, the skull, King of the Hill's hills and, for Dogfight, the
race's gates. Pick a box and **make it move** for a lift or a platform that
goes back and forth (how far, how long each way, how long it waits). The
panel checks the map with the build's own compiler as you
go and says what it would refuse. **3D** (or **both**) shows it as the game
draws it: drag to turn, right-drag to move, the wheel to zoom. Save writes the three files: in Chrome,
pick a new folder in `maps/`; elsewhere they download and you put them
there. Then play it with bots:

```sh
node net/play.mjs --arena --map <folder>                # open the URL it prints
node net/play.mjs --flight --mode 16 --map <folder>     # Dogfight's Ring Race, on a map with gates
```

A Roblox place makes a map too: in the editor, **open… > a Roblox place…**
(or drop the `.rbxl` on the page), or `node tools/roblox.mjs place.rbxl`.
Its parts, colours, terrain, spawns and teams come over; the report says
what didn't, and **download the port brief** gives its scripts and what
they do, to port the game itself ([docs/roblox.md](docs/roblox.md)). Only bring a place that is
yours or that its owner has licensed for reuse. A MagicaVoxel model
(`.vox`) does too, the same ways (**a MagicaVoxel model…**, or `node
tools/vox.mjs model.vox`): name an object `red spawn`, `blue spawn` or a
weapon's name in MagicaVoxel and it comes over as one ([docs/vox.md](docs/vox.md)).

Send it as a pull request with the folder in `maps/`, and say which game
it is for. The editor's **send it in** does that without git: it downloads
the three files and opens GitHub's upload page for `maps/<folder>/`; drop
them there and propose the change (GitHub makes a fork for you if you need
one). CI checks every map in `maps/` the way you can here:

```sh
node tools/map-check.mjs maps/<folder>   # compiles, builds into the debug sim, plays three modes with AI fighters
```

A map is part of the game's build, not just a look, so it
reaches everyone when it is merged and a game is built on it. Each game
builds one map today; several in one build is on the roadmap.
`docs/arena.md`'s "Making a map" has the format, for editing `map.json` by
hand.

## A Roblox game

A game, not only its map: a Roblox place that is yours, or that its owner
has licensed for reuse (Roblox's 31 open-source levels are MIT), playing on
Fireplace. The map comes over by itself; the rules are written fresh.

```sh
node tools/roblox.mjs place.rbxl --brief   # maps/<name>/, and port/<name>/: its scripts and port.md
node net/play.mjs --arena --map <name>      # its map with bots
```

`port.md` is the brief: the players (speed, jump, health, what they carry),
the teams and the leaderboard, every remote and the scripts that use it,
saved data and what it sells, what moves (a lift or platform its script
tweens to and fro already moves in the map; anything else that moves is a
structure of its own for you to give a `move`), and the Roblox services the
scripts lean on, with what stands for each here. Write the rules as an
arena mode (`src/am/<key>.wat`, four hooks; docs/arena.md) or a Party
minigame (`node tools/new-mg.mjs`; docs/party.md), whichever the game is
closest to. What a player paid for on Roblox does not come over as an edge.
Send the map in `maps/` and the mode or minigame with its tests, a log for
the determinism matrix and an online gate, as a new mode needs (CLAUDE.md).
[docs/roblox.md](docs/roblox.md) has what comes over and what a port takes.

## Anything else

Read CLAUDE.md first: its rules are what keeps every machine on the same bits.
Then the doc in docs/ for what you touch. `npm test` before the PR; CI
runs everything else on it.
