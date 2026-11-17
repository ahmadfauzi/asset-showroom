import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { box, chair, cylinder, glass, H, lamp, metal, plinth, roomKit, shade, sofa, soft, table, view } from './parts';

// Living room, 7 × 5 m: the v1 living room and dining corner. The front (+z) and right (+x) sides are open.
export function buildLiving(ktx2: KTX2Loader): BuiltRoom {
  const room = roomKit('living', ktx2);
  const { add, place } = room;

  // Shell: feature wall behind the sofa, a window on the right of the back wall, plain left wall.
  add([
    box(plinth, -3.9, 3.9, -0.65, -0.05, -2.9, 2.9),
    box('floor', -3.5, 3.5, -0.05, 0, -2.5, 2.5),
    box('featureWall', -3.65, 1.4, 0, H, -2.65, -2.5),
    box('walls', 1.4, 1.9, 0, H, -2.65, -2.5),
    box('walls', 1.9, 3.1, 0, 0.9, -2.65, -2.5),
    box('walls', 1.9, 3.1, 2.2, H, -2.65, -2.5),
    box('walls', 3.1, 3.5, 0, H, -2.65, -2.5),
    box(glass, 1.9, 3.1, 0.9, 2.2, -2.6, -2.55),
    box('walls', -3.65, -3.5, 0, H, -2.5, 2.5),
  ]);
  for (let z = -2.1; z < 0.6; z += 0.1) add([box('slatWall', -3.5, -3.46, 0.1, 2.5, z, z + 0.06)]);

  // Sofa with cushions, armchair, coffee table, rug, pouf, sideboard and floor lamp.
  add(
    [
      ...sofa(2.4),
      soft('accents', 0.45, 0.42, 0.14, -0.7, 0.42, -0.19),
      soft('accents', 0.45, 0.42, 0.14, 0.7, 0.42, -0.19),
    ],
    -0.1,
    -1.95,
  );
  add(sofa(0.95), 1.95, -0.8, -Math.PI / 2);
  add([soft('woodwork', 1.2, 0.05, 0.6, 0, 0.33, 0, 0.02), soft('woodwork', 1, 0.33, 0.4, 0, 0, 0, 0.02)], -0.1, -0.7);
  add([soft('rugs', 3.2, 0.015, 2.2, 0, 0, 0, 0.01)], -0.1, -1);
  add([cylinder('accents', 0.28, 0.4, 0, 0, 0)], 1.2, 0.2);
  add(
    [
      soft('woodwork', 1.8, 0.6, 0.45, 0, 0.1, 0, 0.02),
      ...[-0.85, 0.85].flatMap((x) => [-0.18, 0.18].map((z) => soft(metal, 0.04, 0.1, 0.04, x, 0, z, 0.01))),
    ],
    -3.25,
    -0.7,
    Math.PI / 2,
  );
  add(lamp(1.5, 0.22), -2.9, -2);

  // A potted plant on the coffee table.
  place('potted_plant_04', 0.2, 0.38, -0.7);

  // Dining corner, front left, with a pendant lamp.
  add(table(1.6, 0.9), -2, 1.5);
  for (const x of [-2.4, -1.6]) {
    add(chair(), x, 0.75);
    add(chair(), x, 2.25, Math.PI);
  }
  add([cylinder(metal, 0.006, 0.9, 0, 1.8, 0), cylinder(shade, 0.25, 0.22, 0, 1.6, 0)], -2, 1.5);

  return room.finish(5.5, view([6, 6, 7.5], 5, 16));
}
