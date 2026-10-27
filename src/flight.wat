;; Flight: the arena with every fighter a ship, built when ARENA and FLIGHT
;; are set (build/flight/game.wasm). The arena's world, map, match, modes,
;; sides, shields and health, kills and respawns all stand; what changes is
;; how a fighter moves and what it fires. A ship flies at a cruising speed
;; its nose sets: the word's yaw and pitch are where its pilot aims, and the
;; nose turns toward them at TURN a tick (slower boosting, faster braking).
;; Forward boosts and back brakes while the meter lasts; melee's bit throws
;; a barrel roll that turns lasers away; grenade's drops a bomb; the jump bit
;; held builds the charge shot, released fires it, homing on the ship nearest
;; the nose; the trigger fires lasers, hitscan and checked where the shooter
;; saw the others, as the arena's guns are. The ground, the map's boxes and
;; the ceiling are hard: a ship bounces off them and a hard hit hurts.
;;
;; A ship's position is its centre. Its own fields sit over the arena's guns
;; in the record (src/flight.mjs). Like the arena's, everything $f_move
;; reaches runs on either bank d and writes only the ship's own record, its
;; own projectiles and its bank's FX ring; damage is the confirmed world's.

;; Slot p's ship, as a match brings it (back) in: $a_spawn has put it on its
;; spawn point, full; here it is lifted SPAWN_ALT m into the air (under the
;; ceiling), its nose level and turned toward the middle of the map (the most
;; that way of 16 headings), at cruising speed, the meter full, BOMBS bombs.
;; In Ring Race it comes back at the last gate it passed (none yet: its spawn
;; point), its nose toward the next.
(func $f_spawn (param $p i32)
  (local $pb i32) (local $k i32) (local $hy i32) (local $s f32) (local $c f32) (local $dx f32) (local $dz f32) (local $dot f32) (local $best f32)
  (local $n i32) (local $pts i32) (local $a i32) (local $tx f32) (local $tz f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb)
    (f32.min (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.const @SPAWN_ALT)) (f32.const @(MAP_CEIL - 5))))
  (local.set $tx (f32.mul (f32.add (f32.load (i32.const @MAP_BOUNDS)) (f32.load (i32.const @(MAP_BOUNDS + 4)))) (f32.const 0.5)))
  (local.set $tz (f32.mul (f32.add (f32.load (i32.const @(MAP_BOUNDS + 8))) (f32.load (i32.const @(MAP_BOUNDS + 12)))) (f32.const 0.5)))
  (local.set $n (i32.load (i32.const @MAP_RACE)))
  (if (i32.and (i32.eq (i32.load (i32.const @AH_MODE)) (i32.const @M_RACE)) (i32.ne (local.get $n) (i32.const 0)))
    (then
      (local.set $pts (i32.load16_u offset=@(MODE_REC + MR_POINTS) (i32.shl (local.get $p) (i32.const 3))))
      (local.set $a (i32.add (i32.const @(MAP_RACE + 16)) (i32.shl (i32.rem_u (local.get $pts) (local.get $n)) (i32.const 4))))
      (local.set $tx (f32.load (local.get $a)))
      (local.set $tz (f32.load offset=8 (local.get $a)))
      (if (local.get $pts)
        (then
          (local.set $a (i32.add (i32.const @(MAP_RACE + 16)) (i32.shl (i32.rem_u (i32.sub (local.get $pts) (i32.const 1)) (local.get $n)) (i32.const 4))))
          (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.load (local.get $a)))
          (!put f32 @(PLAYERS + P_PY) (local.get $pb) (f32.load offset=4 (local.get $a)))
          (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (f32.load offset=8 (local.get $a)))))))
  (local.set $dx (f32.sub (local.get $tx) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
  (local.set $dz (f32.sub (local.get $tz) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  (local.set $best (f32.const -1e30))
  (!for $k (i32.const 0) (i32.const 16)
    (call $sincos (i32.shl (local.get $k) (i32.const 10)))
    (local.set $c) (local.set $s)
    (local.set $dot (f32.add (f32.mul (local.get $c) (local.get $dx)) (f32.mul (local.get $s) (local.get $dz))))
    (if (f32.gt (local.get $dot) (local.get $best))
      (then (local.set $best (local.get $dot)) (local.set $hy (i32.shl (local.get $k) (i32.const 10))))))
  (call $sincos (local.get $hy))
  (local.set $c) (local.set $s)
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $c) (f32.const @FL_CRUISE)))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $s) (f32.const @FL_CRUISE)))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_GROUND))))
  (!put u16 @(PLAYERS + F_YAW) (local.get $pb) (local.get $hy))
  (!put u16 @(PLAYERS + F_PITCH) (local.get $pb) (i32.const 0))
  (!put u8 @(PLAYERS + F_BOOST) (local.get $pb) (i32.const @BOOST_MAX))
  (!put u8 @(PLAYERS + F_ROLL) (local.get $pb) (i32.const 0))
  (!put u8 @(PLAYERS + F_CHARGE) (local.get $pb) (i32.const 0))
  ;; a charge already held doesn't fire on arrival
  (!put u8 @(PLAYERS + F_BITS) (local.get $pb)
    (select (i32.const @FB_HELD) (i32.const 0) (i32.and (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const @(1 << AW_JUMP)))))
  (!put u8 @(PLAYERS + A_GRENS) (local.get $pb)
    (select (i32.const 0) (i32.const @BOMBS) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_JUGG)))))

