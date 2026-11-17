import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { loadModel } from '../models';
import { PLACEHOLDER, ROOMS, type RoomKey, type Slot } from '../room';
import type { BuiltRoom } from './index';

export const H = 2.7; // wall height in metres

// Shared by every room. Only one room shows at a time, so the daylight can set the shade and glass for it.
export const plinth = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.9 });
export const metal = new MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.4, metalness: 0.8 });
export const shade = new MeshStandardMaterial({ color: '#efe6d2', emissive: '#ffd59a', emissiveIntensity: 0, roughness: 0.9 });
export const glass = new MeshStandardMaterial({ color: '#cfe0ee', emissive: '#cfe0ee', emissiveIntensity: 0.4, roughness: 0.1 });
// Clear glass for the shower screen. It is see-through and casts no shadow, and it doesn't write depth, so it
// leaves no hole in the ambient occlusion.
export const screenGlass = new MeshStandardMaterial({ color: '#dcebf2', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
// Glazed white ceramic for the bathtub, basin and toilet. Two-sided because the basin is a thin shell.
export const ceramic = new MeshStandardMaterial({ color: '#f3f1ed', roughness: 0.18, side: DoubleSide });

export type Part = [BufferGeometry, Slot | MeshStandardMaterial];

// A box spanning the given ranges.
export const box = (m: Part[1], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Part => [
  new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  m,
];

// A rounded box with the centre of its base at (x, y, z).
export const soft = (m: Part[1], w: number, h: number, d: number, x: number, y: number, z: number, r = 0.04): Part => [
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001)).translate(x, y + h / 2, z),
  m,
];

export const cylinder = (m: Part[1], r: number, h: number, x: number, y: number, z: number): Part => [
  new CylinderGeometry(r, r, h, 24).translate(x, y + h / 2, z),
  m,
];

// UVs in metres, projected along the face direction, so a texture repeats 100 / sizeCm times per UV unit.
function metreUVs(geometry: BufferGeometry) {
  const { position: p, normal: n, uv } = geometry.attributes;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
}

// Furniture is built facing +z around a local origin.
export const sofa = (w: number): Part[] => [
  soft('upholstery', w, 0.42, 0.95, 0, 0, 0),
  soft('upholstery', w, 0.4, 0.22, 0, 0.42, -0.365),
  soft('upholstery', 0.22, 0.62, 0.95, -(w / 2 - 0.11), 0, 0),
  soft('upholstery', 0.22, 0.62, 0.95, w / 2 - 0.11, 0, 0),
];

export const chair = (seat: Slot = 'upholstery'): Part[] => [
  soft(seat, 0.45, 0.07, 0.45, 0, 0.43, 0),
  soft(seat, 0.45, 0.45, 0.06, 0, 0.5, -0.2),
  ...[-0.19, 0.19].flatMap((x) => [-0.19, 0.19].map((z) => soft(metal, 0.03, 0.43, 0.03, x, 0, z, 0.01))),
];

export const table = (w: number, d: number): Part[] => [
  soft('woodwork', w, 0.04, d, 0, 0.71, 0, 0.01),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => soft('woodwork', 0.06, 0.71, 0.06, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.01))),
];

export const lamp = (stand: number, r: number): Part[] => [
  cylinder(metal, r * 0.6, 0.03, 0, 0, 0),
  cylinder(metal, 0.012, stand, 0, 0, 0),
  cylinder(shade, r, r * 1.3, 0, stand - r * 0.2, 0),
];

// Bathroom pieces, also built facing +z around a local origin.

// A tub 1.7 m long (along x), with a rim and a tap at one end.
export const bathtub = (w = 1.7, d = 0.75): Part[] => [
  soft(ceramic, w, 0.14, d, 0, 0, 0),
  soft(ceramic, w, 0.55, 0.08, 0, 0, -(d / 2 - 0.04)),
  soft(ceramic, w, 0.55, 0.08, 0, 0, d / 2 - 0.04),
  soft(ceramic, 0.08, 0.55, d - 0.16, -(w / 2 - 0.04), 0, 0),
  soft(ceramic, 0.08, 0.55, d - 0.16, w / 2 - 0.04, 0, 0),
  cylinder(metal, 0.015, 0.2, w / 2 - 0.12, 0.55, -(d / 2 - 0.05)),
  soft(metal, 0.025, 0.025, 0.12, w / 2 - 0.12, 0.72, -(d / 2 - 0.1), 0.01),
];

