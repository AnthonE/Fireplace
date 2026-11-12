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
`tools/party-shot.mjs`, a room theme from the couch by
`tools/theme-shots.mjs`, or the arena or Dogfight by `tools/arena-shot.mjs`:
in a local room on a fixed seed and a held hour (`track`, `rim`, `sky`,
`dusk`, `night`, `ships`: a camera held over Box Canyon, or a bot's own;
`behind`, `close`, `far`: the arena's camera behind a bot, `--map` on another map), or
on the arena renderer's demo page with no sim (`faces`, `figures`). All run
Chromium on SwiftShader with `?present=0`,
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

**In the page**, `client/look.html` (the studio's third tab, beside maps and
minigames) is the same board: each view is drawn there by the page that draws
it for the shooter (`page` in the board: `party-render-demo.html`'s
`__demo.shot`, `room.html`'s `__room.shot`), with the same measurements
(`test/look.test.mjs` holds the two `measure()`s equal), read out in plain
words against the references ("darker at the top, less colourful"; a
difference under 6 of 255 reads as close) with the numbers on hover. The page
draws every view when it opens (`?shoot=0` skips it); a view is references,
now and the shot before, in three fixed columns, and clicking a picture opens
a reference beside now, large. Drop a picture on a view, say what to take
from it, say whether the view **looks right** or **not yet** (not yet needs
your words), and **send it in** downloads the board, the marks and the
pictures for a pull request; **brief for an agent** copies what an agent
running the elo-look skill needs to start. A view's `name` is what the page
and the sheet call it.

## The cartoon: golf's, the arena's and Dogfight's look

Those three share one look in two files, nothing in either hashed.
`client/lowpoly.mjs` is the paint, WGSL each renderer declares beside its
own. `client/post.mjs` is the finish, a module each renderer draws its world
through.

The paint:

- **Three tones.** `cel()` turns the cosine to the sun into what a colour is
  multiplied by: by day, in shadow (0.5, 0.53, 0.82), turned from the sun
  (0.82, 0.85, 0.97), in it (1.06, 1.03, 0.95), the edges 0.05 wide. Shadow
  is violet, not grey. An axis-aligned box comes out one tone a face: its
  top lit, two walls turned, two in shadow.
- **The hour.** The sun, the sky's colours, the haze, the tones and the
  clouds' two colours are one uniform, `env` (`ENVS`: 40 floats), not
  constants: day as above; dusk, the sun 15 degrees up, shadows four times
  as long and what is lit gone gold; night, the moon's blue with stars,
  where what glows shows the more. The lit tone's threshold follows the
  light's height (0.85 of it), so level ground in the open is lit at any
  hour. The arena and Dogfight take a match's hour from its seed (`envOf`:
  day four matches in six, dusk one, night one; `?env=` holds one), so a
  room sees one sky; golf is played by day. Nothing in the sim knows it.
- **Shadows.** The boxes cast them as before (a ray to the sun through the
  map's boxes). The ground now does too: `hillLit` marches 22 growing steps
  toward the sun over the heights, 386 m at most, stopping once clear of the
  highest ground. A fighter's own is an ellipse on the level of its feet,
  multiplied in where the sun reaches. The flat clouds' shadows drift over
  the ground and the boxes.
- **The ground** (`groundPaint`, the arena's and Dogfight's; golf keeps its
  mown stripes) is lit by its slope over 3 m each way, 12 m far off, rather
  than a 4 m facet's, so a hill's dark side has a curved edge. Grass is three
  greens in patches with strokes and a few flowers inside 40 m; anything
  steeper than 0.74 up is a cliff in strata 2.1 m deep.
- **The sky**: cobalt overhead to a pale horizon, the sun past white,
  cumulus piled round the horizon (noise on a cylinder, its lumps the noise
  folded) and flat clouds on a layer 300 m up, every cloud two flat
  colours. Far things fade to the horizon's haze by the square of the
  distance, so near colours stay as painted and the world's far edge is gone.

What stands on it:

- **The figure** (`client/figure.mjs`), the arena's fighter and golf's
  golfer: a person as a distance field marched along the pixel's ray (at
  most 64 steps, then four more for the normal) in the figure's own frame.
  Legs with knees that bend as the leg comes forward, arms with elbows out
  to the rifle (golf's launcher on the shoulder), a head a quarter of its
  height with hair in one of three cuts, two tall eyes, a mouth. A zombie
  reaches empty-handed; a robot body has a box for a head, a visor and an
  aerial. The colours are what the seven boxes had: a body's skin, an
  avatar's six parts, the seat's or the side's colour on the shirt; hair and
  eyes come from the slot (10 and 6 colours). Party's riders are still the
  boxes (`client/rider.mjs`), and so is the gun in your hands.
- **What glows** (`FX_WGSL`): a blast is a spiked burst in three flat bands,
  white-hot inside, breaking up in holes from its rim as it ages; a spark a
  four-pointed glint; a shield or a spawn a ring of dashes; a tracer a white
  core in its colour's sheath. All past white, so they bloom. Boosting in
  Dogfight draws speed lines in from the screen's edge, a new set 14 times a
  second, eased in over 120 ms.

Party keeps its own renderer and its toy-box materials
(`client/party-render.mjs`), but its sun now falls in the same flat steps:
turned to it at all, and square to it, a shadow's soft edge drawn in to a
crisp one. The living room is as it was.

`client/arena-render-demo.html` is the arena's renderer on a memory laid out
by hand, no sim (`figures`, `faces`, `teams`, `effects`; `?env=` the hour):
what a match never holds still. `node tools/arena-shot.mjs --scenes
figures,faces [--env night]` shoots it.

The finish, per frame: the world into an `rgba16float` texture and a linear
depth; a bloom of what is past 0.92 (the sun, lights, tracers, blasts,
engines), five halvings down and back up; ink wherever the second difference
of 1/depth passes 0.035 (zero across any plane, so only silhouettes and
creases), 1 px wide at 600 rows, fading over 170 m (320 m in Dogfight, where
a ship is read by its outline); a roll-off above 0.8 that keeps a colour's
hue; FXAA; then the HUD, by the renderer's own pipeline in that last pass,
so text is never blurred.

**Measured**, on SwiftShader at 960 x 600 (a software GPU, with the test
suite running beside it, so only the ratio means anything): a frame of the
arena went from 5.3 s to 6.3 s, of Dogfight from 8.5 s to 9.5 s. On the
same machine idle, the demo's four figures filling the screen from 2.8 m
draw in 2.1 s, its first frame in 3.9 s (the shader's compile included).
Not measured: any real GPU.

`tools/board.mjs` is vendored from the Elo Pros agent kit
(`skills/elo-look/scripts/board.mjs` in elo-pros-launcher): fix it there and copy it
back. `test/board.test.mjs` holds what it promises.
