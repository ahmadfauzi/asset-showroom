import { cpSync, existsSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

// Only the active texture set is served and copied into dist/. See docs/PRD.md section 7.4.
export default defineConfig(({ mode }) => {
  const set = loadEnv(mode, process.cwd()).VITE_ASSET_SET || 'free';
  if (set !== 'free' && set !== 'premium') throw new Error(`VITE_ASSET_SET must be free or premium, not "${set}"`);
  const textures = `textures-built/${set}`;

  return {
    resolve: { alias: { '@manifest': `/src/textures/${set}.json` } },
    plugins: [
      {
        name: 'texture-set',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url?.startsWith('/textures/')) req.url = `/${textures}/${req.url.slice('/textures/'.length)}`;
            next();
          });
        },
        closeBundle() {
          if (existsSync(textures)) cpSync(textures, 'dist/textures', { recursive: true });
        },
      },
    ],
  };
});
