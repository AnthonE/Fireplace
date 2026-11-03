;; MINI GOLF: every ball the golf ball, on a putt-putt course of PT_NHMIN to
;; PT_NHMAX holes laid side by side along x, each running along +z and walled
;; all round: six holes, picked and mirrored from the round's seed (a
;; windmill, a dogleg, a gate and a ramp, bumpers over a hump, a zigzag, a
;; spinning bar). The roll's push, drag and hop are off and balls pass
;; through each other (no PGF_BUMPS), so nobody blocks a putt and a crowd of
;; 256 plays the one course. A ball at rest charges while Space is held (or
;; from a click to the next) and putts as it's let go, the way the word looks.
;; The crowd waits on a lawn behind the first hole, every ball its own spot,
;; and is on the first tee PT_WALK into play. Everyone plays the holes in
;; order at their own pace, so nobody waits on a slow putter: holed (or
;; picked up at PT_CAP), a ball sinks PT_SINKT and is on the next tee; past
;; the last it's home (PF_DEAD, never back). Placed by PG_SCORE (PK_SCORE): the fewest
;; strokes, a hole not finished PT_CAP + 1, ties to whoever finished their
;; last hole first; over once everyone is home, and once half are, the rest
;; have PT_LATE.
;;
;; The course is fixed at setup in PG_S (the confirmed world's, never written
;; again), the obstacles move on the tick into play, and everything about a
;; ball (its hole, strokes, charge, pause) is its own PG_M and PG_SCORE: so
;; push, on either bank, does the whole game for its ball, and the
;; prediction is exact through every putt, wall, obstacle and cup.

;; Hole h's record.
(func $pt_rec (param $h i32) (result i32)
  (i32.add (i32.const @PG_S) (i32.mul (local.get $h) (i32.const @PT_HSIZE))))

;; ---- the layout (setup: the confirmed world, from the round's seed, so a
;; countdown's re-lay for a newcomer keeps the course)

;; A wall from (u0, v0) to (u1, v1) in hole record a's own frame (u across,
;; mirrored if it is, v along from its near end).
(func $pt_wall (param $a i32) (param $u0 f32) (param $v0 f32) (param $u1 f32) (param $v1 f32)
  (local $s i32) (local $m f32) (local $x f32) (local $z f32)
  (local.set $s (i32.add (local.get $a) (i32.shl (i32.load offset=@PT_H_NSEG (local.get $a)) (i32.const 4))))
  (local.set $m (f32.load offset=@PT_H_MIR (local.get $a)))
  (local.set $x (f32.load offset=@PT_H_X (local.get $a)))
  (local.set $z (f32.load offset=@PT_H_Z (local.get $a)))
  (f32.store offset=@PT_H_SEG (local.get $s) (!madd (local.get $m) (local.get $u0) (local.get $x)))
  (f32.store offset=@(PT_H_SEG + 4) (local.get $s) (f32.add (local.get $z) (local.get $v0)))
  (f32.store offset=@(PT_H_SEG + 8) (local.get $s) (!madd (local.get $m) (local.get $u1) (local.get $x)))
  (f32.store offset=@(PT_H_SEG + 12) (local.get $s) (f32.add (local.get $z) (local.get $v1)))
  (i32.store offset=@PT_H_NSEG (local.get $a) (i32.add (i32.load offset=@PT_H_NSEG (local.get $a)) (i32.const 1))))

;; The four walls round u0..u1 by v0..v1, and it a green to draw.
(func $pt_box (param $a i32) (param $u0 f32) (param $v0 f32) (param $u1 f32) (param $v1 f32)
  (call $pt_wall (local.get $a) (local.get $u0) (local.get $v0) (local.get $u1) (local.get $v0))
  (call $pt_wall (local.get $a) (local.get $u1) (local.get $v0) (local.get $u1) (local.get $v1))
  (call $pt_wall (local.get $a) (local.get $u1) (local.get $v1) (local.get $u0) (local.get $v1))
  (call $pt_wall (local.get $a) (local.get $u0) (local.get $v1) (local.get $u0) (local.get $v0))
  (call $pt_green (local.get $a) (local.get $u0) (local.get $v0) (local.get $u1) (local.get $v1)))

