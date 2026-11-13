import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import slots from './textures/slots.json';

export type Slot = keyof typeof slots;

// Shown until a slot has a texture.
const PLACEHOLDER: Record<Slot, string> = {
  floor: '#b89b7a',
  featureWall: '#c9c2b8',
  walls: '#e8e4de',
  slatWall: '#9a7552',
  upholstery: '#8a8f8a',
  accents: '#c4a484',
  bedding: '#ecebe6',
  rugs: '#a39b8f',
  woodwork: '#7a5a40',
};

const H = 2.7; // wall height in metres

const plinth = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.9 });
const metal = new MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.4, metalness: 0.8 });
const shade = new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.9 });
const glass = new MeshStandardMaterial({ color: '#cfe0ee', emissive: '#cfe0ee', emissiveIntensity: 0.4, roughness: 0.1 });

type Part = [BufferGeometry, Slot | MeshStandardMaterial];

// A box spanning the given ranges.
const box = (m: Part[1], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Part => [
  new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
  m,
];

// A rounded box with the centre of its base at (x, y, z).
const soft = (m: Part[1], w: number, h: number, d: number, x: number, y: number, z: number, r = 0.04): Part => [
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001)).translate(x, y + h / 2, z),
  m,
];

const cylinder = (m: Part[1], r: number, h: number, x: number, y: number, z: number): Part => [
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
const sofa = (w: number): Part[] => [
  soft('upholstery', w, 0.42, 0.95, 0, 0, 0),
  soft('upholstery', w, 0.4, 0.22, 0, 0.42, -0.365),
  soft('upholstery', 0.22, 0.62, 0.95, -(w / 2 - 0.11), 0, 0),
  soft('upholstery', 0.22, 0.62, 0.95, w / 2 - 0.11, 0, 0),
];

const chair = (): Part[] => [
  soft('upholstery', 0.45, 0.07, 0.45, 0, 0.43, 0),
  soft('upholstery', 0.45, 0.45, 0.06, 0, 0.5, -0.2),
  ...[-0.19, 0.19].flatMap((x) => [-0.19, 0.19].map((z) => soft(metal, 0.03, 0.43, 0.03, x, 0, z, 0.01))),
];

const table = (w: number, d: number): Part[] => [
  soft('woodwork', w, 0.04, d, 0, 0.71, 0, 0.01),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => soft('woodwork', 0.06, 0.71, 0.06, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.01))),
];

const lamp = (stand: number, r: number): Part[] => [
  cylinder(metal, r * 0.6, 0.03, 0, 0, 0),
  cylinder(metal, 0.012, stand, 0, 0, 0),
  cylinder(shade, r, r * 1.3, 0, stand - r * 0.2, 0),
];

