declare module '@manifest' {
  const manifest: {
    set: 'free' | 'premium';
    defaults: Record<string, string>;
    textures: { slug: string; name: string; category: string; poliigonUrl: string; sizeCm: [number, number] }[];
  };
  export default manifest;
}
