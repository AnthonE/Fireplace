// A renderer made ahead of its game: its pipelines compiled all at once and
// off the GPU process's main thread (client/pipelines.mjs), the renderer the
// host's whoever asks for it first (client/host.mjs once(), a frontend's
// warm()), and Fireplace asking for the next game's while this one is on,
// its TV never more than a few frames ahead of the GPU. No GPU here: what a
// switch costs one is net/run-fireplace.mjs's to measure (docs/fireplace.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../client/pipelines.mjs';
import { once } from '../client/host.mjs';

const read = (f) => readFileSync(f, 'utf8');
const RENDERERS = ['client/render.mjs', 'client/arena-render.mjs', 'client/flight-render.mjs', 'client/party-render.mjs'];
const FRONTENDS = { golf: 'client/golf-game.mjs', arena: 'client/arena-game.mjs', flight: 'client/flight-game.mjs', party: 'client/party-game.mjs' };

// A device that compiles when told to and notes what is drawn: enough of WebGPU for compile().
globalThis.GPUTextureUsage ??= { RENDER_ATTACHMENT: 16 };
function fakeDevice() {
  const log = { asked: [], answer: [], textures: [], passes: [], submitted: 0 };
  const device = {
    createRenderPipelineAsync: (d) => new Promise((ok, no) => { log.asked.push(d); log.answer.push({ d, ok, no }); }),
    createTexture: (t) => { const tex = { ...t, destroyed: false, destroy() { this.destroyed = true; }, createView() { return this; } }; log.textures.push(tex); return tex; },
    createCommandEncoder: () => ({
      beginRenderPass: (p) => {
        const calls = [];
        log.passes.push({ ...p, calls });
        return { setBindGroup: (k, g) => calls.push(['bind', k, g]), setVertexBuffer: (k, b) => calls.push(['vertex', k, b]), setPipeline: (x) => calls.push(['pipeline', x]), draw: (n) => calls.push(['draw', n]), end: () => calls.push(['end']) };
      },
      finish: () => 'commands',
    }),
    queue: { submit: (c) => { assert.deepEqual(c, ['commands']); log.submitted++; } },
  };
  return { device, log };
}

test('pipelines are asked for all at once, each by its name, and one that fails fails the lot', async () => {
  const { device, log } = fakeDevice();
  const descs = { terrain: { fs: 'fs_terrain' }, splat: { fs: 'fs_splat' }, hudPipe: { fs: 'fs_hud' } };
  const made = compile(device, descs, () => {});
  // every compile is under way before the first has answered
  assert.deepEqual(log.asked, Object.values(descs));
  // answered out of order, each lands under its own name
  for (const a of [...log.answer].reverse()) a.ok({ of: a.d.fs });
  assert.deepEqual(await made, { terrain: { of: 'fs_terrain' }, splat: { of: 'fs_splat' }, hudPipe: { of: 'fs_hud' } });
  const bad = { ...device, createRenderPipelineAsync: (d) => (d.fs === 'fs_splat' ? Promise.reject(new Error('fs_splat: no such entry point')) : Promise.resolve(d)) };
  await assert.rejects(compile(bad, descs, () => {}), /fs_splat/);
});

test('each pipeline is drawn with once, into a scratch pixel of its own formats, with what the renderer binds', async () => {
  const { device, log } = fakeDevice();
  const descs = {
    // a world's pipeline: a float target and depth, multisampled; a shadow's: depth alone; a HUD's: the canvas's format, no depth
    world: { name: 'world', fragment: { targets: [{ format: 'rgba16float' }] }, depthStencil: { format: 'depth32float' }, multisample: { count: 4 } },
    shadow: { name: 'shadow', depthStencil: { format: 'depth32float' } },
    hud: { name: 'hud', fragment: { targets: [{ format: 'bgra8unorm' }] } },
  };
  const made = compile(device, descs, (pass, d) => pass.setBindGroup(0, `${d.name}'s group`));
  assert.equal(log.passes.length, 0, 'nothing is drawn before every pipeline is compiled');
  for (const a of log.answer) a.ok(`${a.d.name}'s pipeline`);
  await made;
  assert.equal(log.submitted, 1);
  assert.deepEqual(log.passes.map((p) => [p.colorAttachments.map((a) => [a.view.format, a.view.sampleCount]), p.depthStencilAttachment ? [p.depthStencilAttachment.view.format, p.depthStencilAttachment.view.sampleCount] : null]),
    [[[['rgba16float', 4]], ['depth32float', 4]], [[], ['depth32float', 1]], [[['bgra8unorm', 1]], null]]);
  for (const [k, name] of Object.keys(descs).entries()) {
    assert.deepEqual(log.passes[k].calls, [['bind', 0, `${name}'s group`], ['pipeline', `${name}'s pipeline`], ['draw', 3], ['end']], name);
  }
  // one pixel each, nothing stored, and none kept
  assert.ok(log.textures.length === 4 && log.textures.every((t) => t.size[0] === 1 && t.size[1] === 1 && t.destroyed));
  assert.ok(log.passes.every((p) => p.colorAttachments.every((a) => a.storeOp === 'discard') && (p.depthStencilAttachment?.depthStoreOp ?? 'discard') === 'discard'));
});