;; A green to draw over u0..u1 by v0..v1 (the client's; nothing in the sim reads it).
(func $pt_green (param $a i32) (param $u0 f32) (param $v0 f32) (param $u1 f32) (param $v1 f32)
  (local $s i32) (local $m f32) (local $x f32) (local $z f32) (local $xa f32) (local $xb f32)
  (local.set $s (i32.add (local.get $a) (i32.shl (i32.load offset=@PT_H_NGRN (local.get $a)) (i32.const 4))))
  (local.set $m (f32.load offset=@PT_H_MIR (local.get $a)))
  (local.set $x (f32.load offset=@PT_H_X (local.get $a)))
  (local.set $z (f32.load offset=@PT_H_Z (local.get $a)))
  (local.set $xa (!madd (local.get $m) (local.get $u0) (local.get $x)))
  (local.set $xb (!madd (local.get $m) (local.get $u1) (local.get $x)))
  (f32.store offset=@PT_H_GRN (local.get $s) (f32.min (local.get $xa) (local.get $xb)))
  (f32.store offset=@(PT_H_GRN + 4) (local.get $s) (f32.add (local.get $z) (local.get $v0)))
  (f32.store offset=@(PT_H_GRN + 8) (local.get $s) (f32.max (local.get $xa) (local.get $xb)))
  (f32.store offset=@(PT_H_GRN + 12) (local.get $s) (f32.add (local.get $z) (local.get $v1)))
  (i32.store offset=@PT_H_NGRN (local.get $a) (i32.add (i32.load offset=@PT_H_NGRN (local.get $a)) (i32.const 1))))

;; A bumper post of radius r at (u, v): it kicks kick m/s on top of what it gives back.
(func $pt_post (param $a i32) (param $u f32) (param $v f32) (param $r f32) (param $kick f32)
  (local $s i32)
  (local.set $s (i32.add (local.get $a) (i32.shl (i32.load offset=@PT_H_NPOST (local.get $a)) (i32.const 4))))
  (f32.store offset=@PT_H_POST (local.get $s) (!madd (f32.load offset=@PT_H_MIR (local.get $a)) (local.get $u) (f32.load offset=@PT_H_X (local.get $a))))
  (f32.store offset=@(PT_H_POST + 4) (local.get $s) (f32.add (f32.load offset=@PT_H_Z (local.get $a)) (local.get $v)))
  (f32.store offset=@(PT_H_POST + 8) (local.get $s) (f32.add (local.get $r) (f32.const @B_RAD)))
  (f32.store offset=@(PT_H_POST + 12) (local.get $s) (local.get $kick))
  (i32.store offset=@PT_H_NPOST (local.get $a) (i32.add (i32.load offset=@PT_H_NPOST (local.get $a)) (i32.const 1))))

;; A slope (PT_F_*) from v0 to v1, h high.
(func $pt_slope (param $a i32) (param $kind i32) (param $v0 f32) (param $v1 f32) (param $h f32)
  (local $s i32)
  (local.set $s (i32.add (local.get $a) (i32.shl (i32.load offset=@PT_H_NFT (local.get $a)) (i32.const 4))))
  (i32.store offset=@PT_H_FT (local.get $s) (local.get $kind))
  (f32.store offset=@(PT_H_FT + 4) (local.get $s) (f32.add (f32.load offset=@PT_H_Z (local.get $a)) (local.get $v0)))
  (f32.store offset=@(PT_H_FT + 8) (local.get $s) (f32.add (f32.load offset=@PT_H_Z (local.get $a)) (local.get $v1)))
  (f32.store offset=@(PT_H_FT + 12) (local.get $s) (local.get $h))
  (i32.store offset=@PT_H_NFT (local.get $a) (i32.add (i32.load offset=@PT_H_NFT (local.get $a)) (i32.const 1))))

;; The tee, the cup, the par; the hole's length and half width.
(func $pt_pin (param $a i32) (param $tu f32) (param $tv f32) (param $cu f32) (param $cv f32) (param $par i32) (param $len f32) (param $hw f32)
  (local $m f32) (local $x f32) (local $z f32)
  (local.set $m (f32.load offset=@PT_H_MIR (local.get $a)))
  (local.set $x (f32.load offset=@PT_H_X (local.get $a)))
  (local.set $z (f32.load offset=@PT_H_Z (local.get $a)))
  (f32.store offset=@PT_H_TEEX (local.get $a) (!madd (local.get $m) (local.get $tu) (local.get $x)))
  (f32.store offset=@PT_H_TEEZ (local.get $a) (f32.add (local.get $z) (local.get $tv)))
  (f32.store offset=@PT_H_CUPX (local.get $a) (!madd (local.get $m) (local.get $cu) (local.get $x)))
  (f32.store offset=@PT_H_CUPZ (local.get $a) (f32.add (local.get $z) (local.get $cv)))
  (i32.store offset=@PT_H_PAR (local.get $a) (local.get $par))
  (f32.store offset=@PT_H_LEN (local.get $a) (local.get $len))
  (f32.store offset=@PT_H_HW (local.get $a) (local.get $hw)))

;; The moving obstacle: kind at (u, v), its speed (or period), phase and sizes.
(func $pt_mover (param $a i32) (param $kind i32) (param $u f32) (param $v f32) (param $w i32) (param $ph i32) (param $ma f32) (param $mb f32) (param $mc i32)
  (i32.store offset=@PT_H_MK (local.get $a) (local.get $kind))
  (f32.store offset=@PT_H_MX (local.get $a) (!madd (f32.load offset=@PT_H_MIR (local.get $a)) (local.get $u) (f32.load offset=@PT_H_X (local.get $a))))
  (f32.store offset=@PT_H_MZ (local.get $a) (f32.add (f32.load offset=@PT_H_Z (local.get $a)) (local.get $v)))
  (i32.store offset=@PT_H_MW (local.get $a) (local.get $w))
  (i32.store offset=@PT_H_MP (local.get $a) (local.get $ph))
  (f32.store offset=@PT_H_MA (local.get $a) (local.get $ma))
  (f32.store offset=@PT_H_MB (local.get $a) (local.get $mb))
  (i32.store offset=@PT_H_MC (local.get $a) (local.get $mc)))

;; The six holes, each in its own frame: u across (-HW..HW), v from the near end.

;; A straight 10 m lane; halfway, a windmill's house across it with a door
;; 3.2 m wide that its blades shut as each comes down; a hump before it.
(func $pt_t_windmill (param $a i32) (param $r i32)
  (call $pt_box (local.get $a) (f32.const -5) (f32.const 0) (f32.const 5) (f32.const 46))
  (call $pt_wall (local.get $a) (f32.const -5) (f32.const 21.5) (f32.const @(-PT_WM_HD)) (f32.const 21.5))
  (call $pt_wall (local.get $a) (f32.const @PT_WM_HD) (f32.const 21.5) (f32.const 5) (f32.const 21.5))
  (call $pt_wall (local.get $a) (f32.const -5) (f32.const 24.5) (f32.const @(-PT_WM_HD)) (f32.const 24.5))
  (call $pt_wall (local.get $a) (f32.const @PT_WM_HD) (f32.const 24.5) (f32.const 5) (f32.const 24.5))
  (call $pt_wall (local.get $a) (f32.const @(-PT_WM_HD)) (f32.const 21.5) (f32.const @(-PT_WM_HD)) (f32.const 24.5))
  (call $pt_wall (local.get $a) (f32.const @PT_WM_HD) (f32.const 21.5) (f32.const @PT_WM_HD) (f32.const 24.5))
  (call $pt_mover (local.get $a) (i32.const @PT_MK_WINDMILL) (f32.const 0) (f32.const 21.5) (i32.const @PT_WM_W)
    (i32.and (local.get $r) (i32.const 16383)) (f32.const @PT_WM_HD) (f32.const 0) (i32.const @PT_WM_BL))
  (call $pt_slope (local.get $a) (i32.const @PT_F_HUMP) (f32.const 8) (f32.const 14) (f32.const 0.5))
  (call $pt_pin (local.get $a) (f32.const 0) (f32.const 5) (f32.const 1.5) (f32.const 40) (i32.const 3) (f32.const 46) (f32.const 5)))

;; An L: up an 8 m lane, then right along the top to the cup; the outer
;; corner cut by a bank to play off, a bumper post in the top lane.
(func $pt_t_dogleg (param $a i32) (param $r i32)
  (call $pt_wall (local.get $a) (f32.const -11) (f32.const 0) (f32.const -11) (f32.const 43))
  (call $pt_wall (local.get $a) (f32.const -11) (f32.const 43) (f32.const -4) (f32.const 50))
  (call $pt_wall (local.get $a) (f32.const -4) (f32.const 50) (f32.const 11) (f32.const 50))
  (call $pt_wall (local.get $a) (f32.const 11) (f32.const 50) (f32.const 11) (f32.const 38))
  (call $pt_wall (local.get $a) (f32.const 11) (f32.const 38) (f32.const -3) (f32.const 38))
  (call $pt_wall (local.get $a) (f32.const -3) (f32.const 38) (f32.const -3) (f32.const 0))
  (call $pt_wall (local.get $a) (f32.const -3) (f32.const 0) (f32.const -11) (f32.const 0))
  (call $pt_green (local.get $a) (f32.const -11) (f32.const 0) (f32.const -3) (f32.const 50))
  (call $pt_green (local.get $a) (f32.const -3) (f32.const 38) (f32.const 11) (f32.const 50))
  (call $pt_post (local.get $a) (f32.const 2) (f32.const 44) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_pin (local.get $a) (f32.const -7) (f32.const 5) (f32.const 7) (f32.const 44) (i32.const 3) (f32.const 50) (f32.const 11)))

;; A 14 m lane crossed by a sliding gate, its gap going side to side; then a
;; ramp up 1.2 m to a raised green with the cup.
(func $pt_t_gate (param $a i32) (param $r i32)
  (call $pt_box (local.get $a) (f32.const -7) (f32.const 0) (f32.const 7) (f32.const 54))
  (call $pt_mover (local.get $a) (i32.const @PT_MK_GATE) (f32.const 0) (f32.const 20) (i32.const @PT_GT_P)
    (i32.rem_u (local.get $r) (i32.const @PT_GT_P)) (f32.const @PT_GT_A) (f32.const @PT_GT_B) (i32.const 0))
  (call $pt_slope (local.get $a) (i32.const @PT_F_RAMP) (f32.const 33) (f32.const 35.4) (f32.const 1.2))
  (call $pt_pin (local.get $a) (f32.const 0) (f32.const 5) (f32.const 0) (f32.const 47) (i32.const 3) (f32.const 54) (f32.const 7)))

;; A 16 m lane over a hump, five bumper posts staggered before the cup.
(func $pt_t_bumpers (param $a i32) (param $r i32)
  (call $pt_box (local.get $a) (f32.const -8) (f32.const 0) (f32.const 8) (f32.const 48))
  (call $pt_post (local.get $a) (f32.const -4.5) (f32.const 16) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_post (local.get $a) (f32.const 4.5) (f32.const 16) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_post (local.get $a) (f32.const 0) (f32.const 23) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_post (local.get $a) (f32.const -3.5) (f32.const 30) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_post (local.get $a) (f32.const 3) (f32.const 31.5) (f32.const 0.9) (f32.const @PT_KICK))
  (call $pt_slope (local.get $a) (i32.const @PT_F_HUMP) (f32.const 7) (f32.const 13) (f32.const 0.6))
  (call $pt_pin (local.get $a) (f32.const 0) (f32.const 4) (f32.const 2.5) (f32.const 42) (i32.const 3) (f32.const 48) (f32.const 8)))

;; A 14 m lane with two baffles from either side, a dip between them.
(func $pt_t_zigzag (param $a i32) (param $r i32)
  (call $pt_box (local.get $a) (f32.const -7) (f32.const 0) (f32.const 7) (f32.const 56))
  (call $pt_wall (local.get $a) (f32.const -7) (f32.const 18) (f32.const 2.5) (f32.const 18))
  (call $pt_wall (local.get $a) (f32.const -2.5) (f32.const 36) (f32.const 7) (f32.const 36))
  (call $pt_slope (local.get $a) (i32.const @PT_F_HUMP) (f32.const 24) (f32.const 30) (f32.const -0.5))
  (call $pt_pin (local.get $a) (f32.const -3.5) (f32.const 5) (f32.const -3) (f32.const 50) (i32.const 3) (f32.const 56) (f32.const 7)))

;; A 14 m lane, a bar spinning flat round a post halfway, the cup at the
;; bottom of a bowl.
(func $pt_t_spinner (param $a i32) (param $r i32)
  (call $pt_box (local.get $a) (f32.const -7) (f32.const 0) (f32.const 7) (f32.const 50))
  (call $pt_mover (local.get $a) (i32.const @PT_MK_SPINNER) (f32.const 0) (f32.const 24)
    (select (i32.const @(-PT_SP_W)) (i32.const @PT_SP_W) (f32.lt (f32.load offset=@PT_H_MIR (local.get $a)) (f32.const 0)))
    (i32.and (local.get $r) (i32.const 16383)) (f32.const @PT_SP_ARM) (f32.const 0) (i32.const 0))
  (call $pt_post (local.get $a) (f32.const 0) (f32.const 24) (f32.const 0.7) (f32.const 0))
  (call $pt_slope (local.get $a) (i32.const @PT_F_HUMP) (f32.const 38) (f32.const 47) (f32.const -0.6))
  (call $pt_pin (local.get $a) (f32.const 0) (f32.const 5) (f32.const 0) (f32.const 42.5) (i32.const 2) (f32.const 50) (f32.const 7)))

;; The course: PT_NHMIN to PT_NHMAX holes from the seed, the six shuffled and
;; each mirrored or not, side by side round the stage's centre; the knobs:
;; scored, nobody back, no push, no drag, no hop, no bumps.
(func $pt_setup (param $n i32)
  (local $nh i32) (local $h i32) (local $k i32) (local $j i32) (local $perm i32) (local $a i32) (local $tpl i32) (local $r i32) (local $par i32)
  (local $x0 f32)
  (local.set $nh (i32.add (i32.const @PT_NHMIN) (i32.rem_u (call $p_seed (i32.const 0x9017)) (i32.const @(PT_NHMAX - PT_NHMIN + 1)))))
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_LEN) (i32.add (i32.const @PT_LEN0) (i32.mul (local.get $nh) (i32.const @PT_LENH))))
  (f32.store (i32.const @PG_SIZE) (f32.mul (f32.convert_i32_u (local.get $nh)) (f32.const @(PT_PITCH / 2))))
  (f32.store (i32.const @PG_ACC) (f32.const 0))
  (f32.store (i32.const @PG_DRAG) (f32.const 1))
  (f32.store (i32.const @PG_IDLE) (f32.const 1))
  (f32.store (i32.const @PG_HOP) (f32.const 0))
  (i32.store (i32.const @PG_RESPAWN) (i32.const 0x7fffffff))
  (i32.store (i32.const @PG_FLAGS) (i32.const 0))
  (local.set $x0 (f32.sub (f32.load (i32.const @PG_CX)) (f32.mul (f32.convert_i32_u (i32.sub (local.get $nh) (i32.const 1))) (f32.const @(PT_PITCH / 2)))))
  (i32.store (i32.const @(PG_H + PT_NH)) (local.get $nh))
  (f32.store (i32.const @(PG_H + PT_X0)) (local.get $x0))
  (f32.store (i32.const @(PG_H + PT_Z0)) (f32.sub (f32.load (i32.const @PG_CX)) (f32.const @PT_ZH)))
  ;; the six in a nibble each, shuffled (Fisher and Yates, from the back)
  (local.set $perm (i32.const 0x543210))
  (local.set $k (i32.const @(PT_NTPL - 1)))
  (block $done
    (loop $more
      (br_if $done (i32.eqz (local.get $k)))
      (local.set $j (i32.rem_u (call $p_seed (i32.add (i32.const 0x9020) (local.get $k))) (i32.add (local.get $k) (i32.const 1))))
      (local.set $a (i32.and (i32.shr_u (local.get $perm) (i32.shl (local.get $k) (i32.const 2))) (i32.const 15)))
      (local.set $tpl (i32.and (i32.shr_u (local.get $perm) (i32.shl (local.get $j) (i32.const 2))) (i32.const 15)))
      (local.set $perm (i32.and (local.get $perm) (i32.xor (i32.or (i32.shl (i32.const 15) (i32.shl (local.get $k) (i32.const 2)))
                                                                    (i32.shl (i32.const 15) (i32.shl (local.get $j) (i32.const 2))))
                                                           (i32.const -1))))
      (local.set $perm (i32.or (local.get $perm) (i32.or (i32.shl (local.get $tpl) (i32.shl (local.get $k) (i32.const 2)))
                                                         (i32.shl (local.get $a) (i32.shl (local.get $j) (i32.const 2))))))
      (local.set $k (i32.sub (local.get $k) (i32.const 1)))
      (br $more)))
  (!for $h (i32.const 0) (local.get $nh)
    (local.set $a (call $pt_rec (local.get $h)))
    (local.set $tpl (i32.and (i32.shr_u (local.get $perm) (i32.shl (local.get $h) (i32.const 2))) (i32.const 15)))
    (local.set $r (call $p_seed (i32.add (i32.const 0x9030) (local.get $h))))
    (i32.store offset=@PT_H_TPL (local.get $a) (local.get $tpl))
    (f32.store offset=@PT_H_MIR (local.get $a) (select (f32.const -1) (f32.const 1) (i32.and (local.get $r) (i32.const 0x10000))))
    (f32.store offset=@PT_H_X (local.get $a) (!madd (f32.convert_i32_u (local.get $h)) (f32.const @PT_PITCH) (local.get $x0)))
    (f32.store offset=@PT_H_Z (local.get $a) (f32.load (i32.const @(PG_H + PT_Z0))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_WINDMILL)) (then (call $pt_t_windmill (local.get $a) (local.get $r))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_DOGLEG)) (then (call $pt_t_dogleg (local.get $a) (local.get $r))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_GATE)) (then (call $pt_t_gate (local.get $a) (local.get $r))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_BUMPERS)) (then (call $pt_t_bumpers (local.get $a) (local.get $r))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_ZIGZAG)) (then (call $pt_t_zigzag (local.get $a) (local.get $r))))
    (if (i32.eq (local.get $tpl) (i32.const @PT_T_SPINNER)) (then (call $pt_t_spinner (local.get $a) (local.get $r))))
    (local.set $par (i32.add (local.get $par) (i32.load offset=@PT_H_PAR (local.get $a)))))
  (i32.store (i32.const @(PG_H + PT_PARS)) (local.get $par)))