export function buildRoom() {
  const materials = Object.fromEntries(
    Object.entries(PLACEHOLDER).map(([slot, color]) => [slot, new MeshStandardMaterial({ color, roughness: 0.8 })]),
  ) as Record<Slot, MeshStandardMaterial>;
  const group = new Group();

  // Turns the parts by rotY, moves them to (x, z) and adds them as meshes. Slot meshes get userData.slot.
  const add = (parts: Part[], x = 0, z = 0, rotY = 0) => {
    for (const [geometry, material] of parts) {
      geometry.rotateY(rotY).translate(x, 0, z);
      metreUVs(geometry);
      const mesh = new Mesh(geometry, typeof material === 'string' ? materials[material] : material);
      if (typeof material === 'string') mesh.userData.slot = material;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  };

  // Shell: plinth, floor, back wall (x) and left wall (z). The front and right sides are open.
  add([
    box(plinth, -6.4, 6.4, -0.65, -0.05, -4.4, 4.4),
    box('floor', -6, 6, -0.05, 0, -4, 4),
    box('featureWall', -6.15, 0.5, 0, H, -4.15, -4),
    box('walls', 0.5, 4, 0, H, -4.15, -4),
    box('walls', 4, 5.6, 0, 0.9, -4.15, -4),
    box('walls', 4, 5.6, 2.2, H, -4.15, -4),
    box('walls', 5.6, 6, 0, H, -4.15, -4),
    box(glass, 4, 5.6, 0.9, 2.2, -4.1, -4.05),
    box('walls', -6.15, -6, 0, H, -4, 0.9),
    box('walls', -6.15, -6, 0, 0.9, 0.9, 2.5),
    box('walls', -6.15, -6, 2.2, H, 0.9, 2.5),
    box('walls', -6.15, -6, 0, H, 2.5, 4),
    box(glass, -6.1, -6.05, 0.9, 2.2, 0.9, 2.5),
    box('walls', 0.5, 0.65, 0, H, -4, -1),
    box('woodwork', -6, -5.96, 0, 2.1, 3, 3.9),
  ]);

  // Living room
  for (let z = -3.6; z < -0.9; z += 0.1) add([box('slatWall', -6, -5.96, 0.1, 2.5, z, z + 0.06)]);
  add(
    [
      ...sofa(2.4),
      soft('accents', 0.45, 0.42, 0.14, -0.7, 0.42, -0.19),
      soft('accents', 0.45, 0.42, 0.14, 0.7, 0.42, -0.19),
    ],
    -2.6,
    -3.45,
  );
  add(sofa(0.95), -0.55, -2.3, -Math.PI / 2);
  add([soft('woodwork', 1.2, 0.05, 0.6, 0, 0.33, 0, 0.02), soft('woodwork', 1, 0.33, 0.4, 0, 0, 0, 0.02)], -2.6, -2.2);
  add([soft('rugs', 3.2, 0.015, 2.2, 0, 0, 0, 0.01)], -2.6, -2.5);
  add([cylinder('accents', 0.28, 0.4, 0, 0, 0)], -1.3, -1.3);
  add(
    [
      soft('woodwork', 1.8, 0.6, 0.45, 0, 0.1, 0, 0.02),
      ...[-0.85, 0.85].flatMap((x) => [-0.18, 0.18].map((z) => soft(metal, 0.04, 0.1, 0.04, x, 0, z, 0.01))),
    ],
    -5.75,
    -2.2,
    Math.PI / 2,
  );
  add(lamp(1.5, 0.22), -5.4, -3.5);

  // Dining corner
  add(table(1.6, 0.9), -3.9, 2.3);
  for (const x of [-4.3, -3.5]) {
    add(chair(), x, 1.5);
    add(chair(), x, 3.1, Math.PI);
  }
  add([cylinder(metal, 0.006, 0.9, 0, 1.8, 0), cylinder(shade, 0.25, 0.22, 0, 1.6, 0)], -3.9, 2.3);

  // Bedroom
  add(
    [
      soft('woodwork', 1.7, 0.3, 2.1, 0, 0, 0, 0.02),
      soft('woodwork', 1.8, 1, 0.08, 0, 0, -1.09, 0.02),
      soft('bedding', 1.6, 0.25, 2, 0, 0.3, 0.02, 0.08),
      soft('bedding', 0.6, 0.14, 0.4, -0.4, 0.55, -0.72, 0.06),
      soft('bedding', 0.6, 0.14, 0.4, 0.4, 0.55, -0.72, 0.06),
      soft('accents', 1.66, 0.03, 0.5, 0, 0.55, 0.65, 0.015),
    ],
    2.6,
    -2.85,
  );
  for (const x of [1.4, 3.8]) add([soft('woodwork', 0.45, 0.5, 0.4, 0, 0, 0, 0.02)], x, -3.7);
  add(lamp(0.45, 0.12).map(([g, m]) => [g.translate(0, 0.5, 0), m] as Part), 3.8, -3.7);
  add([soft('rugs', 2.6, 0.015, 1.8, 0, 0, 0, 0.01)], 2.6, -2);

  // Study
  add([soft('woodwork', 3.2, 1.1, 0.35, 0, 0, 0, 0.02)], 3.8, 0.85);
  add(
    [
      soft('woodwork', 1.4, 0.04, 0.7, 0, 0.71, 0, 0.01),
      soft('woodwork', 0.04, 0.71, 0.66, -0.66, 0, 0, 0.01),
      soft('woodwork', 0.04, 0.71, 0.66, 0.66, 0, 0, 0.01),
    ],
    4,
    1.5,
  );
  add(chair(), 4, 2.25, Math.PI);
  add(lamp(0.4, 0.09).map(([g, m]) => [g.translate(0, 0.75, 0), m] as Part), 4.5, 1.3);
  add([soft('rugs', 2, 0.015, 1.6, 0, 0, 0, 0.01)], 4, 2);

  return { group, materials };
}
