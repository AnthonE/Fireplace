// CROSSROADS (M_CROSSROADS, prefix cx): everyone for itself, no sides,
// Roblox's Crossroads (Roblox's own level, MIT, maps/crossroads/) as its
// place played it, and any place that hands everyone the same classic gear.
// The numbers are the place's and the gear's own where its file holds them
// (tools/roblox.mjs --brief: the superball's scripts; the sword's from the
// LinkedSource its script names), a Roblox default where it leaves them to
// Roblox, at the place's 0.28 m a stud.
//
// Everyone spawns with the sword and the rocket launcher in its two hands
// and a superball to throw (G), on a Humanoid's CX_HP and no shields, healing
// a point every CX_REGEN; it is back CX_RESPAWN after a death. The sword's
// swing deals CX_SWORD; the rocket is the arena's. The superball flies at
// CX_BALL_V, falls under the place's gravity and bounces (CX_BALL_E), and
// the first body it touches takes CX_BALL_DMG halved for every bounce before
// (its script: 55, halved off anything that isn't a Humanoid, harmless
// once under CX_BALL_MIN), each touch within CX_BALL_QUIET of the last
// counting for nothing; gone CX_BALL_LIFE after the throw, another in hand
// CX_BALL_RELOAD after. No melee but the sword's. KOs are kills and
// Wipeouts deaths, as its leaderboard named them; the most KOs at the clock
// (MODES: 10 min, where the place never ends) win.
export const CX_HP = 100; // Humanoid.MaxHealth
export const CX_REGEN = 125; // ticks a point of health comes back: Roblox's Health script, 1% of MaxHealth a second
export const CX_RESPAWN = 625; // Players.RespawnTime, 5 s
export const CX_SWORD = 30; // LinkedSword's lunge (its script: 5 a touch, slash 10, lunge 30)
export const CX_BALL_DMG = 55; // LinkedSuperball's CannonBall script
export const CX_BALL_MIN = 2; // its damage halved below this: harmless
export const CX_BALL_V = '56'; // m/s: 200 studs/s (CannonScript: missile.Velocity = v * 200)
export const CX_BALL_R = '0.28'; // m: a 2-stud ball
export const CX_BALL_G = '0.43949'; // m/s a tick: Workspace.Gravity's 196.2 studs/s^2 at 0.28 m a stud
export const CX_BALL_E = '0.75'; // the speed into a surface it keeps: its Elasticity 1 with a part's 0.5, averaged as Roblox combines them
export const CX_BALL_E1 = '1.75'; // 1 + CX_BALL_E: the share of the speed into a surface a bounce takes off it
export const CX_BALL_LIFE = 625; // ticks: the CannonBall script removes it after 5 s
export const CX_BALL_RELOAD = 250; // ticks: CannonScript's wait(2)
export const CX_BALL_QUIET = 13; // ticks: a touch within 0.1 s of the last does nothing
export const CX_BALL_SAFE = 25; // ticks its thrower can't be hit by it (Roblox starts it 5 studs out; here it starts half a metre out)
export const CX_K_BALL = 7; // its projectile kind, past the arena's and flight's (K_CHARGE, K_BOMB)
export const CX_KILL_BALL = 20; // the kill feed's cause, past flight's KILL_*
// A superball in PROJ: J_TGT the bounces it has made (its damage CX_BALL_DMG
// >> that; CX_SPENT once it has struck a body), J_HOME the ticks left of its quiet.
export const CX_SPENT = 8;
// A fighter's own, in its MODE_REC:
export const CX_MR_BALL = 6; // u16 ticks until a superball is back in hand