;; Ball k's place on hole record a's tee: five across 1.3 m apart, three
;; deep 1.6 m apart (balls pass through each other, so more share them).
(func $pt_tee (param $a i32) (param $k i32) (result f32 f32)
  (local $c i32) (local $w i32)
  (local.set $c (i32.rem_u (local.get $k) (i32.const 15)))
  (local.set $w (i32.div_u (local.get $c) (i32.const 5)))
  (!madd (f32.convert_i32_s (i32.sub (i32.rem_u (local.get $c) (i32.const 5)) (i32.const 2))) (f32.const 1.3) (f32.load offset=@PT_H_TEEX (local.get $a)))
  (!madd (f32.convert_i32_u (local.get $w)) (f32.const -1.6) (f32.load offset=@PT_H_TEEZ (local.get $a))))

;; The lawn behind the first hole: PT_LCOLS across PT_LSTEP apart round its
;; middle, rows back from PT_LBACK behind its near end; everyone is on the
;; first tee PT_WALK into play.
(func $pt_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $a i32) (local $k i32)
  (local.set $a (call $pt_rec (i32.const 0)))
  (local.set $k (i32.and (local.get $i) (i32.const 255)))
  (!madd (f32.sub (f32.convert_i32_u (i32.rem_u (local.get $k) (i32.const @PT_LCOLS))) (f32.const @((PT_LCOLS - 1) / 2))) (f32.const @PT_LSTEP)
         (f32.load offset=@PT_H_X (local.get $a)))
  (f32.const @PLAT_Y)
  (!madd (f32.convert_i32_u (i32.div_u (local.get $k) (i32.const @PT_LCOLS))) (f32.const @(-PT_LSTEP))
         (f32.sub (f32.load offset=@PT_H_Z (local.get $a)) (f32.const @PT_LBACK))))

