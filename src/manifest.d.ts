declare module '@manifest' {
  export type TextureInfo = {
    slug: string;
    name: string;
    category: 'wood' | 'stone' | 'fabric' | 'wall';
    poliigonUrl: string;
    sizeCm: [number, number];
  };
  const manifest: {
    set: 'free' | 'premium';
    defaults: Record<string, string>;
    textures: TextureInfo[];
  };
  export default manifest;
}
