import { deleteUpload, listUploads, putUpload } from './store';
import type { Upload, UploadMeta } from './types';

export type Library = {
  list(): UploadMeta[];
  ids(): Set<string>;
  get(id: string): UploadMeta | undefined;
  thumb(id: string): string;
  add(upload: Upload): Promise<void>;
  remove(id: string): Promise<void>;
};

// The uploads in this browser, newest first (PRD 16.6). Read once at start, then kept in step with the store.
export async function createLibrary(): Promise<Library> {
  // If IndexedDB can't open (some private windows), the room still loads with no uploads.
  let list = await listUploads().catch((error) => {
    console.warn('Asset Showroom: could not read uploads.', error);
    return [] as UploadMeta[];
  });
  const thumbs = new Map<string, string>();
  const get = (id: string) => list.find((meta) => meta.id === id);

  return {
    list: () => list,
    ids: () => new Set(list.map((meta) => meta.id)),
    get,
    thumb(id) {
      if (!thumbs.has(id)) thumbs.set(id, URL.createObjectURL(get(id)!.thumb));
      return thumbs.get(id)!;
    },
    async add(upload) {
      await putUpload(upload);
      const { files: _files, ...meta } = upload;
      list = [meta, ...list];
    },
    async remove(id) {
      await deleteUpload(id);
      list = list.filter((meta) => meta.id !== id);
      if (thumbs.has(id)) URL.revokeObjectURL(thumbs.get(id)!);
      thumbs.delete(id);
    },
  };
}