;; One live ship's tick on bank d: the meter, the nose, a roll, its weapons,
;; then it flies (not in the countdown: it waits where it came in, its nose
;; turning, so a word of 0, nose down, can't fly it into the ground); whatever it hits (the ground, a box, the map's edge, the
;; ceiling) it bounces off, and hitting the ground or a box harder than
;; FL_CRASH m/s across it hurts (on the confirmed world, after the record is
;; written: the hit may kill it).
(func $f_move (param $p i32) (param $d i32)
  (local $pb i32) (local $in i32) (local $fl i32) (local $mv i32) (local $bits i32) (local $boost i32) (local $go i32)
  (local $turn i32) (local $hy i32) (local $hp i32) (local $ty i32) (local $tp i32) (local $dd i32)
  (local $act i32) (local $cool i32) (local $roll i32) (local $bit i32) (local $b i32) (local $hurt i32)
  (local $s f32) (local $c f32) (local $sp f32) (local $cp f32) (local $fx f32) (local $fy f32) (local $fz f32) (local $vt f32) (local $side f32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $ox f32) (local $oy f32) (local $oz f32)
  (local $h f32) (local $nx f32) (local $ny f32) (local $nz f32) (local $vn f32) (local $hit f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (local.set $in (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (if (i32.and (local.get $fl) (i32.const @PF_DEAD)) (then (call $a_dead (local.get $p) (local.get $d) (local.get $in)) (return)))
  (local.set $mv (i32.and (i32.shr_u (local.get $in) (i32.const @AW_MOVE)) (i32.const 15)))
  ;; boost (forward) or brake (back) while the meter lasts; run dry, neither
  ;; until it is full again; it fills a unit a tick neither is on
  (local.set $bits (!at u8 @(PLAYERS + F_BITS) (local.get $pb)))
  (local.set $boost (!at u8 @(PLAYERS + F_BOOST) (local.get $pb)))
  (if (i32.and (i32.and (i32.ne (i32.and (local.get $mv) (i32.const 3)) (i32.const 0)) (i32.eqz (i32.and (local.get $bits) (i32.const @FB_SPENT))))
               (i32.ne (local.get $boost) (i32.const 0)))
    (then
      (local.set $go (select (i32.const 1) (i32.const 2) (i32.and (local.get $mv) (i32.const 1))))
      (local.set $boost (i32.sub (local.get $boost) (i32.const 1)))
      (if (i32.eqz (local.get $boost)) (then (local.set $bits (i32.or (local.get $bits) (i32.const @FB_SPENT))))))
    (else
      (if (i32.lt_u (local.get $boost) (i32.const @BOOST_MAX))
        (then
          (local.set $boost (i32.add (local.get $boost) (i32.const 1)))
          (if (i32.eq (local.get $boost) (i32.const @BOOST_MAX))
            (then (local.set $bits (i32.and (local.get $bits) (i32.const @(255 ^ FB_SPENT))))))))))
  ;; the nose toward the aim: yaw the short way round, pitch within PITCH_MAX
  (local.set $turn (select (i32.const @TURN_BOOST) (select (i32.const @TURN_BRAKE) (i32.const @TURN) (i32.eq (local.get $go) (i32.const 2)))
                           (i32.eq (local.get $go) (i32.const 1))))
  (local.set $hy (!at u16 @(PLAYERS + F_YAW) (local.get $pb)))
  (local.set $hp (i32.load16_s offset=@(PLAYERS + F_PITCH) (local.get $pb)))
  (local.set $ty (i32.shl (i32.and (local.get $in) (i32.const 0x7ff)) (i32.const 3)))
  (local.set $tp (i32.shl (i32.sub (i32.and (i32.shr_u (local.get $in) (i32.const @AW_PITCH)) (i32.const 0x3ff)) (i32.const 512)) (i32.const 3)))
  (local.set $tp (select (i32.const @PITCH_MAX) (local.get $tp) (i32.gt_s (local.get $tp) (i32.const @PITCH_MAX))))
  (local.set $tp (select (i32.const @(-PITCH_MAX)) (local.get $tp) (i32.lt_s (local.get $tp) (i32.const @(-PITCH_MAX)))))
  (local.set $dd (i32.sub (i32.and (i32.add (i32.sub (local.get $ty) (local.get $hy)) (i32.const 8192)) (i32.const 16383)) (i32.const 8192)))
  (local.set $dd (select (local.get $turn) (local.get $dd) (i32.gt_s (local.get $dd) (local.get $turn))))
  (local.set $dd (select (i32.sub (i32.const 0) (local.get $turn)) (local.get $dd) (i32.lt_s (local.get $dd) (i32.sub (i32.const 0) (local.get $turn)))))
  (local.set $hy (i32.and (i32.add (local.get $hy) (local.get $dd)) (i32.const 16383)))
  (local.set $dd (i32.sub (local.get $tp) (local.get $hp)))
  (local.set $dd (select (local.get $turn) (local.get $dd) (i32.gt_s (local.get $dd) (local.get $turn))))
  (local.set $dd (select (i32.sub (i32.const 0) (local.get $turn)) (local.get $dd) (i32.lt_s (local.get $dd) (i32.sub (i32.const 0) (local.get $turn)))))
  (local.set $hp (i32.add (local.get $hp) (local.get $dd)))
  (call $sincos (local.get $hy))
  (local.set $c) (local.set $s)
  (call $sincos (local.get $hp))
  (local.set $cp) (local.set $sp)
  (local.set $fx (f32.mul (local.get $cp) (local.get $c)))
  (local.set $fy (local.get $sp))
  (local.set $fz (f32.mul (local.get $cp) (local.get $s)))
  ;; the countdown: held where it came in, the nose turning, ready to go at the cruise
  (if (i32.le_u (i32.load offset=@HDR_STATE (local.get $d)) (i32.const @H_COUNT))
    (then
      (!put u16 @(PLAYERS + F_YAW) (local.get $pb) (local.get $hy))
      (!put u16 @(PLAYERS + F_PITCH) (local.get $pb) (local.get $hp))
      (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $fx) (f32.const @FL_CRUISE)))
      (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.mul (local.get $fy) (f32.const @FL_CRUISE)))
      (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $fz) (f32.const @FL_CRUISE)))
      (call $f_shoot (local.get $p) (local.get $d) (local.get $in) (local.get $fx) (local.get $fy) (local.get $fz) (f32.const 0))
      (return)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  ;; a barrel roll at melee's bit, the cooldown clear: ROLL_TICKS of it, and a
  ;; throw sideways (left with left held, else right: right is (-s, 0, c))
  (local.set $act (!at u8 @(PLAYERS + A_ACT) (local.get $pb)))
  (local.set $cool (!at u16 @(PLAYERS + A_COOL) (local.get $pb)))
  (if (local.get $cool) (then (local.set $cool (i32.sub (local.get $cool) (i32.const 1)))))
  (local.set $roll (!at u8 @(PLAYERS + F_ROLL) (local.get $pb)))
  (if (local.get $roll) (then (local.set $roll (i32.sub (local.get $roll) (i32.const 1)))))
  (local.set $bit (i32.and (i32.shr_u (local.get $in) (i32.const @AW_MELEE)) (i32.const 1)))
  (if (i32.ne (local.get $bit) (i32.and (local.get $act) (i32.const @AB_MELEE)))
    (then
      (local.set $act (i32.xor (local.get $act) (i32.const @AB_MELEE)))
      (if (i32.and (i32.eqz (local.get $cool)) (i32.eqz (local.get $roll)))
        (then
          (local.set $roll (i32.const @ROLL_TICKS))
          (local.set $cool (i32.const @ROLL_COOL))
          (local.set $bits (i32.or (i32.and (local.get $bits) (i32.const @(255 ^ FB_LEFT)))
                                   (select (i32.const @FB_LEFT) (i32.const 0) (i32.and (local.get $mv) (i32.const 4)))))
          (local.set $side (select (f32.const @(-FL_ROLLV)) (f32.const @FL_ROLLV) (i32.and (local.get $mv) (i32.const 4))))
          (local.set $vx (!madd (f32.neg (local.get $s)) (local.get $side) (local.get $vx)))
          (local.set $vz (!madd (local.get $c) (local.get $side) (local.get $vz)))))))
  (!put u8 @(PLAYERS + A_ACT) (local.get $pb) (local.get $act))
  (!put u16 @(PLAYERS + A_COOL) (local.get $pb) (local.get $cool))
  (!put u8 @(PLAYERS + F_ROLL) (local.get $pb) (local.get $roll))
  (!put u8 @(PLAYERS + F_BITS) (local.get $pb) (local.get $bits))
  (!put u16 @(PLAYERS + F_YAW) (local.get $pb) (local.get $hy))
  (!put u16 @(PLAYERS + F_PITCH) (local.get $pb) (local.get $hp))
  (!put u8 @(PLAYERS + F_BOOST) (local.get $pb) (local.get $boost))
  (call $f_shoot (local.get $p) (local.get $d) (local.get $in) (local.get $fx) (local.get $fy) (local.get $fz)
                 (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $fx) (local.get $fy) (local.get $fz)))
  ;; the velocity eases toward the nose at the speed asked for
  (local.set $vt (select (f32.const @FL_BOOST) (select (f32.const @FL_BRAKE) (f32.const @FL_CRUISE) (i32.eq (local.get $go) (i32.const 2)))
                         (i32.eq (local.get $go) (i32.const 1))))
  (local.set $vx (!madd (f32.sub (f32.mul (local.get $fx) (local.get $vt)) (local.get $vx)) (f32.const @FL_GAIN) (local.get $vx)))
  (local.set $vy (!madd (f32.sub (f32.mul (local.get $fy) (local.get $vt)) (local.get $vy)) (f32.const @FL_GAIN) (local.get $vy)))
  (local.set $vz (!madd (f32.sub (f32.mul (local.get $fz) (local.get $vt)) (local.get $vz)) (f32.const @FL_GAIN) (local.get $vz)))
  (local.set $ox (local.get $px))
  (local.set $oy (local.get $py))
  (local.set $oz (local.get $pz))
  (local.set $px (!madd (local.get $vx) (f32.const @DT) (local.get $px)))
  (local.set $py (!madd (local.get $vy) (f32.const @DT) (local.get $py)))
  (local.set $pz (!madd (local.get $vz) (f32.const @DT) (local.get $pz)))
  ;; the map's edge and the ceiling stop it
  (if (f32.lt (local.get $px) (f32.load (i32.const @MAP_BOUNDS))) (then (local.set $px (f32.load (i32.const @MAP_BOUNDS))) (local.set $vx (f32.max (local.get $vx) (f32.const 0)))))
  (if (f32.gt (local.get $px) (f32.load (i32.const @(MAP_BOUNDS + 4)))) (then (local.set $px (f32.load (i32.const @(MAP_BOUNDS + 4)))) (local.set $vx (f32.min (local.get $vx) (f32.const 0)))))
  (if (f32.lt (local.get $pz) (f32.load (i32.const @(MAP_BOUNDS + 8)))) (then (local.set $pz (f32.load (i32.const @(MAP_BOUNDS + 8)))) (local.set $vz (f32.max (local.get $vz) (f32.const 0)))))
  (if (f32.gt (local.get $pz) (f32.load (i32.const @(MAP_BOUNDS + 12)))) (then (local.set $pz (f32.load (i32.const @(MAP_BOUNDS + 12)))) (local.set $vz (f32.min (local.get $vz) (f32.const 0)))))
  (if (f32.gt (local.get $py) (f32.const @MAP_CEIL)) (then (local.set $py (f32.const @MAP_CEIL)) (local.set $vy (f32.min (local.get $vy) (f32.const 0)))))
  ;; a box: back where it was, the speed across the face it came through
  ;; turned and halved (a top or an underside if neither side face)
  (local.set $b (call $box_in (local.get $px) (local.get $py) (local.get $pz) (f32.const @FL_R)))
  (if (local.get $b)
    (then
      (if (i32.or (f32.le (local.get $ox) (f32.sub (f32.load (local.get $b)) (f32.const @FL_R)))
                  (f32.ge (local.get $ox) (f32.add (f32.load offset=12 (local.get $b)) (f32.const @FL_R))))
        (then
          (local.set $vn (f32.abs (local.get $vx)))
          (local.set $px (local.get $ox))
          (local.set $vx (f32.mul (local.get $vx) (f32.const -0.5))))
        (else
          (if (i32.or (f32.le (local.get $oz) (f32.sub (f32.load offset=8 (local.get $b)) (f32.const @FL_R)))
                      (f32.ge (local.get $oz) (f32.add (f32.load offset=20 (local.get $b)) (f32.const @FL_R))))
            (then
              (local.set $vn (f32.abs (local.get $vz)))
              (local.set $pz (local.get $oz))
              (local.set $vz (f32.mul (local.get $vz) (f32.const -0.5))))
            (else
              (local.set $vn (f32.abs (local.get $vy)))
              (local.set $px (local.get $ox))
              (local.set $py (local.get $oy))
              (local.set $pz (local.get $oz))
              (local.set $vy (f32.mul (local.get $vy) (f32.const -0.5)))))))
      (local.set $hit (f32.max (local.get $hit) (local.get $vn)))))
  ;; the ground: up out of it, the speed into it turned and halved
  (call $ground (local.get $px) (local.get $pz))
  (drop)
  (local.set $nz) (local.set $ny) (local.set $nx) (local.set $h)
  (if (f32.lt (local.get $py) (f32.add (local.get $h) (f32.const @FL_R)))
    (then
      (local.set $py (f32.add (local.get $h) (f32.const @FL_R)))
      (local.set $vn (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $nx) (local.get $ny) (local.get $nz)))
      (if (f32.lt (local.get $vn) (f32.const 0))
        (then
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (f32.mul (local.get $vn) (f32.const 1.5)))))
          (local.set $vy (f32.sub (local.get $vy) (f32.mul (local.get $ny) (f32.mul (local.get $vn) (f32.const 1.5)))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (f32.mul (local.get $vn) (f32.const 1.5)))))
          (local.set $hit (f32.max (local.get $hit) (f32.neg (local.get $vn))))))))
  (!chk (local.get $px) 11 (local.get $p))
  (!chk (local.get $py) 12 (local.get $p))
  (!chk (local.get $pz) 13 (local.get $p))
  (!chk (local.get $vx) 14 (local.get $p))
  (!chk (local.get $vy) 15 (local.get $p))
  (!chk (local.get $vz) 16 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (if (f32.gt (local.get $hit) (f32.const @FL_CRASH))
    (then
      (call $fx (local.get $d) (i32.const @FX_BLAST) (local.get $p) (i32.const 0) (local.get $px) (local.get $py) (local.get $pz) (f32.const 0.6))
      (if (i32.eqz (local.get $d))
        (then
          (local.set $hurt (i32.trunc_sat_f32_u (!madd (f32.sub (local.get $hit) (f32.const @FL_CRASH)) (f32.const @FL_CRASHK) (f32.const 5))))
          (call $a_hurt (local.get $p) (local.get $p) (local.get $hurt) (i32.const 0) (i32.const @KILL_CRASH)
                        (local.get $px) (local.get $py) (local.get $pz)))))))

