;; ESCAPE (M_ESCAPE, prefix es; constants and AO's fields in src/am/escape.mjs):
;; no sides on the board, one hunter against the room. The hunter is P_FL's
;; PF_JUGG (the juggernaut's legs and sword; TEAM_MODES makes it everyone's
;; enemy and the survivors each other's friends); nothing hurts anybody (the
;; hurt hook takes every blow): the hunter's swing downs a survivor (PF_DOWN,
;; Evade's, which the prediction reads for the crawl), a survivor's shove
;; stuns the hunter (PF_DOWN on it too: it lies down and crawls). The downed
;; are revived by survivors and finished by hunters holding still over them,
;; or bleed out. The terminals are records in AO laid on the map's objective
;; spots and pads; survivors holding still by one hack it; enough hacked, or
;; the clock late, two exits open, and a survivor reaching one escapes (out
;; of play, PF_DEAD, its order kept). All of it serial, in slot order, on the
;; confirmed world; the prediction moves only its own body.

;; Play begins: the hunters, then the terminals for the survivors left, then the counts.
(func $es_start
  (local $live i32) (local $n i32)
  (local.set $live (i32.load (i32.const @HDR_LIVE)))
  (local.set $n (i32.div_u (i32.add (local.get $live) (i32.const @(ES_PER >> 1))) (i32.const @ES_PER)))
  (call $es_draw (select (local.get $n) (i32.const 1) (local.get $n)))
  (call $es_count)
  (call $es_lay (i32.load (i32.const @(AO + ES_IN))))
  (call $es_count))

;; A tick of play: the hunters' stuns and finishing, in slot order; each
;; survivor's (its shove's cooldown, escaping, hacking, or downed: revived or
;; bleeding), in slot order; the terminals' progress, in index order; the
;; exits, once enough are hacked or the clock is late; a hunter drawn if none
;; is left; the counts. Over (1) when no survivor is left in play.
(func $es_tick (result i32)
  (local $until i32)
  (call $es_hunt)
  (call $es_folk)
  (call $es_terms)
  (if (i32.eqz (i32.load (i32.const @(AO + ES_OPEN))))
    (then
      (local.set $until (i32.sub (i32.load (i32.const @HDR_UNTIL)) (i32.load (i32.const @HDR_TICK))))
      (if (i32.ge_u (i32.load (i32.const @(AO + ES_HACKED))) (i32.load (i32.const @(AO + ES_NEED))))
        (then (call $es_open (i32.const 1)))
        (else (if (i32.le_s (local.get $until) (i32.const @ES_LATE)) (then (call $es_open (i32.const 2))))))))
  (call $es_count)
  (if (i32.eqz (i32.load (i32.const @(AO + ES_HUNTERS))))
    (then (call $es_draw (i32.const 1)) (call $es_count)))
  (if (i32.and (i32.eqz (i32.load (i32.const @(AO + ES_IN)))) (i32.ne (i32.load (i32.const @HDR_LIVE)) (i32.const 0)))
    (then (i32.store (i32.const @(AO + ES_END)) (i32.const 1)) (return (i32.const 1))))
  (if (i32.ge_u (i32.load (i32.const @HDR_TICK)) (i32.load (i32.const @HDR_UNTIL)))
    (then (i32.store (i32.const @(AO + ES_END)) (i32.const 2))))
  (i32.const 0))

;; No kill happens: the hurt hook takes every blow.
(func $es_kill (param $q i32) (param $a i32) (param $cause i32))

;; Everyone comes in with no guns and no frags (the hunter is armed as it's drawn).
(func $es_spawn (param $p i32)
  (call $a_arm (local.get $p) (i32.const 0) (i32.const 0))
  (!put u8 @(PLAYERS + A_GRENS) (i32.shl (local.get $p) (i32.const 6)) (i32.const 0)))

;; A survivor mustn't come in at a spawn point a hunter is within ES_BAR of.
(func $es_bar (param $x f32) (param $y f32) (param $z f32) (result i32)
  (local $q i32) (local $qb i32) (local $dx f32) (local $dz f32)
  (!for $q (i32.const 0) (i32.const @NPLAYER)
    (if (call $es_hunter (local.get $q))
      (then
        (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
        (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $qb)) (local.get $x)))
        (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $qb)) (local.get $z)))
        (if (f32.lt (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))) (f32.const @(ES_BAR * ES_BAR)))
          (then (return (i32.const 1)))))))
  (i32.const 0))

