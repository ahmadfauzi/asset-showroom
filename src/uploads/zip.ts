import { unzip, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { ZipEntry } from './types';

// The filter returns false for every file, so fflate reads the directory but inflates nothing.
export function listZip(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  unzipSync(data, { filter: (f) => (entries.push({ name: f.name, size: f.originalSize }), false) });
  return entries;
}

export const readZip = (data: Uint8Array, names: string[]) =>
  new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    const wanted = new Set(names);
    unzip(data, { filter: (f) => wanted.has(f.name) }, (err, files) => (err ? reject(err) : resolve(files)));
  });
