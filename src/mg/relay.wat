;; RELAY RACE: fixed floor; only confirmed tick changes baton ownership,
;; checkpoints and scores. Prediction's movement reads no changing race state.
(func $rr_setup (param $n i32)
  (i32.store (i32.const @PG_KIND) (i32.const @PK_SCORE))
  (i32.store (i32.const @PG_FLAGS) (i32.const @PGF_TEAMS))
  (i32.store (i32.const @PG_LEN) (i32.const @RR_LEN))
  (i32.store (i32.const @PG_RESPAWN) (i32.const @RR_RESPAWN))
  (f32.store (i32.const @PG_SIZE) (f32.const @RR_HX))
  (f32.store (i32.const @PG_IDLE) (f32.const 0.95))
  (i32.store (i32.const @(PG_H + RR_RUNNER)) (i32.const @NPLAYER))
  (i32.store (i32.const @(PG_H + RR_RUNNER + 4)) (i32.const @NPLAYER)))

(func $rr_z (param $s i32) (result f32)
  (f32.add (f32.load (i32.const @PG_CX)) (select (f32.const @RR_Z) (f32.const @(-RR_Z)) (local.get $s))))

(func $rr_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (local $k i32)
  (local.set $k (i32.rem_u (i32.load (i32.const @PG_TK)) (i32.const 128)))
  (f32.sub (f32.load (i32.const @PG_CX))
    (!madd (f32.convert_i32_u (i32.div_u (local.get $k) (i32.const 8))) (f32.const 2.5) (f32.const @(RR_X + 5))))
  (f32.const @PLAT_Y)
  (!madd (f32.convert_i32_u (i32.rem_u (local.get $k) (i32.const 8))) (f32.const 2.5)
    (f32.sub (call $rr_z (i32.load (i32.const @PG_TSIDE))) (f32.const 8.75))))

(func $rr_in (param $p i32) (param $s i32) (result i32)
  (local $pb i32)
  (if (i32.ge_u (local.get $p) (i32.const @NPLAYER)) (then (return (i32.const 0))))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (i32.and (call $p_in (local.get $pb)) (i32.eq (call $p_side (local.get $pb)) (local.get $s))))

;; Next live teammate in cyclic slot order. A lone runner carries again.
(func $rr_next (param $p i32) (param $s i32) (result i32)
  (local $k i32) (local $q i32)
  (!for $k (i32.const 1) (i32.const @(NPLAYER + 1))
    (local.set $q (i32.rem_u (i32.add (local.get $p) (local.get $k)) (i32.const @NPLAYER)))
    (if (call $rr_in (local.get $q) (local.get $s)) (then (return (local.get $q)))))
  (i32.const @NPLAYER))

(func $rr_start
  (local $s i32) (local $a i32) (local $p i32)
  (!for $s (i32.const 0) (i32.const 2)
    (local.set $a (i32.shl (local.get $s) (i32.const 2)))
    (local.set $p (call $rr_next (i32.const @(NPLAYER - 1)) (local.get $s)))
    (i32.store offset=@(PG_H + RR_RUNNER) (local.get $a) (local.get $p))
    (i32.store offset=@(PG_H + RR_NEXT) (local.get $a) (call $rr_next (local.get $p) (local.get $s)))))
(func $rr_begin (param $p i32) (param $d i32))
(func $rr_push (param $p i32) (param $d i32))
(func $rr_out (param $p i32))

(func $rr_ground (param $d i32) (param $x f32) (param $y f32) (param $z f32) (result f32)
  (if (result f32)
    (i32.and (f32.ge (local.get $y) (f32.const @PLAT_Y))
      (i32.and (f32.le (f32.abs (f32.sub (local.get $x) (f32.load offset=@PG_CX (local.get $d)))) (f32.const @RR_HX))
               (f32.le (f32.abs (f32.sub (local.get $z) (f32.load offset=@PG_CX (local.get $d)))) (f32.const @RR_HZ))))
    (then (f32.const @PLAT_Y)) (else (f32.const -1000))))

;; A gate counts only with feet on the floor, within its painted circle.
(func $rr_at (param $p i32) (param $s i32) (param $c i32) (result i32)
  (local $pb i32) (local $dx f32) (local $dz f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (if (i32.eqz (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_GROUND))) (then (return (i32.const 0))))
  (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb))
    (f32.add (f32.load (i32.const @PG_CX))
      (select (f32.const @RR_X) (f32.const @(-RR_X)) (i32.or (i32.eq (local.get $c) (i32.const 1)) (i32.eq (local.get $c) (i32.const 2)))))))
  (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
    (f32.add (call $rr_z (local.get $s))
      (select (f32.const @RR_WIDTH) (f32.const @(-RR_WIDTH)) (i32.or (i32.eq (local.get $c) (i32.const 2)) (i32.eq (local.get $c) (i32.const 3)))))))
  (f32.le (!madd (local.get $dx) (local.get $dx) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(RR_GATE * RR_GATE))))

(func $rr_tick
  (local $s i32) (local $a i32) (local $p i32) (local $q i32) (local $c i32)
  (!for $s (i32.const 0) (i32.const 2)
    (local.set $a (i32.shl (local.get $s) (i32.const 2)))
    (local.set $p (i32.load offset=@(PG_H + RR_RUNNER) (local.get $a)))
    ;; A fall or disconnect forfeits only the unfinished leg. A replacement
    ;; must collect the baton at home before any course gate counts.
    (if (i32.eqz (call $rr_in (local.get $p) (local.get $s))) (then
      (local.set $p (call $rr_next (local.get $p) (local.get $s)))
      (i32.store offset=@(PG_H + RR_RUNNER) (local.get $a) (local.get $p))
      (i32.store offset=@(PG_H + RR_CHECK) (local.get $a) (i32.const 0))))
    (local.set $q (call $rr_next (local.get $p) (local.get $s)))
    (i32.store offset=@(PG_H + RR_NEXT) (local.get $a) (local.get $q))
    (if (i32.lt_u (local.get $p) (i32.const @NPLAYER)) (then
      (local.set $c (i32.load offset=@(PG_H + RR_CHECK) (local.get $a)))
      (if (call $rr_at (local.get $p) (local.get $s) (local.get $c)) (then
        (if (i32.lt_u (local.get $c) (i32.const 4))
          (then (i32.store offset=@(PG_H + RR_CHECK) (local.get $a) (i32.add (local.get $c) (i32.const 1))))
          (else
            (if (call $rr_at (local.get $q) (local.get $s) (i32.const 0)) (then
              (call $p_tadd (local.get $s) (i32.const 1))
              (!put u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $p) (i32.const 6))
                (i32.add (!at u16 @(PLAYERS + PG_SCORE) (i32.shl (local.get $p) (i32.const 6))) (i32.const 1)))
              (i32.store offset=@(PG_H + RR_RUNNER) (local.get $a) (local.get $q))
              (i32.store offset=@(PG_H + RR_NEXT) (local.get $a) (call $rr_next (local.get $q) (local.get $s)))
              (i32.store offset=@(PG_H + RR_CHECK) (local.get $a) (i32.const 1)))))))))))
  ;; Both sides advance before over is checked: same-tick finishes draw.
)
(func $rr_over (result i32)
  (i32.or (i32.ge_u (i32.load (i32.const @PG_TSCORE)) (i32.const @RR_LEGS))
          (i32.ge_u (i32.load (i32.const @(PG_TSCORE + 4))) (i32.const @RR_LEGS))))