;; A blow to slot q from slot a (the confirmed world, in play, not a's own
;; side): the mode takes it, always (1). The hunter's swing on a standing
;; survivor downs it; a survivor's shove on the hunter stuns it, when the
;; hunter is neither stunned nor calm and the shove is off its cooldown.
(func $es_hurt (param $q i32) (param $a i32) (param $cause i32) (result i32)
  (local $qb i32) (local $ra i32) (local $rq i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (local.set $ra (i32.shl (local.get $a) (i32.const 3)))
  (local.set $rq (i32.shl (local.get $q) (i32.const 3)))
  (if (i32.and (call $es_hunter (local.get $a)) (call $es_up (local.get $q)))
    (then
      (if (i32.eqz (call $es_hunter (local.get $q))) (then (call $es_down (local.get $q) (local.get $a))))
      (return (i32.const 1))))
  (if (i32.and (call $es_up (local.get $a)) (call $es_hunter (local.get $q)))
    (then
      (if (i32.and (call $es_up (local.get $q))
                   (i32.eqz (i32.or (i32.load8_u offset=@(MODE_REC + ES_MR_CALM) (local.get $rq))
                                    (i32.load16_u offset=@(MODE_REC + ES_MR_TIME) (local.get $ra)))))
        (then
          (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_DOWN)))
          (!put u8 @(PLAYERS + A_RELOAD) (local.get $qb) (i32.const 0))
          (!put u8 @(PLAYERS + A_BURST) (local.get $qb) (i32.const 0))
          (i32.store8 offset=@(MODE_REC + ES_MR_STUN) (local.get $rq) (i32.const @ES_STUN))
          (i32.store8 offset=@(MODE_REC + ES_MR_FIN) (local.get $rq) (i32.const 0))
          (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (local.get $ra) (i32.const @ES_COOL))
          (i32.store (i32.const @(AO + ES_STUNS)) (i32.add (i32.load (i32.const @(AO + ES_STUNS))) (i32.const 1)))
          (call $es_news (i32.const @ES_MX_STUN) (local.get $a) (local.get $q) (local.get $q))))))
  (i32.const 1))

;; How slot p places (higher is better, unsigned): the escaped (by escape
;; order), then the hunters (by survivors finished, then downs), then the
;; survivors still in play, then those out (each by revives, then ticks hacking).
(func $es_key (param $p i32) (result i32)
  (local $r i32) (local $fl i32) (local $a i32) (local $b i32) (local $tier i32)
  (local.set $r (i32.shl (local.get $p) (i32.const 3)))
  (local.set $fl (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))))
  (local.set $a (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
  (local.set $a (select (local.get $a) (i32.const 0xfff) (i32.lt_u (local.get $a) (i32.const 0xfff))))
  (local.set $b (i32.load16_u offset=@(MODE_REC + MR_AUX) (local.get $r)))
  (local.set $tier (select (i32.const 0) (i32.const 1) (i32.and (local.get $fl) (i32.const @PF_DEAD))))
  (if (i32.and (local.get $fl) (i32.const @PF_JUGG)) (then (local.set $tier (i32.const 2))))
  (if (i32.and (i32.ne (i32.and (local.get $fl) (i32.const @PF_DEAD)) (i32.const 0))
               (i32.ne (i32.load8_u offset=@(MODE_REC + ES_MR_ORDER) (local.get $r)) (i32.const 0)))
    (then
      (local.set $tier (i32.const 3))
      (local.set $a (i32.sub (i32.const 0xfff) (i32.load8_u offset=@(MODE_REC + ES_MR_ORDER) (local.get $r))))
      (local.set $b (i32.const 0))))
  (i32.or (i32.or (i32.shl (local.get $tier) (i32.const 28)) (i32.shl (local.get $a) (i32.const 16))) (local.get $b)))

;; 1 if slot p is up: in the room, not out or escaped, not down (a stunned hunter is down).
(func $es_up (param $p i32) (result i32)
  (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_DOWN))) (i32.const @PF_LIVE)))

;; 1 if slot p is a hunter (in the room; never dead).
(func $es_hunter (param $p i32) (result i32)
  (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_JUGG))) (i32.const @(PF_LIVE | PF_JUGG))))

;; 1 if slot p's feet move under ES_STILL across.
(func $es_still (param $p i32) (result i32)
  (local $pb i32) (local $vx f32) (local $vz f32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $vx (!at f32 @(PLAYERS + P_VX) (local.get $pb)))
  (local.set $vz (!at f32 @(PLAYERS + P_VZ) (local.get $pb)))
  (f32.lt (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vz) (local.get $vz))) (f32.const @(ES_STILL * ES_STILL))))

;; The room's counts into AO: hunters, survivors standing, down, out and
;; escaped, and the survivors in play.
(func $es_count
  (local $p i32) (local $fl i32) (local $h i32) (local $s i32) (local $d i32) (local $o i32) (local $e i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (local.set $fl (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))))
    (if (i32.and (local.get $fl) (i32.const @PF_LIVE))
      (then
        (if (i32.and (local.get $fl) (i32.const @PF_JUGG))
          (then (!inc $h))
          (else
            (if (i32.and (local.get $fl) (i32.const @PF_DEAD))
              (then
                (if (i32.load8_u offset=@(MODE_REC + ES_MR_ORDER) (i32.shl (local.get $p) (i32.const 3)))
                  (then (!inc $e))
                  (else (!inc $o))))
              (else
                (if (i32.eq (i32.and (local.get $fl) (i32.const @PF_DOWN)) (i32.const @PF_DOWN))
                  (then (!inc $d))
                  (else (!inc $s))))))))))
  (i32.store (i32.const @(AO + ES_HUNTERS)) (local.get $h))
  (i32.store (i32.const @(AO + ES_UP)) (local.get $s))
  (i32.store (i32.const @(AO + ES_DOWNED)) (local.get $d))
  (i32.store (i32.const @(AO + ES_OUT)) (local.get $o))
  (i32.store (i32.const @(AO + ES_FREE)) (local.get $e))
  (i32.store (i32.const @(AO + ES_IN)) (i32.add (local.get $s) (local.get $d))))

