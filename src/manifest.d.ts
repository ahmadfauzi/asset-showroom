declare module '@manifest' {
  import type { Slot } from './room';
  export type RoomKey = 'living' | 'bedroom' | 'bathroom' | 'garden';
  export type TextureInfo = {
    slug: string;
    name: string;
    category: 'wood' | 'stone' | 'fabric' | 'wall' | 'ground';
    poliigonUrl: string;
    sizeCm: [number, number];
  };
  const manifest: {
    set: 'free' | 'premium' | 'fixture';
    defaults: Record<RoomKey, Partial<Record<Slot, string>>>;
    textures: TextureInfo[];
  };
  export default manifest;
}
