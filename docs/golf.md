# Golf

256 players in one room, one course, rockets and grenades as clubs, and every
ball ever hit stays in play. Golf is where the engine started (`src/` built
plain, `build/game.wasm`), and in Fireplace it is a hole on the playlist. Its
own page, `client/index.html`, plays it alone, with a netcode graph and
replays; Fireplace mounts the lean frontend, `client/golf-game.mjs`. Both
draw with `client/render.mjs`: the course low-poly under a blue sky
(`client/lowpoly.mjs`, the arena's and Dogfight's look too), the golfers as
the arena's blocky figures, and trees of boxes in the rough. The trees are
drawing only, so a ball flies through one; they stand where there is nothing
but rough for 16 m round them.

## Play it

```sh
npm ci && sh tools/install-deno.sh   # once
node net/play.mjs                    # the relay and the page; open the URL it prints in two Chrome tabs
```

Click to play. The mouse aims, WASD runs, Space jumps, left click fires, 1/2
or right click picks the rocket or the grenade, Tab shows scores, F goes
fullscreen, M mutes the music. Every shot is a stroke. The rocket is the club: a blast just
behind your ball drives it 200+ m with loft, one 4 m back rolls it a few
metres, and the cup is a slipgate that swallows any ball under 8 m/s. The
grenade bounces and pops after 2.5 s, for lobs. A rocket at your own feet is
a rocket jump (and a stroke). Holes last 4 minutes; not finishing costs 2.
Your own movement, shots and rocket jumps are predicted, so they show on the
next frame; other players and every ball show a round trip late. The net graph
in the top right (N hides it) shows the last 9.6 s of the netcode: bytes down
by kind (bundles green, repairs orange, keyframes and fills purple) and up
(the cyan line); the share of ticks that needed a repair and the lag from an
input to the confirmed world; the input lead (yellow) and the playout delay
(cyan), in ticks; and the sync, a green tick for each interval hash sent to
the relay and a bar for each keyframe (blue a join, purple a resync, red a
desync). To feel a
bad network, add `&impair=delay=150,jitter=15,loss=0.1` to the URL: a 150 ms
round trip with 10% loss each way. Each hole has its own tune, in
bytebeat: one line of arithmetic per sample, 8000 samples a second, 8 bits,
its notes picked by the room's seed and the hole number ([`client/sound.mjs`](../client/sound.mjs));
`&music=0` starts with it off.

To play among 250 AI golfers, start the bot host beside it; it fills the room
through the relay's native door, every golfer its own session:

```sh
node net/bot-host.mjs --bots 250     # bred golfers (below) sharing one copy of the world, until Ctrl-C
```

To watch instead of play, open the page with `?watch=1`: no slot, no inputs,
a camera riding with a player (→, Space or a click the next one, ← the one before).
A room can be watched through edge relays ([netcode.md](netcode.md#spectators)), each a spectator of the one above
it serving the room on to its own spectators, so one room reaches any number
of them:

```sh
.tools/deno run --unstable-net -A net/relay.ts --port 4443 --native-port 4444 --upstream 127.0.0.1:4434
# then open the page with ?watch=1&url=https://127.0.0.1:4443/
node net/bot-host.mjs --relay 127.0.0.1:4444 --bots 200 --watch   # or 200 spectators that check every hash
```

Every room `net/play.mjs` runs is saved when it ends, as a replay in
`replays/`. It is the room's closed ticks and the referee's hashes, a few
kilobytes a minute. Open one with `?replay=../replays/<file>`. K pauses,
J and L go back and on 10 s, [ and ] halve and double the speed, and every
interval is checked against the relay's hashes as it plays.
`node tools/replay.mjs <file>` checks one without a browser.

A standby relay keeps a room alive if its relay dies. Give the page both
addresses (`?url=https://127.0.0.1:4433/,https://127.0.0.1:4443/`) and start
the standby:

```sh
.tools/deno run --unstable-net -A net/relay.ts --port 4443 --native-port 4444 --upstream 127.0.0.1:4434 --standby
```

Kill the first relay and the game goes on: the standby takes the room over
and everyone comes back to their own slot.

To write your own client, in any language, [wire.md](wire.md) is
the protocol, and `net/tiny-client.mjs` is a whole client in 128 lines.

## The golf bot and the bred golfer

`?bot=1` hands the controls to `client/bot.mjs`, which plans every shot on a
private copy of the sim: 24 tries a shot, the best one taken. Fireplace's
guests and the bot host play golf with something lighter, the bred golfer
(`client/brain.mjs`): a 274-weight net that judges each shot by feel. It
reads a ball at rest as fourteen numbers (the cup's distance and height, the
lie, the ground at six points along the line and 5 m ahead of and behind the
ball) and answers with the blast distance behind the ball and a turn of up to
6°. It walks and aims on the golf bot's own legs, so the shot choice is the
only difference between the two.

Its genome stores no weights. It is a base seed and one 16-bit seed per
accepted mutation, and replaying that rebuilds the weights bit for bit (the
encoding of Such et al. 2017). All of it is f32, as the sim is: every `+ -
* /` and `sqrt` rounds to single, which every engine does alike. As `qg2:`
and base64url, 101 mutations still fit in a tweet, and the one every bot
plays is `GOLFER` in `client/brain.mjs`. It was bred by mutation: a parent
and fifteen children played eight training courses by shots alone, and the
best child replaced the parent only if it beat it again on sixteen fresh
courses. The run kept 101 children in 260 generations. On 40 held-out
courses:

| | shots alone (10 at most, else +2) | real holes (walking, the clock) |
| --- | --- | --- |
| a random net (no mutations) | 10.93, 12 sunk | |
| a rule of thumb (blast distance by range) | 9.43, 18 sunk | |
| **the bred golfer, 279 chars** | **4.35, 40 sunk** | **4.80, 40 sunk** |
| the golf bot, 24 tries a shot | 2.10, 40 sunk | 2.33, 40 sunk |

Foresight still wins, by two to two and a half strokes a hole, which is about
right for a guest on the couch. Play against it in Chrome: run
`node net/play.mjs` and add `&bot=1&genome=qg2:...` to the URL it prints.
