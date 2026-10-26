;; SUMO RING (MG_SUMO, prefix su), written in Rust: rust/mg/sumo/. This is
;; what it compiles to (rustc 1.97.0, wasm32-unknown-unknown), turned into the assembler's WAT by
;; node tools/rust.mjs: edit the Rust and run that, never this file. CI checks the two
;; agree (node tools/rust.mjs --check). The numbers the Rust names, as it was built
;; (test/rust.test.mjs fails when layout.mjs or the constants file has moved one):
;;   BH_LEFT=65584 DT=0.008 HDR_TICK=65536 NPLAYER=256 PF_DEAD=8 PF_FALL=16
;;   PF_GROUND=2 PF_LIVE=1 PG_CX=65660 PG_H=65664 PG_KIND=65612 PG_LEN=65616
;;   PG_M=60 PG_S=114944 PG_SCORE=56 PG_SIZE=65624 PK_OUT=0 PLAT_Y=40
;;   PLAYERS=65792 PSIZE=64 P_FL=28 P_PX=0 P_PY=4 P_PZ=8
;;   P_VX=12 P_VY=16 P_VZ=20 SU_A0=12 SU_FELL=0 SU_FX_BONK=152
;;   SU_FX_RING=153 SU_FX_TURN=154 SU_HOLD=2500 SU_KICK=9 SU_LEN=12500 SU_NP=8
;;   SU_ORBIT=0.55 SU_P0=2 SU_PMAX=10 SU_POP=2.5 SU_POSTH=2.4 SU_POSTR=1.1
;;   SU_PPER=16 SU_PV=5 SU_R0=8 SU_RAD=0 SU_RK=3 SU_RLOW=4
;;   SU_RLOWK=0.35 SU_RMAX=48 SU_RMIN=6 SU_SHRINK=6250 SU_SPAWNM=1.6 SU_SPIN=16
;;   SU_SWING=1500

;; spawn: the Rust writes x, y, z at RS_OUT (serial, per call).
(func $su_spawn (param $i i32) (param $n i32) (result f32 f32 f32)
  (call $su__spawn (local.get $i) (local.get $n) (i32.const @RS_OUT))
  (f32.load (i32.const @RS_OUT)) (f32.load (i32.const @(RS_OUT + 4))) (f32.load (i32.const @(RS_OUT + 8))))
(func $su_start)
(func $su_begin (param i32 i32))
(func $su_out (param i32))

(func $su_ground (param i32 f32 f32 f32) (result f32)
  (local f32 i32)
  f32.const -0x1.f4p+9
  local.set 4
  block
    local.get 2
    f32.const 0x1.4p+5
    f32.lt
    br_if 0
    local.get 0
    call $p_t
    local.set 5
    local.get 0
    i32.const 65664
    i32.add
    f32.load
    local.set 4
    block
      local.get 5
      i32.const 2501
      i32.lt_s
      br_if 0
      local.get 0
      i32.const 65668
      i32.add
      f32.load
      local.set 2
      block
        local.get 5
        i32.const 8749
        i32.le_u
        br_if 0
        local.get 2
        local.set 4
        br 1
      end
      local.get 4
      local.get 4
      local.get 2
      f32.sub
      local.get 5
      i32.const -2500
      i32.add
      f32.convert_i32_u
      f32.const -0x1.86ap+12
      f32.div
      f32.mul
      f32.add
      local.set 4
    end
    f32.const 0x1.4p+5
    f32.const -0x1.f4p+9
    local.get 1
    local.get 0
    i32.const 65660
    i32.add
    f32.load
    local.tee 2
    f32.sub
    local.tee 1
    local.get 1
    f32.mul
    local.get 3
    local.get 2
    f32.sub
    local.tee 2
    local.get 2
    f32.mul
    f32.add
    local.get 4
    local.get 4
    f32.mul
    f32.le
    select
    local.set 4
  end
  local.get 4)
