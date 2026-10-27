// Flight's constants (src/flight.wat): literals, no imports, gathered
// into the assembler's scope through layout.mjs's FLIGHT_CONSTS as a
// minigame's are; JS imports this file itself. Times are ticks (125 a
// second), angles 1/16384 turn, the f32 literals strings.

export const FLIGHT_MAP = 'skyways'; // flight's map, maps/skyways/ (tools/skyways.mjs drew it); the arena's stays Box Canyon

// A ship's fields in the player record, over the arena's guns (a ship
// carries none): A_GUN, A_MAG and A_RES's eight bytes.
export const F_YAW = 38; // u16 the nose's heading, 0 faces +x, growing turns right
export const F_PITCH = 40; // i16 the nose's pitch, up is more
export const F_BOOST = 42; // u8 the boost meter, BOOST_MAX full
export const F_ROLL = 43; // u8 ticks of a barrel roll left
export const F_CHARGE = 44; // u8 ticks the charge shot has built, up to CHARGE_TICKS
export const F_BITS = 45; // u8 FB_*
export const FB_SPENT = 1; // the meter ran dry: no boost or brake until it is full again
export const FB_LEFT = 2; // the roll goes left
export const FB_HELD = 4; // the trigger's charge bit was held last tick

// The nose turns toward where the pilot aims (the word's yaw and pitch) at
// most this much a tick: 110 degrees a second cruising, 77 boosting, 154 braking.
export const TURN = 40;
export const TURN_BOOST = 28;
export const TURN_BRAKE = 56;
export const PITCH_MAX = 3413; // 75 degrees up or down
export const BOOST_MAX = 200; // 1.6 s of boost or brake; it fills a unit a tick unused
export const ROLL_TICKS = 60; // a barrel roll: half a second that turns lasers away
export const ROLL_COOL = 100; // ticks after one before the next roll or bomb
export const SPAWN_ALT = 25; // m over the spawn point's ground a ship comes in at

// Weapons. Lasers are hitscan, checked where the shooter saw the others;
// the charge shot and the bomb are projectiles that go off with splash.
export const LASER_REFIRE = 11; // 11.4 shots a second, held
export const LASER_DMG = 9;
export const LASER_RANGE = 260; // m
export const CHARGE_TICKS = 75; // held 0.6 s, a release fires the charge shot
export const CHARGE_DMG = 70;
export const CHARGE_LIFE = 250; // ticks, then it goes off where it is
export const BOMBS = 3; // a ship's bombs at a spawn; a kill gives one back, up to 4
export const BOMB_DMG = 170;
export const BOMB_FUSE = 100; // ticks, then it goes off
export const K_CHARGE = 5; // projectile kinds past the arena's
export const K_BOMB = 6;
// kill feed causes past the arena's KILL_*
export const KILL_LASER = 16;
export const KILL_CHARGE = 17;
export const KILL_BOMB = 18;
export const KILL_CRASH = 19;
export const HIT_DEFLECT = 4; // FX_HIT's size for a laser a roll turned away

// Ring Race, flight's own mode (src/flight.wat $f_race): past the arena's
// M_* so its build never sees it, through the map's gates (map.json "race",
// MAP_RACE) in order, LAPS times round; a ship's progress is the gates it
// has passed (MODE_REC's MR_POINTS), which places it as the arena's modes
// place by points. Its news codes sit past every team mode's MX codes.
export const M_RACE = 15;
export const LAPS = 3;
export const RACE_TICKS = 37500; // 5 min
export const NGATE = 16; // gates a map may have at most
export const MX_GATE = 104; // owner passed a gate, shot its count of gates passed
export const MX_LAP = 105; // owner started lap shot + 1 (shot the laps done)

// The f32 literals.
export const FL_CRUISE = '34'; // m/s
export const FL_BOOST = '62';
export const FL_BRAKE = '16';
export const FL_GAIN = '0.05'; // of the gap to the wanted velocity closed a tick
export const FL_ROLLV = '16'; // m/s sideways a roll throws the ship
export const FL_R = '1.2'; // the hull against the ground and the boxes
export const FL_HIT = '1.8'; // a ship's sphere for shots and blasts
export const FL_NOSE = '2.5'; // where the guns are, ahead of the centre
export const FL_CRASH = '5'; // m/s into the ground or a wall before it hurts
export const FL_CRASHK = '0.9'; // damage a m/s past that
export const FL_MEET = '2.4'; // two ships closer than this, centre to centre, have met
export const FL_MEET2 = '5.76'; // its square
export const FL_BOUNCE = '0.7'; // (1 + restitution 0.4) / 2: each ship's share of the closing speed turned back
export const FL_CHARGEV = '95'; // m/s
export const FL_CHARGE_TURN = '0.1'; // of the turn toward its target a tick
export const FL_CHARGE_RAD = '7'; // m
export const FL_BOMBV = '40'; // m/s on top of the ship's own speed
export const FL_BOMB_RAD = '20'; // m
export const FL_LOCK = '0.94'; // the charge shot locks on inside this cosine of the nose (20 degrees)
export const FL_LOCK_RANGE = '260'; // m
