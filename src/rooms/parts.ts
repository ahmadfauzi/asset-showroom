import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel } from '../models';
import { PLACEHOLDER, ROOMS, type RoomKey, type Slot } from '../room';
import { triplanar } from '../triplanar';
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
// Glazed white ceramic for the bathtub, basin and toilet. Only the basin, a thin shell, draws both sides.
export const ceramic = new MeshStandardMaterial({ color: '#f3f1ed', roughness: 0.18 });
const basinCeramic = new MeshStandardMaterial({ color: '#f3f1ed', roughness: 0.18, side: DoubleSide });

export type Part = [BufferGeometry, Slot | MeshStandardMaterial];

// A box spanning the given ranges. A bevel above 0 cuts its edges at 45 degrees, that wide.
export const box = (m: Part[1], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, bevel = 0): Part => [
  (bevel ? new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 1, bevel) : new BoxGeometry(x1 - x0, y1 - y0, z1 - z0)).translate(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  ),
  m,
];

// A rounded box with the centre of its base at (x, y, z). One segment gives a bevel instead of a round.
export const soft = (m: Part[1], w: number, h: number, d: number, x: number, y: number, z: number, r = 0.04, segments = 3): Part => [
  new RoundedBoxGeometry(w, h, d, segments, Math.min(r, Math.min(w, h, d) / 2 - 0.001)).translate(x, y + h / 2, z),
  m,
];

export const cylinder = (m: Part[1], r: number, h: number, x: number, y: number, z: number): Part => [
  new CylinderGeometry(r, r, h, 24).translate(x, y + h / 2, z),
  m,
];

// A round leg h tall, narrower at the foot, with its foot at (x, y, z).
export const leg = (m: Part[1], h: number, x: number, z: number, top = 0.022, foot = 0.014, y = 0): Part => [
  new CylinderGeometry(top, foot, h, 12).translate(x, y + h / 2, z),
  m,
];

// A cushion: a rounded box whose top rises in the middle by puff × h. The rise differs a little across the top,
// and with the seed, so no two cushions look the same. The centre of its base is at (x, y, z). RoundedBoxGeometry
// repeats vertices along its seams, so the normals are tilted to match the rise by hand instead of recomputed.
export function cushion(m: Part[1], w: number, h: number, d: number, x: number, y: number, z: number, puff = 0.2, seed = 0, r = 0.05): Part {
  const geometry = new RoundedBoxGeometry(w, h, d, 4, Math.min(r, Math.min(w, h, d) / 2 - 0.001));
  const { position: p, normal: n } = geometry.attributes;
  const normal = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const u = (2 * p.getX(i)) / w; // -1 to 1 across
    const v = (2 * p.getZ(i)) / d; // -1 to 1 front to back
    const top = Math.max(0, (2 * p.getY(i)) / h); // 0 at half height, 1 on top
    const rise = h * puff * top * (1 + 0.3 * Math.sin(seed * 5.1 + u * 1.9) * Math.cos(seed * 3.7 + v * 1.3));
    p.setY(i, p.getY(i) + rise * (1 - u * u) * (1 - v * v));
    // The slope of the rise along x and z.
    const sx = (-4 * rise * u * (1 - v * v)) / w;
    const sz = (-4 * rise * v * (1 - u * u)) / d;
    normal.set(n.getX(i) - sx * n.getY(i), n.getY(i), n.getZ(i) - sz * n.getY(i)).normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return [geometry.translate(x, y + h / 2, z), m];
}

