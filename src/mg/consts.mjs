// Every minigame's constants (src/mg/<key>.mjs) as one object, what the
// assembler spreads into its scope for @NAME and (!tab NAME i). Kept out of
// layout.mjs, which every page and worker loads: a page fetches a minigame's
// constants with its client module (client/mg/<key>.mjs imports its own
// file), and only what builds the sim (tools/asm.mjs, the studio's worker)
// or checks it reads them all.
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
import * as mg_kart from './kart.mjs';
import * as mg_disaster from './disaster.mjs';
import * as mg_slap from './slap.mjs';
import * as mg_trap from './trap.mjs';
import * as mg_parry from './parry.mjs';
import * as mg_mingle from './mingle.mjs';
import * as mg_honey from './honey.mjs';
import * as mg_dodge from './dodge.mjs';
import * as mg_volley from './volley.mjs';
import * as mg_soccer from './soccer.mjs';
import * as mg_sumo from './sumo.mjs';
import * as mg_cheese from './cheese.mjs';
import * as mg_mole from './mole.mjs';
import * as mg_balloon from './balloon.mjs';
import * as mg_eggs from './eggs.mjs';
import * as mg_bowl from './bowl.mjs';
import * as mg_fallball from './fallball.mjs';
import * as mg_tug from './tug.mjs';
import * as mg_minigolf from './minigolf.mjs';
import * as mg_relay from './relay.mjs';
import * as mg_traffic from './traffic.mjs';
import * as mg_jump from './jump.mjs';
import * as mg_herd from './herd.mjs';
export const MG_CONSTS = Object.freeze(Object.assign({}, mg_thinice, mg_color, mg_sweep, mg_light, mg_bombs, mg_wall, mg_pads, mg_hill, mg_potato, mg_coins, mg_paint, mg_race, mg_chute, mg_tag, mg_snowball, mg_tilt, mg_lava, mg_gale, mg_drums, mg_hoops, mg_pinball, mg_trails, mg_maze, mg_bullseye, mg_cannon, mg_rope, mg_glass, mg_gates, mg_stomp, mg_seesaw, mg_kart, mg_disaster, mg_slap, mg_trap, mg_parry, mg_mingle, mg_honey, mg_dodge, mg_volley, mg_soccer, mg_sumo, mg_cheese, mg_mole, mg_balloon, mg_eggs, mg_bowl, mg_fallball, mg_tug, mg_minigolf, mg_relay, mg_traffic, mg_jump, mg_herd));
