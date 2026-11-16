import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    const texture = (slug: string, category: string) => ({ slug, name: slug, category, poliigonUrl: '', sizeCm: [100, 100] });
    writeFileSync(
      join(dir, 'src/textures/fixture.json'),
      JSON.stringify({
        set: 'fixture',
        defaults: { floor: 'linen' },
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
    expect(run.stderr).toContain('walls: no texture in stone or wall');
    expect(run.stderr).toContain('floor: default "linen" is missing or not accepted');
    expect(run.stderr).toContain('woodwork: default "" is missing');
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
  const build = () =>
    spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, VITE_ASSET_SET: 'fixture' },
    });

  test('dist/textures holds exactly the active set', () => {
    const run = build();
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(join(outDir, 'textures')).sort()).toEqual(
      ['clay', 'concrete', 'linen', 'marble', 'oak', 'plaster', 'velvet', 'walnut'].map((name) => `${name}-fixture`),
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

  test.afterAll(() => rmSync(outDir, { recursive: true, force: true }));
});