(func $pt_start)

;; A ball's start: the use counter as it stands (a press made before isn't a
;; click), and the score of every hole not finished.
(func $pt_init (param $pb i32) (param $d i32) (result i32)
  (local $m i32)
  (local.set $m (i32.or (i32.const @PT_M_BEGUN)
                        (i32.shl (i32.and (i32.shr_u (!at i32 @(PLAYERS + P_IN) (local.get $pb)) (i32.const 29)) (i32.const 3)) (i32.const @PT_M_CTR))))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb)
    (i32.shl (i32.sub (i32.const @PT_SMAX) (i32.mul (i32.load offset=@(PG_H + PT_NH) (local.get $d)) (i32.const @(PT_CAP + 1)))) (i32.const 10)))
  (local.get $m))

(func $pt_begin (param $p i32) (param $d i32)
  (drop (call $pt_init (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)) (local.get $d))))

;; ---- the course as a ball meets it (either bank)

;; The hole whose strip of x holds x.
(func $pt_hole_at (param $d i32) (param $x f32) (result i32)
  (local $k i32) (local $nh i32)
  (local.set $nh (i32.load offset=@(PG_H + PT_NH) (local.get $d)))
  (local.set $k (i32.trunc_sat_f32_s (f32.floor (f32.div (f32.add (f32.sub (local.get $x) (f32.load offset=@(PG_H + PT_X0) (local.get $d))) (f32.const @(PT_PITCH / 2)))
                                                         (f32.const @PT_PITCH)))))
  (if (i32.ge_s (local.get $k) (local.get $nh)) (then (local.set $k (i32.sub (local.get $nh) (i32.const 1)))))
  (if (i32.lt_s (local.get $k) (i32.const 0)) (then (local.set $k (i32.const 0))))
  (local.get $k))

;; Hole record a's green over the stage's floor at z, and its slope along z.
(func $pt_surf (param $a i32) (param $z f32) (result f32 f32)
  (local $i i32) (local $s i32) (local $kind i32) (local $z0 f32) (local $w f32) (local $hh f32) (local $u f32)
  (local $h f32) (local $g f32) (local $sn f32) (local $cs f32)
  (!for $i (i32.const 0) (i32.load offset=@PT_H_NFT (local.get $a))
    (local.set $s (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 4))))
    (local.set $kind (i32.load offset=@PT_H_FT (local.get $s)))
    (local.set $z0 (f32.load offset=@(PT_H_FT + 4) (local.get $s)))
    (local.set $w (f32.sub (f32.load offset=@(PT_H_FT + 8) (local.get $s)) (local.get $z0)))
    (local.set $hh (f32.load offset=@(PT_H_FT + 12) (local.get $s)))
    (local.set $u (f32.div (f32.sub (local.get $z) (local.get $z0)) (local.get $w)))
    (if (i32.eq (local.get $kind) (i32.const @PT_F_RAMP))
      (then
        (if (f32.ge (local.get $u) (f32.const 1))
          (then (local.set $h (f32.add (local.get $h) (local.get $hh))))
          (else
            (if (f32.gt (local.get $u) (f32.const 0))
              (then
                (local.set $h (!madd (local.get $hh) (local.get $u) (local.get $h)))
                (local.set $g (f32.add (local.get $g) (f32.div (local.get $hh) (local.get $w))))))))))
    (if (i32.and (i32.eq (local.get $kind) (i32.const @PT_F_HUMP))
                 (i32.and (f32.gt (local.get $u) (f32.const 0)) (f32.lt (local.get $u) (f32.const 1))))
      (then
        (call $sincos (i32.trunc_sat_f32_s (f32.mul (local.get $u) (f32.const 16384))))
        (local.set $cs) (local.set $sn)
        (local.set $h (!madd (f32.mul (local.get $hh) (f32.const 0.5)) (f32.sub (f32.const 1) (local.get $cs)) (local.get $h)))
        (local.set $g (!madd (f32.div (f32.mul (local.get $hh) (f32.const 3.1415927)) (local.get $w)) (local.get $sn) (local.get $g))))))
  (local.get $h)
  (local.get $g))

