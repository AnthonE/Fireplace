# The coin

Fireplace's coin, ready to create and not created: a pump.fun coin on Solana
paired against PROS, the way oneshot's ONESHOT was made on 2026-11-10. This
is what is decided, what is drawn, what the game does for it, what is still
owed and the day itself. **Nothing here has an address.** ⛔ marks what is
welded at the create: a wrong name or picture is a second coin.

A coin is outside the game the way a look or a chat line is: no tick, record
or hash knows it, and no build changed for it. It is Fireplace's alone: a game
made from this template (`tools/kit.mjs`) has no coin, and deletes `coin/`,
`tools/coin.mjs`, `test/coin.test.mjs` and this page, or writes its own sheet.

## The sheet

`coin/fireplace.json` is this table as Elo Pros' launch kit reads it
(scry-forge `deploy/pumpfun`, a game's coin quoted in PROS). `coin/` has that
folder's shape, so it copies over it.

| | | |
|---|---|---|
| ⛔ name | `Fireplace` | the game's name, as the store writes it |
| ⛔ ticker | `FIREPLACE` | the name, the rule ONESHOT's was picked by; bare, never with a `$` |
| ⛔ pair | PROS | picked on the create form |
| ⛔ creator fee | 2% on the sheet | the rate our titles set; ONESHOT's landed at 1%, so read what the form offers |
| ⛔ mayhem mode | off | it doubles the supply |
| ⛔ picture | `coin/art/fireplace-coin.png` | draft a, the TV's fire; b and c are beside it |
| ⛔ banner | `coin/art/fireplace-banner.jpg` | the living room, the title on the right |
| ⛔ description | below | |
| ⛔ links | website `https://elopros.com/games/fireplace/`, X `https://x.com/ELOonSOL`, Telegram `https://t.me/eloonsol` | Elo Pros' own |
| creator | `FF31ZeUkM8T4YVT1dm1XTKsf9HfXcycTAGrPu2Pu6Vkx` | the wallet that created PROS and ONESHOT: it pays the opening in PROS and takes the fee in PROS |
| opening buy | 100,000,000 on the sheet (10%) | in the create, no bundle; what it costs in PROS is read on the day |

The description:

> Fireplace is a free party game on Elo Pros, in your browser: a living room
> with a fire going and a TV that plays party minigames, an arena, a dogfight
> and golf in turn, with a whole crowd in one room. FIREPLACE is its coin,
> paired against PROS. Play signed in and finish the day's challenges for a
> share of the daily pot. Every house wallet is listed at
> elopros.com/tokenomics.html

It names no figure, and `tools/coin.mjs` refuses one. ONESHOT's said the house
bought 10% in the create; the create bought 4.8% and the rest went on the
curve after, and the sentence could not be corrected. What the house holds
goes on the tokenomics page and in the news post, written after the fact.

`node tools/coin.mjs --check` holds the sheet to the form's rules as the kit
checks them (a name of 1 to 32 characters, https links, no mayhem, an opening
the curve can sell, a creator that is a Solana address) and to two of ours:
the ticker fits the daily pot's rule (2 to 10 capitals or digits) and the
description names no figure. `test/coin.test.mjs` runs the same check, and
holds this page to the sheet word for word.

## The pictures

`node tools/coin.mjs` draws them, in code like the rest of the game: the TV's
3x5 font, its fire's colours, Grandma's brick, flat tones and no font file.
Chromium rasters them; the banner and the post stand on the living room shot
from the couch, as `tools/theme-shots.mjs` takes it.

| | file | |
|---|---|---|
| the coin's picture | `coin/art/fireplace-coin.png` | 1024 px, ink to the corners so pump.fun's circle and its rounded square both hold; 67 KB |
| its drafts | `coin/art/fireplace/coin-a-fire.png`, `coin-b-mallow.png`, `coin-c-hearth.png` | the TV's fire on its logs; a toasted marshmallow, what a game pays its top three; the fireplace with Grandma's pumpkins |
| pump.fun's banner | `coin/art/fireplace-banner.jpg` | 1500 x 500 |
| the launch post | `coin/art/fireplace-post.jpg` | 1600 x 900, for X and Telegram; no amount on it, since a pot can change and a picture in a feed can't |

`node tools/coin.mjs --pick b` makes draft b the picture (and the post's
coin). Each carries Elo Pros' tile in its corner, as ONESHOT's does. All three
read at 48 px.

## What it does

| | |
|---|---|
| pairs against | PROS, on pump.fun's curve and then its pool |
| how a player gets it | buys it, or plays for it: a share of a daily pot for the day's challenges, on rooms we host, signed in |
| a game's pay | none. The top three still get marshmallows, and marshmallows are the room's score: they are not the coin, and no rate between the two is posted |
| what it buys | nothing yet. Looks are bought with marshmallows out of a browser's purse (`client/purse.mjs`); selling one for the coin waits on purchases living with the wallet ([roadmap.md](roadmap.md)) |
| the house | never sells it: a prize wallet spends it on players only |

The pot is the house's rule, not the game's: a fixed sum a UTC day, split by
the shares earned that day, a share being one of the day's live challenges
finished by a wallet that played on our rooms, capped per player, paid the
next day after a person reads the file (scry-forge `meter/daily_pot.py`,
`data/challenges/pots.json`). ONESHOT's is 100,000 a day and at most 5,000 a
player; Fireplace's figures are the operator's to set, and no text in this
repo names one.

## What the game does for it

Built here, with the coin:

1. **The challenges' pool** (`client/achievements.mjs` `CHALLENGES`, written
   into `elo.json`'s `stats` block by `node tools/elo.mjs`): ten for a day and
   eight for a week, each a goal over a stat the relay already reports as a
   game ends (games, marshmallows, wins, a game played or won, the crowd).
   Elo Pros draws three of each a period by a hash anyone can recompute. A
   day's goal is once or twice round the playlist: its five games are nine
   rounds of at most 90 s (the arena, Dogfight and a hole of golf one each,
   Party three to a game, twice), so *play 5 games* is a quarter of an hour
   at the longest. None is on `best_streak`, which the relay reports as it
   stands, nor on bumper balls' stats, which nothing plays.
2. **Solana wallets count** (`net/elo.mjs` `walletResults`). The relay used
   to report only Ethereum wallets' results; a pump.fun buyer signs in with a
   Solana wallet, and Elo Pros keeps its stats as its own, or as the Ethereum
   wallet's it is linked to. Read from Elo Pros' code, not yet run against
   the live service: the first signed-in Solana game should show on
   `/api/gamestats/fireplace/of/<wallet>`.
3. **The sheet and the pictures**, above.

Results come from the referee, never a client, and a local room
(`?local=1`) reports nothing, so only play on rooms we host earns. A player
alone in a hosted room wins every game; the pot's cap bounds what that takes,
and the gate after it is the one ONESHOT's plan names: count only games with
two signed-in wallets in them, which is already the rule for a rated match
(`matchOf`).

## Owed

Before the create, in order; the owner in brackets.

1. [operator] **The calls.** The ticker: `FIREPLACE` here, by the rule
   ONESHOT's was picked by; `MALLOW` is the other one worth a look, with
   draft b as its picture, but then the room's marshmallows and the coin
   share a name without sharing a rate. The picture: a, b or c. The X link:
   Elo Pros' here; ONESHOT's sheet used the developer's own. The creator
   wallet and the opening: the sheet assumes ONESHOT's.
2. [operator] **A server key for the hosted rooms**: `node tools/elo.mjs
   --server-key <id>`, the public half committed with `elo.json`, the relay
   started with it ([hosting.md](hosting.md)). `elo.json` names none today,
   and until Elo Pros holds one it refuses every report, so no challenge
   moves.
3. [Elo Pros] **A prize wallet** for Fireplace, on the house's wallet list,
   and Fireplace's row in the pot's rule and the challenges' rewards.
4. [Elo Pros] **The kit's side**: `coin/` copied over `deploy/pumpfun/`, the
   coin's icons cut from the picked picture, the listing's coin banner and
   economy line, the tokenomics section, the news post, and the landing test
   ONESHOT has (`meter/test_oneshot_landing.py`).
5. [here] **The page says so**: a line on the TV's standings or the couch
   for the day's challenges and what is left of them, read from
   `/api/challenges/fireplace/<wallet>`. Not built: it waits on the calls.

Open, and not this page's to decide: where the creator fees go. The
[roadmap](roadmap.md) has wanted a pot for a minigame's author, split by the
rounds the referee measured, and had no rule for where it comes from. Fees
paid in PROS are one answer.

## The day

After ONESHOT's, with what its day taught.

1. **Read the opening's cost**, in the kit, just before: `node launch.mjs
   price fireplace.json`. A curve quoted in PROS is priced off PROS's own, so
   the figure moves; never type one from a page.
2. **Create it** on pump.fun's web app from the creator wallet: the sheet's
   name, ticker, description, picture, banner and links; pair PROS; mayhem
   off; the creator fee the form offers; the opening buy in PROS.
3. **Split it**: half of what the create bought to the prize wallet, in one
   transfer.
4. **Record it**, in the kit: `node launch.mjs coin --mint <coin> --title
   fireplace --prize <the prize wallet>`, then the same with `--write`. It
   reads the name, ticker, creator, pair and fee off the chain and refuses a
   coin that isn't ours.
5. **The landing commit** on Elo Pros: the record, the wallets' rows, the
   listing, the post. The pot switches on from the record.
6. **Here**: the store's economy line for Fireplace changes with the listing;
   `elo.json` needs nothing, since the coin sells nothing yet.
7. **Post it**: `coin/art/fireplace-post.jpg`, with the coin's address in the
   words and what the house holds as it was bought.
8. **Each morning**: the day's file written, read by a person, paid.

Not financial advice; the pot is a ceiling, never a promise of value.