;; Slot p's weapons for this tick, its nose along (fx, fy, fz) and its speed
;; along it `fwd`: the frame (its view lag), a bomb at grenade's bit, the
;; charge shot built while the jump bit is held and fired as it's let go once
;; full, and a laser when the trigger's counter has moved and the refire is
;; clear. No weapons in the countdown: the counters follow the word.
(func $f_shoot (param $p i32) (param $d i32) (param $in i32) (param $fx f32) (param $fy f32) (param $fz f32) (param $fwd f32)
  (local $pb i32) (local $re i32) (local $ctr i32) (local $held i32) (local $act i32) (local $cool i32) (local $bit i32) (local $bits i32)
  (local $ch i32) (local $shots i32) (local $q i32) (local $state i32)
  (local $ex f32) (local $ey f32) (local $ez f32) (local $t f32) (local $hx f32) (local $hy f32) (local $hz f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (call $a_frame (local.get $pb) (local.get $d) (local.get $in))
  (local.set $re (!at u16 @(PLAYERS + P_REFIRE) (local.get $pb)))
  (if (local.get $re) (then (local.set $re (i32.sub (local.get $re) (i32.const 1)))))
  (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (local.get $re))
  (local.set $ctr (i32.and (i32.shr_u (local.get $in) (i32.const @AW_SHOT)) (i32.const 3)))
  (local.set $held (i32.and (i32.shr_u (local.get $in) (i32.const @AW_JUMP)) (i32.const 1)))
  (local.set $act (!at u8 @(PLAYERS + A_ACT) (local.get $pb)))
  (local.set $cool (!at u16 @(PLAYERS + A_COOL) (local.get $pb)))
  (local.set $bits (!at u8 @(PLAYERS + F_BITS) (local.get $pb)))
  (local.set $bit (i32.and (i32.shr_u (local.get $in) (i32.const @AW_GREN)) (i32.const 1)))
  (local.set $state (i32.load offset=@HDR_STATE (local.get $d)))
  (!put u8 @(PLAYERS + F_BITS) (local.get $pb)
    (select (i32.or (local.get $bits) (i32.const @FB_HELD)) (i32.and (local.get $bits) (i32.const @(255 ^ FB_HELD))) (local.get $held)))
  (if (i32.le_u (local.get $state) (i32.const @H_COUNT))
    (then
      (!put u8 @(PLAYERS + P_FIRED) (local.get $pb) (local.get $ctr))
      (!put u8 @(PLAYERS + A_ACT) (local.get $pb)
        (i32.or (i32.and (local.get $act) (i32.const @(255 ^ AB_GREN))) (i32.shl (local.get $bit) (i32.const 1))))
      (!put u8 @(PLAYERS + F_CHARGE) (local.get $pb) (i32.const 0))
      (return)))
  (local.set $ex (!madd (local.get $fx) (f32.const @FL_NOSE) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
  (local.set $ey (!madd (local.get $fy) (f32.const @FL_NOSE) (!at f32 @(PLAYERS + P_PY) (local.get $pb))))
  (local.set $ez (!madd (local.get $fz) (f32.const @FL_NOSE) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
  ;; a bomb, ahead at the ship's speed and FL_BOMBV more
  (if (i32.ne (local.get $bit) (i32.and (i32.shr_u (local.get $act) (i32.const 1)) (i32.const 1)))
    (then
      (local.set $act (i32.xor (local.get $act) (i32.const @AB_GREN)))
      (if (i32.and (i32.eqz (local.get $cool)) (i32.ne (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const 0)))
        (then
          (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.sub (!at u8 @(PLAYERS + A_GRENS) (local.get $pb)) (i32.const 1)))
          (local.set $shots (i32.and (i32.add (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)) (i32.const 1)) (i32.const 0xffff)))
          (!put u16 @(PLAYERS + P_SHOTS) (local.get $pb) (local.get $shots))
          (call $f_launch (local.get $p) (local.get $d) (i32.const @K_BOMB) (local.get $ex) (local.get $ey) (local.get $ez)
                          (local.get $fx) (local.get $fy) (local.get $fz) (f32.add (f32.max (local.get $fwd) (f32.const 0)) (f32.const @FL_BOMBV)))
          (local.set $cool (i32.const @ROLL_COOL))))))
  (!put u8 @(PLAYERS + A_ACT) (local.get $pb) (local.get $act))
  (!put u16 @(PLAYERS + A_COOL) (local.get $pb) (local.get $cool))
  ;; the charge: built while held, fired as it's let go once full
  (local.set $ch (!at u8 @(PLAYERS + F_CHARGE) (local.get $pb)))
  (if (local.get $held)
    (then (if (i32.lt_u (local.get $ch) (i32.const @CHARGE_TICKS)) (then (local.set $ch (i32.add (local.get $ch) (i32.const 1))))))
    (else
      (if (i32.and (i32.ne (i32.and (local.get $bits) (i32.const @FB_HELD)) (i32.const 0)) (i32.ge_u (local.get $ch) (i32.const @CHARGE_TICKS)))
        (then
          (local.set $shots (i32.and (i32.add (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)) (i32.const 1)) (i32.const 0xffff)))
          (!put u16 @(PLAYERS + P_SHOTS) (local.get $pb) (local.get $shots))
          (call $f_launch (local.get $p) (local.get $d) (i32.const @K_CHARGE) (local.get $ex) (local.get $ey) (local.get $ez)
                          (local.get $fx) (local.get $fy) (local.get $fz) (f32.const @FL_CHARGEV))))
      (local.set $ch (i32.const 0))))
  (!put u8 @(PLAYERS + F_CHARGE) (local.get $pb) (local.get $ch))
  ;; a laser
  (if (i32.or (local.get $re) (i32.eq (local.get $ctr) (!at u8 @(PLAYERS + P_FIRED) (local.get $pb)))) (then (return)))
  (!put u8 @(PLAYERS + P_FIRED) (local.get $pb) (local.get $ctr))
  (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const @LASER_REFIRE))
  (local.set $shots (i32.and (i32.add (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)) (i32.const 1)) (i32.const 0xffff)))
  (!put u16 @(PLAYERS + P_SHOTS) (local.get $pb) (local.get $shots))
  (call $fx (local.get $d) (i32.const @FX_SHOT) (local.get $p) (local.get $shots) (local.get $ex) (local.get $ey) (local.get $ez) (f32.const @KILL_LASER))
  (call $f_ray (local.get $p) (local.get $ex) (local.get $ey) (local.get $ez) (local.get $fx) (local.get $fy) (local.get $fz)
               (f32.const @LASER_RANGE) (call $a_seen (local.get $p) (local.get $d)))
  (local.set $t) (local.set $q)
  (local.set $hx (!madd (local.get $fx) (local.get $t) (local.get $ex)))
  (local.set $hy (!madd (local.get $fy) (local.get $t) (local.get $ey)))
  (local.set $hz (!madd (local.get $fz) (local.get $t) (local.get $ez)))
  (call $fx (local.get $d) (i32.const @FX_TRACER) (local.get $p) (local.get $shots) (local.get $hx) (local.get $hy) (local.get $hz) (f32.const @KILL_LASER))
  (if (i32.and (i32.eqz (local.get $d)) (i32.ge_s (local.get $q) (i32.const 0)))
    (then
      ;; a ship in a roll turns it away
      (if (!at u8 @(PLAYERS + F_ROLL) (i32.shl (local.get $q) (i32.const 6)))
        (then
          (call $fx (i32.const 0) (i32.const @FX_HIT) (local.get $p) (local.get $q) (local.get $hx) (local.get $hy) (local.get $hz) (f32.const @HIT_DEFLECT))
          (return)))
      ;; the juggernaut's lasers hit twice as hard
      (call $a_hurt (local.get $q) (local.get $p)
                    (select (i32.const @(LASER_DMG * 2)) (i32.const @LASER_DMG) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_JUGG)))
                    (i32.const 0) (i32.const @KILL_LASER) (local.get $hx) (local.get $hy) (local.get $hz)))))

