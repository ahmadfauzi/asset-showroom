import type { TextureInfo } from '@manifest';

export type Kind = 'texture' | 'model' | 'hdri';
export type ZipEntry = { name: string; size: number }; // size is the unpacked size in bytes

// The message is the exact text to show the user.
export class UploadError extends Error {}

export type SkySun = { direction: [number, number, number]; color: [number, number, number] } | null; // null: the brightest spot is below the horizon
export type TextureFiles = { color: Blob; normal: Blob; orm: Blob };
export type UploadMeta = { id: string; kind: Kind; name: string; created: number; bytes: number; thumb: Blob; sizeCm?: [number, number]; sun?: SkySun };
export type UploadFiles = TextureFiles | { glb: Blob } | { exr: Blob };
export type Upload = UploadMeta & { files: UploadFiles };
export type UploadedTexture = { slug: string; name: string; sizeCm: [number, number]; uploaded: true; thumb: string }; // slug is the upload id, thumb an object URL
export type AnyTexture = TextureInfo | UploadedTexture;
export type Placement = { id: string; x: number; y: number; z: number; turn: number }; // turn in degrees, a multiple of 15, 0 to 345
export type Sky = { id: string; turn: number } | null;
