// Builds KTX2 maps and a thumbnail for each texture in a set. See docs/PRD.md section 7.3.
// Usage: npm run textures -- <free|premium> [slug]
// With a slug, only that texture is built and the slot checks are skipped.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const MAPS = {
  color: /BaseColor|_COL_/,
  normal: /Normal|_NRM_/,
  roughness: /Roughness|_ROUGHNESS_/,
  ao: /AmbientOcclusion|_AO_/,
  metalness: /Metallic|_METALNESS_/,
};
const REQUIRED = ['color', 'normal', 'roughness'];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const [set, only] = process.argv.slice(2);
if (set !== 'free' && set !== 'premium') fail('Usage: npm run textures -- <free|premium> [slug]');

const toktx = process.env.TOKTX || 'toktx';
try {
  execFileSync(toktx, ['--version'], { stdio: 'ignore' });
} catch {
  fail('toktx not found. Install KTX-Software, or set TOKTX to the full path of toktx.');
}

const slots = JSON.parse(readFileSync('src/textures/slots.json', 'utf8'));
const manifest = JSON.parse(readFileSync(`src/textures/${set}.json`, 'utf8'));
const textures = only ? manifest.textures.filter((t) => t.slug === only) : manifest.textures;
const errors = [];

if (only && !textures.length) errors.push(`${only}: not in src/textures/${set}.json`);

if (!only) {
  for (const [slot, accepts] of Object.entries(slots)) {
    if (!manifest.textures.some((t) => accepts.includes(t.category))) {
      errors.push(`${slot}: no texture in ${accepts.join(' or ')}`);
    }
    const fallback = manifest.textures.find((t) => t.slug === manifest.defaults[slot]);
    if (!fallback || !accepts.includes(fallback.category)) {
      errors.push(`${slot}: default "${manifest.defaults[slot] ?? ''}" is missing or not accepted by this slot`);
    }
  }
}

const jobs = [];
for (const texture of textures) {
  const dir = join('assets-src', set, texture.slug);
  if (!existsSync(dir)) {
    errors.push(`${texture.slug}: no folder at ${dir}`);
    continue;
  }
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const maps = {};
  for (const [name, pattern] of Object.entries(MAPS)) {
    const file = files.find((f) => pattern.test(f));
    if (file) maps[name] = join(dir, file);
  }
  for (const name of REQUIRED) if (!maps[name]) errors.push(`${texture.slug}: no ${name} map in ${dir}`);
  jobs.push({ slug: texture.slug, maps });
}

if (errors.length) fail(`Texture build failed:\n${errors.map((e) => `- ${e}`).join('\n')}`);

// Decodes to 8-bit raw pixels. 1 channel for greyscale maps, 3 for colour and normal.
const raw = (file, channels, size) => {
  let image = sharp(file);
  if (size) image = image.resize(size.width, size.height);
  image = channels === 1 ? image.toColourspace('b-w') : image.removeAlpha().toColourspace('srgb');
  return image.raw().toBuffer({ resolveWithObject: true });
};

const writePng = ({ data, info }, file) =>
  sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toFile(file);

const encode = (input, output, args) =>
  execFileSync(toktx, ['--t2', '--genmipmap', ...args, output, input], { stdio: 'inherit' });

for (const { slug, maps } of jobs) {
  console.log(`Building ${set}/${slug}`);
  const out = join('textures-built', set, slug);
  const tmp = mkdtempSync(join(tmpdir(), 'textures-'));
  mkdirSync(out, { recursive: true });
  try {
    const color = await raw(maps.color, 3);
    await writePng(color, join(tmp, 'color.png'));
    encode(join(tmp, 'color.png'), join(out, 'color.ktx2'), ['--encode', 'etc1s', '--assign_oetf', 'srgb']);

    const normal = await raw(maps.normal, 3);
    // three.js expects OpenGL-style normals (green up). Poliigon marks DirectX ones with "DX".
    if (/DX/.test(maps.normal)) for (let i = 1; i < normal.data.length; i += 3) normal.data[i] = 255 - normal.data[i];
    await writePng(normal, join(tmp, 'normal.png'));
    encode(join(tmp, 'normal.png'), join(out, 'normal.ktx2'), [
      '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '19', '--assign_oetf', 'linear', '--normalize',
    ]);

    // AO in red, roughness in green, metalness in blue, which is how three.js reads them.
    const size = color.info;
    const roughness = await raw(maps.roughness, 1, size);
    const ao = maps.ao && (await raw(maps.ao, 1, size));
    const metalness = maps.metalness && (await raw(maps.metalness, 1, size));
    const pixels = size.width * size.height;
    const orm = Buffer.alloc(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      orm[i * 3] = ao ? ao.data[i] : 255;
      orm[i * 3 + 1] = roughness.data[i];
      orm[i * 3 + 2] = metalness ? metalness.data[i] : 0;
    }
    await writePng({ data: orm, info: { ...size, channels: 3 } }, join(tmp, 'orm.png'));
    encode(join(tmp, 'orm.png'), join(out, 'orm.ktx2'), ['--encode', 'etc1s', '--assign_oetf', 'linear']);

    await sharp(maps.color).resize(256, 256).webp({ quality: 80 }).toFile(join(out, 'thumb.webp'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