;; A ray from (ox, oy, oz) along the unit (dx, dy, dz), out to `range`, against
;; the ground, the map's boxes and every live ship but p and its own side's
;; where each was after tick rt: the ship it hits first (or -1), and how far.
;; A ship is a ball of FL_HIT about its centre.
(func $f_ray (param $p i32) (param $ox f32) (param $oy f32) (param $oz f32) (param $dx f32) (param $dy f32) (param $dz f32) (param $range f32) (param $rt i32)
  (result i32 f32)
  (local $t f32) (local $lo f32) (local $hi f32) (local $m f32) (local $k i32) (local $best f32) (local $who i32) (local $q i32)
  (local $qx f32) (local $qy f32) (local $qz f32) (local $fx f32) (local $fy f32) (local $fz f32) (local $b f32) (local $cc f32) (local $disc f32) (local $t1 f32)
  ;; the ground: metre steps, then bisection
  (local.set $best (local.get $range))
  (local.set $t (f32.const 1))
  (block $out
    (loop $march
      (br_if $out (f32.gt (local.get $t) (local.get $range)))
      (call $ground (!madd (local.get $dx) (local.get $t) (local.get $ox)) (!madd (local.get $dz) (local.get $t) (local.get $oz)))
      (drop) (drop) (drop) (drop)
      (if (f32.gt (!madd (local.get $dy) (local.get $t) (local.get $oy)))
        (then
          (local.set $lo (f32.sub (local.get $t) (f32.const 1)))
          (local.set $hi (local.get $t))
          (!for $k (i32.const 0) (i32.const 7)
            (local.set $m (f32.mul (f32.add (local.get $lo) (local.get $hi)) (f32.const 0.5)))
            (call $ground (!madd (local.get $dx) (local.get $m) (local.get $ox)) (!madd (local.get $dz) (local.get $m) (local.get $oz)))
            (drop) (drop) (drop) (drop)
            (if (f32.gt (!madd (local.get $dy) (local.get $m) (local.get $oy)))
              (then (local.set $hi (local.get $m)))
              (else (local.set $lo (local.get $m)))))
          (local.set $best (local.get $hi))
          (br $out)))
      (local.set $t (f32.add (local.get $t) (f32.const 1)))
      (br $march)))
  (local.set $best (call $box_ray (local.get $ox) (local.get $oy) (local.get $oz) (local.get $dx) (local.get $dy) (local.get $dz) (local.get $best)))
  (local.set $who (i32.const -1))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (i32.and (i32.eq (i32.and (i32.load8_u offset=@(PLAYERS + P_FL) (i32.shl (local.get $q) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                          (i32.ne (local.get $q) (local.get $p)))
                 (i32.eqz (call $a_ally (local.get $p) (local.get $q))))
      (then
        (call $a_where (local.get $q) (local.get $rt))
        (local.set $qz) (local.set $qy) (local.set $qx)
        (local.set $fx (f32.sub (local.get $ox) (local.get $qx)))
        (local.set $fy (f32.sub (local.get $oy) (local.get $qy)))
        (local.set $fz (f32.sub (local.get $oz) (local.get $qz)))
        (local.set $b (!dot3 (local.get $fx) (local.get $fy) (local.get $fz) (local.get $dx) (local.get $dy) (local.get $dz)))
        (local.set $cc (f32.sub (!dot3 (local.get $fx) (local.get $fy) (local.get $fz) (local.get $fx) (local.get $fy) (local.get $fz))
                                (f32.const @(FL_HIT * FL_HIT))))
        (local.set $disc (f32.sub (f32.mul (local.get $b) (local.get $b)) (local.get $cc)))
        (if (f32.ge (local.get $disc) (f32.const 0))
          (then
            (local.set $t1 (f32.max (f32.sub (f32.neg (local.get $b)) (f32.sqrt (local.get $disc))) (f32.const 0)))
            (if (i32.and (f32.lt (local.get $t1) (local.get $best)) (f32.gt (f32.add (f32.neg (local.get $b)) (f32.sqrt (local.get $disc))) (f32.const 0)))
              (then (local.set $best (local.get $t1)) (local.set $who (local.get $q)))))))))
  (local.get $who)
  (local.get $best))

;; A charge shot or a bomb from slot p of bank d at (x, y, z), along the unit
;; (fx, fy, fz) at `speed`. A charge shot locks on to the live enemy most
;; ahead of the nose within FL_LOCK and FL_LOCK_RANGE, where p saw them.
(func $f_launch (param $p i32) (param $d i32) (param $kind i32) (param $x f32) (param $y f32) (param $z f32)
  (param $fx f32) (param $fy f32) (param $fz f32) (param $speed f32)
  (local $pb i32) (local $j i32) (local $jb i32) (local $q i32) (local $rt i32) (local $who i32)
  (local $qx f32) (local $qy f32) (local $qz f32) (local $dx f32) (local $dy f32) (local $dz f32) (local $dist f32) (local $cos f32) (local $best f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (call $fx (local.get $d) (i32.const @FX_SHOT) (local.get $p) (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)) (local.get $x) (local.get $y) (local.get $z)
            (select (f32.const @KILL_CHARGE) (f32.const @KILL_BOMB) (i32.eq (local.get $kind) (i32.const @K_CHARGE))))
  (local.set $j (i32.const 0))
  (block $found
    (loop $find
      (br_if $found (i32.eqz (!at u8 @(PROJ + J_KIND) (i32.add (i32.shl (local.get $j) (i32.const 5)) (local.get $d)))))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br_if $find (i32.lt_u (local.get $j) (i32.const @NPROJ)))
      (return)))
  (local.set $jb (i32.add (i32.shl (local.get $j) (i32.const 5)) (local.get $d)))
  (!put f32 @(PROJ + J_PX) (local.get $jb) (local.get $x))
  (!put f32 @(PROJ + J_PY) (local.get $jb) (local.get $y))
  (!put f32 @(PROJ + J_PZ) (local.get $jb) (local.get $z))
  (!put f32 @(PROJ + J_VX) (local.get $jb) (f32.mul (local.get $fx) (local.get $speed)))
  (!put f32 @(PROJ + J_VY) (local.get $jb) (f32.mul (local.get $fy) (local.get $speed)))
  (!put f32 @(PROJ + J_VZ) (local.get $jb) (f32.mul (local.get $fz) (local.get $speed)))
  (!put u16 @(PROJ + J_AGE) (local.get $jb) (i32.const 0))
  (!put u8 @(PROJ + J_KIND) (local.get $jb) (local.get $kind))
  (!put u8 @(PROJ + J_TGT) (local.get $jb) (i32.const 0))
  (!put u8 @(PROJ + J_OWNER) (local.get $jb) (local.get $p))
  (!put u8 @(PROJ + J_HOME) (local.get $jb) (i32.const 0))
  (!put u16 @(PROJ + J_SHOT) (local.get $jb) (!at u16 @(PLAYERS + P_SHOTS) (local.get $pb)))
  (if (i32.ne (local.get $kind) (i32.const @K_CHARGE)) (then (return)))
  (local.set $rt (call $a_seen (local.get $p) (local.get $d)))
  (local.set $who (i32.const -1))
  (local.set $best (f32.const @FL_LOCK))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (i32.and (i32.eq (i32.and (i32.load8_u offset=@(PLAYERS + P_FL) (i32.shl (local.get $q) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                          (i32.ne (local.get $q) (local.get $p)))
                 (i32.eqz (call $a_ally (local.get $p) (local.get $q))))
      (then
        (call $a_where (local.get $q) (local.get $rt))
        (local.set $qz) (local.set $qy) (local.set $qx)
        (local.set $dx (f32.sub (local.get $qx) (local.get $x)))
        (local.set $dy (f32.sub (local.get $qy) (local.get $y)))
        (local.set $dz (f32.sub (local.get $qz) (local.get $z)))
        (local.set $dist (f32.sqrt (f32.max (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (f32.const 1e-6))))
        (local.set $cos (f32.div (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $fx) (local.get $fy) (local.get $fz)) (local.get $dist)))
        (if (i32.and (f32.gt (local.get $cos) (local.get $best)) (f32.lt (local.get $dist) (f32.const @FL_LOCK_RANGE)))
          (then (local.set $best (local.get $cos)) (local.set $who (local.get $q)))))))
  (if (i32.ge_s (local.get $who) (i32.const 0))
    (then
      (!put u8 @(PROJ + J_TGT) (local.get $jb) (local.get $who))
      (!put u8 @(PROJ + J_HOME) (local.get $jb) (i32.const 1)))))

;; The first live ship other than `skip` whose ball (FL_HIT) is within r of
;; the point, in the confirmed world, or -1.
(func $f_hit (param $x f32) (param $y f32) (param $z f32) (param $r f32) (param $skip i32) (result i32)
  (local $q i32) (local $qb i32) (local $dx f32) (local $dy f32) (local $dz f32) (local $rr f32)
  (local.set $rr (f32.add (f32.const @FL_HIT) (local.get $r)))
  (local.set $rr (f32.mul (local.get $rr) (local.get $rr)))
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.and (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                 (i32.ne (local.get $q) (local.get $skip)))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dy (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $y)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)) (local.get $rr))
          (then (return (local.get $q)))))))
  (i32.const -1))