;; n hunters drawn from the survivors standing, each by $es_pick in slot order,
;; never the last one standing.
(func $es_draw (param $n i32)
  (local $k i32) (local $q i32) (local $c i32) (local $pick i32)
  (!for $k (i32.const 0) (local.get $n)
    (local.set $c (i32.const 0))
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (if (i32.and (call $es_up (local.get $q)) (i32.eqz (call $es_hunter (local.get $q)))) (then (!inc $c))))
    (if (i32.lt_u (local.get $c) (i32.const 2)) (then (return)))
    (local.set $pick (call $es_pick (local.get $c)))
    (local.set $c (i32.const 0))
    (block $found
      (!for $q (i32.const 0) (i32.const @NPLAYER)
        (if (i32.and (call $es_up (local.get $q)) (i32.eqz (call $es_hunter (local.get $q))))
          (then
            (if (i32.eq (local.get $c) (local.get $pick)) (then (call $es_turn (local.get $q)) (br $found)))
            (!inc $c)))))))

;; Slot q becomes a hunter: PF_JUGG, the sword in both hands, no frags, its
;; record from nothing; moved to the spawn point farthest from everyone else
;; in the fight (the lowest such), still; news.
(func $es_turn (param $q i32)
  (local $qb i32) (local $i i32) (local $a i32) (local $p i32) (local $pb i32) (local $best i32)
  (local $sx f32) (local $sz f32) (local $md f32) (local $bestd f32) (local $dx f32) (local $dz f32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_JUGG)))
  (call $a_arm (local.get $q) (i32.const @W_SWORD) (i32.const @W_SWORD))
  (!put u8 @(PLAYERS + A_GRENS) (local.get $qb) (i32.const 0))
  (!put u16 @(PLAYERS + P_REFIRE) (local.get $qb) (i32.const @SWAP_TICKS))
  (i32.store8 offset=@(MODE_REC + ES_MR_STUN) (i32.shl (local.get $q) (i32.const 3)) (i32.const 0))
  (i32.store offset=@(MODE_REC + MR_POINTS) (i32.shl (local.get $q) (i32.const 3)) (i32.const 0))
  (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (i32.shl (local.get $q) (i32.const 3)) (i32.const 0))
  (local.set $bestd (f32.const -1))
  (!for $i (i32.const 0) (i32.load (i32.const @MAP_NSPAWN))
    (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $i) (i32.const 4))))
    (local.set $sx (f32.load (local.get $a)))
    (local.set $sz (f32.load offset=8 (local.get $a)))
    (local.set $md (f32.const 1e9))
    (!for $p (i32.const 0) (i32.const @NPLAYER)
      (if (i32.and (call $a_alive (local.get $p)) (i32.ne (local.get $p) (local.get $q)))
        (then
          (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
          (local.set $dx (f32.sub (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (local.get $sx)))
          (local.set $dz (f32.sub (!at f32 @(PLAYERS + P_PZ) (local.get $pb)) (local.get $sz)))
          (local.set $md (f32.min (local.get $md) (f32.add (f32.mul (local.get $dx) (local.get $dx)) (f32.mul (local.get $dz) (local.get $dz))))))))
    (if (f32.gt (local.get $md) (local.get $bestd)) (then (local.set $bestd (local.get $md)) (local.set $best (local.get $i)))))
  (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $best) (i32.const 4))))
  (!put f32 @(PLAYERS + P_PX) (local.get $qb) (f32.load (local.get $a)))
  (!put f32 @(PLAYERS + P_PY) (local.get $qb) (f32.load offset=4 (local.get $a)))
  (!put f32 @(PLAYERS + P_PZ) (local.get $qb) (f32.load offset=8 (local.get $a)))
  (!put f32 @(PLAYERS + P_VX) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VY) (local.get $qb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $qb) (f32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_GROUND)))
  (call $es_news (i32.const @ES_MX_HUNT) (local.get $q) (local.get $q) (local.get $q)))

