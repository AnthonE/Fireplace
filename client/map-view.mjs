// The map editor's 3D view: the arena's own renderer (client/arena-render.mjs)
// drawing the map being edited, so what it shows is what a fighter sees, from
// a camera that orbits a point on the map. It holds no game: the renderer
// gets a memory with no fighters in it, the ground the editor holds, the
// boxes the build's compiler made, and sprites for what can be placed.
//
//   const v = await createMapView(canvas)
//   v.ground({ W, H, ox, oz, hgt, srf })   the editor's images (hgt u16 in 1/256 m)
//   v.map(result)                          compileSpec's result: boxes and groups
//   v.marks({ solid, glow, zone })         sprites and zones, as the renderer takes them
//   v.draw({ target, yaw, pitch, dist })   draws a frame
//
// With `present: false` it draws into a texture and copies the picture onto
// the canvas as a 2D image: slower, and what headless Chrome needs (on
// SwiftShader, presenting to a canvas loses the GPU device; the gates' ?present=0).
import * as L from '../src/layout.mjs';
import { createRenderer } from './arena-render.mjs';

const GRID = L.GRID;

export async function createMapView(canvas, { present = true } = {}) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('the 3D view needs WebGPU, which this browser does not have');
  const device = await adapter.requestDevice();
  // the renderer is made for a canvas size; a new one, on the same device, when the size changes
  let renderer = null, made = '';
  // a memory as the renderer reads the sim's: no fighters or projectiles, the
  // world's ground at TERRAIN_H and TERRAIN_S
  const u8 = new Uint8Array(L.TERRAIN_END);
  const h16 = new Uint16Array(u8.buffer, L.TERRAIN_H, GRID * GRID);
  const s8 = u8.subarray(L.TERRAIN_S, L.TERRAIN_S + GRID * GRID);
  let boxes = { boxes: [], groups: [] }, marks = { solid: [], glow: [], zone: null };
  let groundSent = false, mapSent = false;
  const text = new Uint32Array(1 << 16);

  async function sized() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(64, Math.round(canvas.clientWidth * dpr)), h = Math.max(64, Math.round(canvas.clientHeight * dpr));
    if (renderer && made === `${w}x${h}`) return renderer;
    canvas.width = w; canvas.height = h;
    made = `${w}x${h}`;
    renderer = await createRenderer(canvas, { device, present });
    groundSent = mapSent = false;
    return renderer;
  }

  return {
    // The world's ground from the map's images: inside them, as they are;
    // outside, as the sim's $arena_gen raises it, the nearest edge sample and
    // a quarter metre a sample further out (the sim adds noise to that).
    ground({ W, H, ox, oz, hgt, srf }) {
      const x0 = ox / L.SPACING, z0 = oz / L.SPACING;
      for (let z = 0; z < GRID; z++) {
        const ez = Math.min(H - 1, Math.max(0, z - z0));
        for (let x = 0; x < GRID; x++) {
          const ex = Math.min(W - 1, Math.max(0, x - x0));
          const dx = x - x0 - ex, dz = z - z0 - ez, k = z * GRID + x;
          const e = ez * W + ex;
          if (!dx && !dz) { h16[k] = hgt[e]; s8[k] = srf[e]; continue; }
          h16[k] = Math.min(65535, hgt[e] + Math.round(Math.sqrt(dx * dx + dz * dz) * 64));
          s8[k] = 0;
        }
      }
      groundSent = false;
    },
    map(result) {
      boxes = {
        boxes: result.boxes.map((b) => ({ box: b.box, material: b.material })),
        groups: result.groups.map((g) => ({ box: g.bound, first: g.first, count: g.count })),
      };
      mapSent = false;
    },
    marks(m) { marks = { solid: m.solid || [], glow: m.glow || [], zone: m.zone || null }; },

    // A frame from the camera: `dist` metres from `target`, looking at it
    // along `yaw` (0 towards +x) and `pitch` (down is negative). The
    // renderer's pitch is a shear, not a turn, so the target stays mid-screen
    // and steep views stretch; it holds to 1.3.
    async draw({ target, yaw, pitch, dist }) {
      const r = await sized();
      if (!groundSent) { r.setTerrain(u8); groundSent = true; }
      if (!mapSent) { r.setMap(boxes); mapSent = true; }
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cam = [target[0] - Math.cos(yaw) * cp * dist, target[1] - sp * dist, target[2] - Math.sin(yaw) * cp * dist];
      const s = {
        cam, yaw, pitch, zoom: 1, time: performance.now() / 1000, dt: 0, dtPred: 0, proj: L.PROJ, slot: 999,
        solid: marks.solid, glow: marks.glow, beams: [], rects: [], tracker: null, text, graph: null, marker: 0, hurt: 0,
        scope: false, sides: 0, zone: marks.zone, crosshair: 7, gap: 0,
      };
      if (present) { r.frame(u8, s); return; }
      const { width, height, rgba } = await r.capture(u8, s);
      canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
    },
  };
}
