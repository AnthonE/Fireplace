// Moving boxes, for a renderer: the boxes of a map's groups that move,
// written over their place in its box buffer (eight f32 a box, as setMap
// writes them) where they are at the tick drawn (src/arena-view.mjs moverAt).
// Drawing only: the sim's $mv places them for play.
import { moverAt } from '../src/arena-view.mjs';
import * as L from '../src/layout.mjs';

// map: a View's map() (or the map editor's): null if nothing in it moves
export function moverBoxes(map) {
  const moving = map.groups.filter((g) => g.move);
  if (!moving.length) return null;
  const data = moving.map((g) => new Float32Array(8 * g.count));
  return {
    // t: the tick drawn, its fraction carrying the boxes on between ticks
    write(device, buf, t) {
      moving.forEach((g, i) => {
        const [ox, oy, oz] = moverAt(g.move, t), d = data[i];
        for (let k = 0; k < g.count; k++) {
          const { box: b, material: m } = map.boxes[g.first + k];
          d.set([b[0] + ox, b[1] + oy, b[2] + oz, m & 255, b[3] + ox, b[4] + oy, b[5] + oz, m >>> 8], 8 * k);
        }
        device.queue.writeBuffer(buf, 32 * g.first, d);
      });
    },
  };
}

// The tick a frame draws: the one the confirmed world last stepped, carried on dt seconds
export const drawnTick = (u8, dt = 0) => new DataView(u8.buffer, u8.byteOffset).getUint32(L.HDR_TICK, true) - 1 + dt * L.TICK_HZ;
