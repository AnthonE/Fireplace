;; CROSSROADS (M_CROSSROADS, prefix cx; constants in src/am/crossroads.mjs):
;; Roblox's Crossroads' rules, everyone for itself, no sides. Everyone comes
;; in with the sword and the rocket launcher and a superball in hand, CX_HP
;; and no shields (the spawn hook); the core recharges nothing in this mode
;; (OWN_HEALTH), so the tick hook heals a point every CX_REGEN, keeps the
;; sword's swings and the rocket's reserve full, and puts a superball back in
;; hand CX_BALL_RELOAD after one is thrown. The hurt hook makes the sword's
;; swing CX_SWORD rather than a kill, and takes the rifle butt's blows (the
;; classic gear has no melee but the sword). The kill hook makes the respawn
;; CX_RESPAWN. KOs are A_KILLS and Wipeouts A_DEATHS; the most KOs at the
;; clock win, by the core's places ($a_key: kills). The superball itself is
;; $cx_ball, a projectile on either bank like a frag: what the prediction
;; reads of the mode is AH_MODE in its copy (the throw, in $a_shoot) and the
;; ball's own record.

;; Play begins: nothing to lay out.
(func $cx_start)

;; Every tick of play: health back a point every CX_REGEN of the room's
;; clock; every live fighter's sword swings and rocket reserve full, one
;; superball at most, the next CX_BALL_RELOAD after a throw; the leader by
;; $a_key (KOs, the lowest slot on a tie). Never over before the clock.
(func $cx_tick (result i32)
  (local $p i32) (local $pb i32) (local $r i32) (local $n i32) (local $k i32) (local $w i32)
  (local $heal i32) (local $key i32) (local $best i32) (local $lead i32)
  (local.set $heal (i32.eqz (i32.rem_u (i32.load (i32.const @HDR_TICK)) (i32.const @CX_REGEN))))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (call $a_alive (local.get $p))
      (then
        (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const 0))
        (if (i32.and (local.get $heal) (i32.lt_u (!at u8 @(PLAYERS + A_HP) (local.get $pb)) (i32.const @CX_HP)))
          (then (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.add (!at u8 @(PLAYERS + A_HP) (local.get $pb)) (i32.const 1)))))
        (!for $k (i32.const 0) (i32.const 2)
          (local.set $w (i32.load8_u offset=@(PLAYERS + A_GUN) (i32.add (local.get $pb) (local.get $k))))
          (i32.store16 offset=@(PLAYERS + A_RES) (i32.add (local.get $pb) (i32.shl (local.get $k) (i32.const 1))) (!arm res (local.get $w)))
          (if (i32.eq (local.get $w) (i32.const @W_SWORD))
            (then (i32.store8 offset=@(PLAYERS + A_MAG) (i32.add (local.get $pb) (local.get $k)) (!arm mag (local.get $w))))))
        ;; the superball: a kill's frag back is none of its business
        (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $p) (i32.const 3))))
        (local.set $n (i32.load16_u offset=@CX_MR_BALL (local.get $r)))
        (if (local.get $n)
          (then
            (local.set $n (i32.sub (local.get $n) (i32.const 1)))
            (i32.store16 offset=@CX_MR_BALL (local.get $r) (local.get $n))
            (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.eqz (local.get $n))))
          (else
            (if (!at u8 @(PLAYERS + A_GRENS) (local.get $pb))
              (then (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.const 1)))
              (else (i32.store16 offset=@CX_MR_BALL (local.get $r) (i32.const @(CX_BALL_RELOAD - 1)))))))
        (local.set $key (call $a_key (local.get $p)))
        (if (i32.or (i32.eqz (local.get $lead)) (i32.gt_u (local.get $key) (local.get $best)))
          (then (local.set $best (local.get $key)) (local.set $lead (i32.add (local.get $p) (i32.const 1))))))))
  (i32.store (i32.const @AH_LEADER) (local.get $lead))
  (i32.const 0))

