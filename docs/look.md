# The reference board

How a look gets made here: references first, the game photographed with no
GPU, both read side by side, and the operator's word on each picture as the
bar. `board/board.json` is the board, `tools/board.mjs` runs it.

```sh
node tools/board.mjs look                          # shoot every view, then the sheet
node tools/board.mjs look --views couch            # one view
node tools/board.mjs status                        # each view's last mark, and passes since
node tools/board.mjs ref couch ~/Pictures/den.jpg --take "warm lamp light, the TV the brightest thing" --licence ours
node tools/board.mjs mark couch wrong "the fire outshines the TV"
```

**A view** is one fixed picture: a demo scene in `client/party-render-demo.mjs`
(`looks`, `crowd`, `thinice~over`, `horizon@sunset`, ...) shot by
`tools/party-shot.mjs`, or a room theme from the couch by
`tools/theme-shots.mjs`. Both run Chromium on SwiftShader with `?present=0`,
so a box with no graphics card draws the real frame (a second or more each).
Views that share a shooter are shot by one run of it. A new view is a line in
the board naming its shooter, the PNG it writes, what it shows (`what`) and
what it aims at (`take`).

**A pass** is every view shot once, kept in `board/passes/<stamp>/` (not
committed; the last 20 stay). **The sheet** (`sheet.png` in the pass) puts
each view's references, the frame now and the frame from the pass before in
one row, with Rec.601 luma over the frame, the sky band (top 25% of rows),
the near band (bottom 35%) and chroma (max minus min channel), each 0 to 255,
and now's distance from the references' median. One estimator reads both
sides in the same run. `stats.json` holds the numbers for a reader with no
eyes.

**A reference** is a target, never an asset: nothing is traced or copied from
one. A picture that is ours or CC0 goes in `board/refs/` with its licence; any
other is `--private`: the file stays in the directory `$ELO_REF_DIR` names and
only its name and what to take from it are written in the board.

**Marks** are `board/marks.jsonl`, one line each, never edited: `right`,
`wrong` or a `note`, in the operator's words. A loop stops on a view when its
latest mark is `right`; the numbers keep a floor and never overrule a mark.
An agent records a mark only when the operator has said it.

`tools/board.mjs` is vendored from the Elo Pros agent kit
(`skills/elo-look/board.mjs` in elo-pros-launcher): fix it there and copy it
back. `test/board.test.mjs` holds what it promises.