(func $su_over (result i32)
  (local i32 i32 i32 i32 i32 i32)
  i32.const 0
  call $p_t
  i32.const 1
  i32.add
  local.set 0
  i32.const 65884
  local.set 1
  i32.const 114946
  local.set 2
  loop
    block
      local.get 1
      i32.const -64
      i32.add
      i32.load8_u
      i32.const 25
      i32.and
      i32.const 17
      i32.ne
      br_if 0
      local.get 2
      i32.const -2
      i32.add
      local.tee 3
      i32.load16_u
      br_if 0
      local.get 3
      local.get 0
      i32.store16
    end
    block
      local.get 1
      i32.load8_u
      i32.const 25
      i32.and
      i32.const 17
      i32.ne
      br_if 0
      local.get 2
      i32.load16_u
      br_if 0
      local.get 2
      local.get 0
      i32.store16
    end
    local.get 1
    i32.const 128
    i32.add
    local.set 1
    local.get 2
    i32.const 4
    i32.add
    local.tee 2
    i32.const 115458
    i32.ne
    br_if 0
  end
  i32.const 0
  local.set 4
  block
    i32.const 0
    i32.load offset=65584
    i32.const 2
    i32.lt_s
    br_if 0
    i32.const 0
    local.set 4
    i32.const 65884
    local.set 1
    i32.const 114946
    local.set 3
    i32.const 0
    local.set 2
    loop
      block
        block
          local.get 1
          i32.const -64
          i32.add
          i32.load8_u
          i32.const 25
          i32.and
          i32.const -1
          i32.add
          br_table 3  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1  0  1
        end
        local.get 3
        i32.const -2
        i32.add
        i32.load16_u
        local.set 0
        block
          local.get 2
          br_if 0
          local.get 0
          local.set 2
          br 1
        end
        local.get 2
        local.get 0
        i32.ne
        local.set 5
        local.get 0
        local.set 2
        local.get 5
        br_if 2
      end
      block
        block
          local.get 1
          i32.load8_u
          i32.const 25
          i32.and
          i32.const -1
          i32.add
          br_table 3  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1  0  1
        end
        local.get 3
        i32.load16_u
        local.set 0
        block
          local.get 2
          br_if 0
          local.get 0
          local.set 2
          br 1
        end
        local.get 2
        local.get 0
        i32.ne
        local.set 5
        local.get 0
        local.set 2
        local.get 5
        br_if 2
      end
      local.get 1
      i32.const 128
      i32.add
      local.set 1
      local.get 3
      i32.const 4
      i32.add
      local.tee 3
      i32.const 115458
      i32.ne
      br_if 0
    end
    i32.const 1
    local.set 4
  end
  local.get 4)
