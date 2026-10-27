# A minigame in Rust

A Party minigame's rules can be Rust instead of hand-written WebAssembly
text. The crate is `rust/mg/<key>/`, on the engine's bindings in `rust/fp/`;
`node tools/rust.mjs` builds it with cargo (`no_std`,
`wasm32-unknown-unknown`) and turns the wasm into `src/mg/<key>.wat`, which the
assembler takes as it takes every other minigame's: included from
`src/party.wat`, every name under the minigame's prefix, checked as source and
again as binary for `memory.grow`, mutable globals, active data segments and
relaxed SIMD. That file is checked in, so `npm run build` needs no Rust and
every build stays what it was; CI rebuilds the crate and fails if the two
differ. The gates test the built wasm, never the Rust.

SUMO RING (minigame 40) is the first: `rust/mg/sumo/src/lib.rs`, 226 lines
of Rust for six hooks (start, begin and out are left empty). A round ring
over the sea, bumps on; posts orbit it, swinging 12 s one way and then back,
and knock away any ball they meet at 9 m/s; from 20 s the ring shrinks over
50 s to 35% of its size. The last ball on wins; balls that go off together
share it.

```sh
node tools/new-mg.mjs <key> <prefix> "<NAME>" --rust   # a new one: the sumo scaffold, in Rust
node tools/rust.mjs                                    # after every change to the Rust: writes src/mg/<key>.wat
npm run build && node --test test/mg-<key>.test.mjs test/rust.test.mjs
node tools/rust.mjs --check                            # what CI runs: the checked-in WAT is what the Rust builds to
```

It needs Rust (rustup, then `rustup target add wasm32-unknown-unknown`). The
WAT's head names the rustc that made it (1.97.0 for SUMO RING); `--check`
compares like with like, so CI installs that version. No crate from outside
`rust/`.

## Writing one

The hooks are the WAT's, exported as `<prefix>_<hook>`, with the same
arguments (the top of `src/party.wat` and the scaffold's head say what each
is given and may do):

```rust
#![no_std]
use fp::*;                       // the layout's numbers, memory, a ball, the engine's functions
include!("../gen/consts.rs");    // the minigame's own src/mg/<key>.mjs

#[no_mangle]
pub extern "C" fn su_ground(d: i32, x: f32, y: f32, z: f32) -> f32 {
    let r = ld_f32(PG_H + SU_RAD + d);
    let (dx, dz) = (x - centre(d), z - centre(d));
    if y >= PLAT_Y && dx * dx + dz * dz <= r * r { PLAT_Y } else { -1000.0 }
}
```

- setup, spawn and ground are required; a hook left out is written empty
  (over: 0). spawn hands its point back through a pointer,
  `<prefix>_spawn(i: i32, n: i32, out: &mut [f32; 3])` (the WAT's spawn
  returns three values; the adapter reads them from `RS_OUT`, 16 bytes of
  serial scratch outside the region).
- Every number in `src/layout.mjs` (with PHYS and BPHYS) and in the
  minigame's own `src/mg/<key>.mjs` is a `pub const`: an integer an `i32`, a
  fraction or a PHYS string an `f32`. tools/rust.mjs writes them into
  `gen/` (not checked in). Rust bakes them in where the WAT reads `@NAME` at
  build time, so the WAT's head lists every one the crate's source names and
  `test/rust.test.mjs` fails, without needing Rust, when layout.mjs has moved
  one since.
- Memory by address: `ld_f32`, `st_i32`, `ld_u8`, `st_u16` and so on, at
  `PG_H + ... + d` for bank `d`, as the WAT does. `Ball::of(p, d)` is ball
  p's record on bank d (`px()`, `set_vx()`, `fl()`, `m()`, `is_in()`,
  `rad()`).
- The engine's functions: `rand`, `sincos`, `p_t`, `p_unit`, `p_seed`,
  `p_disc`, `p_hex`, `p_hexc`, `hash32`, `fx`, `sqrt`, `floor`, `ceil`,
  `trunc`, `nearest`, `fmin`, `fmax`. More is one line in `rust/fp/src/lib.rs`'s
  `sys` block: an import named for the engine's `$name` calls it; one that
  returns two 32-bit values is `name__pk`, the pair packed in an i64 (no
  memory). The f32 ones become the instruction itself.