;; The green's top under (x, z), if it is no higher than y.
(func $pt_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (local $top f32) (local $g f32)
  (if (i32.eqz (i32.load offset=@(PG_H + PT_NH) (local.get $d))) (then (return (f32.const @PLAT_Y))))
  (call $pt_surf (call $pt_rec (call $pt_hole_at (local.get $d) (local.get $x))) (local.get $z))
  (local.set $g) (local.set $top)
  (local.set $top (f32.add (local.get $top) (f32.const @PLAT_Y)))
  (select (local.get $top) (f32.const -1000) (f32.le (local.get $top) (local.get $y))))

;; The ball (px, pz) going (vx, vz) against the line (ax, az)-(bx, bz) grown
;; by rad: out to touching on the side its centre is on, and its speed into
;; the line, against the line's own (moving at (ux, uz) and turning w rad/s
;; round (cx, cz)), reflected with e of it kept.
(func $pt_hit (param $px f32) (param $pz f32) (param $vx f32) (param $vz f32)
              (param $ax f32) (param $az f32) (param $bx f32) (param $bz f32) (param $rad f32) (param $e f32)
              (param $ux f32) (param $uz f32) (param $w f32) (param $cx f32) (param $cz f32)
              (result f32 f32 f32 f32)
  (local $ex f32) (local $ez f32) (local $t f32) (local $qx f32) (local $qz f32) (local $dx f32) (local $dz f32) (local $d2 f32) (local $d f32)
  (local $nx f32) (local $nz f32) (local $vn f32)
  (local.set $ex (f32.sub (local.get $bx) (local.get $ax)))
  (local.set $ez (f32.sub (local.get $bz) (local.get $az)))
  (local.set $t (f32.div (!madd (f32.sub (local.get $px) (local.get $ax)) (local.get $ex) (f32.mul (f32.sub (local.get $pz) (local.get $az)) (local.get $ez)))
                         (!madd (local.get $ex) (local.get $ex) (f32.mul (local.get $ez) (local.get $ez)))))
  (local.set $t (!clamp (local.get $t) (f32.const 0) (f32.const 1)))
  (local.set $qx (!madd (local.get $ex) (local.get $t) (local.get $ax)))
  (local.set $qz (!madd (local.get $ez) (local.get $t) (local.get $az)))
  (local.set $dx (f32.sub (local.get $px) (local.get $qx)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $qz)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.or (f32.ge (local.get $d2) (f32.mul (local.get $rad) (local.get $rad))) (f32.eq (local.get $d2) (f32.const 0)))
    (then (return (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz))))
  (local.set $d (f32.sqrt (local.get $d2)))
  (local.set $nx (f32.div (local.get $dx) (local.get $d)))
  (local.set $nz (f32.div (local.get $dz) (local.get $d)))
  ;; the line's own velocity where it touches
  (local.set $ux (f32.sub (local.get $ux) (f32.mul (local.get $w) (f32.sub (local.get $qz) (local.get $cz)))))
  (local.set $uz (!madd (local.get $w) (f32.sub (local.get $qx) (local.get $cx)) (local.get $uz)))
  (local.set $vn (!madd (f32.sub (local.get $vx) (local.get $ux)) (local.get $nx) (f32.mul (f32.sub (local.get $vz) (local.get $uz)) (local.get $nz))))
  (if (f32.lt (local.get $vn) (f32.const 0))
    (then
      (local.set $vn (f32.mul (local.get $vn) (f32.add (f32.const 1) (local.get $e))))
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $vn) (local.get $nx))))
      (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $vn) (local.get $nz))))))
  (!madd (local.get $nx) (local.get $rad) (local.get $qx))
  (!madd (local.get $nz) (local.get $rad) (local.get $qz))
  (local.get $vx)
  (local.get $vz))

