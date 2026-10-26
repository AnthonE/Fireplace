# Fireplace

![The living room: the fire going, the TV on, Fireplace's title card](f1-fireplace.png)

Grandma's living room at Thanksgiving, everyone round the Atari: the fire
going, snow at the window, a walnut console TV with rabbit ears. Click and you
sit down: the camera closes in on the TV until its glass fills the screen, and
you're in whatever the room is playing. When a game ends it pulls back to the
room, and the TV shows the marshmallows and what's on next; then it closes in
again. The room plays the playlist through: bumper balls (two rounds), party
(three minigames), the arena (one three-minute match of any of its twelve
modes, drawn for it), party again, a hole of golf, and round
again; the top three of each game get 3, 2 and 1 marshmallows. Join any time,
into whatever is on (or the next round of it); leave any time.

```sh
node net/play.mjs --fireplace            # the relay on Fireplace's sim, 15 guests, the page; open the URL it prints
node net/play.mjs --fireplace --bots 0   # just people
```

Click (or Enter) to sit down; then each game's own controls. `?bot=1` sits a
guest at the controls; `?watch=1` spectates; F goes fullscreen. While the room
is in view, T changes its theme (`?theme=<id>` picks one), B and H your ball
and hat, and L lists your achievements (`?look=<word>` wears a look for one
visit).

**How it fits on the engine.** `build/fireplace/game.wasm` is golf, the arena,
bumper balls and party in one module: `tools/asm.mjs` expands each exactly as
its own build is, puts its every identifier under a prefix (`$g.`, `$a.`,
`$b.`, `$p.`) and makes its exports internal, and appends `src/fireplace.wat`.
A function that is the same code in two games (the hash, the snapshot, the
prediction, bumper's ball in bumper balls and party) is kept once
(`mergeTwins`): the same text with the prefixes out, calling the same in
turn. That is 279 of 1,018 functions, and the wasm goes from 298 KB to 248 KB
(105 KB gzipped); every instruction a game runs is what it was.
That sends every export to the game on now (the header's `FP_GAME`) and runs
the playlist at the end of each tick. The ball phases and the barrier are the
same code in every game, so the worker threads never change games. The
playlist goes by position, not by game (`PLAYLIST` in `src/layout.mjs`): the
count of games played (`FP_COUNT`'s high half) mod its length picks the next
entry, so party comes round twice. When a game's last match ends, its result
is scored (golf: strokes; the arena: a Fiesta by kills, then deaths, any other
mode by the places it gives; bumper: rounds won, then KOs, then bumps; party:
party points, then minigames won), the marshmallows handed out, the next
entry's seed drawn and the result held 6 s. Then the region is wiped but for
the tick, the PRNG and the playlist's own state, the next game's world is
built on that seed, and everyone in the room is joined into it on that tick
(bumper and party lay one round out with everyone in it), keeping their input
words when the two games read the same word (golf's, which bumper and party
share). The seed is a hash of the room's PRNG and the games played (`FP_NEXT`,
`REGION + 0xe400`). The arena's forces a mode: `0xA8` in its top byte, the
mode in the next, drawn by `$rand` from the twelve, never the one the arena
played last (`FP_MODE`, `REGION + 0xe404`), and drawn as the game before ends
so the TV can name it; whatever the mode, the match is cut to 3 min
(Infection's already is; gun game, Juggernaut, Oddball and King of the Hill
lose 2 or 3 min, Team Slayer 5, a Fiesta and Capture the Flag 7), and a team
match cut short goes to the side ahead.
Party's keeps its top byte off `0xA7`, which would play one minigame only.
What lasts from game to game (the marshmallows, the arena's last mode, the
next seed) sits in 8 KiB of the region no game touches. A game's static world
(the terrain, the arena's map) is outside the region, so a keyframe from
another game would land on the wrong ground: `FP_WORLD` says which world is
built, and when the region comes from outside, `regrid` stashes it
(`FP_STASH`), builds that game's world under it and puts it back. Nothing else
changed: the relay, referee, keyframes, spectators and replays just see a sim.

`client/fireplace.html` is the page. One host (`client/host.mjs`: the memory,
the net and sim workers, the prediction's instance, the sound, one GPU device)
and each game's frontend (`client/bumper-game.mjs`, `party-game.mjs`,
`arena-game.mjs`, `golf-game.mjs`) mounted on its own canvas as the room moves
into it (bumper balls and party at the window's size, golf and the arena at
320 x 200); `bumper.html`, `party.html` and `arena.html` are the same
frontends mounted alone. The net worker packs each tick's word in the format
of the game on now. The room (`client/room-render.mjs`) is drawn like the
cheese, solved per pixel: a few dozen boxes, two pumpkins and the antenna's
rods, lit by the fire (it flickers, and its shadow is cast through the
firebox's mouth), by the TV in the colour of the game on it, and by the snow
light, every colour the theme's. The flames are a short march through the firebox. While the room is in
view the game draws into a texture that the TV shows through a curved CRT with
scanlines and a shadow mask, and those fade as the camera closes in, so the
zoom's last frame is the game as it draws itself; then the page shows the
game's own canvas. The TV's cards (the title, the standings, what's next, the
arena by its mode: "NEXT: ARENA INFECTION") are drawn in the games' 3x5 font.
`client/fireplace-bot.mjs` is a guest: a brain for each game (party's is
`client/party-bot.mjs`'s Partier), asked for the one that's on.

**Themes.** A theme is a reskin of the room, local to whoever picks it: one
JSON file in `client/themes/` naming any of the room's 29 colours (the brick,
the wallpaper's stripes, the rug's yarns, the fire, the night through the
window...), the weather at the window (`snow`, `rain`, `clear`) and what
stands on the mantel (`pumpkins`, `baubles`, `none`). It is data, never code,
and only the room's shader reads it (a uniform of its own, `client/themes.mjs`
`pack()`), so no sim, net or other page sees it and a theme can't desync
anything. Grandma's (`grandma.json`) writes out every default: against the
renderer as it was before themes, no pixel of the couch view differs by more
than 2 levels in 255 outside the mantel, where the pumpkins now show (they had
sat inside the brick pillars). `npm run build` checks every file and bundles
them into `build/themes.json` for the picker; the page reads the theme's own
file, so an edit shows on a reload. `client/room.html` is the room alone, for
making one: it reads the file every second and shows a mistake instead of
drawing it. `node tools/theme-shots.mjs` draws each into
`traces/themes/<id>.png` (CI keeps them), and `elo.json` credits each on the
store (`node tools/elo.mjs`). CONTRIBUTING.md is the guide, for themes and
minigames both.

```sh
node tools/themes.mjs new <id> <github-login>   # a theme at Grandma's colours, to edit
node tools/serve.mjs                            # then /client/room.html?theme=<id>
node --test test/themes.test.mjs
```

**Looks.** A look is a ball and a hat a player picks, and everyone in the room
sees it: ten balls (the house colours, beach, candy, zebra, melon, pumpkin,
snowball, eight ball, gold, marshmallow) and seven hats (a cap, a beanie, a
headband, a helmet, none, a pumpkin head, a crown), listed in
`client/looks.mjs`. A look is drawing only. The page writes its word
(the ball in the low byte, the hat in the next) to `CL_LOOK`, the net worker
sends it on the stream when it changes, and the relay keeps a word a slot and
sends the table to every session that asked for looks in its hello (flag 4),
then what changed, at most every 250 ms (`docs/wire.md`). A slot that empties
goes back to 0, the house look. No tick, record, replay or hash carries a
look, so the sims build to the same sha256 with or without them, and
`tiny-client` and an edge relay, which never ask, never see one. Bumper balls
and party draw the ball's pattern (beach panels, bands, ribs, a solid, metal,
an eight ball's spot) and the hat on the rider's head, a few lines each in
their shaders' ball and head cases; golf and the arena tint the golfer and the
fighter the ball's colour (a team mode's sides still win). Look 0 draws exactly
as the riders always have: the seat's colours, alpha 1, the slot for a seed.
Musical Pads and Paint Party mark what is whose by the seat's colour, so their
balls keep it there (`seatColors`); the hat still shows. The page keeps your
pick in this browser. `client/party-render-demo.html?scene=wardrobe` shows
every ball and hat.

**Achievements.** Twelve, in `client/achievements.mjs`, kept in this browser:
a first game, the top three, a win, two and three wins in a row, first,
second and third, 25 and 100 marshmallows, 25 games, every game of the
playlist played and won, and a game with 32 or more in it. Each is a test over
a tally of results, and a result is what the confirmed world holds while a
game's end is on screen (`FP_STAGE` 1): the game, this slot's place
(`FP_LAST`) and marshmallows (`FP_GOT`), and how many were in it. So every
machine reads the same bits for it; the page counts its own slot's, once per
game (a key of the room, the games played and the game, so a keyframe that
shows the same end again counts nothing). Four open a look: the pumpkin head,
the eight ball, the gold ball and the crown (the marshmallow ball takes 100
marshmallows). What one opened shows under the standings, and L lists them on
the TV, six a page. They are this browser's record, not the room's: signing in
with Elo Pros, and the referee's standings as their evidence, come next
(`docs/roadmap.md`).

**Results.** `test/fireplace.test.mjs` (10 tests): the prefixer; one
module with every export; the playlist on the debug build from bumper balls
round to bumper balls again, the room coming and going (each game's matches:
two rounds, three minigames, one match cut to 3 min, one hole; everyone in
each new game straight after its switch; no party seed forcing a minigame);
the arena's seed drawn as the party before it ended, and the mode it played;
marshmallows, 3, 2 and 1, by each game's places (party's by points, then wins;
a mode's by its own), summed from game to game and lost with the slot; the
mode's draw (any of the eight, then never the last, 100 draws each way), each
mode's match cut to 3 min and placed by the mode; a party seed that came out
with `0xA7` on top turned off it; the playlist equal on every tick on 1 and 4
threads through bumper balls and the switch into party; and keyframes taken
just into party, mid-party, mid-arena and mid-golf, each restored into a sim
sitting in bumper balls' world, its terrain and map rebuilt, every tick after
equal to a run that never left; and the achievements' tally fed every held
end of that playlist for three slots, twice each as a page sees a hold, which
counts each game a slot was in once, with its marshmallows and wins.
`test/looks.test.mjs` and `test/achievements.test.mjs` hold the rest: the house
look as the riders were, every pattern and style the lists use present in both
shaders, earned looks naming real achievements, and each achievement's test.
The determinism matrix replays 145,000 ticks
of twelve guests, the playlist round once with the minigames and the arena's
modes as they stand at this commit: bumper balls, party from 191 s (Tag, The
Wall, Bomb Rain), the arena from 392 s (Juggernaut, drawn from the eight),
party from 581 s (Musical Pads, Red Light, Hot Potato), golf from 771 s and
bumper balls again from 930 s: 27 configurations (Node, Deno, Chrome x JIT
tiers x 1, 2 and 4 threads), equal on every tick, at 0.056 to 0.060 ms a tick
on TurboFan in Deno and Chrome, the region's hash included. Online, `net/run-fireplace.mjs --bots 15 --seconds
270` on one 4-core machine shared with other work: 16 sessions (15 guests and
Chrome), the room moved from bumper balls into party at 147 s, 4,174 interval
hashes checked by the referee, all equal, 7 bytes a closed tick on average,
3.8 KB/s down and 2.0 KB/s up a session. On SwiftShader the switch into party
holds up the page's GPU for about 40 s while party's pipelines compile
(bumper's take about 14 s as the page starts); its sim worker and its hashes
carry on, and it catches up. The switch tick costs 30 to 46 ms (measured
with the machine busy) on the relay's referee and every client (most of it
the 512 x 512 terrain each game builds); the sim workers catch up past it.
With looks, `net/run-fireplace.mjs --chrome 2` (240 s, 15 guests): 17
sessions, 3,959 interval hashes checked, all equal, the room into party, and
each Chrome page's look in both pages' tables at its slot (the gate's
`looksWentRound`).

```sh
node --test test/fireplace.test.mjs
node tools/genfireplace.mjs --bots 12 --ticks 145000 --out logs/fireplace.qgl   # or --games 6: 1500 ticks into bumper balls again
node harness/matrix.mjs --ticks 145000 --log logs/fireplace.qgl --wasm build/fireplace/game.wasm
node net/run-fireplace.mjs [--bots 15] [--chrome 1] [--seconds 240] [--res 960x600] [--port 4433]
```

## The trailer

Fireplace films itself from a replay. `tools/film.mjs record` runs a room of
guests and keeps its replay; `plan` prints what was on, second by second;
`shoot` draws a cut list (`film/trailer.json`) in headless Chrome. The page
runs with `?replay=…&film=<seconds>`: the replay sits paused, and for each
frame the film moves the sim to the frame's tick (between ticks too, so motion
is smooth), sets the page's clock and draws once. The room's scenes are the
page's own (the couch, the zoom into the TV, the standings between games), run
on that clock at 60 frames a second with every other one kept. The sound is
the game's own, every call made while a shot rolls, rendered in an
OfflineAudioContext on the cut's timeline (`client/film.mjs`), then brought
to -14 LUFS. Captions are drawn in the games' 3x5 font.

```sh
node tools/film.mjs record --seconds 960 --bots 64   # a replay in replays/
node tools/film.mjs plan replays/<file>.qgr          # each game's span
node tools/film.mjs shoot film/trailer.json --replay replays/<file>.qgr [--stills 2,7.5]
```

The house cut was shot on a 960 s room of 64 guests, which went through the
whole playlist once (bumper balls from 1 s, party from 175 s, the arena's
Juggernaut from 423 s, party from 612 s, golf from 846 s). On SwiftShader at
1280 x 720 a second of film took about a minute to draw. A replay is tied to
the build of `game.wasm` it was recorded on: after a sim change, record again,
plan it and move the shots.

Not done yet: a vote for what's next, names, achievements that follow a
player off this browser, and a way to lean back from the TV mid-game.
