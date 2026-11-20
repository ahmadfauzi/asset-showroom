import {
  Box3,
  CanvasTexture,
  Color,
  Group,
  LoadingManager,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type InterleavedBufferAttribute,
  type Light,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as WebGLTextureUtils from 'three/examples/jsm/utils/WebGLTextureUtils.js';
import { mapWord, words, type MapRole } from './detect';
import { decode, encodeImage, fit } from './texture';
import { LIMITS, MESSAGES, UploadError } from './types';

const MAP_MAX = 1024;
const THUMB = 256;

const baseName = (path: string) => path.split(/[/\\]/).pop()!.toLowerCase();
// Names compared without case or separators, so `Plant_Orchid` matches the prefix `plantorchid`.
const flat = (name: string) => name.toLowerCase().replace(/[_\-. ]+/g, '');

export function countTriangles(object: Object3D) {
  let count = 0;
  object.traverse((o) => {
    const { isMesh, geometry } = o as Mesh;
    if (isMesh) count += (geometry.index ?? geometry.attributes.position).count / 3;
  });
  return count;
}

// Reads the model file. The files it points to (a .gltf's .bin and images, an FBX's textures) are found in the zip
// by file name. The KTX2 transcoder comes from the app's /basis/ folder. Anything else gets an empty data URL, so
// nothing outside the zip is fetched.
export async function parseModel(files: Record<string, Uint8Array>, main: string, renderer: WebGLRenderer): Promise<Object3D> {
  const urls = new Map(Object.entries(files).map(([name, bytes]) => [baseName(name), URL.createObjectURL(new Blob([bytes as BlobPart]))]));
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (/^(data|blob):|^\/basis\//.test(url) ? url : (urls.get(baseName(decodeURIComponent(url))) ?? 'data:,')));
  let started = false;
  manager.onStart = () => (started = true);
  const loaded = new Promise<void>((resolve) => (manager.onLoad = resolve));
  const bytes = files[main];
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try {
    if (main.toLowerCase().endsWith('.fbx')) {
      const group = new FBXLoader(manager).parse(buffer, '');
      // FBXLoader doesn't apply UnitScaleFactor. 1.0 means centimetres.
      group.scale.multiplyScalar((group.userData.unitScaleFactor ?? 1) / 100);
      // Its textures load after parse returns.
      if (started) await loaded;
      return group;
    }
    const ktx2 = new KTX2Loader(manager).setTranscoderPath('/basis/').detectSupport(renderer);
    try {
      const gltf = await new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
      return gltf.scene;
    } finally {
      ktx2.dispose();
    }
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
  }
}

type MapSet = Partial<Record<MapRole, Texture>>;

// Maps in the zip, grouped by the words before the role word: `PlantOrchid001_COL_4K.jpg` is in group
// `plantorchid001`. If several files share a role, the biggest file wins, as for textures.
async function zipMaps(files: Record<string, Uint8Array>, flipY: boolean) {
  const picked = new Map<string, Map<MapRole, string>>();
  for (const [name, bytes] of Object.entries(files)) {
    const found = mapWord(name);
    if (!found) continue;
    const { role, index } = found;
    const prefix = words(name).slice(0, index).join('');
    if (!picked.has(prefix)) picked.set(prefix, new Map());
    const group = picked.get(prefix)!;
    if (bytes.length > (files[group.get(role)!]?.length ?? -1)) group.set(role, name);
  }
  const groups = new Map<string, MapSet>();
  for (const [prefix, roles] of picked) {
    const set: MapSet = {};
    for (const [role, name] of roles) {
      const bitmap = await decode(files[name]);
      const { width, height } = fit(bitmap.width, bitmap.height, MAP_MAX);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      // Gloss becomes roughness.
      if (role === 'gloss') {
        const image = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < image.data.length; i += 4) image.data[i] = image.data[i + 1] = image.data[i + 2] = 255 - image.data[i];
        ctx.putImageData(image, 0, 0);
      }
      const texture = new CanvasTexture(canvas);
      texture.flipY = flipY;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      if (role === 'color') texture.colorSpace = SRGBColorSpace;
      // A JPEG colour map is written as JPEG. A PNG or WebP one may have alpha, so it stays PNG, like the other maps.
      if (role === 'color' && /\.jpe?g$/i.test(name)) texture.userData.mimeType = 'image/jpeg';
      set[role] = texture;
    }
    groups.set(prefix, set);
  }
  return groups;
}

// Every material becomes a MeshStandardMaterial with the zip's maps (PRD 16.5).
async function convertMaterials(model: Object3D, files: Record<string, Uint8Array>, flipY: boolean) {
  const groups = await zipMaps(files, flipY);
  // Longest prefix first, so `plantmonsteravase001` is tried before `plantmonstera`.
  const prefixes = [...groups.keys()].sort((a, b) => b.length - a.length);
  const done = new Map<Material, MeshStandardMaterial>();
  const convert = (old: Material, meshName: string) => {
    if (done.has(old)) return done.get(old)!;
    const o = old as MeshStandardMaterial; // Phong, Lambert and Basic materials have the same fields
    // A texture with no image is one the file pointed to that isn't in the zip.
    const usable = (texture: Texture | null) => (texture?.image ? texture : null);
    const material = o.isMeshStandardMaterial
      ? o
      : new MeshStandardMaterial({ name: o.name, color: o.color ?? new Color(1, 1, 1), map: usable(o.map), normalMap: usable(o.normalMap), transparent: o.transparent, opacity: o.opacity, alphaTest: o.alphaTest, side: o.side });
    const prefix = groups.size === 1 ? prefixes[0] : prefixes.find((p) => flat(o.name).startsWith(p) || flat(meshName).startsWith(p));
    const maps = prefix === undefined ? {} : groups.get(prefix)!;
    if (maps.color) material.map = maps.color;
    if (maps.normal) material.normalMap = maps.normal;
    if (maps.ao) material.aoMap = maps.ao;
    const roughness = maps.roughness ?? maps.gloss;
    if (roughness) [material.roughnessMap, material.roughness] = [roughness, 1];
    if (maps.metalness) [material.metalnessMap, material.metalness] = [maps.metalness, 1];
    material.needsUpdate = true;
    done.set(old, material);
    return material;
  };
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => convert(m, mesh.name)) : convert(mesh.material, mesh.name);
  });
}

