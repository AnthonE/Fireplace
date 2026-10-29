# A voxel model as a map

A model built in MagicaVoxel comes into Fireplace as an arena map: its
voxels as boxes in their own colours, its floor as the ground, and objects
named for spawns and weapons as spawns and pads. The `.vox` format is
MagicaVoxel's own, and Goxel, Avoyd and Qubicle's exporter write it too. It
takes one command, or one file dropped on the map editor, with no prompt and
no hand work. A report lists everything the converter left out or changed.

```sh
node tools/vox.mjs model.vox                  # writes maps/model/, checked by the build's compiler
node tools/vox.mjs model.vox --scale 0.25     # a finer model: a quarter metre a voxel
node net/play.mjs --arena --map model         # play it with bots
```

You can also open `/client/map-editor.html` (`node tools/serve.mjs`). Pick
**open… > a MagicaVoxel model…** or drop the file on the page, then look it
over in 2D and 3D. The editor runs the same converter in the page. From
there, **play it here** opens the arena on the map with AI fighters, laid
at run time with no build.

## What comes over

`tools/vox-file.mjs` reads the file from the format's published description
(github.com/ephtracy/voxel-model). It has no dependencies and no Node. It
reads:

- the models;
- the palette (or MagicaVoxel's default, when the file has none of its own);
- the materials;
- the scene of transforms and groups that places each model, turned and
  moved, composed down the tree.

Hidden objects and hidden layers are left out. `tools/vox-map.mjs` makes
the map:

| In the model | In the map |
| --- | --- |
| a voxel | a cube `--scale` m a side, 0.5 by default: the arena's step, so a fighter walks up one |
| runs of one colour | one box: grown along x, then y, then z, each as big as it can be from where it starts |
| the floor: each column's lowest solid, as deep as at least half the columns' is, standing on the model's bottom or meeting a neighbour's (a landscape's slopes) | the ground, its top voxel's colour the nearest surface (grass, rock, sand; metal for a metal material); what stands on it is boxes |
| an object named `spawn`, `red spawn` or `blue spawn` (the outliner's name) | a spawn on its top; red's and blue's are the teams, their flags among them |
| an object named for a weapon (`sword`, `rocket launcher`, `sniper`, as a Roblox tool's name is read) | a weapon pad with that gun; its voxels are not solid |
| a colour's material: metal, emit | the metal look, the lit look (`metal#...`, `light#...`); glass and the rest plain |
| open air under the model | a pit, and `"void"`: a fighter 3 m under the lowest ground dies by falling |

MagicaVoxel's z is up; the map's y is. A voxel at (x, y, z) is the map's
(x, z, -y), a turn that keeps left and right where they were. A model turns
about its middle (`floor(size / 2)`), as MagicaVoxel places it. An older
file (version 150) with several models and no scene holds animation
frames, so the first frame is the map.

The back half is shared with the Roblox converter (`tools/scene-map.mjs`):
the ground, the cut to the world, the box budget, the void, the spawns and
the structures are the same code. That is why a voxel map's report reads
like a Roblox place's.

## Measured

MagicaVoxel's own sample models (MIT), on this machine's Node. The table
gives voxels, ground columns, boxes before and after the fit to NBOX
(2048), and the time to convert:

| Model | Voxels | Ground columns | Boxes | In the map | Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| monument/monu1 | 156 942 | 3 652 | 506 | 506 | 0.1 s |
| monument/monu7 | 226 036 | 15 625 | 423 | 423 | 0.1 s |
| monument/monu16 | 194 300 | 6 429 | 1 162 | 1 162 | 0.1 s |
| procedure/maze (a 3D maze) | 10 990 | 910 | 721 | 721 | 0.1 s |
| scan/teapot | 28 411 | 5 389 | 3 890 | 2 045 | 0.9 s |
| procedure/nature (a landscape) | 75 835 | 9 869 | 10 180 | 2 048 | 3.3 s |
| procedure/menger (a Menger sponge) | 160 000 | 4 096 | 42 648 | 2 048 | 10.0 s |

Built models, which are flat colour over big surfaces, fit with every box
kept. A scan or a noise landscape has a colour nearly every voxel, so its
boxes are fused until they fit, and the report says how far. A fractal is
the worst case there is.

## Limits

- The ground is a heightfield, one height a 2 m sample. A hill steeper
  than the floor's depth a column comes over as stepped boxes, and a cave
  or arch in the floor is filled.
- Fireplace's ground has four surfaces, so the floor's colours are the
  nearest of grass, rock, sand and metal. The boxes keep their own colours.
- At most NBOX (2048) boxes. A model with many colours, such as a scan, a
  noise landscape or a gradient, is fused to fit and loses its smallest
  boxes. A model with fewer colours keeps everything.
- At most 64M voxels in the model's bounds at once. Hide what isn't the
  map, or save it in parts.
- Nothing moves: a voxel model is a level, not a game.

Only bring a model that is yours, or that its owner has licensed for reuse.

## The code

| File | |
| --- | --- |
| `tools/vox-file.mjs` | a `.vox` file into models, a palette, materials and placed instances (`readVox`, `eachVoxel`), and back (`writeVox`), no Node |
| `tools/vox-map.mjs` | voxels into the ground, boxes, spawns and pads, handed to the shared back half, no Node |
| `tools/scene-map.mjs` | the back half both converters share: solids into `map.json` and the two images, the fit, the report, no Node |
| `tools/vox.mjs` | the command line: a file in, `maps/<name>/` out, compiled by `tools/map.mjs` |
| `client/map-editor.mjs` | the editor's **a MagicaVoxel model…** and drop |
| `test/vox.test.mjs` | the default palette against the spec, a file MagicaVoxel saved (`test/vox/maze.vox`, MIT), a scene's transforms, turns, names, hidden objects and materials through `writeVox`, every rotation byte, refusals, a built scene into a map rule by rule, open air into a void, and a match on a voxel map laid at run time |