## What the sim can't have, and the converter refuses

tools/rust.mjs reads the wasm and stops on any of these, naming the function
and the instruction:

| refused | what does it in Rust | instead |
| --- | --- | --- |
| a global (`__stack_pointer` included) | the stack: a local array, a value whose address is taken, a tuple or struct handed back by a function that isn't inlined | scalars in locals; `#[inline(always)]` on a helper that returns two values (SUMO RING's `post`) |
| memory of its own (`__data_end` past `__global_base`, a data segment) | a `static`, a string, a `const` table indexed at run time | state in PG_H, PG_S, PG_BIG and the record; tables built into PG_BIG by setup |
| `call_indirect`, a table | function pointers, `dyn` | a `match` |
| `memory.grow`, `memory.size` | an allocator | none: the memory is the engine's 64 pages |
| an import from anywhere but `fp` | a crate that expects an OS | the fp crate |

`rust/.cargo/config.toml` keeps LLVM from turning a `match` into a lookup
table in memory (`-switch-to-lookup=false`), so a `match` stays branches.
The stack is refused rather than given a home because the confirmed world and
the prediction's instance call the hooks at once on different threads: a
stack would want a region per bank and a mutable stack pointer per instance,
an exception to the mutable-global rule this spike doesn't make.

The sim's float rules hold as they do in WAT. Rust's `a * b + c` is a
multiply then an add, never fused (`mul_add` would call `fmaf`, an import
the converter refuses); LLVM only reorders float maths when that changes no
bit. Angles go through `sincos` (1/16384 turn), never a float sin or cos.
`rand` only from serial confirmed code, never in begin, ground or push.
Integer overflow wraps (release, no overflow checks), and a division by zero
or an index out of bounds traps the sim.

## Measured

- `npm run build` before and after: golf, the arena and bumper balls
  bit-identical (`8ef1bbb687c46cb9`, `6ed5b92310f82d7f`, `2e9ea0302ee85c3c`);
  with the tooling alone (tools/rust.mjs, rust/fp, RS_OUT in the layout) all
  five, party and Fireplace too. SUMO RING changes party and Fireplace, as any
  minigame does.
- SUMO RING's WAT: 14 functions, 1,086 lines; Party's wasm grows 134,319 B to
  136,851 B. The same WAT from `cargo clean` and from another checkout path.
- Its recorded log, 20,000 ticks of 16 AI balls (`node tools/genparty.mjs
  --mg 30`), equal on every tick in all 27 configurations of the matrix
  (Node, Deno, Chrome x JIT tiers x 1, 2, 4 threads).
- Online, forced (`node net/run-party.mjs --mg 30`): Chrome and 15 AI balls,
  16 sessions, 943 hashes compared, all equal; with 127, 128 sessions,
  7,456 hashes, all equal.
- `npm test` with it in: 716 tests, all pass. Adding a minigame moved which
  seed's first round is Thin Ice, so `test/party.test.mjs`'s rotation test
  now finds that seed rather than naming it (it broke for any 31st minigame,
  WAT or Rust).
- `test/mg-sumo.test.mjs`, 9 tests: the ring and posts for 1, 8, 64 and 256
  balls; the shrink and the swing against the client's mirror; the edge on
  every tick; a post's knock (9 m/s off the post, up, an FX, PG_M); the end;
  the prediction bit for bit through a knock, the shrinking edge and the
  swing turning back; rounds of 8 and 64 AI balls on the debug build, equal
  on 1 and 4 threads. `test/rust.test.mjs`, 5: the built-against numbers, the
  rebuild, the generated constants, the converter, and every refusal above.
- `node tools/new-mg.mjs zring zr "Z RING" --rust` on a copy: the scaffold
  builds and its two tests pass.
- Merged with main's ten minigames (30 to 39), SUMO RING moved from 30 to 40
  and its FX kinds to its own block (192 to 194); `node tools/rust.mjs`
  rewrote only those three literals (the rest of the layout it bakes in had
  not moved), and `--check` agrees. Golf, the arena, flight and bumper balls
  build to main's bytes, release and debug; Party's wasm grows 188,355 B to
  190,883 B. Its log of 16 AI balls (`--mg 40`) equal in all 27
  configurations; forced online, Chrome and 15 AI balls, 944 hashes, all
  equal; `npm test`, 949 tests, all pass.