;; The terminals for `n` survivors: the map's spots (its hills, the flags',
;; the skull's, the pads', at their feet height), one of any ES_APART across
;; and ES_APART_H up or down of one before it; of those, as many as one for
;; every ES_TPER survivors (ES_TMIN at least), the first drawn ($es_pick) and
;; each next the farthest from those already taken (a metre up or down
;; counting as three across), so they spread over the map. ES_NEED of them
;; open the exits.
(func $es_lay (param $n i32)
  (local $m i32) (local $k i32) (local $i i32) (local $j i32) (local $a i32) (local $c i32) (local $want i32)
  (local $x f32) (local $y f32) (local $z f32) (local $d f32) (local $best f32) (local $md f32) (local $bi i32) (local $tmp i32)
  (!for $k (i32.const 0) (i32.add (i32.add (i32.load (i32.const @MAP_NHILL)) (i32.const 3)) (i32.load (i32.const @MAP_NPAD)))
    ;; the k-th spot: a hill, a flag's, the skull's, a pad's (each f32 x, z, top first; the skull's follows the flags')
    (local.set $i (i32.load (i32.const @MAP_NHILL)))
    (local.set $a (select (i32.add (i32.const @MAP_HILLS) (i32.shl (local.get $k) (i32.const 4)))
                          (select (i32.add (i32.const @MAP_FLAGS) (i32.shl (i32.sub (local.get $k) (local.get $i)) (i32.const 4)))
                                  (i32.add (i32.const @MAP_PADS) (i32.shl (i32.sub (local.get $k) (i32.add (local.get $i) (i32.const 3))) (i32.const 4)))
                                  (i32.lt_u (local.get $k) (i32.add (local.get $i) (i32.const 3))))
                          (i32.lt_u (local.get $k) (local.get $i))))
    (local.set $x (f32.load (local.get $a)))
    (local.set $z (f32.load offset=4 (local.get $a)))
    (local.set $y (call $stand (local.get $x) (local.get $z) (f32.load offset=8 (local.get $a))))
    (block $dup
      (!for $j (i32.const 0) (local.get $m)
        (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $j) (i32.const 4))))
        (local.set $d (f32.sub (f32.load offset=@ES_T_X (local.get $c)) (local.get $x)))
        (local.set $md (f32.sub (f32.load offset=@ES_T_Z (local.get $c)) (local.get $z)))
        (br_if $dup (i32.and (f32.lt (f32.add (f32.mul (local.get $d) (local.get $d)) (f32.mul (local.get $md) (local.get $md))) (f32.const @(ES_APART * ES_APART)))
                             (f32.lt (f32.abs (f32.sub (f32.load offset=@ES_T_Y (local.get $c)) (local.get $y))) (f32.const @ES_APART_H)))))
      (if (i32.lt_u (local.get $m) (i32.const @ES_TMAX))
        (then
          (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $m) (i32.const 4))))
          (f32.store offset=@ES_T_X (local.get $c) (local.get $x))
          (f32.store offset=@ES_T_Y (local.get $c) (local.get $y))
          (f32.store offset=@ES_T_Z (local.get $c) (local.get $z))
          (!inc $m)))))
  ;; how many: one for every ES_TPER survivors, rounded up, ES_TMIN at least, at most the spots
  (local.set $want (i32.div_u (i32.add (local.get $n) (i32.const @(ES_TPER - 1))) (i32.const @ES_TPER)))
  (if (i32.lt_u (local.get $want) (i32.const @ES_TMIN)) (then (local.set $want (i32.const @ES_TMIN))))
  (if (i32.gt_u (local.get $want) (local.get $m)) (then (local.set $want (local.get $m))))
  ;; the chosen to the front: the first by the PRNG, then each farthest from those before it
  (!for $k (i32.const 0) (local.get $want)
    (if (i32.eqz (local.get $k))
      (then (local.set $bi (call $es_pick (local.get $m))))
      (else
        (local.set $best (f32.const -1))
        (!for $i (local.get $k) (local.get $m)
          (local.set $a (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $i) (i32.const 4))))
          (local.set $md (f32.const 1e18))
          (!for $j (i32.const 0) (local.get $k)
            (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $j) (i32.const 4))))
            (local.set $x (f32.sub (f32.load offset=@ES_T_X (local.get $a)) (f32.load offset=@ES_T_X (local.get $c))))
            (local.set $y (f32.mul (f32.sub (f32.load offset=@ES_T_Y (local.get $a)) (f32.load offset=@ES_T_Y (local.get $c))) (f32.const 3)))
            (local.set $z (f32.sub (f32.load offset=@ES_T_Z (local.get $a)) (f32.load offset=@ES_T_Z (local.get $c))))
            (local.set $md (f32.min (local.get $md) (!dot3 (local.get $x) (local.get $y) (local.get $z) (local.get $x) (local.get $y) (local.get $z)))))
          (if (f32.gt (local.get $md) (local.get $best)) (then (local.set $best (local.get $md)) (local.set $bi (local.get $i)))))))
    ;; swap spot bi into place k
    (local.set $a (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $k) (i32.const 4))))
    (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $bi) (i32.const 4))))
    (!for $j (i32.const 0) (i32.const 3)
      (local.set $tmp (i32.load (i32.add (local.get $a) (i32.shl (local.get $j) (i32.const 2)))))
      (i32.store (i32.add (local.get $a) (i32.shl (local.get $j) (i32.const 2))) (i32.load (i32.add (local.get $c) (i32.shl (local.get $j) (i32.const 2)))))
      (i32.store (i32.add (local.get $c) (i32.shl (local.get $j) (i32.const 2))) (local.get $tmp))))
  ;; the spots not taken go
  (memory.fill (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $want) (i32.const 4))) (i32.const 0)
               (i32.shl (i32.sub (i32.const @ES_TMAX) (local.get $want)) (i32.const 4)))
  (i32.store (i32.const @(AO + ES_NT)) (local.get $want))
  (i32.store (i32.const @(AO + ES_NEED)) (i32.div_u (i32.add (i32.shl (local.get $want) (i32.const 1)) (i32.const 2)) (i32.const 3))))

