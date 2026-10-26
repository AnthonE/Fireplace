// Every minigame's constants (src/mg/<key>.mjs) as one object, what the
// assembler spreads into its scope for @NAME and (!tab NAME i). Kept out of
// layout.mjs so a page loads a minigame's constants only with its client
// module; the client imports src/mg/<key>.mjs itself.
import * as mg_thinice from './thinice.mjs';
import * as mg_color from './color.mjs';
import * as mg_sweep from './sweep.mjs';
import * as mg_light from './light.mjs';
import * as mg_bombs from './bombs.mjs';
import * as mg_wall from './wall.mjs';
import * as mg_pads from './pads.mjs';
import * as mg_hill from './hill.mjs';
import * as mg_potato from './potato.mjs';
import * as mg_coins from './coins.mjs';
import * as mg_paint from './paint.mjs';
import * as mg_race from './race.mjs';
import * as mg_chute from './chute.mjs';
import * as mg_tag from './tag.mjs';
import * as mg_snowball from './snowball.mjs';
import * as mg_tilt from './tilt.mjs';
import * as mg_lava from './lava.mjs';
import * as mg_gale from './gale.mjs';
import * as mg_drums from './drums.mjs';
import * as mg_hoops from './hoops.mjs';
import * as mg_pinball from './pinball.mjs';
import * as mg_trails from './trails.mjs';
import * as mg_maze from './maze.mjs';
import * as mg_bullseye from './bullseye.mjs';
import * as mg_cannon from './cannon.mjs';
import * as mg_rope from './rope.mjs';
import * as mg_glass from './glass.mjs';
import * as mg_gates from './gates.mjs';
import * as mg_stomp from './stomp.mjs';
import * as mg_seesaw from './seesaw.mjs';
export const MG_CONSTS = Object.freeze(Object.assign({}, mg_thinice, mg_color, mg_sweep, mg_light, mg_bombs, mg_wall, mg_pads, mg_hill, mg_potato, mg_coins, mg_paint, mg_race, mg_chute, mg_tag, mg_snowball, mg_tilt, mg_lava, mg_gale, mg_drums, mg_hoops, mg_pinball, mg_trails, mg_maze, mg_bullseye, mg_cannon, mg_rope, mg_glass, mg_gates, mg_stomp, mg_seesaw));
