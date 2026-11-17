import { MeshStandardMaterial } from 'three';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { box, cushion, cylinder, merge, metal, plinth, roomKit, shade, soft, view, type Part } from './parts';

// The house wall and its door and window. They are not surfaces you can retexture.
const render = new MeshStandardMaterial({ color: '#d9d3c7', roughness: 0.9 });
const door = new MeshStandardMaterial({ color: '#3d4a45', roughness: 0.6 });
const frame = new MeshStandardMaterial({ color: '#f2efe8', roughness: 0.5 });
// Dark glass that shows the sky. The shared indoor glass changes with the time of day, so it isn't used here.
const windowGlass = new MeshStandardMaterial({ color: '#27313b', roughness: 0.05, metalness: 0.6 });

const DECK = 0.18; // height of the deck's top

// A low fence along z at x: a post every 2 m, three boards and a cap, with bevelled edges.
const fence = (x: number): Part[] => [
  merge([
    ...[-3.95, -2, 0, 2, 3.95].map((z) => box('fence', x - 0.05, x + 0.05, 0, 1, z - 0.05, z + 0.05, 0.008)),
    ...[0.15, 0.45, 0.75].map((y) => box('fence', x - 0.03, x + 0.03, y, y + 0.2, -4, 4, 0.006)),
    box('fence', x - 0.07, x + 0.07, 1, 1.04, -4, 4, 0.01),
  ]),
];

// A path light: a post with a glowing head. Its light goes at the middle of the head.
const pathLight = (): Part[] => [
  cylinder(metal, 0.025, 0.5, 0, 0, 0),
  cylinder(shade, 0.06, 0.12, 0, 0.5, 0),
  cylinder(metal, 0.08, 0.02, 0, 0.62, 0),
];

// Garden, 12 × 8 m. The house wall is at the back (-z), with a door onto a wooden deck on the left and a window
// on the right. Low fences run down the left and right sides. A stone path leads from the front to the deck.
export function buildGarden(ktx2: KTX2Loader): BuiltRoom {
  const room = roomKit('garden', ktx2);
  const { add, place } = room;

  // Plinth, lawn and the house wall with its door and window.
  add([
    box(plinth, -6.4, 6.4, -0.65, -0.05, -4.6, 4.4),
    box('ground', -6, 6, -0.05, 0, -4, 4),
    box(render, -6.2, 6.2, 0, 3.2, -4.6, -4),
    box(frame, -2.4, -1.3, DECK, 2.35, -4.02, -3.98),
    box(door, -2.32, -1.38, DECK, 2.29, -4.04, -3.97),
    soft(metal, 0.03, 0.03, 0.12, -1.48, 1.15, -3.96, 0.01),
    box(frame, 2.2, 3.8, 1.05, 2.35, -4.03, -3.98),
    box(windowGlass, 2.27, 3.73, 1.12, 2.28, -4.05, -3.97),
    box(frame, 2.97, 3.03, 1.12, 2.28, -4.06, -3.96),
    box(frame, 2.15, 3.85, 1.0, 1.06, -4.1, -3.95),
  ]);

  // Deck: a frame with boards along x and a step down to the path.
  add([
    box('deck', -5.6, -0.4, 0, DECK - 0.04, -3.98, -1.62),
    merge(Array.from({ length: 16 }, (_, i) => box('deck', -5.6, -0.4, DECK - 0.04, DECK, -3.98 + i * 0.148, -3.98 + i * 0.148 + 0.138, 0.005))),
    box('deck', -2.5, -1.2, 0, 0.09, -1.62, -1.3),
  ]);

  // Stone path: two rows of slabs from the step to the front edge, ending 6 cm inside it.
  add([
    merge(
      Array.from({ length: 9 }, (_, row) =>
        [-2.45, -1.83].map((x) => box('path', x, x + 0.58, 0, 0.03, -1.24 + row * 0.58, -1.24 + row * 0.58 + 0.54, 0.01)),
      ).flat(),
    ),
  ]);

  add(fence(-5.95));
  add(fence(5.95));

  // Four path lights, two on each side of the path.
  for (const [x, z] of [[-2.8, 0.2], [-0.95, 1.4], [-2.8, 2.6], [-0.95, 3.6]]) add(pathLight(), x, z);

  // The table and chairs on the deck, with a seat pad on each chair. The pads sit on the chair seats, which are
  // at 0.39 m, turned the same as each chair in the model.
  const table = { x: -4.2, z: -2.75, rotY: Math.PI / 2 };
  place('outdoor_table_chair_set_01', table.x, DECK, table.z, { rotY: table.rotY });
  const pads = [[-0.011, 0.464, 0.243], [-0.084, -0.39, 0.269]].map(([x, z, turn], i): Part => {
    const [geometry, material] = cushion('cushions', 0.4, 0.05, 0.36, 0, DECK + 0.39, 0, 0.4, i, 0.025);
    return [geometry.rotateY(turn).translate(x, 0, z), material];
  });
  add(pads, table.x, table.z, table.rotY);

  // Rocks on the lawn are the Rocks surface. A shrub by the left fence, and a planter with small plants under the
  // window.
  place('rock_07', 3.4, 0, 1.6, { scale: 3, rotY: 0.6, slot: 'rocks' });
  place('rock_09', 4.3, 0, 2.3, { scale: 6, rotY: 2.1, slot: 'rocks' });
  place('shrub_02', -5.2, 0, 0.5, { scale: 0.75, rotY: -Math.PI / 2 });
  place('planter_box_01', 3, 0, -3.7);
  place('shrub_03', 2.62, 0.36, -3.7, { scale: 0.6 });

  return room.finish(7.5, view([11, 8.5, 13], 8, 22), true);
}