;; Hole record a's moving obstacle on tick t into play, against the ball.
(func $pt_movers (param $a i32) (param $t i32) (param $px f32) (param $pz f32) (param $vx f32) (param $vz f32) (result f32 f32 f32 f32)
  (local $kind i32) (local $w i32) (local $ph i32) (local $tau i32) (local $bl i32)
  (local $mx f32) (local $mz f32) (local $ma f32) (local $mb f32) (local $g f32) (local $gv f32) (local $sn f32) (local $cs f32) (local $mir f32)
  (local.set $kind (i32.load offset=@PT_H_MK (local.get $a)))
  (if (i32.eqz (local.get $kind)) (then (return (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz))))
  (local.set $mx (f32.load offset=@PT_H_MX (local.get $a)))
  (local.set $mz (f32.load offset=@PT_H_MZ (local.get $a)))
  (local.set $w (i32.load offset=@PT_H_MW (local.get $a)))
  (local.set $ph (i32.load offset=@PT_H_MP (local.get $a)))
  (local.set $ma (f32.load offset=@PT_H_MA (local.get $a)))
  (if (i32.eq (local.get $kind) (i32.const @PT_MK_WINDMILL))
    (then
      ;; a blade within its half angle of straight down shuts the door
      (local.set $bl (i32.load offset=@PT_H_MC (local.get $a)))
      (if (i32.lt_u (i32.and (i32.add (i32.add (i32.mul (local.get $t) (local.get $w)) (local.get $ph)) (local.get $bl)) (i32.const 4095))
                    (i32.shl (local.get $bl) (i32.const 1)))
        (then
          (return (call $pt_hit (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
                    (f32.sub (local.get $mx) (local.get $ma)) (local.get $mz) (f32.add (local.get $mx) (local.get $ma)) (local.get $mz)
                    (f32.const @PT_RW) (f32.const @PT_ME) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0)))))
      (return (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz))))
  (if (i32.eq (local.get $kind) (i32.const @PT_MK_GATE))
    (then
      ;; the gap's middle: a triangle wave ma either way over w ticks
      (local.set $mb (f32.load offset=@PT_H_MB (local.get $a)))
      (local.set $mir (f32.load offset=@PT_H_MIR (local.get $a)))
      (local.set $tau (i32.rem_u (i32.add (local.get $t) (local.get $ph)) (local.get $w)))
      (local.set $g (f32.div (f32.mul (f32.convert_i32_u (local.get $tau)) (f32.const 4)) (f32.convert_i32_u (local.get $w))))
      (local.set $gv (f32.mul (f32.div (f32.mul (local.get $ma) (f32.const 500)) (f32.convert_i32_u (local.get $w))) (local.get $mir)))
      (if (i32.lt_u (i32.shl (local.get $tau) (i32.const 1)) (local.get $w))
        (then (local.set $g (f32.sub (local.get $g) (f32.const 1))))
        (else
          (local.set $g (f32.sub (f32.const 3) (local.get $g)))
          (local.set $gv (f32.neg (local.get $gv)))))
      (local.set $g (!madd (f32.mul (local.get $g) (local.get $ma)) (local.get $mir) (local.get $mx)))
      (call $pt_hit (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
        (f32.sub (f32.sub (local.get $mx) (f32.add (local.get $ma) (local.get $mb))) (f32.const 1)) (local.get $mz) (f32.sub (local.get $g) (local.get $mb)) (local.get $mz)
        (f32.const @PT_RW) (f32.const @PT_ME) (local.get $gv) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0))
      (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
      (return (call $pt_hit (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
        (f32.add (local.get $g) (local.get $mb)) (local.get $mz) (f32.add (f32.add (local.get $mx) (f32.add (local.get $ma) (local.get $mb))) (f32.const 1)) (local.get $mz)
        (f32.const @PT_RW) (f32.const @PT_ME) (local.get $gv) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0)))))
  ;; the spinning bar, ma each side of its pivot
  (call $sincos (i32.add (i32.mul (local.get $t) (local.get $w)) (local.get $ph)))
  (local.set $cs) (local.set $sn)
  (call $pt_hit (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
    (f32.sub (local.get $mx) (f32.mul (local.get $ma) (local.get $cs))) (f32.sub (local.get $mz) (f32.mul (local.get $ma) (local.get $sn)))
    (!madd (local.get $ma) (local.get $cs) (local.get $mx)) (!madd (local.get $ma) (local.get $sn) (local.get $mz))
    (f32.const @PT_RW) (f32.const @PT_ME) (f32.const 0) (f32.const 0)
    (f32.mul (f32.convert_i32_s (local.get $w)) (f32.const @PT_RADT)) (local.get $mx) (local.get $mz)))

;; A bumper post at (cx, cz) reaching rad, against the ball: out to touching,
;; its speed in given back PT_PE and kick on top.
(func $pt_bump (param $px f32) (param $pz f32) (param $vx f32) (param $vz f32) (param $cx f32) (param $cz f32) (param $rad f32) (param $kick f32)
               (result f32 f32 f32 f32)
  (local $dx f32) (local $dz f32) (local $d2 f32) (local $d f32) (local $nx f32) (local $nz f32) (local $vn f32)
  (local.set $dx (f32.sub (local.get $px) (local.get $cx)))
  (local.set $dz (f32.sub (local.get $pz) (local.get $cz)))
  (local.set $d2 (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))))
  (if (i32.or (f32.ge (local.get $d2) (f32.mul (local.get $rad) (local.get $rad))) (f32.eq (local.get $d2) (f32.const 0)))
    (then (return (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz))))
  (local.set $d (f32.sqrt (local.get $d2)))
  (local.set $nx (f32.div (local.get $dx) (local.get $d)))
  (local.set $nz (f32.div (local.get $dz) (local.get $d)))
  (local.set $vn (!madd (local.get $vx) (local.get $nx) (f32.mul (local.get $vz) (local.get $nz))))
  (if (f32.lt (local.get $vn) (f32.const 0))
    (then
      (local.set $vn (f32.sub (f32.mul (local.get $vn) (f32.const @(1 + PT_PE))) (local.get $kick)))
      (local.set $vx (f32.sub (local.get $vx) (f32.mul (local.get $vn) (local.get $nx))))
      (local.set $vz (f32.sub (local.get $vz) (f32.mul (local.get $vn) (local.get $nz))))))
  (!madd (local.get $nx) (local.get $rad) (local.get $cx))
  (!madd (local.get $nz) (local.get $rad) (local.get $cz))
  (local.get $vx)
  (local.get $vz))

;; ---- a ball's own game, on bank d

;; A hole done with s strokes (PT_CAP + 1 picked up): the total, the next
;; hole, the score, the pause; its FX on the confirmed world.
(func $pt_done (param $p i32) (param $d i32) (param $m i32) (param $s i32) (param $kind i32) (param $x f32) (param $y f32) (param $z f32) (result i32)
  (local $pb i32) (local $hole i32) (local $total i32) (local $tb i32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $hole (i32.and (local.get $m) (i32.const 7)))
  (local.set $total (i32.add (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_TOTAL)) (i32.const 63)) (local.get $s)))
  (local.set $m (i32.or (i32.or (i32.and (local.get $m) (i32.const @(PT_M_BEGUN | (3 << PT_M_CTR))))
                                (i32.add (local.get $hole) (i32.const 1)))
                        (i32.or (i32.or (i32.shl (local.get $s) (i32.const @PT_M_STROKE)) (i32.shl (local.get $total) (i32.const @PT_M_TOTAL)))
                                (i32.const @(PT_SINKT << PT_M_PAUSE)))))
  (local.set $tb (i32.shr_u (call $p_t (local.get $d)) (i32.const 5)))
  (if (i32.gt_u (local.get $tb) (i32.const 1023)) (then (local.set $tb (i32.const 1023))))
  (!put u16 @(PLAYERS + PG_SCORE) (local.get $pb)
    (i32.or (i32.shl (i32.sub (i32.sub (i32.const @PT_SMAX) (local.get $total))
                              (i32.mul (i32.sub (i32.load offset=@(PG_H + PT_NH) (local.get $d)) (i32.add (local.get $hole) (i32.const 1))) (i32.const @(PT_CAP + 1))))
                     (i32.const 10))
            (i32.sub (i32.const 1023) (local.get $tb))))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (if (i32.eqz (local.get $d))
    (then (call $fx (i32.const 0) (local.get $kind) (local.get $p) (local.get $s) (local.get $x) (local.get $y) (local.get $z) (f32.convert_i32_u (local.get $hole)))))
  (local.get $m))

;; The pause after a hole: sinking into the cup (picked up, still where it
;; lies), then on the next tee, or home.
(func $pt_pause (param $p i32) (param $d i32) (param $m i32)
  (local $pb i32) (local $pause i32) (local $hole i32) (local $a i32) (local $fl i32) (local $x f32) (local $z f32) (local $h f32) (local $g f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $pause (i32.sub (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_PAUSE)) (i32.const 127)) (i32.const 1)))
  (local.set $m (i32.or (i32.and (local.get $m) (i32.const @(~(127 << PT_M_PAUSE)))) (i32.shl (local.get $pause) (i32.const @PT_M_PAUSE))))
  (local.set $hole (i32.and (local.get $m) (i32.const 7)))
  (local.set $fl (i32.or (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_FALL))) (i32.const @PF_GROUND)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (if (local.get $pause)
    (then
      (if (i32.ne (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_STROKE)) (i32.const 7)) (i32.const @(PT_CAP + 1)))
        (then
          ;; down the cup
          (local.set $a (call $pt_rec (i32.sub (local.get $hole) (i32.const 1))))
          (local.set $z (f32.load offset=@PT_H_CUPZ (local.get $a)))
          (call $pt_surf (local.get $a) (local.get $z))
          (local.set $g) (local.set $h)
          (!put f32 @(PLAYERS + P_PX) (local.get $pb) (f32.load offset=@PT_H_CUPX (local.get $a)))
          (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $z))
          (!put f32 @(PLAYERS + P_PY) (local.get $pb)
            (f32.sub (f32.add (local.get $h) (f32.const @PLAT_Y))
                     (f32.mul (f32.convert_i32_u (i32.sub (i32.const @PT_SINKT) (local.get $pause))) (f32.const @PT_SINKDY))))))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  (if (i32.lt_u (local.get $hole) (i32.load offset=@(PG_H + PT_NH) (local.get $d)))
    (then
      ;; the next tee, its strokes 0
      (local.set $a (call $pt_rec (local.get $hole)))
      (call $pt_tee (local.get $a) (local.get $p))
      (local.set $z) (local.set $x)
      (call $pt_surf (local.get $a) (local.get $z))
      (local.set $g) (local.set $h)
      (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $x))
      (!put f32 @(PLAYERS + P_PY) (local.get $pb) (f32.add (local.get $h) (f32.const @PLAT_Y)))
      (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $z))
      (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const 0))
      (local.set $m (i32.and (local.get $m) (i32.const @(~(7 << PT_M_STROKE)))))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  ;; home: out of play for good, watching the rest
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (local.get $fl) (i32.const @PF_DEAD)))
  (!put i32 @(PLAYERS + B_OUTAT) (local.get $pb) (i32.load offset=@HDR_TICK (local.get $d)))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
  (if (i32.eqz (local.get $d))
    (then
      (call $fx (i32.const 0) (i32.const @PT_FX_HOME) (local.get $p) (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_TOTAL)) (i32.const 63))
        (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
        (f32.convert_i32_u (local.get $hole))))))