test('every renderer and the post compile through it: none in line but the room, made before anything draws', () => {
  for (const f of [...RENDERERS, 'client/post.mjs']) {
    const src = read(f);
    assert.match(src, /import \{ compile \} from '\.\/pipelines\.mjs';/, f);
    assert.match(src, /await (Promise\.all\(\[postMade, )?compile\(device, \{/, f);
    assert.doesNotMatch(src, /createRenderPipeline(Async)?\(/, `${f}: a pipeline of its own making`);
  }
  // golf's, the arena's and Dogfight's wait for the post's with their own, not one after the other
  for (const f of RENDERERS.slice(0, 3)) assert.match(read(f), /const postMade = createPost\(device, /, f);
  assert.match(read('client/post.mjs'), /export async function createPost\(/);
  assert.equal(read('client/room-render.mjs').match(/createRenderPipeline\(/g).length, 1);
  assert.match(read('client/pipelines.mjs'), /device\.createRenderPipelineAsync\(/);
});

test('a renderer is made once, kept as its promise, and one that failed is made again', async () => {
  const kept = new Map();
  let made = 0, finish = null;
  const make = () => { made++; return new Promise((ok) => { finish = ok; }); };
  const a = once(kept, 'party', make);
  // a mount that comes while the warm-up is still compiling waits for the same renderer
  const b = once(kept, 'party', make);
  assert.equal(a, b);
  assert.equal(made, 1);
  finish({ name: 'party' });
  assert.deepEqual(await b, { name: 'party' });
  assert.equal(await once(kept, 'party', make), await a, 'and every mount after has it');
  assert.equal(made, 1);
  // another game's is its own
  once(kept, 'golf', make);
  assert.equal(made, 2);
  // one that failed: whoever waited hears why, and the next to ask makes it afresh
  const failed = once(kept, 'arena', () => Promise.reject(new Error('WGSL: 12:3 nope')));
  await assert.rejects(failed, /nope/);
  assert.equal(kept.has('arena'), false);
  assert.deepEqual(await once(kept, 'arena', async () => ({ name: 'arena' })), { name: 'arena' });
});

test("each frontend's warm() makes its renderer on the host under its own key, and its mount takes that one", async () => {
  const canvas = { width: 320, height: 200 };
  for (const [key, f] of Object.entries(FRONTENDS)) {
    const { warm, mount } = await import(`../${f}`);
    assert.equal(typeof mount, 'function', f);
    // a host that only notes what it was asked for: nothing is made, so no GPU
    const asked = [];
    const host = { device: {}, renderer: (k, make) => { asked.push([k, typeof make]); return 'the renderer'; } };
    assert.equal(warm(host, { canvas, present: false }), 'the renderer', f);
    assert.deepEqual(asked, [[key, 'function']], f);
    const src = read(f);
    assert.match(src, /const renderer = await warm\(h(ost)?, \{ canvas, (hud, )?present \}\);/, `${f}: mount goes through warm`);
    assert.doesNotMatch(src, /renderers\.(get|set)\(/, `${f}: the host's map is the host's`);
    assert.equal(src.match(/createRenderer\(/g).length, 1, `${f}: one place makes the renderer`);
  }
  assert.match(read('client/host.mjs'), /h\.renderer = \(key, make\) => once\(h\.renderers, key, make\);/);
});

test('Fireplace makes the next game ready while this one is on, and its TV waits for the GPU', () => {
  const src = read('client/fireplace.mjs');
  // the same options the mount will give, so the renderer made ahead is the one it finds
  assert.match(src, /frontend = await mount\(host, mountOpts\(g\)\);/);
  assert.match(src, /import\(FRONTENDS\[next\]\)\.then\(\(\{ warm \}\) => warm\(host, mountOpts\(next\)\)\)\.catch\(/);
  assert.match(src, /const next = nextGame\(\);\s+if \(next === warmed\) return;\s+warmed = next;/, 'once a game');
  // once the page is inside this game and playing
  assert.match(src, /if \(steady && st === 2 && game === g\) warmNext\(\);/);
  // the game on, and so the one after it, is read from a world that is in (the join's keyframe) and not mid-change
  assert.match(src, /const steady = get\(L\.CL_KEYS\) > 0 && !\(seq & 1\) && get\(L\.CL_SEQ\) === seq;/);
  assert.match(src, /if \(st >= 1 && steady && g !== game && !mounting\) mountGame\(g\);/);
  // no TV frame while TV_AHEAD are still to be drawn; a film skips none
  assert.match(src, /const TV_AHEAD = \d;/);
  assert.match(src, /if \(tvAhead >= TV_AHEAD && !FILM\) return;\s+frontend\.frame\(now, tvTex\[game\]\);\s+tvAhead\+\+;/);
  assert.match(src, /host\.device\.queue\.onSubmittedWorkDone\(\)\.then\(drawn, drawn\);/);
  assert.equal(src.match(/frontend\.frame\(now, tvTex\[game\]\)/g).length, 1, 'the TV has the one way in');
});
