// Writes small zips for the upload tests into tests/fixtures/uploads/.
// Usage: node scripts/make-upload-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { DataTexture, FloatType, HalfFloatType, RGBAFormat } from 'three';
import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter.js';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';

const OUT = 'tests/fixtures/uploads';
mkdirSync(OUT, { recursive: true });

const png = (background) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background } }).png().toBuffer().then((b) => new Uint8Array(b));
const bytes = (text) => new TextEncoder().encode(text);
const zip = (name, files) => writeFileSync(`${OUT}/${name}`, zipSync(files));

zip('texture-metal.zip', {
  'Tile_BaseColor.png': await png('#c86432'),
  'Tile_NormalDX.png': await png('#8080ff'),
  'Tile_Roughness.png': await png('#404040'),
  'Tile_Metallic.png': await png('#ffffff'),
  'Tile_Displacement.tiff': bytes('not a real tiff'),
  'Tile_Preview1.png': await png('#888888'),
});

zip('texture-gloss.zip', {
  'Bark_COL_1K.png': await png('#5a3c28'),
  'Bark_GLOSS_1K.png': await png('#c0c0c0'),
  'Bark_NRM_1K.png': await png('#8080ff'),
});

zip('blend.zip', { 'Plant.blend': bytes('not a real blend file'), 'Plant_COL.png': await png('#4a7a3a') });

zip('nothing.zip', { 'readme.txt': bytes('nothing to see here') });

// A cube `size` tall, its base at y = 0: four corners, a normal and four UVs per face.
const cube = (size) => {
  const h = size / 2;
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]; // axis and side
  const positions = [], normals = [], uvs = [], quads = [];
  for (const [axis, side] of faces) {
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const corners = side > 0 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : [[-1, -1], [-1, 1], [1, 1], [1, -1]];
    quads.push(positions.length / 3);
    for (const [a, b] of corners) {
      const p = [0, 0, 0], n = [0, 0, 0];
      p[axis] = side * h; p[u] = a * h; p[v] = b * h; n[axis] = side;
      p[1] += h;
      positions.push(...p); normals.push(...n); uvs.push((a + 1) / 2, (b + 1) / 2);
    }
  }
  return { positions, normals, uvs, quads };
};

