# The arena

Not a golfer? The same engine runs a deathmatch: `src/` built with `ARENA`
set (`build/arena/game.wasm`), with the same lockstep, relays, keyframes,
prediction, spectators and replays, up to 256 in a room. A room's first
match is a Grab Bag: ten minutes, everyone spawns with two guns drawn at
random, the most kills at the end wins; the matches after it go round the
[modes](#modes), a free-for-all and then two [red against blue](#teams): Team
Deathmatch, Skull Hunt, Zombies, Capture the Flag, Territories, gun game, Keep
Away, VIP, Juggernaut, King of the Hill, Assault. All of them are on
[Box Canyon](#box-canyon-structures-and-maps): a canyon walled all round with
a base at each end you can walk into and up onto, a teleporter behind each, a
cave through the north ridge, boulders for cover. (Set `FIESTA = 0` in
`src/layout.mjs` for a free-for-all instead of Grab Bag: an assault rifle
and a magnum, guns on pads about the floor, first to 25.) Below, the modes go
by the code's names (`MODES` in `src/layout.mjs` holds what a player sees):
Grab Bag is Fiesta, Team Deathmatch is Team Slayer, Zombies is Infection,
Keep Away is Oddball and Skull Hunt is Headhunter.

```sh
npm ci && sh tools/install-deno.sh   # once
node net/play.mjs --arena            # the relay on the arena's sim, 5 AI fighters, the page; open the URL it prints
node net/play.mjs --arena --bots 0   # just people
```

![The arena in Chrome, against AI fighters](a1-arena.png)

Click to play. The mouse aims, WASD runs, Space jumps, left click fires
(hold it for the automatics), right click zooms the guns that have a scope,
1/2, X or the wheel swap your two guns, Q melee, G throws a frag, R reloads,
E picks up the gun on the pad you stand on, Tab shows the scores, F goes
fullscreen, N the net graph. `?bot=1` hands your slot to an AI fighter;
`?watch=1` spectates. More fighters for a running room (up to 255, one
process, one shared copy of the world):
`node net/bot-host.mjs --arena --relay 127.0.0.1:4434 --bots 50 [--skill 0.6]`.

You spawn with two different guns of the nine, drawn at random, full, and
two frags, under 100 points of shields and 100 of health. Shields take damage first and
come back five seconds after the last hit; health comes back once they're
full. A kill gives the killer a frag (up to four). Three seconds after a
death you're back, at the spawn point farthest from the nearest enemy of
four drawn. The guns ([`ARMS` in src/layout.mjs](../src/layout.mjs)):

| Gun | Fires | Damage | Notes |
| --- | --- | --- | --- |
| Assault rifle | auto, 11 rounds/s, 32 a magazine | 8 | spread ±0.9°, 90 m |
| Burst rifle | 3-round bursts | 9 a round | a head shot kills once the shields are down: four bursts; 2x zoom |
| Magnum | semi-auto | 28 | head shot kills once the shields are down: four shots; 2x zoom |
| Sniper rifle | semi-auto, 4 a magazine | 120 | a head shot always kills, two to the body; 5x scope, 420 m |
| Shotgun | 15 pellets, spread ±5.7° | 15 each | falls off past 8 m, a fifth by 28 |
| Rocket launcher | 2 rockets, 36 m/s | 230 splash, 5 m | the whole of it within 1.75 m; half to yourself; rocket jumps |
| Plasma rifle | auto bolts, 70 m/s, a battery of 100 | 10 | no reload |
| Seeker | auto needles, 34 m/s, home within 12° | 6 | seven stuck at once go off together and kill |
| Sword | a lunge | kills within 5 m | 10 swings |
| Frag grenade | thrown (G) | 150 splash | goes off 1.8 s after the throw |
| Melee (Q) | any gun | 70 | lunges 2.4 m; from behind, it kills |

In slayer, the rocket launcher sits on the middle pad, a sniper rifle on
each base; shotguns, burst rifles, a sword, a seeker and plasma rifles
are about the floor. A gun you carry is ammo when you walk over its pad; any other is
yours with E, in place of the one in your hands. A pad comes back 30 s after
(60 s for the sniper, the rocket and the sword).

**How it fits on the engine.** `src/arena.wat` is the fight: guns, damage,
melee, pickups, spawns and the match, all serial and in slot order like the
rest of the sim; the golf files keep their code behind `#if !ARENA` where
the two differ (the input word, the clamp to the map, joins, the end-of-tick
rules); Fiesta and slayer differ only behind `#if FIESTA`. The arena's
input word gives up three bits of yaw (11 bits, 0.18°, as fine as the
pitch) for melee, grenade and gun-slot bits, and its top bit carries an
8-tick frame a bit a tick: the fighter's view lag in ticks, a reload and a
pickup request. The word sits on golf's fields (yaw low, pitch, then a high
byte of the bits that change least), which wire v4 codes tightest, and a
frame goes only when there is news (a request, the lag 2 ticks off, or a
second gone), so between them a still player's word doesn't change and
costs nothing. Hitscan shots are lag-compensated inside the
lockstep: the sim keeps where every fighter stood after each of the last 32
ticks (in the balls' place in the region, so it is hashed and in every
keyframe), and a shot is checked against the targets where the shooter saw
them, by the lag the shooter's own frames sent. Spread comes from a hash of
the fighter, the shot and the pellet rather than the room's PRNG, so the
prediction layer fires your shots exactly as the confirmed world will:
your tracers, muzzle flash, recoil, reloads and swaps show on the next
frame, and hits and kills a round trip later. Projectiles (rockets, bolts,
needles, frags) are checked where things are now.

`client/arena.html` is the page: the same net and sim workers, the arena's
renderer (`client/arena-render.mjs`: golf's ray-marched terrain drawn
low-poly and its splats, the map's boxes as plastic with studs on top, metal
in panels and rock in strata, plus tracers as beams, glowing sprites, the
gun in your hands as boxes ray-traced in the HUD pass like the fighters'
own (`client/viewmodel.mjs`), all at the window's size (`?res=` to set
one), and a HUD on a 320 x 200 grid scaled to fit the screen and centred
(`client/lowpoly.mjs` hudFrame, golf's and Dogfight's too): shields and health, a motion tracker that shows enemies
within 25 m who move or fire (and your own side in yellow, in a team mode),
a reticle that turns red over an enemy in range, the scope, the hit marker
and a kill feed with medals).
`client/arena-bot.mjs` is the AI fighter: the nearest enemy it can see over
the ground, a settling aim with a human's wobble, the gun for the range,
strafing, frags, melee up close, and pads when nobody is in sight.