;; A charge shot or a bomb of bank d, in two half steps a tick. A charge shot
;; with a lock turns toward its target, keeping its speed. Either goes off on
;; the ground, a box or a ship, a charge shot at CHARGE_LIFE and a bomb on its
;; fuse; out of the world it is gone.
(func $f_proj (param $jb i32) (param $d i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32) (local $h f32) (local $k i32)
  (local $qb i32) (local $tx f32) (local $ty f32) (local $tz f32) (local $len f32) (local $charge i32)
  (local.set $px (!at f32 @(PROJ + J_PX) (local.get $jb)))
  (local.set $py (!at f32 @(PROJ + J_PY) (local.get $jb)))
  (local.set $pz (!at f32 @(PROJ + J_PZ) (local.get $jb)))
  (local.set $vx (!at f32 @(PROJ + J_VX) (local.get $jb)))
  (local.set $vy (!at f32 @(PROJ + J_VY) (local.get $jb)))
  (local.set $vz (!at f32 @(PROJ + J_VZ) (local.get $jb)))
  (local.set $charge (i32.eq (!at u8 @(PROJ + J_KIND) (local.get $jb)) (i32.const @K_CHARGE)))
  (if (i32.and (local.get $charge) (i32.ne (!at u8 @(PROJ + J_HOME) (local.get $jb)) (i32.const 0)))
    (then
      (local.set $qb (i32.shl (!at u8 @(PROJ + J_TGT) (local.get $jb)) (i32.const 6)))
      (if (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
        (then
          (local.set $tx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $px)))
          (local.set $ty (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $py)))
          (local.set $tz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $pz)))
          (local.set $len (f32.div (f32.const @FL_CHARGEV)
                                   (f32.sqrt (f32.max (!dot3 (local.get $tx) (local.get $ty) (local.get $tz) (local.get $tx) (local.get $ty) (local.get $tz)) (f32.const 1e-6)))))
          (local.set $vx (!madd (f32.sub (f32.mul (local.get $tx) (local.get $len)) (local.get $vx)) (f32.const @FL_CHARGE_TURN) (local.get $vx)))
          (local.set $vy (!madd (f32.sub (f32.mul (local.get $ty) (local.get $len)) (local.get $vy)) (f32.const @FL_CHARGE_TURN) (local.get $vy)))
          (local.set $vz (!madd (f32.sub (f32.mul (local.get $tz) (local.get $len)) (local.get $vz)) (f32.const @FL_CHARGE_TURN) (local.get $vz)))
          (local.set $len (f32.div (f32.const @FL_CHARGEV)
                                   (f32.sqrt (f32.max (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $vx) (local.get $vy) (local.get $vz)) (f32.const 1e-6)))))
          (local.set $vx (f32.mul (local.get $vx) (local.get $len)))
          (local.set $vy (f32.mul (local.get $vy) (local.get $len)))
          (local.set $vz (f32.mul (local.get $vz) (local.get $len))))
        (else (!put u8 @(PROJ + J_HOME) (local.get $jb) (i32.const 0))))))
  (!for $k (i32.const 0) (i32.const 2)
    (if (call $box_in (!madd (local.get $vx) (f32.const 0.004) (local.get $px)) (!madd (local.get $vy) (f32.const 0.004) (local.get $py))
                      (!madd (local.get $vz) (f32.const 0.004) (local.get $pz)) (f32.const 0))
      (then (call $f_blast (local.get $jb) (local.get $d) (local.get $px) (local.get $py) (local.get $pz)) (return)))
    (local.set $px (!madd (local.get $vx) (f32.const 0.004) (local.get $px)))
    (local.set $py (!madd (local.get $vy) (f32.const 0.004) (local.get $py)))
    (local.set $pz (!madd (local.get $vz) (f32.const 0.004) (local.get $pz)))
    (if (i32.or (i32.or (f32.lt (local.get $px) (f32.const 0)) (f32.gt (local.get $px) (f32.const @WORLD)))
                (i32.or (i32.or (f32.lt (local.get $pz) (f32.const 0)) (f32.gt (local.get $pz) (f32.const @WORLD)))
                        (f32.gt (local.get $py) (f32.const @CEIL))))
      (then (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE)) (return)))
    (call $ground (local.get $px) (local.get $pz))
    (drop) (drop) (drop) (drop)
    (local.set $h)
    (if (f32.le (local.get $py) (local.get $h))
      (then (call $f_blast (local.get $jb) (local.get $d) (local.get $px) (local.get $h) (local.get $pz)) (return)))
    (if (i32.ge_s (call $f_hit (local.get $px) (local.get $py) (local.get $pz) (f32.const 0.3) (!at u8 @(PROJ + J_OWNER) (local.get $jb))) (i32.const 0))
      (then (call $f_blast (local.get $jb) (local.get $d) (local.get $px) (local.get $py) (local.get $pz)) (return))))
  (!chk (local.get $px) 21 (local.get $jb))
  (!chk (local.get $py) 22 (local.get $jb))
  (!chk (local.get $pz) 23 (local.get $jb))
  (!put f32 @(PROJ + J_PX) (local.get $jb) (local.get $px))
  (!put f32 @(PROJ + J_PY) (local.get $jb) (local.get $py))
  (!put f32 @(PROJ + J_PZ) (local.get $jb) (local.get $pz))
  (!put f32 @(PROJ + J_VX) (local.get $jb) (local.get $vx))
  (!put f32 @(PROJ + J_VY) (local.get $jb) (local.get $vy))
  (!put f32 @(PROJ + J_VZ) (local.get $jb) (local.get $vz))
  (if (i32.ge_u (!at u16 @(PROJ + J_AGE) (local.get $jb)) (select (i32.const @CHARGE_LIFE) (i32.const @BOMB_FUSE) (local.get $charge)))
    (then (call $f_blast (local.get $jb) (local.get $d) (local.get $px) (local.get $py) (local.get $pz)))))