;; Ball p after its roll: the pause after a hole; else on its hole the green
;; under it (keeping to it, its slope, the friction), the obstacle, the
;; posts and the walls, then the cup; at rest, picked up at PT_CAP, or the
;; word: Space held (or a click) charges, let go (or a second click) putts.
(func $pt_push (param $p i32) (param $d i32)
  (local $pb i32) (local $m i32) (local $nh i32) (local $hole i32) (local $a i32) (local $t i32) (local $fl i32) (local $in i32)
  (local $ctr i32) (local $click i32) (local $jump i32) (local $ch i32) (local $i i32) (local $s i32) (local $n i32) (local $st i32)
  (local $px f32) (local $py f32) (local $pz f32) (local $vx f32) (local $vy f32) (local $vz f32)
  (local $h f32) (local $g f32) (local $sp2 f32) (local $sp f32) (local $k f32) (local $dx f32) (local $dz f32) (local $sn f32) (local $cs f32)
  (local.set $pb (i32.add (i32.shl (local.get $p) (i32.const 6)) (local.get $d)))
  (local.set $m (!at i32 @(PLAYERS + PG_M) (local.get $pb)))
  (if (i32.eqz (i32.and (local.get $m) (i32.const @PT_M_BEGUN)))
    (then (local.set $m (call $pt_init (local.get $pb) (local.get $d)))))
  ;; the use counter: a click is a change in it (seen only at rest, below)
  (local.set $in (!at i32 @(PLAYERS + P_IN) (local.get $pb)))
  (local.set $ctr (i32.and (i32.shr_u (local.get $in) (i32.const 29)) (i32.const 3)))
  (local.set $click (i32.ne (local.get $ctr) (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_CTR)) (i32.const 3))))
  (local.set $m (i32.or (i32.and (local.get $m) (i32.const @(~(3 << PT_M_CTR)))) (i32.shl (local.get $ctr) (i32.const @PT_M_CTR))))
  (if (i32.and (local.get $m) (i32.const @(127 << PT_M_PAUSE)))
    (then (call $pt_pause (local.get $p) (local.get $d) (local.get $m)) (return)))
  (local.set $nh (i32.load offset=@(PG_H + PT_NH) (local.get $d)))
  (local.set $hole (i32.and (local.get $m) (i32.const 7)))
  (if (i32.ge_u (local.get $hole) (local.get $nh))
    (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)) (return)))
  (local.set $a (call $pt_rec (local.get $hole)))
  (local.set $t (call $p_t (local.get $d)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (local.get $pb)))
  (local.set $px (!at f32 @(PLAYERS + P_PX) (local.get $pb)))
  (local.set $py (!at f32 @(PLAYERS + P_PY) (local.get $pb)))
  (local.set $pz (!at f32 @(PLAYERS + P_PZ) (local.get $pb)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vy (!at f32 @(PLAYERS + P_VY) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  ;; off its hole (on the lawn as play starts, or somehow past the walls): PT_WALK into play, on its tee
  (if (i32.or (f32.gt (f32.abs (f32.sub (local.get $px) (f32.load offset=@PT_H_X (local.get $a)))) (f32.const @(PT_PITCH / 2)))
              (i32.or (f32.lt (local.get $pz) (f32.sub (f32.load offset=@PT_H_Z (local.get $a)) (f32.const 2)))
                      (f32.gt (local.get $pz) (f32.add (f32.add (f32.load offset=@PT_H_Z (local.get $a)) (f32.load offset=@PT_H_LEN (local.get $a))) (f32.const 2)))))
    (then
      (if (i32.lt_s (local.get $t) (i32.const @PT_WALK))
        (then (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)) (return)))
      (call $pt_tee (local.get $a) (local.get $p))
      (local.set $pz) (local.set $px)
      (local.set $py (f32.const @PLAT_Y))
      (local.set $vx (f32.const 0))
      (local.set $vy (f32.const 0))
      (local.set $vz (f32.const 0))))
  ;; the green: a ball just over it keeps to it; on it, its slope pulls and the friction slows
  (call $pt_surf (local.get $a) (local.get $pz))
  (local.set $g) (local.set $h)
  (local.set $h (f32.add (local.get $h) (f32.const @PLAT_Y)))
  (if (i32.and (f32.lt (f32.sub (local.get $py) (local.get $h)) (f32.const @PT_HUG)) (f32.le (local.get $vy) (f32.const 0)))
    (then
      (local.set $py (local.get $h))
      (local.set $vy (f32.const 0))
      (local.set $fl (i32.or (i32.and (local.get $fl) (i32.const @(255 ^ PF_FALL))) (i32.const @PF_GROUND)))))
  (if (i32.and (local.get $fl) (i32.const @PF_GROUND))
    (then
      (local.set $vz (!madd (f32.const @(-PT_SLOPEG_DT)) (local.get $g) (local.get $vz)))
      (local.set $sp2 (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz))))
      (if (i32.and (f32.le (local.get $sp2) (f32.const @(PT_FRIC_DT * PT_FRIC_DT))) (f32.le (f32.abs (local.get $g)) (f32.const @PT_GSTILL)))
        (then
          (local.set $vx (f32.const 0))
          (local.set $vz (f32.const 0)))
        (else
          (if (f32.gt (local.get $sp2) (f32.const 0))
            (then
              (local.set $sp (f32.sqrt (local.get $sp2)))
              (local.set $k (f32.div (f32.max (f32.sub (local.get $sp) (f32.const @PT_FRIC_DT)) (f32.const 0)) (local.get $sp)))
              (local.set $vx (f32.mul (local.get $vx) (local.get $k)))
              (local.set $vz (f32.mul (local.get $vz) (local.get $k)))))))))
  ;; rolled out: PT_ROLLMAX after the putt, still
  (if (i32.eqz (!at u16 @(PLAYERS + P_REFIRE) (local.get $pb)))
    (then
      (local.set $vx (f32.const 0))
      (local.set $vz (f32.const 0))))
  ;; the obstacle, then the posts, then the walls (twice, for the corners): the walls have the last word
  (call $pt_movers (local.get $a) (local.get $t) (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz))
  (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)
  (local.set $n (i32.load offset=@PT_H_NPOST (local.get $a)))
  (!for $i (i32.const 0) (local.get $n)
    (local.set $s (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 4))))
    (call $pt_bump (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
      (f32.load offset=@PT_H_POST (local.get $s)) (f32.load offset=@(PT_H_POST + 4) (local.get $s))
      (f32.load offset=@(PT_H_POST + 8) (local.get $s)) (f32.load offset=@(PT_H_POST + 12) (local.get $s)))
    (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px))
  (local.set $n (i32.load offset=@PT_H_NSEG (local.get $a)))
  (!for $st (i32.const 0) (i32.const 2)
    (!for $i (i32.const 0) (local.get $n)
      (local.set $s (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 4))))
      (call $pt_hit (local.get $px) (local.get $pz) (local.get $vx) (local.get $vz)
        (f32.load offset=@PT_H_SEG (local.get $s)) (f32.load offset=@(PT_H_SEG + 4) (local.get $s))
        (f32.load offset=@(PT_H_SEG + 8) (local.get $s)) (f32.load offset=@(PT_H_SEG + 12) (local.get $s))
        (f32.const @PT_RW) (f32.const @PT_E) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0) (f32.const 0))
      (local.set $vz) (local.set $vx) (local.set $pz) (local.set $px)))
  (!chk (local.get $px) 480 (local.get $p))
  (!chk (local.get $pz) 481 (local.get $p))
  (!chk (local.get $vx) 482 (local.get $p))
  (!chk (local.get $vz) 483 (local.get $p))
  (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $px))
  (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $py))
  (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $pz))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (local.get $vx))
  (!put f32 @(PLAYERS + P_VY) (local.get $pb) (local.get $vy))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (local.get $vz))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (local.get $fl))
  ;; the cup: slow enough over it, holed
  (local.set $dx (f32.sub (local.get $px) (f32.load offset=@PT_H_CUPX (local.get $a))))
  (local.set $dz (f32.sub (local.get $pz) (f32.load offset=@PT_H_CUPZ (local.get $a))))
  (local.set $sp2 (!madd (local.get $vx) (local.get $vx) (f32.mul (local.get $vz) (local.get $vz))))
  (if (i32.and (f32.lt (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(PT_CUPR * PT_CUPR)))
               (f32.lt (local.get $sp2) (f32.const @(PT_SINKV * PT_SINKV))))
    (then
      (local.set $m (call $pt_done (local.get $p) (local.get $d) (local.get $m)
                      (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_STROKE)) (i32.const 7)) (i32.const @PT_FX_SINK)
                      (f32.load offset=@PT_H_CUPX (local.get $a)) (local.get $h) (f32.load offset=@PT_H_CUPZ (local.get $a))))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  ;; rolling: no charge
  (if (i32.or (f32.gt (local.get $sp2) (f32.const 0)) (i32.eqz (i32.and (local.get $fl) (i32.const @PF_GROUND))))
    (then
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (i32.and (local.get $m) (i32.const @(~(PT_M_CHG | PT_M_ARMED | (255 << PT_M_CH))))))
      (return)))
  ;; at rest after PT_CAP strokes: picked up
  (if (i32.ge_u (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_STROKE)) (i32.const 7)) (i32.const @PT_CAP))
    (then
      (local.set $m (call $pt_done (local.get $p) (local.get $d) (local.get $m) (i32.const @(PT_CAP + 1)) (i32.const @PT_FX_PICK)
                      (local.get $px) (local.get $py) (local.get $pz)))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  ;; at rest: the word
  (local.set $jump (i32.and (i32.shr_u (local.get $in) (i32.const 28)) (i32.const 1)))
  (local.set $ch (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_CH)) (i32.const 255)))
  (if (i32.eqz (i32.and (local.get $m) (i32.const @PT_M_CHG)))
    (then
      (if (i32.or (local.get $jump) (local.get $click))
        (then
          (local.set $m (i32.or (i32.and (local.get $m) (i32.const @(~(PT_M_ARMED | (255 << PT_M_CH)))))
                                (i32.or (i32.const @(PT_M_CHG | (1 << PT_M_CH)))
                                        (select (i32.const @PT_M_ARMED) (i32.const 0) (local.get $click)))))))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  (if (i32.or (local.get $click) (i32.and (i32.eqz (i32.and (local.get $m) (i32.const @PT_M_ARMED))) (i32.eqz (local.get $jump))))
    (then
      ;; let go: the putt, the way the word looks (under PT_CHMIN, nothing)
      (local.set $m (i32.and (local.get $m) (i32.const @(~(PT_M_CHG | PT_M_ARMED | (255 << PT_M_CH))))))
      (if (i32.ge_u (local.get $ch) (i32.const @PT_CHMIN))
        (then
          (call $sincos (local.get $in))
          (local.set $cs) (local.set $sn)
          (local.set $sp (f32.mul (f32.convert_i32_u (local.get $ch)) (f32.const @PT_VK)))
          (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.mul (local.get $cs) (local.get $sp)))
          (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.mul (local.get $sn) (local.get $sp)))
          (!put u16 @(PLAYERS + P_REFIRE) (local.get $pb) (i32.const @PT_ROLLMAX))
          (local.set $m (i32.add (local.get $m) (i32.const @(1 << PT_M_STROKE))))
          (if (i32.eqz (local.get $d))
            (then
              (call $fx (i32.const 0) (i32.const @PT_FX_PUTT) (local.get $p) (i32.and (i32.shr_u (local.get $m) (i32.const @PT_M_STROKE)) (i32.const 7))
                (local.get $px) (local.get $py) (local.get $pz) (local.get $sp))))))
      (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m))
      (return)))
  ;; held: a tick more of charge, to PT_CH
  (if (i32.lt_u (local.get $ch) (i32.const @PT_CH))
    (then (local.set $m (i32.add (local.get $m) (i32.const @(1 << PT_M_CH))))))
  (!put i32 @(PLAYERS + PG_M) (local.get $pb) (local.get $m)))

;; Once half the balls in are home, the rest have PT_LATE.
(func $pt_tick
  (local $p i32) (local $fl i32) (local $n i32) (local $home i32) (local $end i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))))
    (if (i32.and (local.get $fl) (i32.const @PF_LIVE))
      (then
        (!inc $n)
        (if (i32.and (local.get $fl) (i32.const @PF_DEAD)) (then (!inc $home))))))
  (if (i32.and (i32.ne (local.get $home) (i32.const 0)) (i32.ge_u (i32.shl (local.get $home) (i32.const 1)) (local.get $n)))
    (then
      (local.set $end (i32.add (i32.load (i32.const @HDR_TICK)) (i32.const @PT_LATE)))
      (if (i32.gt_u (i32.load (i32.const @HDR_UNTIL)) (local.get $end))
        (then (i32.store (i32.const @HDR_UNTIL) (local.get $end)))))))

;; Over once everyone in is home.
(func $pt_over (result i32) (i32.eqz (i32.load (i32.const @BH_LEFT))))
(func $pt_out (param $p i32))