(func $su_push (param i32 i32)
  (local i32 i32 f32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 f32 f32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 f32 f32 f32 f32 f32 f32)
  block
    local.get 0
    i32.const 6
    i32.shl
    local.get 1
    i32.add
    local.tee 2
    i32.const 65820
    i32.add
    i32.load8_u
    local.tee 3
    i32.const 24
    i32.and
    br_if 0
    local.get 2
    i32.const 65796
    i32.add
    f32.load
    local.tee 4
    f32.const 0x1.533334p+5
    f32.ge
    br_if 0
    i32.const 1500
    local.get 1
    call $p_t
    local.tee 5
    i32.const -1
    i32.add
    local.tee 6
    i32.const 0
    local.get 6
    i32.const 0
    i32.gt_s
    select
    local.tee 7
    local.get 7
    i32.const 1500
    i32.div_u
    local.tee 7
    i32.const 1500
    i32.mul
    i32.sub
    local.tee 8
    i32.sub
    local.get 8
    local.get 7
    i32.const 1
    i32.and
    select
    local.set 9
    i32.const 1500
    local.get 5
    i32.const 0
    local.get 5
    i32.const 0
    i32.gt_s
    select
    local.tee 7
    local.get 7
    i32.const 1500
    i32.div_u
    local.tee 7
    i32.const 1500
    i32.mul
    i32.sub
    local.tee 8
    i32.sub
    local.get 8
    local.get 7
    i32.const 1
    i32.and
    select
    local.set 10
    local.get 5
    i32.const -2501
    i32.add
    f32.convert_i32_u
    f32.const 0x1.86ap+12
    f32.div
    local.set 11
    local.get 5
    i32.const -2500
    i32.add
    f32.convert_i32_u
    f32.const 0x1.86ap+12
    f32.div
    local.set 12
    local.get 2
    call $b_rad
    local.set 13
    local.get 2
    i32.const 65812
    i32.add
    f32.load
    local.set 14
    local.get 2
    i32.const 65804
    i32.add
    f32.load
    local.set 15
    local.get 2
    i32.const 65800
    i32.add
    f32.load
    local.set 16
    local.get 2
    i32.const 65792
    i32.add
    f32.load
    local.set 17
    local.get 1
    i32.const 65672
    i32.add
    local.tee 18
    i32.load
    local.set 19
    local.get 13
    f32.const 0x1.19999ap+0
    f32.add
    local.tee 20
    local.get 20
    f32.mul
    local.set 21
    local.get 5
    i32.const 2501
    i32.lt_s
    local.set 22
    local.get 1
    i32.const 65680
    i32.add
    local.set 23
    local.get 1
    i32.const 65676
    i32.add
    local.set 24
    local.get 1
    i32.const 65664
    i32.add
    local.set 25
    local.get 1
    i32.const 65660
    i32.add
    local.set 26
    local.get 1
    i32.const 65668
    i32.add
    local.set 27
    local.get 5
    i32.const -8751
    i32.add
    i32.const -6249
    i32.lt_u
    local.set 28
    local.get 5
    i32.const 8749
    i32.gt_u
    local.set 29
    i32.const 0
    local.set 7
    i32.const 0
    local.set 30
    block
      block
        loop
          local.get 7
          local.get 19
          local.get 7
          local.get 19
          i32.gt_s
          select
          local.set 5
          block
            block
              local.get 22
              br_if 0
              i32.const 0
              local.get 5
              i32.sub
              local.set 31
              local.get 7
              i32.const 24
              i32.shl
              local.set 8
              local.get 7
              i32.const -1
              i32.add
              local.set 5
              loop
                local.get 8
                local.set 7
                local.get 31
                local.get 5
                i32.add
                i32.const -1
                i32.eq
                br_if 5
                local.get 18
                i32.load
                local.tee 8
                i32.eqz
                br_if 4
                local.get 23
                i32.load
                local.set 32
                local.get 24
                i32.load
                local.set 33
                block
                  local.get 7
                  i32.const -2147483648
                  i32.ne
                  br_if 0
                  local.get 8
                  i32.const -1
                  i32.eq
                  br_if 5
                end
                local.get 32
                local.get 10
                i32.mul
                local.get 33
                i32.add
                local.get 7
                local.get 8
                i32.div_s
                i32.add
                i32.const 10
                i32.shr_u
                i32.const 16383
                i32.and
                call $su__pk_sincos
                local.set 34
                local.get 7
                i32.const 16777216
                i32.add
                local.set 8
                local.get 5
                i32.const 1
                i32.add
                local.set 5
                local.get 17
                local.get 26
                f32.load
                local.tee 35
                local.get 27
                f32.load
                local.tee 13
                local.get 25
                f32.load
                local.tee 36
                local.get 12
                local.get 36
                local.get 13
                f32.sub
                f32.mul
                f32.sub
                local.get 29
                select
                f32.const 0x1.19999ap-1
                f32.mul
                local.tee 37
                local.get 34
                i64.const 32
                i64.shr_u
                i32.wrap_i64
                f32.reinterpret_i32
                f32.mul
                f32.add
                local.tee 36
                f32.sub
                local.tee 13
                local.get 13
                f32.mul
                local.get 16
                local.get 35
                local.get 37
                local.get 34
                i32.wrap_i64
                f32.reinterpret_i32
                f32.mul
                f32.add
                local.tee 37
                f32.sub
                local.tee 35
                local.get 35
                f32.mul
                f32.add
                local.tee 38
                local.get 21
                f32.ge
                br_if 0
              end
              local.get 7
              i32.const -2147483648
              i32.eq
              local.set 32
              local.get 8
              i32.const -16777216
              i32.add
              local.set 33
              br 1
            end
            i32.const 0
            local.get 5
            i32.sub
            local.set 31
            local.get 7
            i32.const 24
            i32.shl
            local.set 8
            local.get 7
            i32.const -1
            i32.add
            local.set 5
            loop
              local.get 8
              local.set 7
              local.get 31
              local.get 5
              i32.add
              i32.const -1
              i32.eq
              br_if 4
              local.get 18
              i32.load
              local.tee 8
              i32.eqz
              br_if 3
              local.get 23
              i32.load
              local.set 32
              local.get 24
              i32.load
              local.set 33
              block
                local.get 7
                i32.const -2147483648
                i32.ne
                br_if 0
                local.get 8
                i32.const -1
                i32.eq
                br_if 4
              end
              local.get 32
              local.get 10
              i32.mul
              local.get 33
              i32.add
              local.get 7
              local.get 8
              i32.div_s
              i32.add
              i32.const 10
              i32.shr_u
              i32.const 16383
              i32.and
              call $su__pk_sincos
              local.set 34
              local.get 7
              i32.const 16777216
              i32.add
              local.set 8
              local.get 5
              i32.const 1
              i32.add
              local.set 5
              local.get 17
              local.get 26
              f32.load
              local.tee 35
              local.get 25
              f32.load
              f32.const 0x1.19999ap-1
              f32.mul
              local.tee 37
              local.get 34
              i64.const 32
              i64.shr_u
              i32.wrap_i64
              f32.reinterpret_i32
              f32.mul
              f32.add
              local.tee 36
              f32.sub
              local.tee 13
              local.get 13
              f32.mul
              local.get 16
              local.get 35
              local.get 37
              local.get 34
              i32.wrap_i64
              f32.reinterpret_i32
              f32.mul
              f32.add
              local.tee 37
              f32.sub
              local.tee 35
              local.get 35
              f32.mul
              f32.add
              local.tee 38
              local.get 21
              f32.ge
              br_if 0
            end
            local.get 7
            i32.const -2147483648
            i32.eq
            local.set 32
            local.get 8
            i32.const -16777216
            i32.add
            local.set 33
          end
          local.get 5
          i32.const 1
          i32.add
          local.set 7
          block
            block
              local.get 38
              f32.sqrt
              local.tee 16
              f32.const 0x1.a36e2ep-14
              f32.gt
              br_if 0
              f32.const 0x1p+0
              local.set 13
              f32.const 0x0p+0
              local.set 35
              br 1
            end
            local.get 35
            local.get 16
            f32.div
            local.set 35
            local.get 13
            local.get 16
            f32.div
            local.set 13
          end
          local.get 18
          i32.load
          local.tee 8
          i32.eqz
          br_if 1
          local.get 32
          local.get 8
          i32.const -1
          i32.eq
          i32.and
          br_if 1
          local.get 23
          i32.load
          local.get 9
          i32.mul
          local.get 24
          i32.load
          i32.add
          local.get 33
          local.get 8
          i32.div_s
          i32.add
          i32.const 10
          i32.shr_u
          i32.const 16383
          i32.and
          call $su__pk_sincos
          local.set 34
          local.get 1
          i32.const 152
          local.get 0
          local.get 5
          local.get 36
          local.get 20
          local.get 13
          f32.mul
          f32.add
          local.tee 17
          local.get 4
          local.get 37
          local.get 20
          local.get 35
          f32.mul
          f32.add
          local.tee 16
          f32.const 0x1.2p+3
          local.get 13
          local.get 15
          local.get 36
          local.get 26
          f32.load
          local.tee 39
          local.get 25
          f32.load
          local.tee 38
          local.get 27
          f32.load
          local.tee 40
          local.get 6
          i32.const 2501
          i32.lt_s
          select
          local.get 38
          local.get 11
          local.get 38
          local.get 40
          f32.sub
          f32.mul
          f32.sub
          local.get 28
          select
          f32.const 0x1.19999ap-1
          f32.mul
          local.tee 38
          local.get 34
          i64.const 32
          i64.shr_u
          i32.wrap_i64
          f32.reinterpret_i32
          f32.mul
          f32.add
          f32.sub
          f32.const 0x1.0624dep-7
          f32.div
          f32.sub
          f32.mul
          local.get 35
          local.get 14
          local.get 37
          local.get 39
          local.get 38
          local.get 34
          i32.wrap_i64
          f32.reinterpret_i32
          f32.mul
          f32.add
          f32.sub
          f32.const 0x1.0624dep-7
          f32.div
          f32.sub
          f32.mul
          f32.add
          local.tee 36
          f32.sub
          f32.const 0x0p+0
          local.get 36
          f32.const 0x1.2p+3
          f32.lt
          select
          local.tee 36
          call $fx
          local.get 14
          local.get 35
          local.get 36
          f32.mul
          f32.add
          local.set 14
          local.get 15
          local.get 13
          local.get 36
          f32.mul
          f32.add
          local.set 15
          i32.const 1
          local.set 30
          br 0
        end
      end
      call $su__f12
      unreachable
    end
    local.get 30
    i32.const 1
    i32.and
    i32.eqz
    br_if 0
    block
      local.get 3
      i32.const 2
      i32.and
      i32.eqz
      br_if 0
      local.get 2
      i32.const 65820
      i32.add
      local.get 3
      i32.const 229
      i32.and
      i32.store8
      local.get 2
      i32.const 65808
      i32.add
      i32.const 1075838976
      i32.store
    end
    local.get 2
    i32.const 65812
    i32.add
    local.get 14
    f32.store
    local.get 2
    i32.const 65804
    i32.add
    local.get 15
    f32.store
    local.get 2
    i32.const 65800
    i32.add
    local.get 16
    f32.store
    local.get 2
    i32.const 65792
    i32.add
    local.get 17
    f32.store
    local.get 2
    i32.const 65852
    i32.add
    local.tee 5
    local.get 5
    i32.load
    i32.const 1
    i32.add
    i32.store
  end)