**Results.** `test/arena.test.mjs` (18 tests): the map on five seeds; an
assault-rifle fight through shields to a kill and the respawn on its tick;
shields and health coming back; the magnum's four-shot and the sniper's
one-shot head kills; lag compensation (a sniper shot at where a running
target stood 12 and 25 ticks before lands when the frames say so, and the
same aim claiming no lag misses); reload and pickup frames (and windows without a frame keeping the lag); the sword, a
butt to the front and an assassination; rocket splash killing two and a
rocket jump at half damage; the frag's fuse; a seeker's overload; the
Fiesta's random loadouts (two different guns, full, every gun dealt), its
clock ending the match whatever the kills and a new one from zero; the
prediction equal to the confirmed world bit for bit through runs, bursts, a
swap, a reload, a frag and a butt; the map's structures (below); and a match of eight AI fighters equal
on every tick on 1 and 4 threads. `tools/genarena.mjs` records such a match
(each fighter seeing the world 12 ticks old and saying so in its frames)
and the determinism matrix replays it: 27 configurations (Node, Deno,
Chrome x JIT tiers x 1, 2 and 4 threads), 20,000 ticks each, equal on every
tick, at 0.04 to 0.15 ms a tick on TurboFan. `net/run-arena.mjs` is the
online gate: a relay on the arena's sim, seven AI fighters through its
native door and Chrome with a fighter at its controls; 8 sessions, 352
interval hashes checked by the referee, all equal; 8.6 bytes a closed tick
on average, about 4 KB/s down and 2 KB/s up a session. CI runs it full:
256 fighters, 9,481 hashes checked here, all equal.

```sh
node --test test/arena.test.mjs
node tools/genarena.mjs --bots 8 --ticks 20000 --out logs/arena.qgl
node harness/matrix.mjs --ticks 20000 --log logs/arena.qgl --wasm build/arena/game.wasm
node net/run-arena.mjs [--bots 7] [--chrome 1] [--seconds 60] [--impair delay=60,jitter=10,loss=0.05]
node --test test/map.test.mjs
```

## Modes

