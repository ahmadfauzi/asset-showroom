import type { WebGLRenderer } from 'three';
import { baseName, checkSizes, detectKind, LIMITS, mapRole, MESSAGES } from './detect';
import { processHdri } from './hdri';
import { processModel } from './model';
import { newId } from './store';
import { processTexture } from './texture';
import { UploadError, type SkySun, type Upload, type UploadFiles } from './types';
import { listZip, readZip } from './zip';

// Decoders and canvases report running out of memory in these ways.
const outOfMemory = (error: unknown) =>
  error instanceof RangeError || ['NotReadableError', 'EncodingError'].includes((error as { name?: string } | null)?.name ?? '');

// Turns an uploaded zip into what the store keeps (PRD 16.3 to 16.5). Loaded with import() on the first upload.
// `notice` shows a toast for something that worked but needs saying.
export async function processZip(
  file: File,
  renderer: WebGLRenderer,
  onProgress: (fraction: number) => void,
  notice: (message: string) => void,
): Promise<Upload> {
  try {
    // Checked before reading, so a huge file is never loaded into memory.
    if (file.size > LIMITS.zipBytes) throw new UploadError(MESSAGES.zipSize);
    const data = new Uint8Array(await file.arrayBuffer());
    const entries = listZip(data);
    checkSizes(file.size, entries);
    const { kind, main } = detectKind(entries);
    onProgress(0.1);

    // Only what is needed is unpacked: the maps, for a model its mesh file, any .bin and every image (KTX2 too),
    // and for an HDRI the one file. Folders and previews are skipped, as in detectKind.
    const wanted = (name: string) => kind !== 'hdri' && (kind === 'model' ? /\.(bin|jpe?g|png|webp|ktx2)$/i.test(name) : mapRole(name));
    const names = entries
      .map((entry) => entry.name)
      .filter((name) => name === main || (!name.endsWith('/') && !baseName(name).toLowerCase().includes('preview') && wanted(name)));
    const unpacked = await readZip(data, names);
    onProgress(0.3);
    let files: UploadFiles, thumb: Blob, sun: SkySun = null;
    if (kind === 'hdri') {
      ({ files, thumb, sun } = await processHdri(main, unpacked[main]));
    } else if (kind === 'model') {
      const model = await processModel(unpacked, main, renderer);
      if (model.resized) notice("This model's size looked wrong, so it's now 1 m tall.");
      ({ files, thumb } = model);
    } else {
      ({ files, thumb } = await processTexture(unpacked));
    }
    onProgress(1);

    return {
      id: newId(),
      kind,
      name: file.name.replace(/\.zip$/i, ''),
      created: Date.now(),
      bytes: thumb.size + Object.values(files).reduce((sum, blob: Blob) => sum + blob.size, 0),
      thumb,
      ...(kind === 'texture' && { sizeCm: [100, 100] as [number, number] }),
      ...(kind === 'hdri' && { sun }),
      files,
    };
  } catch (error) {
    throw outOfMemory(error) ? new UploadError(MESSAGES.memory) : error;
  }
}