// Stands up a part made lying flat on its back, such as a back cushion d long: it faces +z, leans back by tilt
// radians, and has its back at z and its bottom edge at y.
export const standUp = ([geometry, m]: Part, d: number, x: number, y: number, z: number, tilt = 0.15): Part => [
  geometry.rotateX(Math.PI / 2 - tilt).translate(x, y + d / 2, z),
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

// One mesh from several parts of the same surface or material, to keep draw calls down. Rounded boxes have no
// index, so every part loses its index to match. Never merge lamp shades: finish() finds one lamp per shade mesh.
export const merge = (parts: Part[]): Part => [
  mergeGeometries(parts.map(([geometry]) => (geometry.index ? geometry.toNonIndexed() : geometry))),
  parts[0][1],
];

// Furniture is built facing +z around a local origin.

// A sofa w wide on tapered wooden legs: a frame with arms, and a seat and back cushion for every 0.7 m or so.
export function sofa(w: number, seed = 0): Part[] {
  const depth = 0.95;
  const arm = 0.18;
  const back = -depth / 2 + 0.18; // front of the back frame
  const count = Math.max(1, Math.round((w - 2 * arm) / 0.7));
  const each = (w - 2 * arm) / count;
  const xs = Array.from({ length: count }, (_, i) => -w / 2 + arm + each * (i + 0.5));
  return [
    merge([-1, 1].flatMap((sx) => [-1, 1].map((sz) => leg('woodwork', 0.1, sx * (w / 2 - 0.08), sz * (depth / 2 - 0.08), 0.024, 0.015)))),
    merge([
      soft('upholstery', w, 0.26, depth, 0, 0.1, 0, 0.04),
      soft('upholstery', w, 0.7, 0.18, 0, 0.1, -depth / 2 + 0.09, 0.06),
      ...[-1, 1].map((sx) => soft('upholstery', arm, 0.52, depth, sx * (w / 2 - arm / 2), 0.1, 0, 0.07)),
      ...xs.map((x, i) => cushion('upholstery', each - 0.012, 0.14, depth - 0.2, x, 0.36, back / 2 + depth / 4, 0.18, seed + i)),
      ...xs.map((x, i) => standUp(cushion('upholstery', each - 0.012, 0.17, 0.4, 0, 0, 0, 0.25, seed + i + 7), 0.4, x, 0.5, back)),
    ]),
  ];
}

// A dining chair: a metal frame on tapered legs, with a seat cushion and a back cushion.
export const chair = (seat: Slot = 'upholstery', seed = 0): Part[] => [
  merge([
    ...[-0.19, 0.19].flatMap((x) => [-0.19, 0.19].map((z) => leg(metal, 0.42, x, z, 0.014, 0.009))),
    soft(metal, 0.45, 0.025, 0.45, 0, 0.42, 0, 0.008),
    ...[-0.19, 0.19].map((x) => soft(metal, 0.022, 0.47, 0.022, x, 0.44, -0.2, 0.008)),
  ]),
  merge([
    cushion(seat, 0.44, 0.06, 0.43, 0, 0.445, 0.005, 0.35, seed),
    standUp(cushion(seat, 0.4, 0.05, 0.3, 0, 0, 0, 0.3, seed + 1), 0.3, 0, 0.58, -0.19, 0.08),
  ]),
];

// A table h tall on tapered legs, with a bevelled top and a rail under it.
export const table = (w: number, d: number, h = 0.75): Part[] => [
  merge([
    soft('woodwork', w, 0.04, d, 0, h - 0.04, 0, 0.012, 1),
    ...[-1, 1].map((s) => soft('woodwork', w - 0.2, 0.08, 0.025, 0, h - 0.12, s * (d / 2 - 0.07), 0.005)),
    ...[-1, 1].map((s) => soft('woodwork', 0.025, 0.08, d - 0.2, s * (w / 2 - 0.07), h - 0.12, 0, 0.005)),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => leg('woodwork', h - 0.04, sx * (w / 2 - 0.07), sz * (d / 2 - 0.07), 0.026, 0.015))),
  ]),
];

// A cabinet h tall on tapered legs: a body, a bevelled top, and cols × rows doors or drawers with a metal handle
// on each.
export function cabinet(w: number, h: number, d: number, cols: number, rows: number, legs = 0.1): Part[] {
  const fw = (w - 0.04) / cols;
  const fh = (h - legs - 0.07) / rows;
  const cells = Array.from({ length: cols * rows }, (_, i) => [-w / 2 + 0.02 + fw * ((i % cols) + 0.5), legs + 0.02 + fh * Math.floor(i / cols)]);
  return [
    merge([
      soft('woodwork', w - 0.02, h - legs - 0.03, d - 0.03, 0, legs, -0.015, 0.01),
      soft('woodwork', w, 0.03, d, 0, h - 0.03, 0, 0.01, 1),
      ...cells.map(([x, y]) => soft('woodwork', fw - 0.012, fh - 0.012, 0.02, x, y + 0.006, d / 2 - 0.01, 0.006)),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => leg('woodwork', legs, sx * (w / 2 - 0.06), sz * (d / 2 - 0.06), 0.022, 0.014))),
    ]),
    merge(cells.map(([x, y]) => soft(metal, Math.min(0.16, fw * 0.4), 0.018, 0.02, x, y + fh - 0.07, d / 2 + 0.01, 0.006))),
  ];
}

