import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { box, chair, glass, H, lamp, metal, plinth, roomKit, soft, view, type Part } from './parts';

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

  // Bed with a throw, nightstands with lamps, rug and dresser.
  add(
    [
      soft('woodwork', 1.7, 0.3, 2.1, 0, 0, 0, 0.02),
      soft('woodwork', 1.8, 1, 0.08, 0, 0, -1.09, 0.02),
      soft('bedding', 1.6, 0.25, 2, 0, 0.3, 0.02, 0.08),
      soft('bedding', 0.6, 0.14, 0.4, -0.4, 0.55, -0.72, 0.06),
      soft('bedding', 0.6, 0.14, 0.4, 0.4, 0.55, -0.72, 0.06),
      soft('accents', 1.66, 0.03, 0.5, 0, 0.55, 0.65, 0.015),
    ],
    -1,
    -1.35,
  );
  for (const x of [-2.2, 0.2]) {
    add([soft('woodwork', 0.45, 0.5, 0.4, 0, 0, 0, 0.02)], x, -2.2);
    add(lamp(0.45, 0.12).map(([g, m]) => [g.translate(0, 0.5, 0), m] as Part), x, -2.2);
  }
  add([soft('rugs', 2.6, 0.015, 1.8, 0, 0, 0, 0.01)], -1, -0.6);
  add(
    [
      soft('woodwork', 1.3, 0.75, 0.5, 0, 0.1, 0, 0.02),
      ...[-0.6, 0.6].flatMap((x) => [-0.2, 0.2].map((z) => soft(metal, 0.04, 0.1, 0.04, x, 0, z, 0.01))),
      ...[0.3, 0.52, 0.74].flatMap((y) => [-0.3, 0.3].map((x) => soft(metal, 0.18, 0.02, 0.02, x, y, 0.26, 0.005))),
    ],
    1.9,
    -2.2,
  );

  // Study: desk under the window, chair with an Accents seat and back, desk lamp.
  add(
    [
      soft('woodwork', 1.4, 0.04, 0.7, 0, 0.71, 0, 0.01),
      soft('woodwork', 0.04, 0.71, 0.66, -0.66, 0, 0, 0.01),
      soft('woodwork', 0.04, 0.71, 0.66, 0.66, 0, 0, 0.01),
    ],
    -2.6,
    1.15,
    Math.PI / 2,
  );
  add(chair('accents'), -1.85, 1.15, -Math.PI / 2);
  add(lamp(0.4, 0.09).map(([g, m]) => [g.translate(0, 0.75, 0), m] as Part), -2.75, 0.65);

  return room.finish(5, view([5.5, 5.8, 7], 5, 15));
}
