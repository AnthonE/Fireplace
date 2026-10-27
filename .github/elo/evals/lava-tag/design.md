# Lava Tag

## The game
"Whoever is it turns the floor to lava where they roll, and everyone else has to dodge."

One player is "it". Wherever "it" rolls, the floor turns to lava for a few
seconds. Touch lava and you're out; tag someone and they become "it". The
last player still rolling wins.

## Kit
Kit: party
Nobody gains by cheating, every game starts fresh and everyone sees the same
floor, so every browser runs the game and a relay passes the inputs. Up to
100 players fits in one room (a room holds 256).

## First playable
A Party minigame called LAVA TAG on a flat square floor. It starts closest to
TAG (`src/mg/tag.wat`) for passing "it" and RISING LAVA (`src/mg/lava.wat`)
for a floor that hurts; the lava trail is the new part. You asked for a
desktop app too: this game is a page, and the page is where to start.

## Biggest risks
1. A lava trail for many players is a lot of floor to remember: store it as a small grid, and test it with 100 bots.
2. Being "it" too long is no fun: pass "it" on a timer if nobody gets tagged.
3. Lunchtime games need people at once: keep AI players in every round so it's never empty.

## Money
You want to sell copies and have a coin. Selling copies starts from this repo
on the Elo Pros store, 100% of the price to you. A coin needs your own
wallet, so it comes last, after the game has players.