;; q died: back CX_RESPAWN on, its superball's wait gone with it.
(func $cx_kill (param $q i32) (param $a i32) (param $cause i32)
  (!put u16 @(PLAYERS + A_RESPAWN) (i32.shl (local.get $q) (i32.const 6)) (i32.const @CX_RESPAWN))
  (i32.store16 offset=@(MODE_REC + CX_MR_BALL) (i32.shl (local.get $q) (i32.const 3)) (i32.const 0)))

;; No spawn point is barred.
(func $cx_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (i32.const 0))

;; Slot p comes in with the sword out and the rocket launcher in the other
;; hand, a superball, CX_HP and no shields.
(func $cx_spawn (param $p i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $a_arm (local.get $p) (i32.const @W_SWORD) (i32.const @W_ROCKET))
  (!put u8 @(PLAYERS + A_SH) (local.get $pb) (i32.const 0))
  (!put u8 @(PLAYERS + A_HP) (local.get $pb) (i32.const @CX_HP))
  (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.const 1))
  (i32.store16 offset=@(MODE_REC + CX_MR_BALL) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0)))

;; A blow from a to q: the sword's swing is CX_SWORD off q's health (a kill
;; at 0), and a rifle butt's is nothing; anything else the core deals.
(func $cx_hurt (param $q i32) (param $a i32) (param $cause i32) (result i32)
  (local $qb i32) (local $hp i32)
  (if (i32.or (i32.eq (local.get $cause) (i32.const @KILL_MELEE)) (i32.eq (local.get $cause) (i32.const @KILL_BEHIND)))
    (then (return (i32.const 1))))
  (if (i32.ne (local.get $cause) (i32.const @W_SWORD)) (then (return (i32.const 0))))
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $hp (!at u8 @(PLAYERS + A_HP) (local.get $qb)))
  (!put u8 @(PLAYERS + A_HITBY) (local.get $qb) (local.get $a))
  (call $fx (i32.const 0) (i32.const @FX_HIT) (local.get $a) (local.get $q)
            (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (f32.add (!at f32 @(PLAYERS + P_PY) (local.get $qb)) (f32.const 1.2)) (!at f32 @(PLAYERS + P_PZ) (local.get $qb))
            (f32.const 2))
  (if (i32.le_u (local.get $hp) (i32.const @CX_SWORD))
    (then (call $a_kill (local.get $q) (local.get $a) (i32.const @W_SWORD)))
    (else (!put u8 @(PLAYERS + A_HP) (local.get $qb) (i32.sub (local.get $hp) (i32.const @CX_SWORD)))))
  (i32.const 1))