// A floor or table lamp: a round base, a stem and a shade that narrows at the top.
export const lamp = (stand: number, r: number): Part[] => [
  cylinder(metal, r * 0.6, 0.03, 0, 0, 0),
  cylinder(metal, 0.012, stand, 0, 0, 0),
  [new CylinderGeometry(r * 0.75, r, r * 1.3, 24).translate(0, stand - r * 0.2 + r * 0.65, 0), shade],
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

// A round vessel basin with a tap behind it. The base of the bowl sits at y.
export const basin = (y = 0): Part[] => [
  [new LatheGeometry([[0, 0.0], [0.15, 0.0], [0.2, 0.06], [0.22, 0.13], [0.2, 0.13], [0.18, 0.06], [0, 0.03]].map(([x, y]) => new Vector2(x, y)), 32).translate(0, y, 0), basinCeramic],
  cylinder(metal, 0.014, 0.22, 0, y, -0.27),
  soft(metal, 0.022, 0.022, 0.12, 0, y + 0.2, -0.22, 0.008),
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

// A towel h long hanging over a rail, with its bottom edge at y. Origin at the bottom centre, back toward -z. The
// fold on top is a bar along x, so the rail (a thin bar at y + h) runs through it.
export const towel = (w: number, h: number, y = 0): Part[] => [
  soft('towels', w, h, 0.03, 0, y, 0.035, 0.012),
  soft('towels', w, h * 0.8, 0.03, 0, y + h * 0.2, -0.035, 0.012),
  [new CylinderGeometry(0.04, 0.04, w, 16).rotateZ(Math.PI / 2).translate(0, y + h, 0), 'towels'],
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
  // A model given a slot, such as a rock, becomes that surface: its meshes take the slot's material with
  // triplanar mapping, and move up to be children of the group, as the code-built surfaces are.
  const loading: Promise<void>[] = [];
  const failed: string[] = [];
  const place = (id: string, x: number, y: number, z: number, { rotY = 0, scale = 1, slot }: { rotY?: number; scale?: number; slot?: Slot } = {}) => {
    loading.push(
      loadModel(id, ktx2).then(
        (model) => {
          model.position.set(x, y, z);
          model.rotation.y = rotY;
          model.scale.setScalar(scale);
          if (!slot) return void group.add(model);
          const surface = materials[slot];
          if (!surface) throw new Error(`The ${key} room has no ${slot} surface.`);
          triplanar(surface);
          model.updateMatrixWorld(true);
          const meshes: Mesh[] = [];
          model.traverse((object) => (object as Mesh).isMesh && meshes.push(object as Mesh));
          for (const mesh of meshes) {
            group.attach(mesh);
            mesh.material = surface;
            mesh.userData.slot = slot;
          }
        },
        (error) => {
          console.warn(error);
          failed.push(id);
        },
      ),
    );
  };

  // Lamp lights go at the centre of each shade, at lampPower. Path lights sit low, so outdoors they are dimmer.
  // Call finish() after the last place().
  const finish = (extent: number, view: BuiltRoom['view'], outdoor = false, lampPower = outdoor ? 3 : 8): BuiltRoom => ({
    key,
    group,
    materials,
    glass: outdoor ? null : glass,
    shade,
    lamps: (group.children as Mesh[])
      .filter((mesh) => mesh.material === shade)
      .map((mesh) => new Box3().setFromObject(mesh).getCenter(new Vector3())),
    lampPower,
    outdoor,
    extent,
    view,
    models: Promise.all(loading).then(() => failed),
  });

  return { add, place, finish };
}