;; Each hunter's tick, in slot order: stunned, the stun runs down (up again
;; at its end, calm ES_CALM); calm runs down. Up and still with a downed
;; survivor within ES_REACH (the lowest slot such), a tick more of finishing
;; it, out at ES_FINISH; else the count starts over.
(func $es_hunt
  (local $p i32) (local $r i32) (local $pb i32) (local $n i32) (local $q i32) (local $by i32)
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (call $es_hunter (local.get $p))
      (then
        (local.set $r (i32.shl (local.get $p) (i32.const 3)))
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $n (i32.load8_u offset=@(MODE_REC + ES_MR_STUN) (local.get $r)))
        (if (local.get $n)
          (then
            (local.set $n (i32.sub (local.get $n) (i32.const 1)))
            (i32.store8 offset=@(MODE_REC + ES_MR_STUN) (local.get $r) (local.get $n))
            (if (i32.eqz (local.get $n))
              (then
                (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_DOWN))))
                (i32.store8 offset=@(MODE_REC + ES_MR_CALM) (local.get $r) (i32.const @ES_CALM)))))
          (else
            (local.set $n (i32.load8_u offset=@(MODE_REC + ES_MR_CALM) (local.get $r)))
            (if (local.get $n) (then (i32.store8 offset=@(MODE_REC + ES_MR_CALM) (local.get $r) (i32.sub (local.get $n) (i32.const 1)))))))
        (local.set $by (i32.const -1))
        (if (i32.and (call $es_up (local.get $p)) (call $es_still (local.get $p)))
          (then
            (block $found
              (!for $q (i32.const 0) (i32.const @NPLAYER)
                (if (i32.and (call $es_downed (local.get $q))
                             (call $a_near (local.get $q) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                                           (f32.const @ES_REACH) (f32.const @ES_REACH_H)))
                  (then (local.set $by (local.get $q)) (br $found)))))))
        (if (i32.lt_s (local.get $by) (i32.const 0))
          (then (i32.store8 offset=@(MODE_REC + ES_MR_FIN) (local.get $r) (i32.const 0)))
          (else
            (local.set $n (i32.add (i32.load8_u offset=@(MODE_REC + ES_MR_FIN) (local.get $r)) (i32.const 1)))
            (if (i32.lt_u (local.get $n) (i32.const @ES_FINISH))
              (then (i32.store8 offset=@(MODE_REC + ES_MR_FIN) (local.get $r) (local.get $n)))
              (else
                (i32.store8 offset=@(MODE_REC + ES_MR_FIN) (local.get $r) (i32.const 0))
                (local.set $n (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
                (if (i32.lt_u (local.get $n) (i32.const 0xffff))
                  (then (i32.store16 offset=@(MODE_REC + MR_POINTS) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
                (i32.store (i32.const @(AO + ES_FINISHED)) (i32.add (i32.load (i32.const @(AO + ES_FINISHED))) (i32.const 1)))
                (call $es_out (local.get $by) (local.get $p))))))))))

;; 1 if slot p is a survivor down.
(func $es_downed (param $p i32) (result i32)
  (i32.eq (i32.and (!at u8 @(PLAYERS + P_FL) (i32.shl (local.get $p) (i32.const 6))) (i32.const @(PF_LIVE | PF_DEAD | PF_JUGG | PF_DOWN))) (i32.const @(PF_LIVE | PF_DOWN))))

;; Each survivor's tick, in slot order. Up: its shove's cooldown runs down;
;; at an open exit it escapes; still by a terminal not yet hacked (the first
;; in index order within ES_TERM_R across and ES_TERM_H up or down), it's one
;; of that terminal's crew this tick, and a tick more of hacking for it.
;; Down: $es_bleed. Every terminal's crew is counted afresh.
(func $es_folk
  (local $p i32) (local $r i32) (local $pb i32) (local $n i32) (local $k i32) (local $c i32) (local $e i32)
  (!for $k (i32.const 0) (i32.load (i32.const @(AO + ES_NT)))
    (i32.store8 offset=@(AO + ES_T + ES_T_CREW) (i32.shl (local.get $k) (i32.const 4)) (i32.const 0)))
  (!for $p (i32.const 0) (i32.const @NPLAYER)
    (if (i32.and (call $es_up (local.get $p)) (i32.eqz (call $es_hunter (local.get $p))))
      (then
        (local.set $r (i32.shl (local.get $p) (i32.const 3)))
        (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
        (local.set $n (i32.load16_u offset=@(MODE_REC + ES_MR_TIME) (local.get $r)))
        (if (local.get $n) (then (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (local.get $r) (i32.sub (local.get $n) (i32.const 1)))))
        (block $done
          (if (i32.load (i32.const @(AO + ES_OPEN)))
            (then
              (!for $e (i32.const 0) (i32.const 2)
                (local.set $c (i32.add (i32.const @(AO + ES_EXIT)) (i32.shl (local.get $e) (i32.const 4))))
                (if (call $a_near (local.get $p) (f32.load (local.get $c)) (f32.load offset=4 (local.get $c)) (f32.load offset=8 (local.get $c))
                                  (f32.const @ES_EXIT_R) (f32.const @ES_EXIT_H))
                  (then (call $es_free (local.get $p)) (br $done))))))
          (br_if $done (i32.eqz (call $es_still (local.get $p))))
          (!for $k (i32.const 0) (i32.load (i32.const @(AO + ES_NT)))
            (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $k) (i32.const 4))))
            (if (i32.and (i32.eqz (i32.load8_u offset=@ES_T_DONE (local.get $c)))
                         (call $a_near (local.get $p) (f32.load offset=@ES_T_X (local.get $c)) (f32.load offset=@ES_T_Y (local.get $c)) (f32.load offset=@ES_T_Z (local.get $c))
                                       (f32.const @ES_TERM_R) (f32.const @ES_TERM_H)))
              (then
                (local.set $n (i32.load8_u offset=@ES_T_CREW (local.get $c)))
                (if (i32.lt_u (local.get $n) (i32.const 255)) (then (i32.store8 offset=@ES_T_CREW (local.get $c) (i32.add (local.get $n) (i32.const 1)))))
                (local.set $n (i32.load16_u offset=@(MODE_REC + MR_AUX) (local.get $r)))
                (if (i32.lt_u (local.get $n) (i32.const 0xffff))
                  (then (i32.store16 offset=@(MODE_REC + MR_AUX) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
                (br $done)))))))
    (if (call $es_downed (local.get $p)) (then (call $es_bleed (local.get $p))))))

;; 1 if slot q revives slot p this tick: a survivor up, someone else, still,
;; its feet within ES_REACH across and ES_REACH_H up or down of p's.
(func $es_helps (param $q i32) (param $p i32) (result i32)
  (local $pb i32)
  (if (i32.or (i32.or (i32.eq (local.get $q) (local.get $p)) (i32.eqz (call $es_up (local.get $q)))) (call $es_hunter (local.get $q)))
    (then (return (i32.const 0))))
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (i32.and (call $es_still (local.get $q))
           (call $a_near (local.get $q) (!at f32 @(PLAYERS + P_PX) (local.get $pb)) (!at f32 @(PLAYERS + P_PY) (local.get $pb)) (!at f32 @(PLAYERS + P_PZ) (local.get $pb))
                         (f32.const @ES_REACH) (f32.const @ES_REACH_H))))

;; Downed slot p's tick, as Evade's: someone reviving it (the lowest slot
;; that is), a tick more of that and none of its bleeding, up at ES_REVIVE
;; (the reviver's revive counted, p's shove ready, news); nobody, the revive
;; starts over and it bleeds, out on the tick that runs out.
(func $es_bleed (param $p i32)
  (local $q i32) (local $by i32) (local $a i32) (local $n i32) (local $r i32) (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $r (i32.shl (local.get $p) (i32.const 3)))
  (local.set $a (i32.add (i32.const @(AO + ES_HELP)) (i32.shl (local.get $p) (i32.const 1))))
  (local.set $by (i32.const -1))
  (block $found
    (!for $q (i32.const 0) (i32.const @NPLAYER)
      (if (call $es_helps (local.get $q) (local.get $p)) (then (local.set $by (local.get $q)) (br $found)))))
  (if (i32.ge_s (local.get $by) (i32.const 0))
    (then
      (local.set $n (i32.add (i32.load16_u (local.get $a)) (i32.const 1)))
      (if (i32.lt_u (local.get $n) (i32.const @ES_REVIVE)) (then (i32.store16 (local.get $a) (local.get $n)) (return)))
      (i32.store16 (local.get $a) (i32.const 0))
      (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_DOWN))))
      (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (local.get $r) (i32.const 0))
      (local.set $r (i32.shl (local.get $by) (i32.const 3)))
      (local.set $n (i32.load16_u offset=@(MODE_REC + MR_POINTS) (local.get $r)))
      (if (i32.lt_u (local.get $n) (i32.const 0xffff))
        (then (i32.store16 offset=@(MODE_REC + MR_POINTS) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
      (i32.store (i32.const @(AO + ES_UPS)) (i32.add (i32.load (i32.const @(AO + ES_UPS))) (i32.const 1)))
      (call $es_news (i32.const @ES_MX_UP) (local.get $by) (local.get $p) (local.get $p))
      (return)))
  (i32.store16 (local.get $a) (i32.const 0))
  (local.set $n (i32.load16_u offset=@(MODE_REC + ES_MR_TIME) (local.get $r)))
  (if (i32.gt_u (local.get $n) (i32.const 1))
    (then (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (local.get $r) (i32.sub (local.get $n) (i32.const 1))) (return)))
  (call $es_out (local.get $p) (local.get $p)))

;; The hunter a downs survivor q: PF_DOWN (a reload or burst under way
;; stops), ES_BLEED to bleed, nobody reviving it yet; the hunter's down
;; counted, news.
(func $es_down (param $q i32) (param $a i32)
  (local $qb i32) (local $r i32) (local $n i32)
  (local.set $qb (i32.shl (local.get $q) (i32.const 6)))
  (!put u8 @(PLAYERS + P_FL) (local.get $qb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $qb)) (i32.const @PF_DOWN)))
  (!put u8 @(PLAYERS + A_RELOAD) (local.get $qb) (i32.const 0))
  (!put u8 @(PLAYERS + A_BURST) (local.get $qb) (i32.const 0))
  (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (i32.shl (local.get $q) (i32.const 3)) (i32.const @ES_BLEED))
  (i32.store16 offset=@(AO + ES_HELP) (i32.shl (local.get $q) (i32.const 1)) (i32.const 0))
  (local.set $r (i32.shl (local.get $a) (i32.const 3)))
  (local.set $n (i32.load16_u offset=@(MODE_REC + MR_AUX) (local.get $r)))
  (if (i32.lt_u (local.get $n) (i32.const 0xffff))
    (then (i32.store16 offset=@(MODE_REC + MR_AUX) (local.get $r) (i32.add (local.get $n) (i32.const 1)))))
  (i32.store (i32.const @(AO + ES_DOWNS)) (i32.add (i32.load (i32.const @(AO + ES_DOWNS))) (i32.const 1)))
  (call $es_news (i32.const @ES_MX_DOWN) (local.get $q) (local.get $a) (local.get $q)))