Each match plays one of fifteen modes, chosen as its countdown starts: match k
of a room plays `ARENA_MODES[k % 15]` (`src/layout.mjs`), Fiesta, Team Slayer,
Headhunter, Infection, Capture the Flag, Territories, gun game, Oddball, VIP,
Juggernaut, King of the Hill, Assault, Lucky Blocks, Evade, Escape, and round
again: a free-for-all, then two [team modes](#teams), and the three kit modes
without sides last. So a room
opens on a Fiesta; Fireplace's arena, one match long, plays whichever mode
the room draws for it (see Fireplace). A seed whose top byte is `0xA8` plays
mode `(seed >>> 16) & 0xff` (the mode's `M_*`: 1 Infection, 2 gun game, 3
Juggernaut, 4 Team Slayer, 5 Capture the Flag, 6 Oddball, 7 King of the Hill,
8 Headhunter, 9 Territories, 10 VIP, 11 Assault, 12 Lucky Blocks, 13 Evade, 14 Escape) every match: `node net/play.mjs --arena --mode 1` is a room of Infection only
(`tools/genarena.mjs` and `net/run-arena.mjs` take `--mode` too). The four
free-for-all modes:

![Infection in Chrome: the humans in blue keep together; P10 has just infected P14](a4-infection.png)

| Mode | Spawns with | Ends | Places |
| --- | --- | --- | --- |
| Fiesta | two guns at random, two frags | 10 min | kills, then deaths |
| Infection | humans: a shotgun and a magnum, full, two frags; zombies: a sword that never runs out, no shields, 100 health, 12.5 m/s and a 1.8 m jump (a human's are 10 m/s and 1.2 m), half the damage of any gun but the shotgun | no human left, or 3 min | humans still alive (shared), then time lived as a human, then infections |
| Gun game | its rung's gun in both hands: assault rifle, burst rifle, magnum, shotgun, plasma rifle, seeker, sniper rifle, rocket launcher, sword | the first kill with the sword, or 5 min | rung, then kills |
| Juggernaut | as in Fiesta; the juggernaut the sword, 200 shields and a zombie's legs | 10 points, or 5 min | points, then kills |

Infection draws one zombie for every ten fighters (at least one) from the
room's PRNG at the countdown's end. A human who dies, to anything, comes
back a zombie 2 s later, at the spawn point (of four drawn) whose nearest
human is nearest 25 m off; a join during play is a zombie; if the zombies
all leave, another is drawn. A zombie has no shields, so a head shot that
kills through them (the burst rifle's, the magnum's) is only a hit; the
sniper's still kills. Neither side hurts its own: the check is in damage,
melee's choice of target, splash and needles (a bullet still stops on a
teammate). In gun game a kill moves its killer up a rung, the new gun in
both hands, full, at once; an assassination moves its victim down one; on
the sword only a sword kill counts. In Juggernaut whoever kills the
juggernaut becomes it, everyone else is on one side, and the juggernaut's
kills are its points.

**How it fits.** The mode is a word of the header, `AH_MODE` at `REGION +
0x48`, followed to `0x5c` by the humans and zombies counted every tick, the
gun game's leader or the juggernaut, and a winner (and to `0x74` by the team
modes' fields: [Teams](#teams)); all inside the prediction's copy. A fighter's side is a bit of its flags, `PF_ZOMBIE` (16)
or `PF_JUGG` (32), so the prediction runs a zombie's legs as the confirmed
world does. What only the confirmed world reads (the rung, the place,
infections or points, ticks as a human) is 8 bytes a fighter at `MODE_REC`,
`REGION + 0xc400`, hashed and in every keyframe. Draws, conversions,
promotions and places are serial and in slot order like the rest of the
match. A Fiesta writes none of it: 20,000 ticks of a Fiesta of eight AI
fighters and 30,000 ticks of Fireplace hash on every tick as they did before
modes, and the bots send the same words. The page draws zombies green, the
juggernaut gold and everyone else in one blue in Infection and Juggernaut
(red and blue in a team mode), shows
the mode and its rule over the countdown, its count on the HUD (humans left;
your rung of 9, the gun next and the leader; the juggernaut and the points),
its news in the feed ("P12 INFECTED P40", "P3 IS ON THE SWORD") and its own
columns on the board. The AI fighter leaves its own side alone; a zombie or
the juggernaut runs at the nearest enemy, seen or not, zigzagging and
jumping; Infection's humans keep together, back away inside 14 m and
shoot.

**Results.** `test/arena-modes.test.mjs` (12 tests): the rotation from a
Fiesta with every mode field 0, a forced mode match after match and an
unknown one played as a Fiesta; Infection's draw (one zombie of 2 and of 9,
two of 25) and loadouts; a conversion (the victim a zombie, back in 2 s with
the sword, the infection counted, no frag for it) and a sword that never
runs out; no friendly fire from the shotgun, the magnum, needles, a frag
(which still hurts its thrower) or a zombie's sword; a zombie at 12.5 m/s
against 10 and jumping 1.84 m against 1.25, a magnum's head shot on a zombie
a hit for 14, and the prediction equal to the confirmed world bit for bit
through a zombie's runs, jumps and swings; the end with no human left and at
the clock, places in that order, survivors sharing first; a late join a
zombie and a zombie drawn when they all leave; gun game's ladder, its
respawns, an assassination's demotion, a rifle kill on the sword rung that
counts for nothing and the sword kill that ends the match on its tick; the
prediction bit for bit after a respawn on a new rung; Juggernaut's draw, its
overshield, the killer taking over, ten points, and a new juggernaut after
one dies by its own frag; and eight AI fighters in each mode on the debug
build, equal on every tick on 1 and 4 threads.

