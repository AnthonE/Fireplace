# Kingdom Keep

## The game
"Players build castles that stay up between games and raid each other for gold."

You build a castle over many sessions and keep it. Other players raid it for
gold, and you raid theirs. The castle and the gold are still there tomorrow.

## Kit
Kit: world
Two of your answers point to a game with one server that owns the world:
cheating pays (gold is worth stealing, so someone could edit their copy of
the game to get more), and the world remembers (castles stay up when nobody
is playing). This repo is the party kit, where every player's browser runs
the whole game and nothing is kept between games. The world kit is not
published yet.

## First playable
The raid itself, as a Party minigame that starts fresh each round: everyone
gets 30 seconds to stack a small castle, then rolls out to knock down the
others'. The last castle standing wins. It starts closest to KING OF THE HILL
(`src/mg/hill.wat`) and THE WALL (`src/mg/wall.wat`). Keeping castles and gold
between games is what moves to the world kit later; the rules you write for
a raid carry over as the design.

## Biggest risks
1. The part you care about most (castles that last) is not something this kit can do: build the raid first and decide after people play it.
2. Gold worth stealing brings cheaters: until there is a server that holds the gold, keep gold out of the game.
3. Building takes longer than raiding is fun: keep the build phase short and test it with bots.