;; Survivor p is out for the match (finished by hunter `by`, or bled out:
;; by == p): PF_DEAD, a respawn past any match's end, a death, still; news.
(func $es_out (param $p i32) (param $by i32)
  (local $pb i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0))
  (i32.store16 offset=@(AO + ES_HELP) (i32.shl (local.get $p) (i32.const 1)) (i32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (i32.and (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @(255 ^ PF_DOWN))) (i32.const @PF_DEAD)))
  (!put u16 @(PLAYERS + A_RESPAWN) (local.get $pb) (i32.const 0xffff))
  (!put u16 @(PLAYERS + A_DEATHS) (local.get $pb) (i32.add (!at u16 @(PLAYERS + A_DEATHS) (local.get $pb)) (i32.const 1)))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (call $es_news (i32.const @ES_MX_OUT) (local.get $p) (local.get $by) (local.get $p)))

;; Survivor p escapes: out of play as the out are (PF_DEAD, never back while
;; the match lasts), its escape order kept; news.
(func $es_free (param $p i32)
  (local $pb i32) (local $n i32)
  (local.set $pb (i32.shl (local.get $p) (i32.const 6)))
  (local.set $n (i32.add (i32.load (i32.const @(AO + ES_ESCAPES))) (i32.const 1)))
  (i32.store (i32.const @(AO + ES_ESCAPES)) (local.get $n))
  (i32.store8 offset=@(MODE_REC + ES_MR_ORDER) (i32.shl (local.get $p) (i32.const 3)) (select (local.get $n) (i32.const 255) (i32.lt_u (local.get $n) (i32.const 255))))
  (i32.store16 offset=@(MODE_REC + ES_MR_TIME) (i32.shl (local.get $p) (i32.const 3)) (i32.const 0))
  (!put u8 @(PLAYERS + P_FL) (local.get $pb) (i32.or (!at u8 @(PLAYERS + P_FL) (local.get $pb)) (i32.const @PF_DEAD)))
  (!put u16 @(PLAYERS + A_RESPAWN) (local.get $pb) (i32.const 0xffff))
  (!put f32 @(PLAYERS + P_VX) (local.get $pb) (f32.const 0))
  (!put f32 @(PLAYERS + P_VZ) (local.get $pb) (f32.const 0))
  (call $es_news (i32.const @ES_MX_FREE) (local.get $p) (local.get $n) (local.get $p)))

