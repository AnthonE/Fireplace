// What golf, the arena and Dogfight do to a frame once the world is drawn,
// the cartoon's half of the look (client/lowpoly.mjs is the paint): the
// world goes into a float texture brighter than the screen can show, and
// from it and its depth come ink lines (wherever 1/depth bends or jumps
// between neighbours: silhouettes and creases, a plane never, thinning out
// with distance), a bloom off everything past white (the sun, tracers,
// blasts, lit clouds: five halvings down and back up), a shoulder that
// rolls the brights off without washing the colours out, and FXAA over the
// result. The HUD is drawn after all of it, by its own renderer in the last
// pass, so text stays sharp. A renderer draws its world into `scene` and
// `depth` (linear: metres ahead over far, 1 the sky) and then calls
// finish(). Drawing only: nothing here is hashed.
import { compile } from './pipelines.mjs';

export const SCENE_FORMAT = 'rgba16float';
export const DEPTH_FORMAT = 'depth32float';
const LEVELS = 5;

const WGSL = /* wgsl */ `
struct P {
  ink: vec4f, // far (m), how far the lines carry (m), their width (px), their strength (0..1)
  fx: vec4f,  // the bloom's strength, where it starts, 0, 0
};
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(1) @binding(0) var<uniform> p: P;
@group(1) @binding(1) var bloom: texture_2d<f32>;
@group(1) @binding(2) var depth: texture_depth_2d;

struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var o: V;
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(xy * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(xy.x, 1.0 - xy.y);
  return o;
}

fn tap4(uv: vec2f, r: f32) -> vec3f {
  let t = r / vec2f(textureDimensions(src));
  return (textureSampleLevel(src, samp, uv + vec2f(-t.x, -t.y), 0.0).rgb + textureSampleLevel(src, samp, uv + vec2f(t.x, -t.y), 0.0).rgb
    + textureSampleLevel(src, samp, uv + vec2f(-t.x, t.y), 0.0).rgb + textureSampleLevel(src, samp, uv + vec2f(t.x, t.y), 0.0).rgb) * 0.25;
}
// the first halving keeps only what is past white, its colour held
@fragment fn fs_bright(v: V) -> @location(0) vec4f {
  let c = min(tap4(v.uv, 1.0), vec3f(16.0));
  let m = max(c.r, max(c.g, c.b));
  return vec4f(c * (max(m - 0.92, 0.0) / max(m, 1e-4)), 1.0);
}
@fragment fn fs_down(v: V) -> @location(0) vec4f { return vec4f(tap4(v.uv, 1.0), 1.0); }
// and back up, each level added onto the one above it
@fragment fn fs_up(v: V) -> @location(0) vec4f { return vec4f(tap4(v.uv, 0.5), 1.0); }

const INK = vec3f(0.09, 0.08, 0.2);
fn zAt(q: vec2i, hi: vec2i) -> f32 { return max(textureLoad(depth, clamp(q, vec2i(0), hi), 0), 1e-5); }

@fragment fn fs_comp(v: V) -> @location(0) vec4f {
  let q = vec2i(v.pos.xy);
  let hi = vec2i(textureDimensions(depth)) - 1;
  var c = textureLoad(src, q, 0).rgb;
  // ink: 1/depth is a straight line across any plane, so its second difference is 0 there and not at an edge
  let r = i32(p.ink.z);
  let z0 = zAt(q, hi);
  let a = z0 / zAt(q + vec2i(r, 0), hi) + z0 / zAt(q - vec2i(r, 0), hi) - 2.0;
  let b = z0 / zAt(q + vec2i(0, r), hi) + z0 / zAt(q - vec2i(0, r), hi) - 2.0;
  let d1 = z0 / zAt(q + vec2i(r, r), hi) + z0 / zAt(q - vec2i(r, r), hi) - 2.0;
  let d2 = z0 / zAt(q + vec2i(r, -r), hi) + z0 / zAt(q - vec2i(r, -r), hi) - 2.0;
  let bend = max(max(abs(a), abs(b)), max(abs(d1), abs(d2)));
  // the nearer side of an edge carries the line: the thing in front is what is outlined
  let near = min(z0, min(min(zAt(q + vec2i(r, 0), hi), zAt(q - vec2i(r, 0), hi)), min(zAt(q + vec2i(0, r), hi), zAt(q - vec2i(0, r), hi)))) * p.ink.x;
  let line = smoothstep(0.035, 0.09, bend) * exp(-near / p.ink.y) * p.ink.w;
  c = mix(c, INK * (0.6 + 0.8 * c), line);
  c += textureSampleLevel(bloom, samp, v.uv, 0.0).rgb * p.fx.x;
  // the shoulder: as it was up to 0.8, then rolling off toward 1, the brightest channel leading so a colour keeps its hue,
  // and what is far past white going white
  let m = max(c.r, max(c.g, c.b));
  let t = select(m, 0.8 + 0.2 * (1.0 - exp(-(m - 0.8) / 0.2)), m > 0.8);
  c = c * (t / max(m, 1e-4));
  c = mix(c, vec3f(1.0), smoothstep(1.2, 4.0, m) * 0.85);
  // half a level of noise against banding in the sky
  let n = fract(sin(dot(v.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(clamp(c + n / 255.0, vec3f(0.0), vec3f(1.0)), 1.0);
}

// FXAA (Lottes' console version): blur along the edge the lumas around a pixel show, if the blur stays within their range
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
@fragment fn fs_fxaa(v: V) -> @location(0) vec4f {
  let px = 1.0 / vec2f(textureDimensions(src));
  let m = textureSampleLevel(src, samp, v.uv, 0.0).rgb;
  let nw = luma(textureSampleLevel(src, samp, v.uv + vec2f(-1.0, -1.0) * px, 0.0).rgb);
  let ne = luma(textureSampleLevel(src, samp, v.uv + vec2f(1.0, -1.0) * px, 0.0).rgb);
  let sw = luma(textureSampleLevel(src, samp, v.uv + vec2f(-1.0, 1.0) * px, 0.0).rgb);
  let se = luma(textureSampleLevel(src, samp, v.uv + vec2f(1.0, 1.0) * px, 0.0).rgb);
  let lm = luma(m);
  let lo = min(lm, min(min(nw, ne), min(sw, se)));
  let hi = max(lm, max(max(nw, ne), max(sw, se)));
  if (hi - lo < max(0.03, hi * 0.08)) { return vec4f(m, 1.0); }
  var dir = vec2f(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  let reduce = max((nw + ne + sw + se) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2f(-8.0), vec2f(8.0)) * px;
  let a = 0.5 * (textureSampleLevel(src, samp, v.uv + dir * (1.0 / 3.0 - 0.5), 0.0).rgb + textureSampleLevel(src, samp, v.uv + dir * (2.0 / 3.0 - 0.5), 0.0).rgb);
  let b = a * 0.5 + 0.25 * (textureSampleLevel(src, samp, v.uv - dir * 0.5, 0.0).rgb + textureSampleLevel(src, samp, v.uv + dir * 0.5, 0.0).rgb);
  let lb = luma(b);
  return vec4f(select(b, a, lb < lo || lb > hi), 1.0);
}
`;

