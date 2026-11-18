import { LIMITS, MESSAGES, UploadError, type Kind, type ZipEntry } from './types';

// Kept in types.ts so the start-up code can use them without the detection code (PRD 16.11).
export { LIMITS, MESSAGES } from './types';

export type MapRole = 'color' | 'normal' | 'ao' | 'roughness' | 'gloss' | 'metalness';

// Checked in this order, so `gloss` is tried before `roughness`.
const ROLE_WORDS: [MapRole, string[]][] = [
  ['color', ['basecolor', 'albedo', 'diffuse', 'col']],
  ['normal', ['normal', 'nrm', 'nor']],
  ['ao', ['ambientocclusion', 'occlusion', 'ao']],
  ['gloss', ['gloss']],
  ['roughness', ['roughness', 'rough']],
  ['metalness', ['metallic', 'metalness', 'metal']],
];

const ext = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

export const words = (fileName: string) =>
  fileName.split('/').pop()!.toLowerCase().split(/[_\-. ]+/).filter(Boolean);

export function mapRole(fileName: string): MapRole | null {
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext(fileName))) return null;
  const w = words(fileName);
  return ROLE_WORDS.find(([, names]) => names.some((n) => w.some((x) => x.startsWith(n))))?.[0] ?? null;
}

export function checkSizes(zipBytes: number, entries: ZipEntry[]) {
  if (zipBytes > LIMITS.zipBytes) throw new UploadError(MESSAGES.zipSize);
  if (entries.reduce((sum, e) => sum + e.size, 0) > LIMITS.unzippedBytes) throw new UploadError(MESSAGES.unzipped);
}

const largest = (list: ZipEntry[]) => list.reduce((a, b) => (b.size > a.size ? b : a));

// The order of the rules is PRD 16.4.
export function detectKind(entries: ZipEntry[]): { kind: Kind; main: string } {
  const files = entries.filter((e) => !e.name.endsWith('/') && !e.name.toLowerCase().includes('preview'));
  const withExt = (...exts: string[]) => files.filter((e) => exts.includes(ext(e.name)));

  const models = withExt('glb', 'gltf', 'fbx');
  if (models.length) return { kind: 'model', main: largest(models).name };
  if (withExt('blend', 'max', 'c4d', 'ma').length) throw new UploadError(MESSAGES.exportFirst);
  const color = files.find((e) => mapRole(e.name) === 'color');
  if (color) return { kind: 'texture', main: color.name };
  const exr = withExt('exr');
  const hdris = exr.length ? exr : withExt('hdr');
  if (hdris.length) return { kind: 'hdri', main: largest(hdris).name };
  throw new UploadError(MESSAGES.nothing);
}
