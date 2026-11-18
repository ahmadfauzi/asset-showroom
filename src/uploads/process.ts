import type { WebGLRenderer } from 'three';
import { checkSizes, detectKind, LIMITS, mapRole, MESSAGES } from './detect';
import { newId } from './store';
import { processTexture } from './texture';
import { UploadError, type Upload } from './types';
import { listZip, readZip } from './zip';

// Decoders and canvases report running out of memory in these ways.
const outOfMemory = (error: unknown) =>
  error instanceof RangeError || ['NotReadableError', 'EncodingError'].includes((error as { name?: string } | null)?.name ?? '');

// Turns an uploaded zip into what the store keeps (PRD 16.3 to 16.5). Loaded with import() on the first upload.
// `notice` shows a toast for something that worked but needs saying.
export async function processZip(
  file: File,
  _renderer: WebGLRenderer,
  onProgress: (fraction: number) => void,
  _notice: (message: string) => void,
): Promise<Upload> {
  try {
    // Checked before reading, so a huge file is never loaded into memory.
    if (file.size > LIMITS.zipBytes) throw new UploadError(MESSAGES.zipSize);
    const data = new Uint8Array(await file.arrayBuffer());
    const entries = listZip(data);
    checkSizes(file.size, entries);
    const { kind } = detectKind(entries);
    if (kind !== 'texture') throw new UploadError(MESSAGES.nothing);
    onProgress(0.1);

    // Only the maps are unpacked. Folders and previews are skipped, as in detectKind.
    const names = entries
      .map((entry) => entry.name)
      .filter((name) => !name.endsWith('/') && !name.toLowerCase().includes('preview') && mapRole(name));
    const unpacked = await readZip(data, names);
    onProgress(0.3);
    const { files, thumb } = await processTexture(unpacked);
    onProgress(1);

    return {
      id: newId(),
      kind,
      name: file.name.replace(/\.zip$/i, ''),
      created: Date.now(),
      bytes: thumb.size + Object.values(files).reduce((sum, blob: Blob) => sum + blob.size, 0),
      thumb,
      sizeCm: [100, 100],
      files,
    };
  } catch (error) {
    throw outOfMemory(error) ? new UploadError(MESSAGES.memory) : error;
  }
}