How long Infection lasts was tuned on AI fighters, who aim better than most
people: at first (a zombie spawning as far from the humans as anyone, a
magnum head shot killing it) a lone zombie against fifteen humans infected
nobody in a minute online. With the rules above, sixteen fighters on four
seeds play matches of 45 to 147 s, and one the humans hold to the clock;
eight fighters, 35 to 138 s. Eight fighters' gun game took 205 s to its
sword kill. The determinism matrix replays 20,000 ticks of eight AI fighters
in each of Infection (two matches over in it), gun game and Juggernaut: 27
configurations each (Node, Deno, Chrome x JIT tiers x 1, 2 and 4 threads),
equal on every tick, at 0.05 to 0.09 ms a tick on TurboFan in Deno and
Chrome. Online, `net/run-arena.mjs --mode 1 --bots 15 --seconds 60`: 16
sessions, 960 interval hashes checked by the referee, all equal, 14.4 bytes
a closed tick on average, 5.6 KB/s down and 1.9 KB/s up a session, two
zombies and 14 humans at the minute's end; `--mode 2` the same way: 960
hashes, all equal, 64 kills. (The page's AI fighter had been playing slot
0's view whatever its own slot; it plays its own now.)

```sh
node --test test/arena-modes.test.mjs
node tools/genarena.mjs --bots 8 --ticks 20000 --mode 1 --out logs/arena-infection.qgl   # 2 gun game, 3 Juggernaut
node harness/matrix.mjs --ticks 20000 --log logs/arena-infection.qgl --wasm build/arena/game.wasm
node net/run-arena.mjs --mode 1 [--bots 15] [--seconds 60]
```

Lucky Blocks (mode 12) is everyone for itself on the [kit](#teams), the first
mode there without sides (MODES' `team: 0`). Everyone spawns with a magnum in
both hands and no frags. As play starts a gold block with a ? is laid over
each of the map's spots: its pads, both stands, the skull's spot and the
hills, one to a spot, 18 on Box Canyon. A hitscan round through one, a swing
reaching it, a blast within half its radius or a bolt through it breaks it,
and none of them stops on it. At the tick's end the room's PRNG draws what it
pays its breaker, out of 64: a gun (rarer ones less often: the rocket and the
sword 3 each), an overshield, a zombie's legs for 15 s, two frags, or unlucky,
either a 300 blast at the breaker or eight frags falling round it. The feed
says which ("P7 LUCKY ROCKET", "P3 UNLUCKY"). A block is back 15 s on. 15
kills win, or the most at 5 min. The strike and spawn hooks are optional kit
hooks, the payout is drawn serially in the tick hook, and the legs are P_FL's
PF_FAST, which the prediction runs. The AI fighter goes for the nearest block
while it holds only the magnum and fights once armed.
`test/arena-lucky.test.mjs` (13 tests).

Evade (mode 13) is everyone against the chasers: flat faces the sim moves over
Box Canyon, 2 to 6 of them, more as the clock runs and the room fills, each
after its nearest standing fighter at 11.5 m/s, a fighter's 10 on the flat,
but slowed to 0.4 of that up stairs and slopes and to 2.5 m/s up a ledge,
which it climbs only when its prey is up there (out of a base first, if its
prey is on the roof over it). A chaser that reaches you downs you: you crawl
at 2 m/s, with no gun and no jump. A friend holding still within 2 m of you
for 3 s gets you up, and your 30 s of bleeding stop while they do; bleed out
and you watch the others for the rest of the match. A hit stuns a chaser for
1.2 s, then it ignores hits for 2 s. Survive 3:30 and whoever stands wins;
nobody standing, the chasers do. Places go standing at the end, then time
standing, then revives. The chasers are records in `AO`, 48 B each, moved
serially on the confirmed world after every fighter's own tick; downed is both
`PF_CARRY` and `PF_FAST` in `P_FL`, so the prediction runs the crawl. Sixteen
AI fighters are usually caught to the last in 150 to 200 s; online with 64, 46
stood at 90 s (5,623 hashes, all equal). `test/arena-evade.test.mjs` (13
tests).

Escape (mode 14) is one hunter against the room: one fighter in 14 (at least
one) is drawn the hunter as play starts, in the juggernaut's gold, with its
sword and its 12.5 m/s legs, at the spawn point farthest from everyone. The
rest have no guns; their melee is a shove that knocks the hunter down for 1.5
s, once in 40 s each, and it shrugs shoves off for 2 s after. The hunter's
swing downs you (Evade's crawl); a friend holding still by you for 3 s gets
you up, the hunter holding still over you for 2 s finishes you, and 30 s down
you bleed out. Terminals stand on the map's objective spots and pads, one for
every three survivors (three at least). Hold still within 2 m of one to hack
it: 50 s alone, faster with friends. While it's hacked its screen flickers and
the hunter's HUD marks the noise. Once two in three are hacked, or with a
minute left, two exits open on the ground, and reaching one gets you out. It's
over when nobody is left in it, or at 4:00 (3:00 in Fireplace, the exits open
at 2:00). The escaped place first by order, then the hunter by survivors
finished, then the rest. Nothing hurts anybody: the kit's optional hurt hook
takes every blow. The terminals live in `AO`, and both the downed and the
stunned hunter are `PF_DOWN`, so the prediction runs every crawl. Matches of 8
or 16 AI fighters run 57 to 144 s, 2 of 7 to 13 of 15 survivors escaping;
online with 64, 28 escaped in 90 s (5,623 hashes, all equal).
`test/arena-escape.test.mjs` (13 tests).

## Teams

Red against blue, in eight more modes on the same build: Team Slayer, Capture
the Flag, Oddball, King of the Hill, Headhunter, Territories, VIP and Assault.
Two of them follow each free-for-all in the rotation (`ARENA_MODES`: Fiesta,
Team Slayer, Headhunter, Infection, Capture the Flag, Territories, gun game,
Oddball, VIP, Juggernaut, King of the Hill, Assault) and Fireplace draws them
too; `node net/play.mjs --arena --mode 5` is a room of Capture
the Flag only.

![Capture the Flag in Chrome, on blue's side: red has just brought blue's flag home](a5-ctf.png)

| Mode | Wins | How it plays |
| --- | --- | --- |
| Team Slayer | 10 kills a fighter on the larger side (at least 50), or the most at 8 min | every kill of an enemy a point for your side, a death by your own hand one off it |
| Capture the Flag | 3 captures, or the most at 10 min | a flag on the floor of each base's room; touch theirs to take it, bring it to yours while yours is home; a carrier who dies drops it; your side returns a dropped flag by touching it, or it goes home by itself after 20 s |
| Oddball | 100 points, or the most at 6 min | one skull mid-field; whoever touches it takes it, either side; a point a second for the side holding it; dropped, it goes back to its spot after 15 s |
| King of the Hill | 100 points, or the most at 6 min | one hill at a time, moving every 60 s round six points (mid-field, both roofs, the cave, both rock piles); the side with more fighters on it holds it, as many each is contested; a point a second held |
| Headhunter | 5 skulls banked a fighter on the larger side (at least 40), or the most at 6 min | every death drops the skulls its fighter carried and one more where it falls, onto any pile within 2 m; anyone takes a whole pile by touching it, guns and all; one drop zone at a time on the hill points, moving every 45 s in the map's order; standing in it banks all you carry, a point each for your side; a pile lies 30 s |
| Territories | 300 points, or the most at 6 min | all six hill points up at once, each a territory 5 m across (the hill's 2 m band); more of a side on one pushes its gauge a step a tick toward that side, 5 s to take a neutral one, and one held must be pushed back to neutral before the other side can take it; as many each hold it still, nobody on it drifts back to its holder; every 2 s a point for each one held |
| VIP | 10 VIPs killed, or the most at 6 min | a VIP each side, drawn at random as play starts, with the juggernaut's 200 shields (back only to 100); kill theirs for a point, any other kill nothing, a VIP dead by its own hand the other side's point, one that leaves nobody's; 3 s after a VIP dies or leaves its side draws another, someone else if anyone is alive |
| Assault | 3 bombs, or the most at 8 min | one bomb in the middle, taken by touch and carried as the skull is (no guns, a swing that kills); 3 s on their plate plants it, and 5 s later it goes off: a point, and their side within 5 m dead; 2 s on it by its plate's side defuses it; dropped, it lies 15 s, then goes back to the middle |

Everyone spawns on their own half (the spawn points nearer their own flag;
two on the middle line are nobody's) with an assault rifle, a magnum and two
frags, and the map's pads are laid: the sniper rifles on the roofs, the
rocket launcher mid-field. King of the Hill keeps its hill clear: nobody
spawns on it, or within 4 m of its edge, while it's up (each base's roof has
two of its side's spawns, and a side respawning onto its own roof's hill
held it 49 to 1 in a minute of 64 AI fighters). Teams are dealt as a match
starts, red, blue, red in slot order, and a join goes to the side with
fewer, red on a tie; nobody is moved as people leave. Neither side hurts its
own, as in Infection. A flag's or the skull's carrier has no guns and no
frags: a click or Q swings what it carries, a rifle butt's reach that always
kills (a press waiting as it takes one up is dropped, and a trigger held
down swings only once let go and pressed again). A match ends at its target,
or at the clock with the side ahead winning (level is a draw); the places
put the winning side first, then each side by its objective points
(captures, seconds holding), then kills, so Fireplace's marshmallows go to
the winners' best three.

**How it fits.** The team modes are a kit, as Party's minigames are: the
core in `src/arena.wat` (sides, dealing, spawns, pads, scores, the end,
carrying) and each mode in its own files, `src/am/<key>.wat` (four hooks,
called through the `(!am)` macro while the mode is on: `start` as play
begins, `tick` every tick of play, `kill` on a death, and `bar`, asked
before a fighter spawns at a spawn point), `src/am/<key>.mjs` (its
constants and its state's fields, gathered into `AM_CONSTS` for the assembler
and out of `layout.mjs`'s namespace, as the minigames' are), `client/am/<key>.mjs` (how it draws, its
HUD lines, news and board columns, and what the AI fighter goes for) and
`test/arena-<key>.test.mjs`. A side is a bit of the fighter's flags, `PF_BLUE` (64), and a carrier
another, `PF_CARRY` (128), so the prediction runs your own swing as the
confirmed world will; the scores, the target, who won and each side's count
sit in the header past the modes' fields (`AH_SCORE` .. `AH_END`, inside the
prediction's copy); each mode's objective (where the flags are and who has
them, the skull, the hill and its holder) in 1 KiB of the region,
`AO` at `REGION + 0xcc00`, hashed and in every keyframe. A Fiesta writes none
of it, and in Fiesta's build the pads are laid only for a mode that has
them, so a Fiesta's region is what it always was (20,000 ticks of a Fiesta
of eight AI fighters hash on every tick as they did before teams, and the
bots send the same words). The flags' stands, the skull's spot and the hills
are the map's (`flags`, `ball` and `hills` in `map.json`, into `MAP_OBJ`;
a map without them gets them by default). The page draws the sides red and
blue, a score bar under the shields, waypoints through walls (TAKE, RETURN,
KILL, ESCORT, HOME; the skull; the hill with its distance), the flags waving
on their stands or over their carriers, the skull with a glow, and the hill
as a disc on the ground or a roof in the colour of whoever holds it; the
board is by side. The AI fighter routes through doors (found once per world
by probing each building's walls), leaves its own side alone, and plays the
objective its mode's module gives it: a carrier runs home, defenders (every
third fighter of a side) hold their stand and return their flag, attackers
run for the enemy's flag and escort their carrier; the skull's carrier keeps
away from enemies near the middle, the rest hunt it; everyone holds the
hill.

**Results.** `test/arena-teams.test.mjs` (11 tests): the sides dealt red,
blue, red as a match starts and a join balancing them; a Fiesta after each
team mode with its region exactly a Fiesta's (the mode header to `AH_END`,
`AO`, the records, the pads in Fiesta's build, no side bits); no friendly
fire from bullets, the butt, an assassination, the sword and its lunge,
frags, rockets, plasma, needles and the overload, the other side still
hurt; spawns on the fighter's own half and never the middle line; the
loadout and the pads; carrying (no shot, frag, reload or pickup, a click or
Q swinging and killing, a press waiting at the pickup dropped and a held
trigger never swinging, the prediction bit for bit through a carrier's runs
and swings); Team Slayer's scoring, its target, its end at the target, at
the clock and in a draw, and places; eight AI fighters scoring, equal on
every tick on 1 and 4 threads. `test/arena-ctf.test.mjs` (17),
`test/arena-oddball.test.mjs` (12) and `test/arena-hill.test.mjs` (13):
each rule with its edges (touches a hair inside and outside reach, the
lower slot first, ties on one tick going the same way for either colour, a
carrier leaving or rejoining or dying without a kill, a flag or skull
dropped from the air landing on what is under it, the timers to the tick,
the hill's height band keeping a roof apart from the room under it, its
news a second apart at most), the prediction through a carrier or a runner
bit for bit, joins and leaves mid-objective, the end and the places, a
Fiesta after; and AI fighters over 20,000 ticks on the debug build, equal on
every tick on 1 and 4 threads, playing the objective: Capture the Flag's
eight take the flags 11 times and capture 3 times, sixteen 12 and 2;
Oddball's skull is taken 29 times among eight and 19 among sixteen, both
sides scoring (75 to 30, 48 to 85); King of the Hill's eight and sixteen hold
every hill it comes to, both sides scoring (45 to 78, 62 to 80), and a lone
fighter of either side gets onto each of the six hills in 4 to 30 s and stays
on it (all the time on the field, the roofs and the cave, 61 to 100% on the
rocks' 5 x 3 m tops).
`test/arena-client.test.mjs` (11): the readers (nobody red in a Fiesta), the
kit's modules and their news, the waypoints landing where the shader's
projection puts them, routes through Box Canyon's doors from every spawn
to every objective with no leg into a wall, a body's width clear, roles.
`test/map.test.mjs`: the objectives on Box Canyon at their heights, the
defaults, the halves.

The determinism matrix replays 20,000 ticks of eight AI fighters in each
team mode: 27 configurations each (Node, Deno, Chrome x JIT tiers x 1, 2 and 4
threads), equal on every tick, at 0.054 to 0.066 ms a tick on TurboFan in Deno
and Chrome. A Fiesta's words and hashes are what they were before teams.

Online, `net/run-arena.mjs --mode k --bots 15 --seconds 90` (Chrome and 15
AI fighters, 8 against 8), and with 256 AI fighters for 40 s (`--chrome 0
--bots 256 --seconds 40`):

| Mode | 16 sessions, 90 s: hashes checked, all equal | kills | the score at the end | 256 sessions, 40 s: hashes checked, all equal | kills | the score |
| --- | --- | --- | --- | --- | --- | --- |
| Team Slayer | 1,408 | 68 | 36 to 38, of 80 | 9,482 | 452 | 222 to 230, of 750 |
| Capture the Flag | 1,408 | 46 | 0 to 0 | 9,478 | 207 | 0 to 0 |
| Oddball | 1,424 | 64 | 29 to 15 | 9,478 | 498 | 0 to 27 |
| King of the Hill | 1,408 | 32 | 59 to 23 | 9,481 | 441 | 22 to 4 |
| Headhunter | 1,407 | 44 | 7 to 5, of 40 | 9,477 | 331 | 12 to 0, of 380 |
| Territories | 1,392 | 46 | 139 to 82, of 300 | 9,468 | 361 | 43 to 31 |
| VIP | 1,407 | 54 | 3 to 1, of 10 | 9,477 | 407 | 3 to 1 |
| Assault | 1,407 | 36 | 0 to 0 | 9,465 | 144 | 0 to 0 |

Sides 8 against 8 and 128 against 128 every time. A closed tick took 8.8 to
14.4 bytes on average with 16 (4.2 to 5.6 KB/s down and 2 KB/s up a session)
and 157 to 206 with 256 (43 to 56 KB/s down, 2 KB/s up), the bot host's 256
fighters 86 to 93% of one core. Captures are rare in a minute and a half
online: across this work's runs of 90 s, one capture in three runs; over 160 s
offline (the tests above) eight fighters capture three times. The AI fighters had
been looking for an enemy every tick while none was in sight, which in a team
mode is half the room: 7.3 ms a tick for 256, the bot host fell behind and
three of these four gates failed at 256; they look on their own tick of 16
now, 3.6 ms.

Headhunter, Territories, VIP and Assault came on the kit as a second wave,
each its own four files and test file (12, 13, 12 and 19 tests): every rule
with its edges, a Fiesta after it exactly a Fiesta's, AI fighters over 20,000
ticks on the debug build equal on every tick on 1 and 4 threads and scoring
for both sides (Assault's plant at 8, 16, 64 and 256 fighters; its defuses
stay rare, 4 in 26 runs, since a defender has 3 s to reach the bomb). Each
mode's log of eight AI fighters agrees in all 27 configurations; online, the
table above. Assault's bomb is carried as the skull is, so the page's carrier
HUD and kill feed read what the mode's module says is carried. Its blast
spares the planter's own side, as everything else in a team mode does.

CI records each mode's log for the matrix and runs it online with 64 AI
fighters.

```sh
node --test test/arena-teams.test.mjs test/arena-ctf.test.mjs test/arena-oddball.test.mjs test/arena-hill.test.mjs test/arena-client.test.mjs
node tools/genarena.mjs --bots 8 --ticks 20000 --mode 5 --out logs/arena-ctf.qgl   # 4 Team Slayer, 6 Oddball, 7 King of the Hill
node harness/matrix.mjs --ticks 20000 --log logs/arena-ctf.qgl --wasm build/arena/game.wasm
node net/run-arena.mjs --mode 5 [--bots 15] [--seconds 90]
node net/play.mjs --arena --mode 7       # a room of King of the Hill
```

## Box Canyon: structures and maps

![Box Canyon from beside the blue base, the red one at the far end](a3-box-canyon.png)

The ground is still a height map, drawn per pixel by stepping a ray across
it, and a height map can't overhang. So everything that has to (a wall you
hide behind, a roof over a room, a bridge, the roof of a cave) is an
axis-aligned box, and the boxes are in the game rules as well as the
picture: `src/arena.wat` moves a fighter through them as Quake moves its
player hull, an axis at a time (x, then z, then up or down), its body a
1 m x 1.8 m box. A box it was clear of stops it a body's radius short; on
the ground the body's band starts half a metre up, so it walks up steps
and onto anything lower than that, and is kept from stepping where its
head wouldn't fit; going up, a box's underside is a ceiling; coming down,
its top is ground. Hitscan rays stop at the first box (a slab test per box),
rockets, plasma and needles go off or burn out where they meet one, frags
bounce off its faces, and a blast, a melee lunge or a blast's knockback
doesn't reach through one. The boxes sit in groups, each with the box that
bounds it, so a query that misses a building costs one test for all of
it. They change nothing about the netcode: the map is static, built into the
wasm, so a room's peers have the same one or the relay turns them away for
a different build.

Box Canyon is two bases, 20 m by 18 m with 4 m walls and a door in every
side, a room inside, twelve steps up the inside wall to a hatch, a roof with
a parapet, and a bridge from the roof back over the yard to the slope
behind (`maps/canyon/map.json` has them as one prefab, placed twice,
the second turned half round and its trim blue); a teleporter in each yard
to the far side of the field; a ridge along the north wall with a cave
through it, its sword pad inside; boulders, rocks, a creek bed. 83 boxes in
5 groups. The renderer ray-traces them in the terrain's pass (the ground is
marched only as far as the nearest box) and casts a ray to the sun from
whatever a pixel lands on, so rooms and the cave are in shadow; teleporters
glow. `?cam=x,y,z,yaw,pitch` holds a spectator's camera anywhere, for
looking a map over:

![On the red base's roof: the hatch and the stairs under it](a3-roof.png)

**Results.** `test/arena.test.mjs`: the map laid out as built on five seeds
(its ground sample for sample, its boxes, every spawn clear of every box,
two on each roof); a runner stopped by a wall a body's radius short, in
through a door, a rise stopped by the roof at 4 m, the stairs climbed a
step at a time to the hatch, out onto the roof and to the parapet; the cave
walked through under its roof and its roof walked on; a teleporter taken at
a run; bullets ending on a wall, a rocket going off on it and its blast not
reaching the fighter behind it, a frag bouncing back off it; the prediction
equal to the confirmed world bit for bit through a wall, a door, the stairs,
a jump under the roof and a teleporter. `test/map.test.mjs`: PNGs round
trip; Box Canyon's blue base the red one turned about; a broken map says
what is wrong with it; a map of its own (a 64 m floor, a block, a
teleporter) built into the arena and played. The determinism matrix: 27
configurations, 20,000 ticks of eight AI fighters on Box Canyon, equal on
every tick. Online, 256 fighters for 40 s: 9,472 interval hashes, all equal,
1,292 kills. The bots see past boxes and walk round them (when a run stops,
they sidle and jump a while). The arena's wasm grew from 12 KB to 49 KB
gzipped, almost all of it the height image.

### Making a map

A map is a directory under `maps/`: `map.json`, `height.png` and, if you
like, `surface.png`. The map editor draws one in the browser
(`node tools/serve.mjs`, then `/client/map-editor.html`): the ground from
above, raised, lowered, flattened, smoothed and painted with a brush; boxes
dragged out and sized; spawns, pads, teleporters, the flags, the skull, the
hills and flight's race gates placed and dragged. It runs the build's own
compiler (`tools/map-compile.mjs`, the part of `tools/map.mjs` with no Node
in it) on every change and shows what it refuses, and saves the three files
into a folder (Chrome writes them in place; elsewhere it downloads them).
**play it here** opens the arena on the map as it stands, in a new tab, you
and AI fighters, with nothing built (below). To play a saved one online:

```sh
node tools/map.mjs maps/mymap            # checks it and says what it holds
node net/play.mjs --arena --map mymap     # relay, bots and page on it, no build; open the URL it prints
QG_MAP=mymap npm run build                # or build it in, as the build's own: node tools/asm.mjs --map mymap
```

- `height.png`: grey, 8 or 16 bits, 2 m a pixel, placed at
  `terrain.origin` (world x, z, multiples of 2; the world is 1024 m a side).
  Metres are `terrain.base + level * terrain.scale` (`1/256` for 16-bit
  files, as Box Canyon's; a quarter metre a level for 8-bit is a fair
  start). Past the image the generated terrain carries on as mountains from
  its edge.
- `surface.png` (optional, the same size): what the ground is, by colour,
  the nearest of grass `#4d8033`, rock `#7a6e5c`, sand `#b89e6b` and base
  metal `#808f9e` (or your own colours under `terrain.surfaces`).
- `map.json`: `bounds` `[x0, x1, z0, z1]`, where fighters can go; `prefabs`,
  named lists of boxes `[x0, y0, z0, x1, y1, z1, material]` about their own
  origin; `structures`, each a `prefab` placed `at` a point with a quarter
  `turn` and a `tint` (a map of materials to others), or its own `boxes` in
  world metres; `teleporters`, `{ from, to, radius }`, one-way; `spawns`,
  `[x, z]` on the ground or `[x, z, top]` on the highest box no higher than
  `top`; `pads` (slayer's and the team modes' guns), `{ weapon, at }`;
  `flags`, the team modes' two flag stands, `[{ team: 'red', at }, { team:
  'blue', at }]`; `ball`, Oddball's skull, `{ at }`; `hills`, King of the
  Hill's, `[{ at, radius }]` (`at` as a spawn's: `[x, z]` or `[x, z, top]`);
  `void`, a height in metres below which a fighter dies by falling (left
  out, none). Left out, the flags stand an eighth in from each end of the
  bounds' longer side, the skull in the middle, and three hills in the
  middle and halfway to each flag. Materials: `metal`, `rock`, `dark`,
  `red`, `blue`, `light`, `plain`, or a colour of the box's own over one of
  them: `#rrggbb` (plain) or `rock#7a6e5c`. The colour is drawing only, in
  the material word's top three bytes; the sim reads a box's corners and
  nothing else. At most 2048 boxes in 64 structures, 16 teleporters, 32
  spawns, 12 pads and 8 hills (radius up to 30 m), and each side's half
  (the spawns strictly nearer its own flag) needs a spawn. `name` is what
  the game and the store call it; `by`, a GitHub login, and `about`, a
  line, are the credit `tools/elo.mjs` writes into `elo.json`'s mods (the
  build reads neither).

