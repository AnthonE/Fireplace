# Snow Fort Party

## The game
"Everyone builds a snow fort, then the snowballs fly and the last fort standing wins."

Each round has two parts. First, 20 seconds to build: you roll along the
ground and push up snow walls around your spot. Then the snowballs fly: you
throw at the other forts, and a fort that loses all its walls is out. The
last fort with a wall left wins the round.

## Kit
Kit: party
Nobody gains by cheating, every game starts fresh and everyone sees the same
field, so every player's browser can run the game and a small relay is all
the server it needs.

## First playable
A Party minigame called SNOW FORT: a round snowfield, up to 16 balls, a short
build phase, then snowballs. It starts closest to SNOWBALL (`src/mg/snowball.wat`),
which already throws snowballs, and the sumo ring that `tools/new-mg.mjs`
writes. Walls are the new part.

## Biggest risks
1. Walls for 16 forts could be a lot to draw and test: start with one wall piece per ball and add more later.
2. You have not made a game before: change one rule at a time and run the test after each change.
3. Bots that only throw will never build: teach them to build first, or every test round is the same.