// A round vessel basin with a tap behind it. The base of the bowl sits at y = 0.
export const basin = (): Part[] => [
  [new LatheGeometry([[0, 0.0], [0.15, 0.0], [0.2, 0.06], [0.22, 0.13], [0.2, 0.13], [0.18, 0.06], [0, 0.03]].map(([x, y]) => new Vector2(x, y)), 32), ceramic],
  cylinder(metal, 0.014, 0.22, 0, 0, -0.27),
  soft(metal, 0.022, 0.022, 0.12, 0, 0.2, -0.22, 0.008),
];

// A close-coupled toilet with its back at z = -0.33.
export const toilet = (): Part[] => [
  soft(ceramic, 0.24, 0.3, 0.34, 0, 0, -0.05),
  soft(ceramic, 0.37, 0.14, 0.56, 0, 0.28, 0),
  soft(ceramic, 0.36, 0.03, 0.5, 0, 0.42, 0.03, 0.015),
  soft(ceramic, 0.34, 0.025, 0.44, 0, 0.45, 0.03, 0.012),
  soft(ceramic, 0.38, 0.38, 0.18, 0, 0.4, -0.24),
  cylinder(metal, 0.025, 0.012, 0, 0.78, -0.24),
];

// A towel hanging over a rail at height h. Origin at the bottom centre, back toward -z. The fold on top is a
// bar along x, so the rail (a thin bar at y = h) runs through it.
export const towel = (w: number, h: number): Part[] => [
  soft('towels', w, h, 0.03, 0, 0, 0.035, 0.012),
  soft('towels', w, h * 0.8, 0.03, 0, h * 0.2, -0.035, 0.012),
  [new CylinderGeometry(0.04, 0.04, w, 16).rotateZ(Math.PI / 2).translate(0, h, 0), 'towels'],
];

// A fixed glass screen w wide and h tall, with a metal channel along the floor and a bar up its free edge.
export const showerScreen = (w: number, h: number): Part[] => [
  [new BoxGeometry(w, h, 0.012).translate(0, h / 2 + 0.03, 0), screenGlass],
  soft(metal, w, 0.03, 0.03, 0, 0, 0, 0.008),
  soft(metal, 0.025, h + 0.03, 0.025, w / 2, 0, 0, 0.008),
];

// A home view from the open front right, looking at the middle of the room. The camera can turn from just
// past the front to just past the right side.
export const view = ([x, y, z]: [number, number, number], minDistance: number, maxDistance: number): BuiltRoom['view'] => ({
  home: new Vector3(x, y, z),
  target: new Vector3(0, 0.6, 0),
  minDistance,
  maxDistance,
  minAzimuth: -0.2,
  maxAzimuth: Math.PI / 2 + 0.2,
});

// Starts a room: one placeholder-coloured material per surface the room has, a group, and add() to place parts.
export function roomKit(key: RoomKey, ktx2: KTX2Loader) {
  const materials: Partial<Record<Slot, MeshStandardMaterial>> = {};
  for (const slot of ROOMS[key].slots as Slot[]) materials[slot] = new MeshStandardMaterial({ color: PLACEHOLDER[slot], roughness: 0.8 });
  const group = new Group();

  // Turns the parts by rotY, moves them to (x, z) and adds them as meshes. Slot meshes get userData.slot.
  // Window glass and the shower screen don't cast shadows, so sunlight comes through them.
  const add = (parts: Part[], x = 0, z = 0, rotY = 0) => {
    for (const [geometry, material] of parts) {
      geometry.rotateY(rotY).translate(x, 0, z);
      metreUVs(geometry);
      const surface = typeof material === 'string' ? materials[material] : material;
      if (!surface) throw new Error(`The ${key} room has no ${material} surface.`);
      const mesh = new Mesh(geometry, surface);
      if (typeof material === 'string') mesh.userData.slot = material;
      mesh.castShadow = material !== glass && material !== screenGlass;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  };

  // Puts a Poly Haven model with the middle of its base at (x, y, z). A model that fails to load is left out.
  const loading: Promise<void>[] = [];
  const failed: string[] = [];
  const place = (id: string, x: number, y: number, z: number, rotY = 0) => {
    loading.push(
      loadModel(id, ktx2).then(
        (model) => {
          model.position.set(x, y, z);
          model.rotation.y = rotY;
          group.add(model);
        },
        (error) => {
          console.warn(error);
          failed.push(id);
        },
      ),
    );
  };

  // Lamp lights go at the centre of each shade. Call finish() after the last place().
  const finish = (extent: number, view: BuiltRoom['view'], outdoor = false): BuiltRoom => ({
    key,
    group,
    materials,
    glass: outdoor ? null : glass,
    shade,
    lamps: (group.children as Mesh[])
      .filter((mesh) => mesh.material === shade)
      .map((mesh) => new Box3().setFromObject(mesh).getCenter(new Vector3())),
    outdoor,
    extent,
    view,
    models: Promise.all(loading).then(() => failed),
  });

  return { add, place, finish };
}
