import { MESSAGES, UploadError, type SkySun } from './types';

type Result = { files: { exr: Blob }; thumb: Blob; sun: SkySun };

// Decodes an .exr or .hdr in a Worker, so the page keeps drawing (PRD 16.5). The Worker ends afterwards.
export function processHdri(name: string, bytes: Uint8Array): Promise<Result> {
  // Only a whole buffer can be transferred.
  const own = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  const worker = new Worker(new URL('./hdri.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Result>((resolve, reject) => {
    worker.onerror = () => reject(new UploadError(MESSAGES.memory));
    worker.onmessage = ({ data }) => {
      if (data.error === 'size') reject(new UploadError(MESSAGES.hdriSize));
      else if (data.error === 'memory') reject(new UploadError(MESSAGES.memory));
      else if (data.error) reject(new Error(data.error));
      else resolve({ files: { exr: data.exr }, thumb: data.thumb, sun: data.sun });
    };
    worker.postMessage({ name, bytes: own }, [own.buffer]);
  }).finally(() => worker.terminate());
}
