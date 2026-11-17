import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { BuiltRoom } from './index';
import { basin, bathtub, box, ceramic, cylinder, glass, H, metal, plinth, roomKit, shade, showerScreen, soft, toilet, towel, view } from './parts';

// Bathroom, 4 × 3.5 m. The front (+z) and right (+x) sides are open. The shower is in the back left corner, the bath
// runs along the left wall under a window, and the toilet and vanity are on the back wall.
export function buildBathroom(ktx2: KTX2Loader): BuiltRoom {
  const room = roomKit('bathroom', ktx2);
  const { add, place } = room;

  // Shell: tiled shower alcove in the back left corner, a window in the left wall over the bath.
  add([
    box(plinth, -2.4, 2.4, -0.65, -0.05, -2.15, 2.15),
    box('floor', -2, 2, -0.05, 0, -1.75, 1.75),
    box('showerWall', -2.15, -0.8, 0, H, -1.9, -1.75),
    box('walls', -0.8, 2, 0, H, -1.9, -1.75),
    box('showerWall', -2.15, -2, 0, H, -1.75, -0.75),
    box('walls', -2.15, -2, 0, H, -0.75, 0.3),
    box('walls', -2.15, -2, 0, 1, 0.3, 1.5),
    box('walls', -2.15, -2, 2.1, H, 0.3, 1.5),
    box('walls', -2.15, -2, 0, H, 1.5, 1.75),
    box(glass, -2.1, -2.05, 1, 2.1, 0.3, 1.5),
  ]);

  // Walk-in shower: a low tray, a glass screen on the open side, a rain head and its pipe.
  add([soft(ceramic, 1.2, 0.05, 1, 0, 0, 0, 0.02)], -1.4, -1.25);
  add(showerScreen(1, 2), -0.8, -1.25, -Math.PI / 2);
  add([
    cylinder(metal, 0.012, 1, 0, 1.25, 0),
    soft(metal, 0.02, 0.02, 0.28, 0, 2.23, 0.14, 0.008),
    cylinder(metal, 0.1, 0.02, 0, 2.2, 0.28),
  ], -1.5, -1.72);

  // Bath along the left wall, tap end toward the shower.
  add(bathtub(), -1.625, 0.9, Math.PI / 2);

  // Toilet against the back wall.
  add(toilet(), -0.2, -1.42);

  // Vanity: a cabinet with two doors, a countertop, a basin and a wall lamp over the mirror.
  add(
    [
      soft(metal, 1.35, 0.08, 0.45, 0, 0, 0, 0.01),
      soft('vanity', 1.45, 0.72, 0.55, 0, 0.08, 0, 0.02),
      ...[-1, 1].flatMap((side) => [
        soft('vanity', 0.7, 0.66, 0.02, side * 0.36, 0.11, 0.285, 0.008),
        soft(metal, 0.015, 0.14, 0.015, side * 0.08, 0.4, 0.31, 0.006),
      ]),
      soft('countertop', 1.5, 0.04, 0.56, 0, 0.8, 0.01, 0.012, 1),
    ],
    1.175,
    -1.465,
  );
  add(basin(0.84), 1.175, -1.42);
  add([soft(metal, 0.05, 0.28, 0.03, 0, 2.14, -0.27), cylinder(shade, 0.07, 0.26, 0, 2.15, -0.185)], 1.175, -1.475);

  // A towel rail above the toilet with two towels.
  add([soft(metal, 1, 0.022, 0.022, 0, 1.539, 0)], -0.2, -1.67);
  for (const x of [-0.65, 0.25]) add([soft(metal, 0.02, 0.03, 0.09, 0, 1.535, 0)], x, -1.705);
  for (const x of [-0.42, 0.02]) add(towel(0.42, 0.65, 0.9), x, -1.67);

  // The Poly Haven mirror over the basin, scaled up from 0.49 × 0.74 m. Its origin is the middle of the frame, with
  // its back on the wall.
  place('ornate_mirror_01', 1.175, 1.6, -1.745, { scale: 1.35, mirror: true });

  // The wall lamp is close to the wall, so its light is dimmer than in the other rooms.
  return room.finish(3, view([3.7, 3.9, 4.8], 4, 11), false, 4);
}