;; A superball of bank d's, its tick: it falls under the place's gravity,
;; bounces off the ground and the boxes keeping CX_BALL_E of its speed into
;; them (none along them: no friction), and strikes the first body it
;; touches (its thrower's too, after CX_BALL_SAFE) for CX_BALL_DMG halved
;; for every bounce before, on the confirmed world; then it is spent and
;; bounces on harmless. A touch within CX_BALL_QUIET of the last does
;; nothing. Gone CX_BALL_LIFE after the throw.
(func $cx_ball (param $jb i32) (param $d i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $ox f32) (local $oy f32) (local $oz f32) (local $h f32) (local $nx f32) (local $ny f32) (local $nz f32) (local $vn f32)
  (local $b i32) (local $t i32) (local $q i32) (local $n i32) (local $quiet i32) (local $touch i32) (local $owner i32) (local $dmg i32)
  (if (i32.gt_u (!at u16 @(PROJ + J_AGE) (local.get $jb)) (i32.const @CX_BALL_LIFE))
    (then (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE)) (return)))
  (local.set $t (i32.load offset=@HDR_TICK (local.get $d)))
  (local.set $owner (!at u8 @(PROJ + J_OWNER) (local.get $jb)))
  (local.set $n (!at u8 @(PROJ + J_TGT) (local.get $jb)))
  (local.set $quiet (!at u8 @(PROJ + J_HOME) (local.get $jb)))
  (local.set $ox (!at f32 @(PROJ + J_PX) (local.get $jb)))
  (local.set $oy (!at f32 @(PROJ + J_PY) (local.get $jb)))
  (local.set $oz (!at f32 @(PROJ + J_PZ) (local.get $jb)))
  (local.set $vx (!at f32 @(PROJ + J_VX) (local.get $jb)))
  (local.set $vy (f32.sub (!at f32 @(PROJ + J_VY) (local.get $jb)) (f32.const @CX_BALL_G)))
  (local.set $vz (!at f32 @(PROJ + J_VZ) (local.get $jb)))
  (local.set $px (!madd (local.get $vx) (f32.const @DT) (local.get $ox)))
  (local.set $py (!madd (local.get $vy) (f32.const @DT) (local.get $oy)))
  (local.set $pz (!madd (local.get $vz) (f32.const @DT) (local.get $oz)))
  (if (i32.or (i32.or (f32.lt (local.get $px) (f32.const @LO)) (f32.gt (local.get $px) (f32.const @HI)))
              (i32.or (i32.or (f32.lt (local.get $pz) (f32.const @LO)) (f32.gt (local.get $pz) (f32.const @HI)))
                      (f32.gt (local.get $py) (f32.const @CEIL))))
    (then (memory.fill (i32.add (i32.const @PROJ) (local.get $jb)) (i32.const 0) (i32.const @JSIZE)) (return)))
  ;; off a box: back where it was, the speed across the face it came through turned and kept at CX_BALL_E
  (local.set $b (call $box_in (local.get $px) (local.get $py) (local.get $pz) (f32.const @CX_BALL_R) (local.get $t)))
  (if (local.get $b)
    (then
      (local.set $touch (i32.const 1))
      (if (i32.or (f32.le (local.get $ox) (f32.sub (call $bc (local.get $b) (i32.const 0) (local.get $t)) (f32.const @CX_BALL_R)))
                  (f32.ge (local.get $ox) (f32.add (call $bc (local.get $b) (i32.const 12) (local.get $t)) (f32.const @CX_BALL_R))))
        (then (local.set $px (local.get $ox)) (local.set $vx (f32.mul (local.get $vx) (f32.const @(-CX_BALL_E)))))
        (else
          (if (i32.or (f32.le (local.get $oz) (f32.sub (call $bc (local.get $b) (i32.const 8) (local.get $t)) (f32.const @CX_BALL_R)))
                      (f32.ge (local.get $oz) (f32.add (call $bc (local.get $b) (i32.const 20) (local.get $t)) (f32.const @CX_BALL_R))))
            (then (local.set $pz (local.get $oz)) (local.set $vz (f32.mul (local.get $vz) (f32.const @(-CX_BALL_E)))))
            (else
              ;; a top or an underside (or it was already in): out the nearer
              (local.set $py (select (f32.add (call $bc (local.get $b) (i32.const 16) (local.get $t)) (f32.const @CX_BALL_R))
                                     (f32.sub (call $bc (local.get $b) (i32.const 4) (local.get $t)) (f32.const @CX_BALL_R))
                                     (f32.ge (local.get $oy) (f32.mul (f32.add (call $bc (local.get $b) (i32.const 4) (local.get $t)) (call $bc (local.get $b) (i32.const 16) (local.get $t))) (f32.const 0.5)))))
              (local.set $vy (f32.mul (local.get $vy) (f32.const @(-CX_BALL_E))))))))))
  ;; off the ground: the speed into it turned about its normal, CX_BALL_E of it kept
  (call $ground (local.get $px) (local.get $pz))
  (drop) (local.set $nz) (local.set $ny) (local.set $nx) (local.set $h)
  (if (f32.lt (local.get $py) (f32.add (local.get $h) (f32.const @CX_BALL_R)))
    (then
      (local.set $py (f32.add (local.get $h) (f32.const @CX_BALL_R)))
      (local.set $vn (!dot3 (local.get $vx) (local.get $vy) (local.get $vz) (local.get $nx) (local.get $ny) (local.get $nz)))
      (if (f32.lt (local.get $vn) (f32.const 0))
        (then
          (local.set $touch (i32.const 1))
          (local.set $vn (f32.mul (local.get $vn) (f32.const @CX_BALL_E1)))
          (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $nx) (local.get $vn))))
          (local.set $vy (f32.sub (local.get $vy) (f32.mul (local.get $ny) (local.get $vn))))
          (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $nz) (local.get $vn))))))))
  ;; a body: struck, if it's not too soon after the last touch and the ball still bites
  (local.set $q (call $hit_player (local.get $px) (local.get $py) (local.get $pz) (f32.const @CX_BALL_R)
                                  (select (local.get $owner) (i32.const -1) (i32.lt_u (!at u16 @(PROJ + J_AGE) (local.get $jb)) (i32.const @CX_BALL_SAFE)))))
  (if (i32.and (i32.ge_s (local.get $q) (i32.const 0)) (i32.eqz (local.get $quiet)))
    (then
      (local.set $dmg (i32.shr_u (i32.const @CX_BALL_DMG) (local.get $n)))
      (if (i32.and (i32.eqz (local.get $d)) (i32.ge_u (local.get $dmg) (i32.const @CX_BALL_MIN)))
        (then (call $a_hurt (local.get $q) (local.get $owner) (local.get $dmg) (i32.const 0) (i32.const @CX_KILL_BALL) (local.get $px) (local.get $py) (local.get $pz))))
      (local.set $n (i32.const @CX_SPENT))
      (local.set $quiet (i32.const @CX_BALL_QUIET))
      ;; and back off it, across
      (local.set $vx (f32.mul (local.get $vx) (f32.const @(-CX_BALL_E))))
      (local.set $vz (f32.mul (local.get $vz) (f32.const @(-CX_BALL_E))))
      (local.set $px (local.get $ox))
      (local.set $pz (local.get $oz))))
  ;; anything else: a bounce halves what it would deal
  (if (i32.and (local.get $touch) (i32.eqz (local.get $quiet)))
    (then
      (local.set $n (select (i32.add (local.get $n) (i32.const 1)) (local.get $n) (i32.lt_u (local.get $n) (i32.const @CX_SPENT))))
      (local.set $quiet (i32.const @CX_BALL_QUIET))))
  (if (local.get $quiet) (then (local.set $quiet (i32.sub (local.get $quiet) (i32.const 1)))))
  (!chk (local.get $px) 31 (local.get $jb))
  (!chk (local.get $py) 32 (local.get $jb))
  (!chk (local.get $pz) 33 (local.get $jb))
  (!chk (local.get $vx) 34 (local.get $jb))
  (!chk (local.get $vy) 35 (local.get $jb))
  (!chk (local.get $vz) 36 (local.get $jb))
  (!put u8 @(PROJ + J_TGT) (local.get $jb) (local.get $n))
  (!put u8 @(PROJ + J_HOME) (local.get $jb) (local.get $quiet))
  (!put f32 @(PROJ + J_PX) (local.get $jb) (local.get $px))
  (!put f32 @(PROJ + J_PY) (local.get $jb) (local.get $py))
  (!put f32 @(PROJ + J_PZ) (local.get $jb) (local.get $pz))
  (!put f32 @(PROJ + J_VX) (local.get $jb) (local.get $vx))
  (!put f32 @(PROJ + J_VY) (local.get $jb) (local.get $vy))
  (!put f32 @(PROJ + J_VZ) (local.get $jb) (local.get $vz)))
