import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { box, cabinet, chair, cushion, glass, H, lamp, leg, merge, plinth, roomKit, soft, table, view, type Part } from './parts';

// Bedroom, 6 × 5 m: the v1 bed and study pieces, plus a dresser. The front (+z) and right (+x) sides are open.
export function buildBedroom(ktx2: KTX2Loader): BuiltRoom {
  const room = roomKit('bedroom', ktx2);
  const { add } = room;

  // Shell: feature wall behind the bed, a window over the desk in the left wall.
  add([
    box(plinth, -3.4, 3.4, -0.65, -0.05, -2.9, 2.9),
    box('floor', -3, 3, -0.05, 0, -2.5, 2.5),
    box('featureWall', -3.15, 0.6, 0, H, -2.65, -2.5),
    box('walls', 0.6, 3, 0, H, -2.65, -2.5),
    box('walls', -3.15, -3, 0, H, -2.5, 0.4),
    box('walls', -3.15, -3, 0, 0.9, 0.4, 1.9),
    box('walls', -3.15, -3, 2.2, H, 0.4, 1.9),
    box('walls', -3.15, -3, 0, H, 1.9, 2.5),
    box(glass, -3.1, -3.05, 0.9, 2.2, 0.4, 1.9),
  ]);

  // Bed: a frame on tapered legs with a headboard, a mattress, a duvet over the foot end with its top edge folded
  // back, two pillows, and a throw over the foot.
  add(
    [
      merge([
        soft('woodwork', 1.7, 0.2, 2.1, 0, 0.1, 0, 0.02),
        soft('woodwork', 1.8, 1, 0.08, 0, 0, -1.09, 0.04),
        ...[-1, 1].flatMap((sx) => [-0.98, 0.98].map((z) => leg('woodwork', 0.1, sx * 0.78, z, 0.03, 0.02))),
      ]),
      merge([
        soft('bedding', 1.6, 0.22, 2, 0, 0.3, 0.02, 0.06),
        cushion('bedding', 1.68, 0.3, 1.5, 0, 0.25, 0.29, 0.06, 2),
        soft('bedding', 1.7, 0.05, 0.26, 0, 0.53, -0.42, 0.025),
        cushion('bedding', 0.62, 0.12, 0.42, -0.4, 0.52, -0.74, 0.4, 3),
        cushion('bedding', 0.62, 0.12, 0.42, 0.4, 0.52, -0.74, 0.4, 4),
      ]),
      soft('accents', 1.72, 0.2, 0.5, 0, 0.37, 0.65, 0.02),
    ],
    -1,
    -1.35,
  );
  // Nightstands with lamps, rug and dresser.
  for (const x of [-2.2, 0.2]) {
    add(cabinet(0.45, 0.5, 0.4, 1, 2, 0.12), x, -2.2);
    add(lamp(0.45, 0.12).map(([g, m]) => [g.translate(0, 0.5, 0), m] as Part), x, -2.2);
  }
  add([soft('rugs', 2.6, 0.015, 1.8, 0, 0, 0, 0.01)], -1, -0.6);
  add(cabinet(1.3, 0.85, 0.5, 2, 3), 1.9, -2.2);

  // Study: desk under the window, chair with an Accents seat and back, desk lamp.
  add(table(1.4, 0.7), -2.6, 1.15, Math.PI / 2);
  add(chair('accents', 6), -1.85, 1.15, -Math.PI / 2);
  add(lamp(0.4, 0.09).map(([g, m]) => [g.translate(0, 0.75, 0), m] as Part), -2.75, 0.65);

  return room.finish(5, view([5.5, 5.8, 7], 5, 15));
}