;; Projectile jb of bank d goes off at (x, y, z): on the confirmed world its
;; splash (a charge shot CHARGE_DMG over FL_CHARGE_RAD, a bomb BOMB_DMG over
;; FL_BOMB_RAD), on either its blast for the screen; its slot is freed.
(func $f_blast (param $jb i32) (param $d i32) (param $x f32) (param $y f32) (param $z f32)
  (local $charge i32) (local $r f32)
  (local.set $charge (i32.eq (!at u8 @(PROJ + J_KIND) (local.get $jb)) (i32.const @K_CHARGE)))
  (local.set $r (select (f32.const @FL_CHARGE_RAD) (f32.const @FL_BOMB_RAD) (local.get $charge)))
  (if (i32.eqz (local.get $d))
    (then (call $f_splash (local.get $x) (local.get $y) (local.get $z)
                          (select (f32.const @CHARGE_DMG) (f32.const @BOMB_DMG) (local.get $charge)) (local.get $r)
                          (!at u8 @(PROJ + J_OWNER) (local.get $jb)) (select (i32.const @KILL_CHARGE) (i32.const @KILL_BOMB) (local.get $charge)))))
  (call $fx (local.get $d) (i32.const @FX_BLAST) (!at u8 @(PROJ + J_OWNER) (local.get $jb)) (!at u16 @(PROJ + J_SHOT) (local.get $jb))
            (local.get $x) (local.get $y) (local.get $z) (local.get $r))
  (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE)))

