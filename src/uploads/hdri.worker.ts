import { DataTexture, DataUtils, FloatType, HalfFloatType, RGBAFormat } from 'three';
import { EXRExporter, ZIP_COMPRESSION } from 'three/examples/jsm/exporters/EXRExporter.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { fillBelowHorizon } from './horizon';
import { encodeImage, fit } from './texture';
import { LIMITS, type SkySun } from './types';

// Decodes an uploaded .exr or .hdr off the main thread (PRD 16.5). Gets { name, bytes }. Posts
// { exr, thumb, sun }, or { error } with 'size', 'memory' or, for a file it can't read, the error's message.

const MAX = { width: 2048, height: 1024 };
const BLOCK = 32;
const STEP = BLOCK / 2;
const THUMB = 256;

// Width and height from the header, so an oversized file is never decoded. null if they can't be found, and
// then the file is refused rather than decoded.
function headerSize(name: string, bytes: Uint8Array): [number, number] | null {
  if (/\.hdr$/i.test(name)) {
    // Read the way HDRLoader reads it: lines that don't start with '#', until it has the format and the size.
    // The size is only looked for in the first 64 KB.
    let size: [number, number] | null = null, format = false;
    for (const line of new TextDecoder('latin1').decode(bytes.subarray(0, 65536)).split('\n')) {
      if (line.startsWith('#')) continue;
      const m = line.match(/^\s*-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/);
      if (m) size = [+m[2], +m[1]];
      format ||= /^\s*FORMAT=\S+\s*$/.test(line);
      if (size && format) break;
    }
    return size;
  }
  // EXR: 8 bytes of magic number and version, then attributes: name, type, int32 size, value.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || view.getInt32(0, true) !== 20000630) return null; // not an EXR
  const text = (at: number) => {
    const end = bytes.indexOf(0, at);
    return [new TextDecoder().decode(bytes.subarray(at, end)), end + 1] as const;
  };
  let at = 8;
  while (at < bytes.length) {
    const [name, afterName] = text(at);
    if (!name) break;
    const [, afterType] = text(afterName);
    const value = afterType + 4;
    if (afterType <= afterName || value + 16 > bytes.length) break; // no end to the type, or cut short
    const size = view.getInt32(afterType, true);
    if (name === 'dataWindow') {
      const [xMin, yMin, xMax, yMax] = [0, 4, 8, 12].map((o) => view.getInt32(value + o, true));
      return [xMax - xMin + 1, yMax - yMin + 1];
    }
    if (value + size <= at) break; // a broken header would loop
    at = value + size;
  }
  return null;
}

// Box-filters RGBA from w x h to W x H. Source rows are bottom first unless topFirst; the result is bottom first.
function shrink(src: ArrayLike<number>, w: number, h: number, W: number, H: number, topFirst: boolean, toNumber?: Float32Array) {
  const out = new Float32Array(W * H * 4);
  const column = Uint32Array.from({ length: w }, (_, x) => Math.floor((x * W) / w));
  const perColumn = new Uint32Array(W), perRow = new Uint32Array(H);
  column.forEach((c) => perColumn[c]++);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(((topFirst ? h - 1 - y : y) * H) / h);
    perRow[row]++;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = (row * W + column[x]) * 4;
      for (let c = 0; c < 4; c++) out[o + c] += toNumber ? toNumber[src[i + c]] : src[i + c];
    }
  }
  for (let row = 0; row < H; row++)
    for (let x = 0; x < W; x++) {
      const n = perRow[row] * perColumn[x], o = (row * W + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] /= n;
    }
  return out;
}