// device, the frame's size, the format of what finish() draws into (the
// canvas's), and far: the metres a depth of 1 stands for. Resolves once its
// pipelines are compiled (client/pipelines.mjs).
export async function createPost(device, { W, H, format, far, inkReach = 170, inkStrength = 0.85, bloom = 0.75 }) {
  const module = device.createShaderModule({ code: WGSL });
  const tex = (w, h, f, usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING) => device.createTexture({ size: [w, h], format: f, usage });
  const scene = tex(W, H, SCENE_FORMAT);
  const depth = tex(W, H, DEPTH_FORMAT);
  const ldr = tex(W, H, 'rgba8unorm');
  const mips = Array.from({ length: LEVELS }, (_, k) => tex(Math.max(1, W >> (k + 1)), Math.max(1, H >> (k + 1)), SCENE_FORMAT));
  const samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const srcLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
  ] });
  const compLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
  ] });
  const ubuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  // the lines a pixel wide at 600 rows, wider on a bigger screen
  device.queue.writeBuffer(ubuf, 0, Float32Array.of(far, inkReach, Math.max(1, Math.round(H / 640)), inkStrength, bloom, 0, 0, 0));
  const srcOf = (t) => device.createBindGroup({ layout: srcLayout, entries: [{ binding: 0, resource: samp }, { binding: 1, resource: t.createView() }] });
  const sceneSrc = srcOf(scene), ldrSrc = srcOf(ldr), mipSrc = mips.map(srcOf);
  const comp = device.createBindGroup({ layout: compLayout, entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: mips[0].createView() }, { binding: 2, resource: depth.createView() }] });
  const one = device.createPipelineLayout({ bindGroupLayouts: [srcLayout] });
  const two = device.createPipelineLayout({ bindGroupLayouts: [srcLayout, compLayout] });
  const pipe = (layout, fs, f, blend) => ({
    layout, vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: fs, targets: [{ format: f, blend }] }, primitive: { topology: 'triangle-list' },
  });
  const add = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
  const { bright, down, up, compPipe, fxaa } = await compile(device, {
    bright: pipe(one, 'fs_bright', SCENE_FORMAT),
    down: pipe(one, 'fs_down', SCENE_FORMAT),
    up: pipe(one, 'fs_up', SCENE_FORMAT, add),
    compPipe: pipe(two, 'fs_comp', 'rgba8unorm'),
    fxaa: pipe(one, 'fs_fxaa', format),
  }, (pass, d) => { pass.setBindGroup(0, sceneSrc); if (d.layout === two) pass.setBindGroup(1, comp); });
  const sceneView = scene.createView(), depthView = depth.createView(), ldrView = ldr.createView(), mipViews = mips.map((t) => t.createView());

  const full = (enc, view, pipeline, src, loadOp = 'clear', extra = null) => {
    const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp, storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, src);
    if (extra) pass.setBindGroup(1, extra);
    pass.draw(3);
    return pass;
  };
  return {
    // what the world's pass draws into
    sceneView, depthView,
    // The rest of the frame, after the world's pass has ended: into `view`
    // (the canvas's texture, or a capture's), and over it whatever `over`
    // draws in the same pass (the HUD: a pipeline of `format` with no depth).
    finish(enc, view, over) {
      full(enc, mipViews[0], bright, sceneSrc).end();
      for (let k = 1; k < LEVELS; k++) full(enc, mipViews[k], down, mipSrc[k - 1]).end();
      for (let k = LEVELS - 1; k > 0; k--) full(enc, mipViews[k - 1], up, mipSrc[k], 'load').end();
      full(enc, ldrView, compPipe, sceneSrc, 'clear', comp).end();
      const pass = full(enc, view, fxaa, ldrSrc);
      over?.(pass);
      pass.end();
    },
  };
}
