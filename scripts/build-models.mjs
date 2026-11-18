// Compresses each room model with gltf-transform: meshopt for the mesh and KTX2 for the textures.
// See docs/PRD.md section 15.10.
// Usage: npm run models [-- <id>]
// With no id, every model listed in src/rooms.json is built.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const rooms = JSON.parse(readFileSync('src/rooms.json', 'utf8'));
const listed = [...new Set(Object.values(rooms).flatMap((room) => room.models))];
const [only] = process.argv.slice(2);
const ids = only ? [only] : listed;
if (only && !listed.includes(only)) fail(`${only} is not listed in src/rooms.json.`);

const missing = ids.filter((id) => !existsSync(join('assets-src/models', id, `${id}_1k.gltf`)));
if (missing.length) {
  fail(`Model build failed:\n${missing.map((id) => `- ${id}: no file at assets-src/models/${id}/${id}_1k.gltf`).join('\n')}`);
}

// gltf-transform runs toktx from PATH. TOKTX points at it when it isn't there, the same as for textures.
const env = { ...process.env };
if (process.env.TOKTX) env.PATH = `${dirname(process.env.TOKTX)}${delimiter}${env.PATH}`;
try {
  execFileSync('toktx', ['--version'], { stdio: 'ignore', env });
} catch {
  fail('toktx not found. Install KTX-Software, or set TOKTX to the full path of toktx.');
}

mkdirSync('models-built', { recursive: true });
for (const id of ids) {
  console.log(`Building ${id}`);
  const input = join('assets-src/models', id, `${id}_1k.gltf`);
  execFileSync(
    process.execPath,
    [
      'node_modules/@gltf-transform/cli/bin/cli.js',
      'optimize',
      input,
      join('models-built', `${id}.glb`),
      '--compress', 'meshopt',
      '--texture-compress', 'ktx2',
      '--texture-size', '512',
    ],
    { stdio: 'inherit', env },
  );
}
