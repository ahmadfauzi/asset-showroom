// Writes small zips for the upload tests into tests/fixtures/uploads/.
// Usage: node scripts/make-upload-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';

const OUT = 'tests/fixtures/uploads';
mkdirSync(OUT, { recursive: true });

const png = (background) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background } }).png().toBuffer().then((b) => new Uint8Array(b));
const bytes = (text) => new TextEncoder().encode(text);
const zip = (name, files) => writeFileSync(`${OUT}/${name}`, zipSync(files));

zip('texture-metal.zip', {
  'Tile_BaseColor.png': await png('#c86432'),
  'Tile_NormalDX.png': await png('#8080ff'),
  'Tile_Roughness.png': await png('#404040'),
  'Tile_Metallic.png': await png('#ffffff'),
  'Tile_Displacement.tiff': bytes('not a real tiff'),
  'Tile_Preview1.png': await png('#888888'),
});

zip('texture-gloss.zip', {
  'Bark_COL_1K.png': await png('#5a3c28'),
  'Bark_GLOSS_1K.png': await png('#c0c0c0'),
  'Bark_NRM_1K.png': await png('#8080ff'),
});

zip('blend.zip', { 'Plant.blend': bytes('not a real blend file'), 'Plant_COL.png': await png('#4a7a3a') });

zip('nothing.zip', { 'readme.txt': bytes('nothing to see here') });
