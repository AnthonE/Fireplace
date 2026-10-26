# Marble Mayhem

## The game
"Up to four marbles race down a twisty track and knock each other off the edges."

Two to four players, each a marble at the top of a winding track. Roll down,
bump the others off the edges, and the first marble to the bottom wins. Fall
off and you start again from the last checkpoint, so nobody is out for long.

## Kit
Kit: party
Nobody gains by cheating, every race starts fresh and everyone sees the same
track, so every player's browser runs the race and a small relay passes the
inputs between them.

## First playable
A Party minigame called MARBLE RUN: one twisty track downhill, checkpoints,
first to the bottom wins. It starts closest to DOWNHILL (`src/mg/race.wat`),
which already races balls down a slope; the bends and the edges are the new
part. Your art can come in later as a room theme and ball looks.

## Biggest risks
1. A twisty track is harder than a straight one: get one bend working before adding more.
2. With two players a race can feel empty: keep AI marbles in every race until friends join.
3. Selling a game nobody has played yet is hard: let people play it free on your page first, then sell.

## Money
You want to sell copies for $4.99. On the Elo Pros store you list your game
from this repo; each copy sold pays 100% of the price to you. The price is
already in `elo.json`. Until you add a wallet line, the store holds your
money for you.
