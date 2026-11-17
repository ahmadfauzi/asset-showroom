import type { Group, MeshStandardMaterial, Vector3 } from 'three';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { RoomKey, Slot } from '../room';
import { buildBathroom } from './bathroom';
import { buildBedroom } from './bedroom';
import { buildGarden } from './garden';
import { buildLiving } from './living';

export type BuiltRoom = {
  key: RoomKey;
  group: Group;
  materials: Partial<Record<Slot, MeshStandardMaterial>>; // only this room's surfaces
  glass: MeshStandardMaterial | null; // null outdoors
  shade: MeshStandardMaterial; // glows at night (lamp shades, path light heads)
  lamps: Vector3[];
  lampPower: number; // each lamp light's intensity at night
  outdoor: boolean;
  extent: number; // half-size of the sun's shadow area, metres
  view: { home: Vector3; target: Vector3; minDistance: number; maxDistance: number; minAzimuth: number; maxAzimuth: number };
  models: Promise<string[]>; // settles when the decor models are placed, with the ids of any that failed to load
};

export function buildRoom(key: RoomKey, ktx2: KTX2Loader): BuiltRoom {
  if (key === 'living') return buildLiving(ktx2);
  if (key === 'bedroom') return buildBedroom(ktx2);
  if (key === 'bathroom') return buildBathroom(ktx2);
  return buildGarden(ktx2);
}
