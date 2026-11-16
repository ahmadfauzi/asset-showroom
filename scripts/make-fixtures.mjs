// Writes plain-colour raw maps for the "fixture" texture set used by the Playwright tests.
// Usage: node scripts/make-fixtures.mjs, then npm run textures -- fixture
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const COLOURS = {
  'oak-fixture': '#b8895a',
  'walnut-fixture': '#5e3b26',
  'concrete-fixture': '#9a9a96',
  'marble-fixture': '#e6e2da',
  'linen-fixture': '#d8cfc0',
  'velvet-fixture': '#3f5a73',
  'plaster-fixture': '#efe9df',
  'clay-fixture': '#c07a5a',
};

const size = { width: 256, height: 256, channels: 3 };
const solid = (background, file) => sharp({ create: { ...size, background } }).png().toFile(file);

const manifest = JSON.parse(readFileSync('src/textures/fixture.json', 'utf8'));
for (const { slug } of manifest.textures) {
  const dir = `assets-src/fixture/${slug}`;
  mkdirSync(dir, { recursive: true });
  await solid(COLOURS[slug], `${dir}/${slug}_BaseColor.png`);
  await solid('#8080ff', `${dir}/${slug}_Normal.png`); // flat
  await solid('#b3b3b3', `${dir}/${slug}_Roughness.png`);
}