;; Splash on every live ship, centred on the ship: the whole of it within 35%
;; of r, falling linearly to nothing at r, half to its owner; a box between
;; the blast and the ship takes it all.
(func $f_splash (param $x f32) (param $y f32) (param $z f32) (param $dmg f32) (param $r f32) (param $owner i32) (param $cause i32)
  (local $q i32) (local $qb i32) (local $dx f32) (local $dy f32) (local $dz f32) (local $dist f32) (local $f f32)
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
    (if (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
      (then
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dy (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (local.get $y)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (local.set $dist (f32.sqrt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz))))
        (if (i32.and (f32.lt (local.get $dist) (local.get $r))
                     (call $clear (local.get $x) (local.get $y) (local.get $z)
                                  (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
          (then
            (local.set $f (f32.mul (local.get $dmg) (!clamp (f32.div (f32.sub (local.get $r) (local.get $dist)) (f32.mul (local.get $r) (f32.const 0.65))) (f32.const 0) (f32.const 1))))
            (if (i32.eq (local.get $q) (local.get $owner)) (then (local.set $f (f32.mul (local.get $f) (f32.const 0.5)))))
            (if (f32.ge (local.get $f) (f32.const 1))
              (then (call $a_hurt (local.get $q) (local.get $owner) (i32.trunc_sat_f32_u (local.get $f)) (i32.const 0) (local.get $cause)
                                  (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb)))))))))))

;; Ships that have met (centres within FL_MEET), on the confirmed world at the
;; end of the tick, in slot order by pair: pushed apart along the line between
;; them, half the overlap each, and bounced, 40% of the closing speed kept;
;; closing faster than FL_CRASH hurts both as a crash does, each hit credited
;; to the other (so allies, whom $a_hurt spares, only bounce). The prediction
;; never sees another ship's body: a ship's own bounce reaches its pilot a
;; round trip later, as a blast's push does.
(func $f_collide
  (local $p i32) (local $q i32) (local $pb i32) (local $qb i32) (local $hurt i32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $d2 f32) (local $d f32) (local $nx f32) (local $ny f32) (local $nz f32)
  (local $c f32) (local $j f32) (local $push f32) (local $mx f32) (local $my f32) (local $mz f32)
  (if (i32.ne (i32.load (i32.const @HDR_STATE)) (i32.const @H_PLAY)) (then (return)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
      (then
        (!for $q (i32.add (local.get $p) (i32.const 1)) (i32.const @NPLAYER)
          (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
          ;; (a dead one is skipped: p may have just died against an earlier q)
          (if (i32.and (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                       (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_DEAD))))
            (then
              (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
              (if (f32.lt (f32.abs (local.get $dx)) (f32.const @FL_MEET))
                (then
                  (local.set $dy (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb))))
                  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
                  (local.set $d2 (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz)))
                  (if (f32.lt (local.get $d2) (f32.const @FL_MEET2))
                    (then
                      ;; the normal, p to q (along x if they sit on one point)
                      (local.set $d (f32.sqrt (local.get $d2)))
                      (if (f32.gt (local.get $d) (f32.const 1e-4))
                        (then
                          (local.set $nx (f32.div (local.get $dx) (local.get $d)))
                          (local.set $ny (f32.div (local.get $dy) (local.get $d)))
                          (local.set $nz (f32.div (local.get $dz) (local.get $d))))
                        (else (local.set $nx (f32.const 1)) (local.set $ny (f32.const 0)) (local.set $nz (f32.const 0))))
                      ;; apart, half the overlap each
                      (local.set $push (f32.mul (f32.sub (f32.const @FL_MEET) (local.get $d)) (f32.const 0.5)))
                      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.mul (local.get $nx) (local.get $push))))
                      (!put f32 @(PLAYERS + P_PY) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.mul (local.get $ny) (local.get $push))))
                      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.mul (local.get $nz) (local.get $push))))
                      (!put f32 @(PLAYERS + P_PX) (local.get $qb) (!madd (local.get $nx) (local.get $push) (!at f32 @(PLAYERS + P_PX) (local.get $qb))))
                      (!put f32 @(PLAYERS + P_PY) (local.get $qb) (!madd (local.get $ny) (local.get $push) (!at f32 @(PLAYERS + P_PY) (local.get $qb))))
                      (!put f32 @(PLAYERS + P_PZ) (local.get $qb) (!madd (local.get $nz) (local.get $push) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))))
                      ;; the closing speed along the normal, turned back
                      (local.set $c (f32.neg (!dot3 (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $qb)) (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
                                                    (f32.sub (!at f32 @(PLAYERS + P_VY) (local.get $qb)) (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
                                                    (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $qb)) (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
                                                    (local.get $nx) (local.get $ny) (local.get $nz))))
                      (if (f32.gt (local.get $c) (f32.const 0))
                        (then
                          (local.set $j (f32.mul (local.get $c) (f32.const @FL_BOUNCE)))
                          (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_VX) (local.get $pb)) (f32.mul (local.get $nx) (local.get $j))))
                          (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_VY) (local.get $pb)) (f32.mul (local.get $ny) (local.get $j))))
                          (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.sub (!at f32 @(PLAYERS + P_VZ) (local.get $pb)) (f32.mul (local.get $nz) (local.get $j))))
                          (!put f32 @(PLAYERS + P_VX) (local.get $qb) (!madd (local.get $nx) (local.get $j) (!at f32 @(PLAYERS + P_VX) (local.get $qb))))
                          (!put f32 @(PLAYERS + P_VY) (local.get $qb) (!madd (local.get $ny) (local.get $j) (!at f32 @(PLAYERS + P_VY) (local.get $qb))))
                          (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (!madd (local.get $nz) (local.get $j) (!at f32 @(PLAYERS + P_VZ) (local.get $qb))))))
                      (if (f32.gt (local.get $c) (f32.const @FL_CRASH))
                        (then
                          (local.set $mx (!madd (local.get $nx) (f32.const 1.2) (!at f32 @(PLAYERS + P_PX) (local.get $pb))))
                          (local.set $my (!madd (local.get $ny) (f32.const 1.2) (!at f32 @(PLAYERS + P_PY) (local.get $pb))))
                          (local.set $mz (!madd (local.get $nz) (f32.const 1.2) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))))
                          (call $fx (i32.const 0) (i32.const @FX_BLAST) (local.get $p) (i32.const 0) (local.get $mx) (local.get $my) (local.get $mz) (f32.const 0.6))
                          (local.set $hurt (i32.trunc_sat_f32_u (!madd (f32.sub (local.get $c) (f32.const @FL_CRASH)) (f32.const @FL_CRASHK) (f32.const 5))))
                          (call $a_hurt (local.get $p) (local.get $q) (local.get $hurt) (i32.const 0) (i32.const @KILL_CRASH) (local.get $mx) (local.get $my) (local.get $mz))
                          (call $a_hurt (local.get $q) (local.get $p) (local.get $hurt) (i32.const 0) (i32.const @KILL_CRASH) (local.get $mx) (local.get $my) (local.get $mz)))))))))))))))

