;; OBBY (M_OBBY, prefix oy; constants in src/am/obby.mjs): an obstacle course
;; on the map's parts, everyone for itself, no sides, no guns. The parts that
;; move a body or kill it are the map's in every mode ($move, $arena); this
;; reads the two that are the mode's own, on the confirmed world: a
;; checkpoint (PK_CHECK, its stage in the row) and the finish (PK_FINISH). A
;; fighter's stage is MR_POINTS, its finishing time OY_MR_DONE; the spawn hook
;; puts it back on its stage's checkpoint; nothing hurts anyone (the hurt
;; hook), and what a kill brick or the void does is $a_kill's own.

;; Play begins: the course's last stage, the highest any checkpoint has, and
;; everyone in the room put back at the start, wherever the countdown took
;; them, so the run is timed from one line.
(func $oy_start
  (local $k i32) (local $w i32) (local $n i32) (local $p i32)
  (!for $k (i32.const 0) (i32.load (i32.const @MAP_NPART))
    (local.set $w (i32.load offset=@(MAP_PART + PT_KIND) (i32.mul (local.get $k) (i32.const @PART_SIZE))))
    (if (i32.and (i32.eq (i32.and (local.get $w) (i32.const 255)) (i32.const @PK_CHECK)) (i32.gt_u (i32.shr_u (local.get $w) (i32.const 8)) (local.get $n)))
      (then (local.set $n (i32.shr_u (local.get $w) (i32.const 8))))))
  (i32.store (i32.const @(AO + OY_STAGES)) (local.get $n))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @PF_LIVE))
      (then (call $a_spawn (local.get $p))))))

;; Every tick of play, each fighter up and still running, in slot order: a
;; checkpoint it touches whose stage is past its own is its stage now; the
;; finish ends its run, timed from the start of play, and the first to get
;; there cuts the clock to OY_AFTER. The leader by $oy_key. Over when
;; everyone in the room has finished (and someone has).
(func $oy_tick (result i32)
  (local $p i32) (local $pb i32) (local $r i32) (local $t i32) (local $pt i32) (local $n i32)
  (local $key i32) (local $best i32) (local $lead i32) (local $running i32)
  (local.set $t (i32.load (i32.const @HDR_TICK)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
    (if (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_LIVE))
      (then
        (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $p) (i32.const 3))))
        (if (i32.eqz (i32.load16_u offset=@OY_MR_DONE (local.get $r)))
          (then
            (!inc $running)
            (if (call $a_alive (local.get $p))
              (then
                (local.set $pt (call $a_part (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                                             (i32.const @(1 << PK_CHECK)) (i32.const 0) (local.get $t)))
                (if (local.get $pt)
                  (then
                    (local.set $n (i32.shr_u (i32.load offset=@PT_KIND (local.get $pt)) (i32.const 8)))
                    (if (i32.gt_u (local.get $n) (i32.load16_u offset=@MR_POINTS (local.get $r)))
                      (then
                        (i32.store16 offset=@MR_POINTS (local.get $r) (local.get $n))
                        (call $a_news (i32.const @OY_MX_STAGE) (local.get $p) (local.get $n))))))
                (if (call $a_part (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                                  (i32.const @(1 << PK_FINISH)) (i32.const 0) (local.get $t))
                  (then
                    (local.set $n (call $a_played))
                    (i32.store16 offset=@OY_MR_DONE (local.get $r)
                                 (select (i32.const 1) (select (local.get $n) (i32.const 65535) (i32.lt_u (local.get $n) (i32.const 65535))) (i32.eqz (local.get $n))))
                    (local.set $n (i32.add (i32.load (i32.const @(AO + OY_DONE))) (i32.const 1)))
                    (i32.store (i32.const @(AO + OY_DONE)) (local.get $n))
                    (call $a_news (i32.const @OY_MX_DONE) (local.get $p) (local.get $n))
                    (local.set $running (i32.sub (local.get $running) (i32.const 1)))
                    (if (i32.eq (local.get $n) (i32.const 1))
                      (then
                        (if (i32.gt_u (i32.load (i32.const @HDR_UNTIL)) (i32.add (local.get $t) (i32.const @OY_AFTER)))
                          (then
                            (i32.store (i32.const @HDR_UNTIL) (i32.add (local.get $t) (i32.const @OY_AFTER)))
                            (call $a_news (i32.const @OY_MX_FIRST) (local.get $p) (i32.const @(OY_AFTER / 125)))))))))))))
        (local.set $key (call $oy_key (local.get $p)))
        (if (i32.or (i32.eqz (local.get $lead)) (i32.gt_u (local.get $key) (local.get $best)))
          (then (local.set $best (local.get $key)) (local.set $lead (i32.add (local.get $p) (i32.const 1))))))))
  (i32.store (i32.const @AH_LEADER) (local.get $lead))
  (i32.and (i32.eqz (local.get $running)) (i32.ne (i32.load (i32.const @(AO + OY_DONE))) (i32.const 0))))

