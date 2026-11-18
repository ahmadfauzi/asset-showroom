import type { TextureInfo } from '@manifest';

export type Kind = 'texture' | 'model' | 'hdri';
export type ZipEntry = { name: string; size: number }; // size is the unpacked size in bytes

// The message is the exact text to show the user.
export class UploadError extends Error {}

export const MESSAGES = {
  zipSize: 'This zip is over 250 MB.',
  unzipped: 'This zip unpacks to more than 1 GB.',
  triangles: 'This model has more than 500,000 triangles.',
  hdriSize: 'HDRIs up to 8K only.',
  quota: 'Your browser is out of space for uploads. Delete some in Uploads and try again.',
  memory: 'This file is too big for this device.',
  exportFirst: 'Export it as .glb or .fbx first.',
  nothing: 'This zip has no texture, model or HDRI we can read.',
  busy: 'Wait for the current upload to finish.',
  cap: 'This room has 10 models. Remove one first.',
};

export const LIMITS = { zipBytes: 250 * 1024 ** 2, unzippedBytes: 1024 ** 3, triangles: 500_000, hdriWidth: 8192, hdriHeight: 4096, modelsPerRoom: 10 };

export type SkySun = { direction: [number, number, number]; color: [number, number, number] } | null; // null: the brightest spot is below the horizon
export type TextureFiles = { color: Blob; normal: Blob; orm: Blob };
export type UploadMeta = { id: string; kind: Kind; name: string; created: number; bytes: number; thumb: Blob; sizeCm?: [number, number]; sun?: SkySun };
export type UploadFiles = TextureFiles | { glb: Blob } | { exr: Blob };
export type Upload = UploadMeta & { files: UploadFiles };
export type UploadedTexture = { slug: string; name: string; sizeCm: [number, number]; uploaded: true; thumb: string }; // slug is the upload id, thumb an object URL
export type AnyTexture = TextureInfo | UploadedTexture;
export type Placement = { id: string; x: number; y: number; z: number; turn: number }; // turn in degrees, a multiple of 15, 0 to 345
export type Sky = { id: string; turn: number } | null;
