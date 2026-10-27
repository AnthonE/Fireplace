# Marble Mayhem — the plan

Tick a box when its check passes. Comment @claude on a milestone-1 issue to
have Claude do that task as a pull request.

## Milestone 1 · The first playable
- [ ] Run the game once, unchanged — files: none — check: `npm ci && node tools/kit.mjs check`
- [ ] Start the MARBLE RUN minigame with node tools/new-mg.mjs marbles mb "MARBLE RUN" — files: `src/mg/marbles.wat`, `src/mg/marbles.mjs`, `client/mg/marbles.mjs`, `test/mg-marbles.test.mjs` — check: `npm run build && node --test test/mg-marbles.test.mjs test/party.test.mjs`
- [ ] A twisty track downhill with edges you can fall off — files: `src/mg/marbles.wat`, `src/mg/marbles.mjs` — check: `npm run build && node --test test/mg-marbles.test.mjs`
- [ ] Checkpoints, and first to the bottom wins — files: `src/mg/marbles.wat`, `client/mg/marbles.mjs` — check: `npm run build && node --test test/mg-marbles.test.mjs`
- [ ] See it on your page — files: none — check: `npm run build && node tools/site.mjs`

## Milestone 2 · Make it look like yours
- [ ] Your art as a room theme — files: `client/themes/marble-hall.json` — check: `node --test test/themes.test.mjs`
- [ ] A glass marble ball look — files: `client/looks.mjs` — check: `node --test test/looks.test.mjs`

## Milestone 3 · Race your friends online
- [ ] Get a relay and put its address in client/kit.json — files: `client/kit.json` — check: `node net/run-party.mjs --mg 30`

## Milestone 4 · Put it on the Elo Pros store
- [ ] Check what the store reads from your repo — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-marble-mayhem/marble-mayhem"`

## Milestone 5 · Sell copies
- [ ] The price, $4.99, is already the sell line in elo.json: list the game and the buy box shows it — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-marble-mayhem/marble-mayhem"`
- [ ] When you have a wallet, add "wallet": "0x…" to elo.json and your money moves to it — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-marble-mayhem/marble-mayhem"`