;; Each terminal not yet hacked, in index order: its crew's progress (more
;; hackers faster, by ES_RATE); hacked at 4 ES_HACK (the lowest slot of its
;; crew named, news).
(func $es_terms
  (local $k i32) (local $c i32) (local $n i32) (local $p i32) (local $who i32)
  (!for $k (i32.const 0) (i32.load (i32.const @(AO + ES_NT)))
    (local.set $c (i32.add (i32.const @(AO + ES_T)) (i32.shl (local.get $k) (i32.const 4))))
    (local.set $n (i32.load8_u offset=@ES_T_CREW (local.get $c)))
    (if (i32.and (i32.ne (local.get $n) (i32.const 0)) (i32.eqz (i32.load8_u offset=@ES_T_DONE (local.get $c))))
      (then
        (local.set $n (select (local.get $n) (i32.const 3) (i32.lt_u (local.get $n) (i32.const 3))))
        (local.set $n (i32.add (i32.load16_u offset=@ES_T_PROG (local.get $c)) (!tab ES_RATE (local.get $n))))
        (if (i32.lt_u (local.get $n) (i32.const @(4 * ES_HACK)))
          (then (i32.store16 offset=@ES_T_PROG (local.get $c) (local.get $n)))
          (else
            (i32.store16 offset=@ES_T_PROG (local.get $c) (i32.const @(4 * ES_HACK)))
            (i32.store8 offset=@ES_T_DONE (local.get $c) (i32.const 1))
            (i32.store (i32.const @(AO + ES_HACKED)) (i32.add (i32.load (i32.const @(AO + ES_HACKED))) (i32.const 1)))
            (local.set $who (i32.const 255))
            (block $found
              (!for $p (i32.const 0) (i32.const @NPLAYER)
                (if (i32.and (i32.and (call $es_up (local.get $p)) (i32.eqz (call $es_hunter (local.get $p))))
                             (call $a_near (local.get $p) (f32.load offset=@ES_T_X (local.get $c)) (f32.load offset=@ES_T_Y (local.get $c)) (f32.load offset=@ES_T_Z (local.get $c))
                                           (f32.const @ES_TERM_R) (f32.const @ES_TERM_H)))
                  (then (local.set $who (local.get $p)) (br $found)))))
            (call $es_say (i32.const @ES_MX_HACK) (local.get $who) (local.get $k)
                          (f32.load offset=@ES_T_X (local.get $c)) (f32.load offset=@ES_T_Y (local.get $c)) (f32.load offset=@ES_T_Z (local.get $c)))))))))