;; q died (a kill brick, the void): back on its checkpoint OY_RESPAWN on.
(func $oy_kill (param $q i32) (param $a i32) (param $cause i32)
  (!put u16 @(PLAYERS + A_RESPAWN) (i32.shl (local.get $q) (i32.const 6)) (i32.const @OY_RESPAWN)))

;; No spawn point is barred.
(func $oy_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (i32.const 0))

;; Slot p comes in with empty hands, on its stage's checkpoint if it has
;; reached one: the first part of that stage, its middle, where it is this
;; tick, on its top (or on whatever is under a ghost's).
(func $oy_spawn (param $p i32)
  (local $pb i32) (local $k i32) (local $pt i32) (local $stage i32) (local $g i32)
  (local $x f32) (local $y f32) (local $z f32) (local $ox f32) (local $oy f32) (local $oz f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (call $a_arm (local.get $p) (i32.const 0) (i32.const 0))
  (!put u8 @(PLAYERS + A_GRENS) (local.get $pb) (i32.const 0))
  (local.set $stage (i32.load16_u offset=@(MODE_REC + MR_POINTS) (i32.shl (local.get $p) (i32.const 3))))
  (if (i32.eqz (local.get $stage)) (then (return)))
  (!for $k (i32.const 0) (i32.load (i32.const @MAP_NPART))
    (local.set $pt (i32.add (i32.const @MAP_PART) (i32.mul (local.get $k) (i32.const @PART_SIZE))))
    (if (i32.eq (i32.load offset=@PT_KIND (local.get $pt)) (i32.or (i32.const @PK_CHECK) (i32.shl (local.get $stage) (i32.const 8))))
      (then
        (local.set $g (i32.load offset=@PT_GROUP (local.get $pt)))
        (if (local.get $g)
          (then
            (call $mv (i32.sub (local.get $g) (i32.const 1)) (i32.load (i32.const @HDR_TICK)))
            (local.set $oz) (local.set $oy) (local.set $ox)))
        (local.set $x (f32.add (f32.mul (f32.add (f32.load (local.get $pt)) (f32.load offset=12 (local.get $pt))) (f32.const 0.5)) (local.get $ox)))
        (local.set $z (f32.add (f32.mul (f32.add (f32.load offset=8 (local.get $pt)) (f32.load offset=20 (local.get $pt))) (f32.const 0.5)) (local.get $oz)))
        (local.set $y (call $stand (local.get $x) (local.get $z) (f32.add (f32.add (f32.load offset=16 (local.get $pt)) (local.get $oy)) (f32.const 0.01))))
        (!put f32 @(PLAYERS + P_PX) (local.get $pb) (local.get $x))
        (!put f32 @(PLAYERS + P_PY) (local.get $pb) (local.get $y))
        (!put f32 @(PLAYERS + P_PZ) (local.get $pb) (local.get $z))
        (return)))))

;; Nothing anyone does hurts anyone.
(func $oy_hurt (param $q i32) (param $a i32) (param $cause i32) (result i32)
  (i32.const 1))

;; Where p stands in the match, higher the better: a finisher over anyone
;; still running, the sooner the better; the rest by stage, then the fewer deaths.
(func $oy_key (param $p i32) (result i32)
  (local $r i32) (local $n i32)
  (local.set $r (i32.add (i32.const @MODE_REC) (i32.shl (local.get $p) (i32.const 3))))
  (local.set $n (i32.load16_u offset=@OY_MR_DONE (local.get $r)))
  (if (local.get $n) (then (return (i32.or (i32.const 0x80000000) (i32.sub (i32.const 65535) (local.get $n))))))
  (i32.or (i32.shl (i32.load16_u offset=@MR_POINTS (local.get $r)) (i32.const 16))
          (i32.sub (i32.const 65535) (!at u16 @(PLAYERS + A_DEATHS) (i32.shl (local.get $p) (i32.const 6))))))