`node tools/map-check.mjs maps/mymap` is the check CI runs on every map: it
compiles, builds into the debug sim (which traps on a NaN) and plays with
eight AI fighters, a Fiesta, Capture the Flag and King of the Hill on an
arena map and a Dogfight (and its Ring Race, with gates) on a map with a
ceiling. Both maps here take about 6 s together.

The editor shows the map in 3D beside the 2D view (**2D / 3D / both**):
the arena's own renderer (`client/map-view.mjs`) on what is being edited,
from a camera that orbits the 2D view's middle; drag turns it, right-drag
moves it, the wheel zooms. Picking is the 2D view's.

A Roblox place makes a map too: `node tools/roblox.mjs place.rbxl`, or
open it in the map editor ([docs/roblox.md](roblox.md)); so does a
MagicaVoxel model, `node tools/vox.mjs model.vox` ([docs/vox.md](vox.md)).

### Maps at run time

A build carries its own map (Box Canyon; Skyways for flight), and the
arena's and flight's builds also take one from outside, the same minute it
is made, with nothing rebuilt. `packMap` (`tools/map-compile.mjs`) packs a
compiled map: a 64-byte head (`MP_*` in layout.mjs: where each part of the
bytes is, the images' place and size, the ceiling), then the bytes a
build's own map segment holds. The host writes it in the keyframe slots
(`MAP_STAGE`, unused before init) and calls the `map_load` export once,
before init. A map may be anyone's, so map_load checks every count, offset
and size against the build's limits, and every number the sim reads as a
place is finite and within 100 km, before it writes anything, and answers
with what was wrong (`MAP_LOAD_ERRORS`). Then it lays the map where the
built-in one goes, the ground included (the mountains past the images from
$terrain_gen's seed 0, so the static world is the map's alone), and sets
`MAP_HOSTED` (in CTRL, which init never clears). Init then clears only up to
`MAP` and leaves the map and the ground as they are, through any number of
inits on any seeds. The same map laid this way and built in give the same
map area, ground and region, byte for byte, and a match on either steps to
the same hashes (`test/map-load.test.mjs`).

Every machine in a room must lay the same bytes, so a hello names the map
with the build: its hash is SHA-256 of the wasm and then the map
(`wasmPrefix` in `net/wire.mjs`), and a client on another map is turned
away as a client of another build is. The page takes it as `?map=<url>`
(`client/host.mjs`), the relay and the bot host as `--map <file>`, laid in
the referee's sim and the bots' world; `net/play.mjs --map` and
`net/run-arena.mjs --map` pack it into `build/maps/` and hand it to all
three. On Crossroads, laid this way, 64 AI fighters for 60 s online: 3,702
interval hashes, all equal, 439 kills, 0.3 ms a step.

`tools/canyon.mjs` is how Box Canyon was drawn: the ground painted by
code into the two images, the rest written to `map.json`. Open it in the
map editor, edit its output in any paint program and text editor, or edit
the script and run it again. The editor writes the ground as 16-bit at
1/256 m and `map.json` as the scripts do, so a map that goes through it
untouched builds to the same bytes (`test/map.test.mjs`).

## 256 in one room

The sim isn't what limits a room. 256 fighters all holding the trigger, on
one thread, step in 0.36 ms a tick at the median and 0.94 ms at p99, of the
8 ms a tick has; a room of 256 AI fighters, their thinking included, in
0.76 ms. So `node net/run-arena.mjs --bots 255 --seconds 60` filled a room:
a relay on the arena's sim, the bot host's 255 fighters through its native
door (one process, one shared world, 45% of one core) and Chrome with a
fighter at its controls, all on one 4-core machine.

![256 in one room: Chrome's view in a Fiesta of 256](a2-fiesta-256.png)

| | 256 fighters, Fiesta, 60 s |
| --- | --- |
| sessions in, of 256 | 256, none refused |
| interval hashes the referee checked | 14,605, all equal |
| kills in the minute | 2,224 |
| a closed tick | 271 B mean, 663 max |
| down / up a session | 71 KB/s / 2 KB/s |
| inputs the relay had to stand in for (late) | 1.2% |
| Chrome | kept up, 0 kills, 11 deaths |

The bytes are the cost of a crowd that never stops turning: every fighter
aiming is a changed word every tick: about 8.5 bits a fighter a tick. On the golf
layout of the word the same room took 491 B a tick and 129 KB/s; and every
bundle fits one datagram again. The late inputs and the relay's few stalls
are this one machine running the relay, the referee, 255 bots and a headless
Chrome at once.

Not done yet: vehicles, dropped weapons, a manual reload while firing,
and a second map (though [making one](#making-a-map) is now a paint program
and a text editor away).