;; Ring Race (M_RACE), a tick of play after every ship's own: a live ship
;; whose centre is inside its next gate (MAP_RACE's, gates passed mod their
;; count) has passed it; LAPS times round the course and it has finished,
;; and the first to finish wins. A ship's gates passed are its MR_POINTS, so
;; the match places by them, then by kills, as the arena's modes place by
;; points. 1 once someone has won. The confirmed world's alone, as every
;; mode's tick is.
(func $f_race (result i32)
  (local $n i32) (local $p i32) (local $pb i32) (local $r i32) (local $pts i32) (local $a i32)
  (local $dx f32) (local $dy f32) (local $dz f32) (local $rr f32)
  (local.set $n (i32.load (i32.const @MAP_RACE)))
  (if (i32.eqz (local.get $n)) (then (return (i32.const 0))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (local.set $r (i32.shl (local.get $p) (i32.const 3)))
    (local.set $pts (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
    (if (i32.and (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(PF_LIVE | PF_DEAD))) (i32.const @PF_LIVE))
                 (i32.lt_u (local.get $pts) (i32.mul (local.get $n) (i32.const @LAPS))))
      (then
        (local.set $a (i32.add (i32.const @(MAP_RACE + 16)) (i32.shl (i32.rem_u (local.get $pts) (local.get $n)) (i32.const 4))))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (f32.load (local.get $a))))
        (local.set $dy (f32.sub (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (f32.load offset=4 (local.get $a))))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (f32.load offset=8 (local.get $a))))
        (local.set $rr (f32.load offset=12 (local.get $a)))
        (if (f32.lt (!dot3 (local.get $dx) (local.get $dy) (local.get $dz) (local.get $dx) (local.get $dy) (local.get $dz))
                    (f32.mul (local.get $rr) (local.get $rr)))
          (then
            (local.set $pts (i32.add (local.get $pts) (i32.const 1)))
            (i32.store16 offset=@(MODE_REC + MR_POINTS) (local.get $r) (local.get $pts))
            (if (i32.rem_u (local.get $pts) (local.get $n))
              (then (call $a_news (i32.const @MX_GATE) (local.get $p) (local.get $pts)))
              (else (call $a_news (i32.const @MX_LAP) (local.get $p) (i32.div_u (local.get $pts) (local.get $n)))))
            (if (i32.and (i32.eq (local.get $pts) (i32.mul (local.get $n) (i32.const @LAPS))) (i32.eqz (i32.load (i32.const @AH_WINNER))))
              (then
                (i32.store (i32.const @AH_WINNER) (i32.add (local.get $p) (i32.const 1)))
                (call $a_news (i32.const @MX_WIN) (local.get $p) (local.get $p)))))))))
  (i32.ne (i32.load (i32.const @AH_WINNER)) (i32.const 0)))