// The brightest 32 x 32 block, tried every 16 px so a small sun is never split between blocks. Uses three's
// equirect mapping: u along the width, v = 0 at the bottom row. An image under 32 px has no sun. Blocks start at
// `fromRow` or above.
function findSun(image: Float32Array, W: number, H: number, fromRow: number): SkySun {
  let best = -1, sum = [0, 0, 0], centre = [0, 0];
  for (let y0 = fromRow; y0 + BLOCK <= H; y0 += STEP)
    for (let x0 = 0; x0 + BLOCK <= W; x0 += STEP) {
      const s = [0, 0, 0];
      for (let y = y0; y < y0 + BLOCK; y++)
        for (let x = x0; x < x0 + BLOCK; x++) for (let c = 0; c < 3; c++) s[c] += image[(y * W + x) * 4 + c];
      const luminance = 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
      if (luminance > best) [best, sum, centre] = [luminance, s, [(x0 + BLOCK / 2) / W, (y0 + BLOCK / 2) / H]];
    }
  const angle = (centre[0] - 0.5) * 2 * Math.PI, elevation = (centre[1] - 0.5) * Math.PI;
  if (elevation < 0) return null;
  const top = Math.max(...sum) || 1;
  return {
    direction: [Math.cos(elevation) * Math.cos(angle), Math.sin(elevation), Math.cos(elevation) * Math.sin(angle)],
    color: sum.map((v) => v / top) as [number, number, number],
  };
}

// Reinhard tone mapping and sRGB, top row first.
function thumbnail(image: Float32Array, W: number, H: number) {
  const { width, height } = fit(W, H, THUMB);
  const small = shrink(image, W, H, width, height, false);
  const pixels = new ImageData(width, height);
  const srgb = (v: number) => {
    const c = v / (1 + v);
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((height - 1 - y) * width + x) * 4, o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[o + c] = srgb(Math.max(0, small[i + c]));
      pixels.data[o + 3] = 255;
    }
  const canvas = new OffscreenCanvas(width, height);
  // A software canvas. Checked: without it, encoding waited 29 s on a busy GPU process (SwiftShader).
  canvas.getContext('2d', { willReadFrequently: true })!.putImageData(pixels, 0, 0);
  return encodeImage(canvas);
}

self.onmessage = async ({ data: { name, bytes } }: MessageEvent<{ name: string; bytes: Uint8Array }>) => {
  try {
    const size = headerSize(name, bytes);
    if (!size) throw new Error('No image size in the header.');
    const [w, h] = size;
    if (w > LIMITS.hdriWidth || h > LIMITS.hdriHeight) return postMessage({ error: 'size' });
    const hdr = /\.hdr$/i.test(name);
    const loader = hdr ? new HDRLoader() : new EXRLoader();
    const decoded = loader.setDataType(HalfFloatType).parse(bytes.buffer as ArrayBuffer) as { width: number; height: number; data: Uint16Array };
    // Half floats become numbers through a table as they are added up, so the full-size image is never held
    // as 32-bit floats.
    const toNumber = Float32Array.from({ length: 65536 }, (_, i) => DataUtils.fromHalfFloat(i));
    const s = Math.min(1, MAX.width / decoded.width, MAX.height / decoded.height);
    const [W, H] = [Math.max(1, Math.round(decoded.width * s)), Math.max(1, Math.round(decoded.height * s))];
    // HDRLoader gives the top row first, EXRLoader the bottom row.
    const image = shrink(decoded.data, decoded.width, decoded.height, W, H, hdr, toNumber);
    // Before the sun search. If it filled, the sun is only looked for above the horizon: the fill can be a little
    // brighter than the sky beside a bright spot, so a block across the horizon could otherwise win.
    const filled = fillBelowHorizon(image, W, H);
    const sun = findSun(image, W, H, filled ? H >> 1 : 0);
    const exr = await new EXRExporter().parse(new DataTexture(image, W, H, RGBAFormat, FloatType), { type: HalfFloatType, compression: ZIP_COMPRESSION });
    postMessage({ exr: new Blob([exr as BlobPart], { type: 'image/x-exr' }), thumb: await thumbnail(image, W, H), sun });
  } catch (error) {
    // Only a failed allocation is "memory". A broken file also throws RangeError (reading past a DataView's end).
    const memory = error instanceof RangeError && /allocation|Invalid typed array length|Array buffer/i.test(error.message);
    postMessage({ error: memory ? 'memory' : String(error) });
  }
};
