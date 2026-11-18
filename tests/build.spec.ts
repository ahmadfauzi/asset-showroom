import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Build checks from PRD section 12: the texture script's validation (7.3) and set isolation (7.4).
const root = resolve(import.meta.dirname, '..');

test('the texture script lists every problem and stops', () => {
  // A small project in a temp folder: oak has its maps, linen is missing its roughness map, ghost has no folder.
  const dir = mkdtempSync(join(tmpdir(), 'texture-check-'));
  try {
    mkdirSync(join(dir, 'src/textures'), { recursive: true });
    cpSync(join(root, 'src/textures/slots.json'), join(dir, 'src/textures/slots.json'));
    cpSync(join(root, 'src/rooms.json'), join(dir, 'src/rooms.json'));
    const texture = (slug: string, category: string) => ({ slug, name: slug, category, poliigonUrl: '', sizeCm: [100, 100] });
    writeFileSync(
      join(dir, 'src/textures/fixture.json'),
      JSON.stringify({
        set: 'fixture',
        defaults: { living: { floor: 'linen' } },
        textures: [texture('oak', 'wood'), texture('linen', 'fabric'), texture('ghost', 'wood')],
      }),
    );
    for (const [slug, maps] of [['oak', ['BaseColor', 'Normal', 'Roughness']], ['linen', ['BaseColor', 'Normal']]] as const) {
      mkdirSync(join(dir, 'assets-src/fixture', slug), { recursive: true });
      for (const map of maps) writeFileSync(join(dir, 'assets-src/fixture', slug, `${slug}_${map}.png`), '');
    }

    const run = spawnSync('node', [join(root, 'scripts/build-textures.mjs'), 'fixture'], { cwd: dir, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('ghost: no folder at');
    expect(run.stderr).toContain('linen: no roughness map');
    expect(run.stderr).toContain('living/walls: no texture in stone or wall');
    expect(run.stderr).toContain('living/floor: default "linen" is missing or not accepted');
    expect(run.stderr).toContain('garden/ground: no texture in ground');
    expect(run.stderr).toContain('bathroom/towels: default "" is missing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the texture script rejects an unknown set', () => {
  const run = spawnSync('node', ['scripts/build-textures.mjs', 'gold'], { cwd: root, encoding: 'utf8' });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('Usage');
});

test.describe('set isolation', () => {
  test.describe.configure({ mode: 'serial' });
  const outDir = join(tmpdir(), 'asset-showroom-isolation');
  const build = (env: Record<string, string> = {}) =>
    spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, VITE_ASSET_SET: 'fixture', ...env },
    });

  test('dist/textures holds exactly the active set', () => {
    const run = build();
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(join(outDir, 'textures')).sort()).toEqual(
      ['clay', 'concrete', 'grass', 'linen', 'marble', 'oak', 'plaster', 'snow', 'velvet', 'walnut'].map((name) => `${name}-fixture`),
    );
  });

  test('the build fails when dist/textures has files from outside the set', () => {
    const planted = join(root, 'public/textures/premium-only');
    mkdirSync(planted, { recursive: true });
    writeFileSync(join(planted, 'color.ktx2'), '');
    try {
      const run = build();
      expect(run.status).not.toBe(0);
      expect(run.stderr + run.stdout).toContain("aren't in the fixture set: premium-only");
    } finally {
      rmSync(join(root, 'public/textures'), { recursive: true, force: true });
    }
  });

  test('dist/models holds the room models', () => {
    const run = build();
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(join(outDir, 'models')).sort()).toEqual(
      ['ornate_mirror_01', 'outdoor_table_chair_set_01', 'planter_box_01', 'potted_plant_04', 'rock_07', 'rock_09', 'shrub_02', 'shrub_03'].map((id) => `${id}.glb`),
    );
  });

  test('the build fails when a room model has no built file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'models-empty-'));
    try {
      const run = build({ MODELS_DIR: empty });
      expect(run.status).not.toBe(0);
      expect(run.stderr + run.stdout).toContain('potted_plant_04 has no built file in models-built/. Run npm run models -- potted_plant_04.');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  // The start-up JavaScript before v3: the entry chunk (assets/index-*.js) of `VITE_ASSET_SET=fixture npx vite build`
  // on commit d83e87d, which has the same code as 64c77f1.
  const ENTRY_BYTES_V2 = 877165;

  test('upload code is not in the start-up JavaScript', () => {
    const run = build();
    expect(run.status, run.stderr).toBe(0);
    // The entry script and every chunk index.html preloads, which is all the JavaScript loaded at start.
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    const files = [...html.matchAll(/<(?:script type="module"|link rel="modulepreload")[^>]*(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    expect(files.some((file) => file.startsWith('assets/index-'))).toBe(true);
    const chunks = files.map((file) => ({ file, code: readFileSync(join(outDir, file)) }));
    // FBXLoader, EXRLoader, GLTFExporter and fflate's unzip.
    for (const { file, code } of chunks) {
      for (const text of ['Kaydara', 'EXRLoader', 'GLTFExporter', 'invalid zip data']) expect(code.includes(text), `${text} in ${file}`).toBe(false);
    }
    const total = chunks.reduce((sum, { code }) => sum + code.length, 0);
    // PRD 16.11: v3 may add up to 30 KB (raised from 10 KB on 19 Nov 2026).
    expect(total, `start-up JavaScript: ${files.join(', ')} = ${total} bytes`).toBeLessThanOrEqual(ENTRY_BYTES_V2 + 30 * 1024);
  });

  test.afterAll(() => rmSync(outDir, { recursive: true, force: true }));
});
