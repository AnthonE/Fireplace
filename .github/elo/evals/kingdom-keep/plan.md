# Kingdom Keep — the plan

Tick a box when its check passes. Comment @claude on a milestone-1 issue and
Claude does it as a pull request.

## Milestone 1 · The raid, as a round
- [ ] Run the game once, unchanged — files: none — check: `npm ci && node tools/kit.mjs check`
- [ ] Start the CASTLE RAID minigame with node tools/new-mg.mjs keep kk "CASTLE RAID" — files: `src/mg/keep.wat`, `src/mg/keep.mjs`, `client/mg/keep.mjs`, `test/mg-keep.test.mjs` — check: `npm run build && node --test test/mg-keep.test.mjs test/party.test.mjs`
- [ ] 30 seconds to stack a small castle — files: `src/mg/keep.wat`, `src/mg/keep.mjs` — check: `npm run build && node --test test/mg-keep.test.mjs`
- [ ] Then roll out and knock castles down; the last one standing wins — files: `src/mg/keep.wat`, `client/mg/keep.mjs` — check: `npm run build && node --test test/mg-keep.test.mjs`
- [ ] See it on your page — files: none — check: `npm run build && node tools/site.mjs`

## Milestone 2 · Make it look like yours
- [ ] A castle-hall room theme — files: `client/themes/castle-hall.json` — check: `node --test test/themes.test.mjs`
- [ ] A crown for the last castle standing — files: `client/looks.mjs` — check: `node --test test/looks.test.mjs`

## Milestone 3 · Raid with friends online
- [ ] Get a relay and put its address in client/kit.json — files: `client/kit.json` — check: `node net/run-party.mjs --mg 30`

## Milestone 4 · Put it on the Elo Pros store
- [ ] Check what the store reads from your repo — files: `elo.json` — check: `curl -fsS "https://elopros.com/api/store/repo-check?repo=kid-kingdom-keep/kingdom-keep"`
