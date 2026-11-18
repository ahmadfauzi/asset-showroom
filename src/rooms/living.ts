import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { LatheGeometry, Vector2 } from 'three';
import { box, cabinet, chair, cushion, cylinder, glass, H, lamp, leg, merge, metal, plinth, roomKit, shade, sofa, soft, standUp, table, view, type Part } from './parts';

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
  add([merge(Array.from({ length: 27 }, (_, i) => box('slatWall', -3.5, -3.46, 0.1, 2.5, -2.1 + i * 0.1, -2.04 + i * 0.1, 0.008)))]);

  // Sofa with cushions, armchair, coffee table, rug, pouf, sideboard and floor lamp.
  // The scatter cushions lean on the back cushions, which come 0.17 m forward of the frame.
  add(
    [
      ...sofa(2.4),
      merge([-0.7, 0.7].map((x, i) => standUp(cushion('accents', 0.42, 0.13, 0.42, 0, 0, 0, 0.35, i + 3, 0.06), 0.42, x, 0.52, -0.12, 0.35))),
    ],
    -0.1,
    -1.95,
  );
  add(sofa(0.95, 5), 1.95, -0.8, -Math.PI / 2);
  add(
    [
      merge([
        soft('woodwork', 1.2, 0.05, 0.6, 0, 0.33, 0, 0.015, 1),
        soft('woodwork', 1.08, 0.025, 0.48, 0, 0.1, 0, 0.008),
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => leg('woodwork', 0.33, sx * 0.52, sz * 0.22, 0.026, 0.016))),
      ]),
    ],
    -0.1,
    -0.7,
  );
  add([soft('rugs', 3.2, 0.015, 2.2, 0, 0, 0, 0.01)], -0.1, -1);
  // A round pouf with soft, rounded edges.
  const pouf: Part = [
    new LatheGeometry([[0, 0], [0.25, 0], [0.28, 0.04], [0.29, 0.2], [0.28, 0.36], [0.25, 0.4], [0.12, 0.415], [0, 0.418]].map(([x, y]) => new Vector2(x, y)), 32),
    'accents',
  ];
  add([pouf], 1.2, 0.2);
  add(cabinet(1.8, 0.7, 0.45, 3, 1), -3.25, -0.7, Math.PI / 2);
  add(lamp(1.5, 0.22), -2.9, -2);

  // A potted plant on the coffee table.
  place('potted_plant_04', 0.2, 0.38, -0.7);

  // Dining corner, front left, with a pendant lamp.
  add(table(1.6, 0.9), -2, 1.5);
  for (const x of [-2.4, -1.6]) {
    add(chair('upholstery', x), x, 0.75);
    add(chair('upholstery', x + 1), x, 2.25, Math.PI);
  }
  add([cylinder(metal, 0.006, 0.9, 0, 1.8, 0), cylinder(shade, 0.25, 0.22, 0, 1.6, 0)], -2, 1.5);

  return room.finish(5.5, view([6, 6, 7.5], 5, 16));
}