(func $su__f12
  call $su__f16
  unreachable)
(func $su_setup (param i32)
  (local f32 f32 i32)
  local.get 0
  f32.convert_i32_s
  f32.sqrt
  f32.const 0x1.8p+1
  f32.mul
  f32.const 0x1p+3
  f32.add
  f32.const 0x1.8p+5
  f32.min
  local.tee 1
  f32.const 0x1.666666p-2
  f32.mul
  f32.const 0x1.8p+2
  f32.max
  local.set 2
  call $rand
  local.set 3
  i32.const 0
  i32.const 0
  i32.store offset=65612
  i32.const 0
  i32.const 12500
  i32.store offset=65616
  i32.const 0
  local.get 1
  f32.store offset=65624
  i32.const 0
  local.get 1
  f32.store offset=65664
  i32.const 0
  local.get 2
  f32.store offset=65668
  i32.const 0
  local.get 0
  i32.const 16
  i32.div_s
  local.tee 0
  i32.const 8
  local.get 0
  i32.const 8
  i32.lt_s
  select
  i32.const 2
  i32.add
  i32.store offset=65672
  i32.const 0
  local.get 3
  i32.const 16777215
  i32.and
  i32.store offset=65676
  i32.const 0
  i32.const 0
  f32.const 0x1.47ae16p+19
  local.get 1
  f32.const 0x1.ba5616p+1
  f32.mul
  f32.div
  i32.trunc_sat_f32_s
  local.tee 0
  i32.sub
  local.get 0
  local.get 3
  i32.const 0
  i32.lt_s
  select
  i32.store offset=65680)
