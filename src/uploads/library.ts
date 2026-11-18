import { RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { deleteUpload, getFiles, listUploads, putUpload, setSize as saveSize } from './store';
import type { TextureFiles, Upload, UploadedTexture, UploadMeta } from './types';

export type Library = {
  list(): UploadMeta[];
  ids(): Set<string>;
  get(id: string): UploadMeta | undefined;
  thumb(id: string): string;
  texture(id: string): UploadedTexture | undefined;
  loadTexture(id: string): Promise<Texture[]>;
  setSize(id: string, sizeCm: [number, number]): Promise<void>;
  add(upload: Upload): Promise<void>;
  remove(id: string): Promise<void>;
};

const repeat = (maps: Texture[], [width, height]: [number, number]) => {
  for (const map of maps) map.repeat.set(100 / width, 100 / height);
};

// The uploads in this browser, newest first (PRD 16.6). Read once at start, then kept in step with the store.
export async function createLibrary(): Promise<Library> {
  // If IndexedDB can't open (some private windows), the room still loads with no uploads.
  let list = await listUploads().catch((error) => {
    console.warn('Asset Showroom: could not read uploads.', error);
    return [] as UploadMeta[];
  });
  const thumbs = new Map<string, string>();
  // One object per upload, so a new size shows wherever it is used.
  const textures = new Map<string, UploadedTexture>();
  const maps = new Map<string, Texture[]>();
  const get = (id: string) => list.find((meta) => meta.id === id);
  const thumb = (id: string) => {
    if (!thumbs.has(id)) thumbs.set(id, URL.createObjectURL(get(id)!.thumb));
    return thumbs.get(id)!;
  };
  const texture = (id: string) => {
    const meta = get(id);
    if (meta?.kind !== 'texture') return undefined;
    if (!textures.has(id)) textures.set(id, { slug: id, name: meta.name, sizeCm: meta.sizeCm ?? [100, 100], uploaded: true, thumb: thumb(id) });
    return textures.get(id);
  };

  return {
    list: () => list,
    ids: () => new Set(list.map((meta) => meta.id)),
    get,
    thumb,
    texture,
    // Colour, normal and ORM, the same way up as the bundled KTX2 maps, which three.js never flips.
    async loadTexture(id) {
      const { color, normal, orm } = (await getFiles(id)) as TextureFiles;
      const loaded = await Promise.all(
        [color, normal, orm].map(async (blob) => {
          const map = new Texture(await createImageBitmap(blob, { colorSpaceConversion: 'none' }));
          map.flipY = false;
          map.wrapS = map.wrapT = RepeatWrapping;
          map.needsUpdate = true;
          return map;
        }),
      );
      loaded[0].colorSpace = SRGBColorSpace;
      repeat(loaded, texture(id)!.sizeCm);
      maps.set(id, loaded);
      return loaded;
    },
    // Changes the upload everywhere it shows, in every room (PRD 16.7).
    async setSize(id, sizeCm) {
      const uploaded = texture(id);
      if (uploaded) uploaded.sizeCm = sizeCm;
      repeat(maps.get(id) ?? [], sizeCm);
      await saveSize(id, sizeCm);
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
