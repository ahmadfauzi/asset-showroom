import { MESSAGES, mapRole, words, type MapRole } from './detect';
import { UploadError, type TextureFiles } from './types';

const COLOR_MAX = 2048;
const NORMAL_MAX = 1024;
const THUMB = 256;

export const decode = (bytes: Uint8Array) => createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: 'none' });

// Never scales up.
export const fit = (w: number, h: number, max: number) => {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
};

function draw(bitmap: ImageBitmap, width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

// Chromium writes lossless WebP at quality 1. Other browsers may fall back to PNG.
export async function encodeImage(canvas: OffscreenCanvas, quality = 0.9): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  return blob.type === 'image/webp' ? blob : canvas.convertToBlob({ type: 'image/png' });
}

// Red channel of a grey map, scaled to the given size.
const grey = (bitmap: ImageBitmap | undefined, width: number, height: number) => {
  if (!bitmap) return null;
  const { data } = draw(bitmap, width, height).ctx.getImageData(0, 0, width, height);
  return (i: number) => data[i * 4];
};

// A DirectX normal map: a word in the file name (not the folder) that is or ends in `dx`, as in Poliigon's `NormalDX`
// and Poly Haven's `nor_dx`.
const directX = (name: string) => words(name).some((word) => word.endsWith('dx'));

export async function processTexture(files: Record<string, Uint8Array>): Promise<{ files: TextureFiles; thumb: Blob }> {
  // If several files share a role, the biggest file wins. A normal map that isn't DirectX wins over one that is.
  const picked = new Map<MapRole, string>();
  for (const [name, bytes] of Object.entries(files)) {
    const role = mapRole(name);
    if (!role) continue;
    const old = picked.get(role);
    const better = old === undefined || (role === 'normal' && directX(old) !== directX(name) ? directX(old) : bytes.length > files[old].length);
    if (better) picked.set(role, name);
  }
  const bitmap = async (role: MapRole) => (picked.has(role) ? decode(files[picked.get(role)!]) : undefined);

  const colorMap = await bitmap('color');
  if (!colorMap) throw new UploadError(MESSAGES.nothing);
  const size = fit(colorMap.width, colorMap.height, COLOR_MAX);
  const color = draw(colorMap, size.width, size.height);

  const normalMap = await bitmap('normal');
  let normal: OffscreenCanvas;
  if (normalMap) {
    const n = fit(normalMap.width, normalMap.height, NORMAL_MAX);
    const { canvas, ctx } = draw(normalMap, n.width, n.height);
    // three.js expects green up, so a DirectX map's green is flipped.
    if (directX(picked.get('normal')!)) {
      const img = ctx.getImageData(0, 0, n.width, n.height);
      for (let i = 1; i < img.data.length; i += 4) img.data[i] = 255 - img.data[i];
      ctx.putImageData(img, 0, 0);
    }
    normal = canvas;
  } else {
    normal = new OffscreenCanvas(1, 1); // no normal map: a flat one
    const ctx = normal.getContext('2d')!;
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 1, 1);
  }

  // AO in red, roughness in green, metalness in blue, which is how three.js reads them.
  const { width, height } = size;
  const ao = grey(await bitmap('ao'), width, height);
  const roughness = grey(await bitmap('roughness'), width, height);
  const gloss = grey(await bitmap('gloss'), width, height);
  const metalness = grey(await bitmap('metalness'), width, height);
  const orm = new OffscreenCanvas(width, height);
  const ormCtx = orm.getContext('2d')!;
  const out = ormCtx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    out.data[i * 4] = ao ? ao(i) : 255;
    out.data[i * 4 + 1] = roughness ? roughness(i) : gloss ? 255 - gloss(i) : 128;
    out.data[i * 4 + 2] = metalness ? metalness(i) : 0;
    out.data[i * 4 + 3] = 255;
  }
  ormCtx.putImageData(out, 0, 0);

  // Centre square of the colour map.
  const side = Math.min(THUMB, colorMap.width, colorMap.height);
  const crop = Math.min(colorMap.width, colorMap.height);
  const thumb = new OffscreenCanvas(side, side);
  thumb.getContext('2d')!.drawImage(colorMap, (colorMap.width - crop) / 2, (colorMap.height - crop) / 2, crop, crop, 0, 0, side, side);

  return {
    files: { color: await encodeImage(color.canvas, 0.9), normal: await encodeImage(normal, 1), orm: await encodeImage(orm, 1) },
    thumb: await encodeImage(thumb, 0.9),
  };
}
