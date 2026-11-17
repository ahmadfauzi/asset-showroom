import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

// Only the active texture set is served and copied into dist/. See docs/PRD.md section 7.4.
// "fixture" is a set of plain-colour textures for the Playwright tests.
const SETS = ['free', 'premium', 'fixture'];

export default defineConfig(({ mode }) => {
  const set = loadEnv(mode, process.cwd()).VITE_ASSET_SET || 'free';
  if (!SETS.includes(set)) throw new Error(`VITE_ASSET_SET must be one of ${SETS.join(', ')}, not "${set}"`);
  const textures = `textures-built/${set}`;
  let outDir = 'dist';
  // The built models. The build tests point this at an empty folder to check the missing-file error.
  const models = process.env.MODELS_DIR || 'models-built';

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
        configResolved(config) {
          outDir = config.build.outDir;
        },
        // Copies the built files of the manifest's textures, then fails the build if a texture has no built
        // files or dist/textures holds anything outside this set's manifest.
        closeBundle() {
          const manifest: { textures: { slug: string }[] } = JSON.parse(readFileSync(`src/textures/${set}.json`, 'utf8'));
          const slugs = new Set(manifest.textures.map((texture) => texture.slug));
          const errors: string[] = [];
          for (const slug of slugs) {
            if (existsSync(`${textures}/${slug}`)) cpSync(`${textures}/${slug}`, `${outDir}/textures/${slug}`, { recursive: true });
            else errors.push(`${slug} has no built files in ${textures}/. Run npm run textures -- ${set} ${slug}.`);
          }
          const outside = existsSync(`${outDir}/textures`) ? readdirSync(`${outDir}/textures`).filter((name) => !slugs.has(name)) : [];
          if (outside.length) errors.push(`dist/textures has files that aren't in the ${set} set: ${outside.join(', ')}.`);
          if (errors.length) throw new Error(`Texture set check failed:\n${errors.join('\n')}`);
        },
      },
      {
        name: 'room-models',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url?.startsWith('/models/')) req.url = `/${models}/${req.url.slice('/models/'.length)}`;
            next();
          });
        },
        // Copies the built model of every id in rooms.json, and fails the build if one has no built file.
        closeBundle() {
          const rooms: Record<string, { models: string[] }> = JSON.parse(readFileSync('src/rooms.json', 'utf8'));
          const ids = new Set(Object.values(rooms).flatMap((room) => room.models));
          const errors: string[] = [];
          for (const id of ids) {
            if (existsSync(`${models}/${id}.glb`)) cpSync(`${models}/${id}.glb`, `${outDir}/models/${id}.glb`);
            else errors.push(`${id} has no built file in models-built/. Run npm run models -- ${id}.`);
          }
          if (errors.length) throw new Error(`Model check failed:\n${errors.join('\n')}`);
        },
      },
    ],
  };
});
