# Bluff Night

## The game
"Each player holds secret cards and bluffs about them; get caught lying and you roll off the table."

Two to four players around a table, each holding cards nobody else can see.
You claim what you hold; the others call your bluff or let it pass. Get
caught lying and your ball rolls off the table.

## Kit
Kit: world
Players see different things: your cards are secret. In this repo's kit every
player's browser runs the whole game, so a curious player could read
everyone's cards. Secret cards need one server that deals them and only
tells you yours. That kit is not published yet.

## First playable
A version with nothing hidden, as a Party minigame: each round a card is
shown to everyone, a player calls "higher" or "lower" by rolling onto a pad,
and the wrong pad tips you off the table. It starts closest to COLOR CALL
(`src/mg/color.wat`), where you race to the right pad. The bluffing comes
when the game moves to a server that can keep secrets.

## Biggest risks
1. Bluffing is the heart of the idea and needs hidden cards: test whether the open version is fun before waiting for the other kit.
2. Two players is a small room: keep AI players at the table so every round has four.
3. Card rules can grow fast: write down one round's rules before adding a second card.
