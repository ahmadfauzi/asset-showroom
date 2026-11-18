import { MESSAGES } from './detect';
import { UploadError, type Upload, type UploadFiles, type UploadMeta } from './types';

let opened: Promise<IDBDatabase> | undefined;
const open = () => (opened ??= new Promise((resolve, reject) => {
  const request = indexedDB.open('asset-showroom', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('meta', { keyPath: 'id' });
    request.result.createObjectStore('files', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
}));

const mapError = (error: unknown) => (error as { name?: string } | null)?.name === 'QuotaExceededError' ? new UploadError(MESSAGES.quota) : error;

// Resolves with the returned request's result once the whole transaction has committed.
// Any failure aborts it, so a write to one store never survives a failed write to the other.
async function transact<T = void>(mode: IDBTransactionMode, fn: (meta: IDBObjectStore, files: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'files'], mode);
    let failure: unknown;
    let request: IDBRequest<T> | void;
    tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
    tx.onabort = () => reject(mapError(failure ?? tx.error));
    // Keep the first failure: aborting makes the other pending requests report AbortError too.
    tx.onerror = (event) => { failure ??= (event.target as IDBRequest).error; };
    try {
      request = fn(tx.objectStore('meta'), tx.objectStore('files'));
    } catch (error) {
      failure = error;
      tx.abort();
    }
  });
}

export const newId = () => `u-${[...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

export function putUpload(upload: Upload) {
  const { files, ...meta } = upload;
  return transact('readwrite', (metaStore, filesStore) => {
    metaStore.put(meta);
    filesStore.put({ id: upload.id, ...files });
  });
}

export async function listUploads(): Promise<UploadMeta[]> {
  const all = await transact<UploadMeta[]>('readonly', (meta) => meta.getAll());
  return all.sort((a, b) => b.created - a.created);
}

export async function getFiles(id: string): Promise<UploadFiles | undefined> {
  const record = await transact<(UploadFiles & { id: string }) | undefined>('readonly', (_, files) => files.get(id));
  if (!record) return undefined;
  const { id: _id, ...files } = record;
  return files as UploadFiles;
}

export function setSize(id: string, sizeCm: [number, number]) {
  return transact('readwrite', (meta) => {
    const get = meta.get(id);
    get.onsuccess = () => { if (get.result) meta.put({ ...get.result, sizeCm }); };
  });
}

export function deleteUpload(id: string) {
  return transact('readwrite', (meta, files) => {
    meta.delete(id);
    files.delete(id);
  });
}