// A 256 px render of the model in a RoomEnvironment, on a clear background.
async function thumbnail(model: Object3D, renderer: WebGLRenderer) {
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const scene = new Scene();
  scene.environment = environment;
  scene.add(model);
  const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
  const camera = new PerspectiveCamera(30, 1, sphere.radius / 100, sphere.radius * 100);
  const distance = sphere.radius / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.copy(sphere.center).addScaledVector(new Vector3(1, 0.6, 1).normalize(), distance);
  camera.lookAt(sphere.center);

  // An sRGB target, so the pixels read back are already sRGB.
  const target = new WebGLRenderTarget(THUMB, THUMB, { colorSpace: SRGBColorSpace });
  const previous = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(THUMB * THUMB * 4);
  renderer.readRenderTargetPixels(target, 0, 0, THUMB, THUMB, pixels);
  renderer.setRenderTarget(previous.target);
  renderer.setClearColor(previous.color, previous.alpha);
  target.dispose();
  environment.dispose();
  pmrem.dispose();

  // WebGL rows run bottom to top.
  const image = new ImageData(THUMB, THUMB);
  const row = THUMB * 4;
  for (let y = 0; y < THUMB; y++) image.data.set(pixels.subarray((THUMB - 1 - y) * row, (THUMB - y) * row), y * row);
  const canvas = new OffscreenCanvas(THUMB, THUMB);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return encodeImage(canvas, 0.9);
}

// Frees the GPU memory the thumbnail render used.
const dispose = (model: Object3D) =>
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) {
      for (const value of Object.values(material)) if ((value as Texture)?.isTexture) (value as Texture).dispose();
      material.dispose();
    }
  });

// Turns the model file into one .glb in metres, standing on y = 0 (PRD 16.5).
export async function processModel(
  files: Record<string, Uint8Array>,
  main: string,
  renderer: WebGLRenderer,
): Promise<{ files: { glb: Blob }; thumb: Blob; resized: boolean }> {
  const model = await parseModel(files, main, renderer);
  if (countTriangles(model) > LIMITS.triangles) throw new UploadError(MESSAGES.triangles);
  // Lights and cameras in the file would light the room or do nothing, so they go.
  const extras: Object3D[] = [];
  model.traverse((o) => ((o as Light).isLight || (o as PerspectiveCamera).isCamera) && extras.push(o));
  for (const o of extras) o.removeFromParent();

  const holder = new Group().add(model);
  const box = new Box3().setFromObject(holder);
  if (box.isEmpty()) throw new UploadError(MESSAGES.nothing);
  const height = box.max.y - box.min.y;
  const resized = height > 0 && (height < 0.02 || height > 4);
  if (resized) holder.scale.setScalar(1 / height);

  await convertMaterials(model, files, main.toLowerCase().endsWith('.fbx'));

  box.setFromObject(holder);
  const center = box.getCenter(new Vector3());
  holder.position.set(-center.x, -box.min.y, -center.z);

  // FBXLoader gives meshes without indices. Sharing vertices makes the stored file much smaller. Meshes that have
  // indices are left alone, and so are interleaved attributes (from a glTF byteStride), which mergeVertices can't read.
  holder.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || mesh.geometry.index) return;
    if (Object.values(mesh.geometry.attributes).some((a) => (a as InterleavedBufferAttribute).isInterleavedBufferAttribute)) return;
    const merged = mergeVertices(mesh.geometry);
    if (merged !== mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = merged;
  });

  const exporter = new GLTFExporter().setTextureUtils(WebGLTextureUtils);
  const glb = new Blob([(await exporter.parseAsync(holder, { binary: true, maxTextureSize: MAP_MAX })) as ArrayBuffer], { type: 'model/gltf-binary' });
  const thumb = await thumbnail(holder, renderer);
  dispose(holder);
  return { files: { glb }, thumb, resized };
}
