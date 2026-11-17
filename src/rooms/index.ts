import type { Group, MeshStandardMaterial, Vector3 } from 'three';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { ROOMS, type RoomKey, type Slot } from '../room';
import { buildBedroom } from './bedroom';
import { buildLiving } from './living';
import { box, H, plinth, roomKit, soft, view } from './parts';

export type BuiltRoom = {
  key: RoomKey;
  group: Group;
  materials: Partial<Record<Slot, MeshStandardMaterial>>; // only this room's surfaces
  glass: MeshStandardMaterial | null; // null outdoors
  shade: MeshStandardMaterial; // glows at night (lamp shades, path light heads)
  lamps: Vector3[];
  outdoor: boolean;
  extent: number; // half-size of the sun's shadow area, metres
  view: { home: Vector3; target: Vector3; minDistance: number; maxDistance: number; minAzimuth: number; maxAzimuth: number };
  models: Promise<string[]>; // settles when the decor models are placed, with the ids of any that failed to load
};

export function buildRoom(key: RoomKey, ktx2: KTX2Loader): BuiltRoom {
  if (key === 'living') return buildLiving(ktx2);
  if (key === 'bedroom') return buildBedroom(ktx2);
  return placeholder(key, ktx2);
}

// The Bathroom and Garden until they are built: a plinth with the floor or ground as one panel,
// wall-type surfaces as panels along the back and the rest as small boxes.
const WALL_TYPES: Slot[] = ['walls', 'showerWall', 'fence'];

function placeholder(key: RoomKey, ktx2: KTX2Loader): BuiltRoom {
  const room = roomKit(key, ktx2);
  const [base, ...rest] = ROOMS[key].slots as Slot[];
  const walls = rest.filter((slot) => WALL_TYPES.includes(slot));
  const others = rest.filter((slot) => !WALL_TYPES.includes(slot));
  room.add([box(plinth, -2.4, 2.4, -0.65, -0.05, -2.4, 2.4), box(base, -2, 2, -0.05, 0, -2, 2)]);
  walls.forEach((slot, i) => {
    const width = 4 / walls.length;
    room.add([box(slot, -2 + i * width, -2 + (i + 1) * width, 0, H, -2.15, -2)]);
  });
  others.forEach((slot, i) => room.add([soft(slot, 0.5, 0.5, 0.5, (i - (others.length - 1) / 2) * 0.9, 0, 0)]));
  return room.finish(4, view([5, 4.6, 6.5], 4, 14), key === 'garden');
}