// A glb written by hand: one mesh with positions, normals and indices. `interleaved` writes it without indices and
// with position and normal sharing one bufferView (byteStride 24), which GLTFLoader reads as interleaved attributes.
const glb = (size, interleaved = false) => {
  const { positions, normals, quads } = cube(size);
  const indices = quads.flatMap((q) => [q, q + 1, q + 2, q, q + 2, q + 3]);
  const n = interleaved ? indices.length : positions.length / 3;
  const vertex = (i) => [...positions.slice(i * 3, i * 3 + 3), ...normals.slice(i * 3, i * 3 + 3)];
  const bin = interleaved
    ? Buffer.from(new Float32Array(indices.flatMap(vertex)).buffer)
    : Buffer.concat([Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(normals).buffer), Buffer.from(new Uint16Array(indices).buffer)]);
  const bounds = { min: [-size / 2, 0, -size / 2], max: [size / 2, size, size / 2] };
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Box' }],
    meshes: [{ primitives: [interleaved ? { attributes: { POSITION: 0, NORMAL: 1 } } : { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: interleaved
      ? [{ buffer: 0, byteOffset: 0, byteLength: n * 24, byteStride: 24, target: 34962 }]
      : [
          { buffer: 0, byteOffset: 0, byteLength: n * 12, target: 34962 },
          { buffer: 0, byteOffset: n * 12, byteLength: n * 12, target: 34962 },
          { buffer: 0, byteOffset: n * 24, byteLength: indices.length * 2, target: 34963 },
        ],
    accessors: interleaved
      ? [
          { bufferView: 0, byteOffset: 0, componentType: 5126, count: n, type: 'VEC3', ...bounds },
          { bufferView: 0, byteOffset: 12, componentType: 5126, count: n, type: 'VEC3' },
        ]
      : [
          { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', ...bounds },
          { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
          { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
        ],
  };
  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const header = (length, type) => Buffer.from(new Uint32Array([length, type]).buffer);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  return new Uint8Array(Buffer.concat([header(0x46546c67, 2), Buffer.from(new Uint32Array([total]).buffer), header(jsonChunk.length, 0x4e4f534a), jsonChunk, header(binChunk.length, 0x004e4942), binChunk]));
};

// An ASCII FBX 7.3 cube in centimetres (UnitScaleFactor 1.0), with UVs and one material.
const fbx = (size) => {
  const { positions, normals, uvs, quads } = cube(size);
  const polygons = quads.flatMap((q) => [q, q + 1, q + 2, -(q + 3) - 1]); // the last index of a polygon is negative
  // The parser reads nesting from the tabs, so `tabs` is the indent of the line the list starts on.
  const list = (tabs, name, values) => `${name}: *${values.length} {\n${tabs}\ta: ${values.join(',')}\n${tabs}}`;
  return bytes(`; FBX 7.3.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7300
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 1000, "Geometry::Box", "Mesh" {
		${list('\t\t', 'Vertices', positions)}
		${list('\t\t', 'PolygonVertexIndex', polygons)}
		GeometryVersion: 124
		LayerElementNormal: 0 {
			Version: 101
			Name: ""
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			${list('\t\t\t', 'Normals', normals)}
		}
		LayerElementUV: 0 {
			Version: 101
			Name: "map1"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			${list('\t\t\t', 'UV', uvs)}
		}
	}
	Model: 2000, "Model::Box", "Mesh" {
		Version: 232
	}
	Material: 3000, "Material::Box", "" {
		Version: 102
		ShadingModel: "phong"
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",1,1,1
		}
	}
}
Connections:  {
	C: "OO",1000,2000
	C: "OO",2000,0
	C: "OO",3000,2000
}
`);
};

zip('model-glb.zip', { 'Box.glb': glb(0.5) });
zip('model-fbx.zip', { 'Box.fbx': fbx(30), 'Box_COL.png': await png('#2864c8') });
zip('model-huge.zip', { 'Huge.glb': glb(10) });
zip('model-interleaved.zip', { 'Strided.glb': glb(0.5, true) });

// HDRIs: 512 x 256, a dim grey sky (0.05) in the upper half, black below, and a white 32 x 32 square centred at
// pixel (128, 64) from the top-left. The sun test expects elevation +45 degrees and angle -90 degrees. The black
// lower half makes them sky-only, so the Worker fills it from the grey just above the horizon.
const [W, H] = [512, 256];
const white = (x, top) => Math.abs(x + 0.5 - 128) < 16 && Math.abs(top + 0.5 - 64) < 16;
const value = (x, top) => (white(x, top) ? 1 : top < H / 2 ? 0.05 : 0);
// EXR data starts at the bottom row, as EXRLoader gives it and EXRExporter expects it.
const pixels = new Float32Array(W * H * 4);
for (let row = 0; row < H; row++)
  for (let x = 0; x < W; x++) {
    const v = value(x, H - 1 - row);
    pixels.set([v, v, v, 1], (row * W + x) * 4);
  }
const texture = new DataTexture(pixels, W, H, RGBAFormat, FloatType);
const exr = await new EXRExporter().parse(texture, { type: HalfFloatType });
zip('hdri-exr.zip', { 'Sky_HDR.exr': exr });
// The same file cut to 400 bytes, inside the table of chunk offsets (bytes 331 to 458). The header is whole, and
// EXRLoader reads past the end, which throws a RangeError. Cut in half instead, it fails with "unexpected EOF".
zip('hdri-cut.zip', { 'Sky_HDR.exr': exr.slice(0, 400) });
// Flat RGBE, top row first. HDRLoader reads data as run-length encoded only if it starts with the bytes 2, 2.
// 1 is (255, 255, 255, 128), 0.05 is (204, 204, 204, 124) and 0.18 is about (184, 184, 184, 126).
// 1000 is about (249, 249, 249, 138).
const RGBE = { 1000: [249, 249, 249, 138], 1: [255, 255, 255, 128], 0.05: [204, 204, 204, 124], 0.18: [184, 184, 184, 126], 0: [0, 0, 0, 0] };
const hdr = (valueAt) => {
  const data = new Uint8Array(W * H * 4);
  for (let top = 0; top < H; top++) for (let x = 0; x < W; x++) data.set(RGBE[valueAt(x, top)], (top * W + x) * 4);
  return data;
};
const hdrHeader = (w, h) => bytes(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
zip('hdri-hdr.zip', { 'Sky.hdr': new Uint8Array([...hdrHeader(W, H), ...hdr(value)]) });
// Sky-only, with one very bright pixel (1000) in the 8 rows just above the horizon, at x = 256 and row 125 from the
// top. Its glow must not light the filled ground or pull the sun below the horizon.
zip('hdri-glow.zip', { 'Glow.hdr': new Uint8Array([...hdrHeader(W, H), ...hdr((x, top) => (x === 256 && top === 125 ? 1000 : top < H / 2 ? 0.05 : 0))]) });
// Not sky-only: a bright upper half (1) and a mid-grey lower half (0.18), which the Worker leaves alone.
zip('hdri-full.zip', { 'Full.hdr': new Uint8Array([...hdrHeader(W, H), ...hdr((x, top) => (top < H / 2 ? 1 : 0.18))]) });
zip('hdri-16k.zip', { 'Big.hdr': new Uint8Array([...hdrHeader(16384, 8192), 0, 0, 0, 0, 0, 0, 0, 0]) });
// A 16K header that HDRLoader still reads: over 4 KB of comments, and double spaces and a tab on the size line.
const comments = '# a comment line that pads the header\n'.repeat(150);
const spaced = bytes(`#?RADIANCE\n${comments}FORMAT=32-bit_rle_rgbe\n\n-Y  8192\t+X  16384 \n`);
zip('hdri-16k-spaced.zip', { 'Big.hdr': new Uint8Array([...spaced, 0, 0, 0, 0, 0, 0, 0, 0]) });
