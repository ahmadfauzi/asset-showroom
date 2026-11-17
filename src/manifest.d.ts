declare module '@manifest' {
  import type { RoomKey, Slot } from './room';
  export type TextureInfo = {
    slug: string;
    name: string;
    category: 'wood' | 'stone' | 'fabric' | 'wall' | 'ground';
    poliigonUrl: string;
    sizeCm: [number, number];
  };
  const manifest: {
    set: 'free' | 'premium' | 'fixture';
    defaults: Partial<Record<RoomKey, Partial<Record<Slot, string>>>>;
    textures: TextureInfo[];
  };
  export default manifest;
}