(func $su__spawn (param i32 i32 i32)
  (local i64)
  local.get 0
  local.get 1
  i32.const 0
  f32.load offset=65664
  f32.const 0x1.19999ap-1
  f32.mul
  f32.const -0x1.19999ap+0
  f32.add
  f32.const -0x1.99999ap+0
  f32.add
  f32.const 0x1p+0
  f32.max
  call $su__pk_p_disc
  local.set 3
  local.get 2
  i32.const 1109393408
  i32.store offset=4
  local.get 2
  local.get 3
  i64.store32
  local.get 2
  local.get 3
  i64.const 32
  i64.shr_u
  i64.store32 offset=8)
(func $su_tick
  (local i32 f32 f32 i32)
  i32.const 0
  call $p_t
  local.set 0
  i32.const 0
  f32.load offset=65668
  local.set 1
  i32.const 0
  f32.load offset=65660
  local.set 2
  block
    block
      local.get 0
      i32.const 8750
      i32.eq
      br_if 0
      local.get 0
      i32.const 2500
      i32.ne
      br_if 1
      i32.const 0
      i32.const 153
      i32.const 255
      i32.const 0
      local.get 2
      f32.const 0x1.4p+5
      local.get 2
      local.get 1
      call $fx
      return
    end
    i32.const 0
    i32.const 153
    i32.const 255
    i32.const 1
    local.get 2
    f32.const 0x1.4p+5
    local.get 2
    local.get 1
    call $fx
    return
  end
  local.get 0
  i32.const 1500
  i32.rem_s
  local.set 3
  block
    local.get 0
    i32.const 1
    i32.lt_s
    br_if 0
    local.get 3
    br_if 0
    i32.const 0
    i32.const 154
    i32.const 255
    local.get 0
    i32.const 1500
    i32.div_u
    local.get 2
    f32.const 0x1.4p+5
    local.get 2
    f32.const 0x0p+0
    call $fx
  end)
(func $su__f16
  unreachable)

;; $sincos's two results in one i64, the first in the low half
(func $su__pk_sincos (param i32) (result i64)
    (local f32 f32)
    local.get 0
    call $sincos
    local.set 2
    local.set 1
    local.get 1
    i32.reinterpret_f32
    i64.extend_i32_u
    local.get 2
    i32.reinterpret_f32
    i64.extend_i32_u
    i64.const 32
    i64.shl
    i64.or)
;; $p_disc's two results in one i64, the first in the low half
(func $su__pk_p_disc (param i32 i32 f32) (result i64)
    (local f32 f32)
    local.get 0
    local.get 1
    local.get 2
    call $p_disc
    local.set 4
    local.set 3
    local.get 3
    i32.reinterpret_f32
    i64.extend_i32_u
    local.get 4
    i32.reinterpret_f32
    i64.extend_i32_u
    i64.const 32
    i64.shl
    i64.or)
