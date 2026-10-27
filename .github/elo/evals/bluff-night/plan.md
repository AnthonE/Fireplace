# Bluff Night — the plan

Tick a box when its check passes. Comment @claude on a milestone-1 issue and
Claude does it as a pull request.

## Milestone 1 · The open-card round
- [ ] Run the game once, unchanged — files: none — check: `npm ci && node tools/kit.mjs check`
- [ ] Start the HIGH LOW minigame with node tools/new-mg.mjs bluff bf "HIGH LOW" — files: `src/mg/bluff.wat`, `src/mg/bluff.mjs`, `client/mg/bluff.mjs`, `test/mg-bluff.test.mjs` — check: `npm run build && node --test test/mg-bluff.test.mjs test/party.test.mjs`
- [ ] A card everyone sees, and two pads: higher and lower — files: `src/mg/bluff.wat`, `client/mg/bluff.mjs` — check: `npm run build && node --test test/mg-bluff.test.mjs`
- [ ] The wrong pad tips you off the table — files: `src/mg/bluff.wat`, `src/mg/bluff.mjs` — check: `npm run build && node --test test/mg-bluff.test.mjs`
- [ ] See it on your page — files: none — check: `npm run build && node tools/site.mjs`

## Milestone 2 · Make it look like yours
- [ ] A card-table room theme — files: `client/themes/card-night.json` — check: `node --test test/themes.test.mjs`

## Milestone 3 · Play with friends online
- [ ] Get a relay and put its address in client/kit.json — files: `client/kit.json` — check: `node net/run-party.mjs --mg 30`

## Milestone 4 · Put it on the Elo Pros store
- [ ] Check what the store reads from your repo — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-bluff-night/bluff-night"`
