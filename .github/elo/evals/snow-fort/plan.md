# Snow Fort Party — the plan

Tick a box when its check passes. Each task in milestone 1 is also an issue:
comment @claude on it and Claude does it as a pull request.

## Milestone 1 · The first playable
- [ ] Run the game once, unchanged — files: none — check: `npm ci && node tools/kit.mjs check`
- [ ] Start the SNOW FORT minigame with node tools/new-mg.mjs fort ft "SNOW FORT" — files: `src/mg/fort.wat`, `src/mg/fort.mjs`, `client/mg/fort.mjs`, `test/mg-fort.test.mjs` — check: `npm run build && node --test test/mg-fort.test.mjs test/party.test.mjs`
- [ ] The build phase: 20 seconds to push up walls — files: `src/mg/fort.wat`, `src/mg/fort.mjs` — check: `npm run build && node --test test/mg-fort.test.mjs`
- [ ] The snowball phase: hit a wall and it breaks, lose them all and you're out — files: `src/mg/fort.wat`, `client/mg/fort.mjs` — check: `npm run build && node --test test/mg-fort.test.mjs`
- [ ] Teach the bots to build, then throw — files: `client/mg/fort.mjs` — check: `node --test test/mg-fort.test.mjs`
- [ ] See it on your page — files: none — check: `npm run build && node tools/site.mjs`

## Milestone 2 · Make it look like yours
- [ ] A snowy room theme for the living room — files: `client/themes/snow-day.json` — check: `node --test test/themes.test.mjs`
- [ ] A woolly hat players can wear — files: `client/looks.mjs` — check: `node --test test/looks.test.mjs`

## Milestone 3 · Play with friends online
- [ ] Get a relay (ask on the Elo Pros dev console, or run your own) and put its address in client/kit.json — files: `client/kit.json` — check: `node net/run-party.mjs --mg 30`

## Milestone 4 · Put it on the Elo Pros store
- [ ] Check what the store reads from your repo — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-snow-fort/snow-fort"`