;; The exits open (`why`: 1 the terminals, 2 the clock): two of the map's
;; spawn points on the ground (feet within a metre of it), the first drawn
;; ($es_pick), the second the one farthest from it; news at the first.
(func $es_open (param $why i32)
  (local $i i32) (local $n i32) (local $a i32) (local $k i32) (local $first i32) (local $best i32)
  (local $d f32) (local $bd f32) (local $x f32) (local $z f32)
  (!for $i (i32.const 0) (i32.load (i32.const @MAP_NSPAWN))
    (if (call $es_low (local.get $i)) (then (!inc $n))))
  ;; (a map with no spawn on the ground: any)
  (local.set $k (call $es_pick (select (local.get $n) (i32.load (i32.const @MAP_NSPAWN)) (local.get $n))))
  (block $found
    (!for $i (i32.const 0) (i32.load (i32.const @MAP_NSPAWN))
      (if (i32.or (call $es_low (local.get $i)) (i32.eqz (local.get $n)))
        (then
          (br_if $found (i32.eqz (local.get $k)))
          (local.set $k (i32.sub (local.get $k) (i32.const 1)))))))
  (local.set $first (local.get $i))
  (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $first) (i32.const 4))))
  (local.set $x (f32.load (local.get $a)))
  (local.set $z (f32.load offset=8 (local.get $a)))
  (local.set $bd (f32.const -1))
  (local.set $best (local.get $first))
  (!for $i (i32.const 0) (i32.load (i32.const @MAP_NSPAWN))
    (if (i32.or (call $es_low (local.get $i)) (i32.eqz (local.get $n)))
      (then
        (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $i) (i32.const 4))))
        (local.set $d (f32.add (f32.mul (f32.sub (f32.load (local.get $a)) (local.get $x)) (f32.sub (f32.load (local.get $a)) (local.get $x)))
                               (f32.mul (f32.sub (f32.load offset=8 (local.get $a)) (local.get $z)) (f32.sub (f32.load offset=8 (local.get $a)) (local.get $z)))))
        (if (f32.gt (local.get $d) (local.get $bd)) (then (local.set $bd (local.get $d)) (local.set $best (local.get $i)))))))
  (memory.copy (i32.const @(AO + ES_EXIT)) (i32.add (i32.const @SPAWNS) (i32.shl (local.get $first) (i32.const 4))) (i32.const 16))
  (memory.copy (i32.const @(AO + ES_EXIT + 16)) (i32.add (i32.const @SPAWNS) (i32.shl (local.get $best) (i32.const 4))) (i32.const 16))
  (i32.store (i32.const @(AO + ES_EXIT + 12)) (i32.const 0))
  (i32.store (i32.const @(AO + ES_EXIT + 28)) (i32.const 0))
  (i32.store (i32.const @(AO + ES_OPEN)) (local.get $why))
  (call $es_say (i32.const @ES_MX_OPEN) (i32.const 255) (local.get $why)
                (f32.load (i32.const @(AO + ES_EXIT))) (f32.load (i32.const @(AO + ES_EXIT + 4))) (f32.load (i32.const @(AO + ES_EXIT + 8)))))

;; 1 if spawn point i stands on the ground (its feet within a metre of it, not on a roof).
(func $es_low (param $i i32) (result i32)
  (local $a i32) (local $g f32)
  (local.set $a (i32.add (i32.const @SPAWNS) (i32.shl (local.get $i) (i32.const 4))))
  (call $ground (f32.load (local.get $a)) (f32.load offset=8 (local.get $a)))
  (drop) (drop) (drop) (drop)
  (local.set $g)
  (f32.lt (f32.sub (f32.load offset=4 (local.get $a)) (local.get $g)) (f32.const 1)))

;; A draw of $rand in [0, n), from its high bits (its low ones follow the
;; seed's low bits too closely for a draw from a few).
(func $es_pick (param $n i32) (result i32)
  (i32.wrap_i64 (i64.shr_u (i64.mul (i64.extend_i32_u (call $rand)) (i64.extend_i32_u (local.get $n))) (i64.const 32))))

;; News for the feed (FX_MODE: what as its size), at slot at's feet.
(func $es_news (param $what i32) (param $owner i32) (param $shot i32) (param $at i32)
  (local $b i32)
  (local.set $b (i32.shl (local.get $at) (i32.const 6)))
  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $owner) (local.get $shot)
            (!at f32 @(PLAYERS + P_PX) (local.get $b)) (!at f32 @(PLAYERS + P_PY) (local.get $b)) (!at f32 @(PLAYERS + P_PZ) (local.get $b))
            (f32.convert_i32_u (local.get $what))))

;; News at a point.
(func $es_say (param $what i32) (param $owner i32) (param $shot i32) (param $x f32) (param $y f32) (param $z f32)
  (call $fx (i32.const 0) (i32.const @FX_MODE) (local.get $owner) (local.get $shot) (local.get $x) (local.get $y) (local.get $z) (f32.convert_i32_u (local.get $what))))
