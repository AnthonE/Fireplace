# Lava Tag — the plan

Tick a box when its check passes. Comment @claude on a milestone-1 issue and
Claude does that task as a pull request.

## Milestone 1 · The first playable
- [ ] Run the game once, unchanged — files: none — check: `npm ci && node tools/kit.mjs check`
- [ ] Start the LAVA TAG minigame with node tools/new-mg.mjs lavatag lg "LAVA TAG" — files: `src/mg/lavatag.wat`, `src/mg/lavatag.mjs`, `client/mg/lavatag.mjs`, `test/mg-lavatag.test.mjs` — check: `npm run build && node --test test/mg-lavatag.test.mjs test/party.test.mjs`
- [ ] One player is it, and a tag passes it on — files: `src/mg/lavatag.wat`, `src/mg/lavatag.mjs` — check: `npm run build && node --test test/mg-lavatag.test.mjs`
- [ ] Where it rolls, the floor turns to lava for a few seconds — files: `src/mg/lavatag.wat`, `client/mg/lavatag.mjs` — check: `npm run build && node --test test/mg-lavatag.test.mjs`
- [ ] The bots chase when they're it and dodge when they're not — files: `client/mg/lavatag.mjs` — check: `node --test test/mg-lavatag.test.mjs`
- [ ] See it on your page — files: none — check: `npm run build && node tools/site.mjs`

## Milestone 2 · Make it look like yours
- [ ] A volcano room theme — files: `client/themes/volcano.json` — check: `node --test test/themes.test.mjs`

## Milestone 3 · Play at lunch with friends
- [ ] Get a relay and put its address in client/kit.json — files: `client/kit.json` — check: `node net/run-party.mjs --mg 30`

## Milestone 4 · Put it on the Elo Pros store
- [ ] Check what the store reads from your repo — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-lava-tag/lava-tag"`

## Milestone 5 · Sell copies, then a coin
- [ ] Set a price on the dev console's Sell pane; it writes the sell line in elo.json — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-lava-tag/lava-tag"`
- [ ] Get a wallet and add "wallet": "0x…" to elo.json; a coin needs it — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-lava-tag/lava-tag"`
