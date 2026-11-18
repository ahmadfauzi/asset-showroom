import { expect, test, type Page } from '@playwright/test';

// Runs a function in the browser after loading a static file on the same origin.
// The app does not load, so these tests only check plain modules.
const run = <T>(page: Page, fn: () => Promise<T>) => page.goto('/robots.txt').then(() => page.evaluate(fn));

test('history: commit, undo, redo', async ({ page }) => {
  const result = await run(page, async () => {
    const h = await import('/src/history.ts');
    const id = (s: number) => String(s);
    const history = h.createHistory(1);
    const pushed = [h.commit(history, 2, id), h.commit(history, 2, id), h.commit(history, 3, id)];
    const undone = [h.undo(history), h.undo(history), h.undo(history)];
    const redone = h.redo(history);
    h.commit(history, 9, id);
    return { pushed, undone, redone, future: history.future.length, committed: history.committed };
  });
  expect(result).toEqual({ pushed: [true, false, true], undone: [2, 1, undefined], redone: 2, future: 0, committed: 9 });
});

test('state: v2 round trip, v1 links, bad values', async ({ page }) => {
  const r = await run(page, async () => {
    const s = await import('/src/state.ts');
    return {
      hash: s.toHash('garden', { textures: { ground: 'grass-fixture', floor: 'oak-fixture' }, time: 18.5, snow: true }),
      v1: s.fromHash('#v=1&floor=concrete-fixture&bedding=linen-fixture&t=18.5'),
      v2: s.fromHash('#v=2&room=bathroom&towels=velvet-fixture&ground=grass-fixture&snow=1&t=9'),
      attic: s.fromHash('#v=2&room=attic&floor=nope&t=30'),
      snowIndoors: s.toHash('living', { textures: {}, time: 12, snow: true }),
      gardenSnow: s.fromHash('#v=2&room=garden&snow=1'),
      wrongCategory: s.fromHash('#v=2&room=living&floor=linen-fixture'),
    };
  });
  expect(r.hash).toBe('#v=2&room=garden&ground=grass-fixture&t=18.5&snow=1');
  expect(r.v1).toEqual({ room: 'living', textures: { floor: 'concrete-fixture' }, time: 18.5, snow: false, missing: 0 });
  expect(r.v2).toEqual({ room: 'bathroom', textures: { towels: 'velvet-fixture' }, time: 9, snow: false, missing: 0 });
  expect(r.attic).toEqual({ room: 'living', textures: {}, snow: false, missing: 1 });
  expect(r.snowIndoors).toBe('#v=2&room=living&t=12');
  expect(r.gardenSnow).toEqual({ room: 'garden', textures: {}, snow: true, missing: 0 });
  expect(r.wrongCategory).toEqual({ room: 'living', textures: {}, snow: false, missing: 0 });
});

test('uploads: kind detection on the example zip lists', async ({ page }) => {
  const r = await run(page, async () => {
    const d = await import('/src/uploads/detect.ts');
    const e = (...names: string[]) => names.map((name) => ({ name, size: 1000 }));
    const kind = (entries: { name: string; size: number }[]) => { try { return d.detectKind(entries); } catch (error) { return (error as Error).message; } };
    return {
      quartzite: kind(e('Poliigon_StoneQuartzite_8060_Preview1.png', '2K/Poliigon_StoneQuartzite_8060_BaseColor.jpg', '2K/Poliigon_StoneQuartzite_8060_Normal.png', '2K/Poliigon_StoneQuartzite_8060_Displacement.tiff', '2K/Poliigon_StoneQuartzite_8060.mtlx')),
      orchid: kind(e('PlantOrchid001_Preview1.png', 'PlantOrchid001.fbx', 'PlantOrchid001_COL_4K_SPECULAR.jpg')),
      monstera: kind(e('PlantMonstera001_preview1.png', 'PlantMonstera001_Blender_Cycles.blend', 'PlantMonstera001_COL_4K_METALNESS.jpg')),
      sunset: kind(e('HdrSkySunset007_preview1.jpg', 'HdrSkySunset007_HDR_8K.exr', 'HdrSkySunset007_JPG_8K.jpg')),
      textureWithExr: kind(e('Wood_COL.jpg', 'Wood_DISP.exr')),
      nothing: kind(e('readme.txt')),
      largestMesh: kind([{ name: 'a.glb', size: 10 }, { name: 'b.fbx', size: 20 }]),
      exrOverHdr: kind([{ name: 'sky.hdr', size: 50 }, { name: 'sky.exr', size: 10 }]),
    };
  });
  expect(r.quartzite).toEqual({ kind: 'texture', main: '2K/Poliigon_StoneQuartzite_8060_BaseColor.jpg' });
  expect(r.orchid).toEqual({ kind: 'model', main: 'PlantOrchid001.fbx' });
  expect(r.monstera).toBe('Export it as .glb or .fbx first.');
  expect(r.sunset).toEqual({ kind: 'hdri', main: 'HdrSkySunset007_HDR_8K.exr' });
  expect(r.textureWithExr).toEqual({ kind: 'texture', main: 'Wood_COL.jpg' });
  expect(r.nothing).toBe('This zip has no texture, model or HDRI we can read.');
  expect(r.largestMesh).toEqual({ kind: 'model', main: 'b.fbx' });
  expect(r.exrOverHdr).toEqual({ kind: 'hdri', main: 'sky.exr' });
});

test('uploads: map roles and size limits', async ({ page }) => {
  const r = await run(page, async () => {
    const d = await import('/src/uploads/detect.ts');
    const fails = (zip: number, entries: { name: string; size: number }[]) => { try { d.checkSizes(zip, entries); return 'ok'; } catch (error) { return (error as Error).message; } };
    return {
      roles: ['X_BaseColor.jpg', 'X_COL_4K.jpg', 'X_Colour.png', 'X_NormalDX.png', 'X_NRM.jpg', 'X_AmbientOcclusion.jpg', 'X_GLOSS_4K.jpg', 'X_Roughness.jpg', 'X_Metallic.jpg', 'X_METALNESS.jpg', 'X_REFL.jpg', 'X_SSS.jpg', 'X_Displacement.tiff', 'X_BaseColor.tiff'].map(d.mapRole),
      words: d.words('2K/Poliigon_Stone-Quartzite 8060.BaseColor.jpg'),
      ok: fails(250 * 1024 ** 2, [{ name: 'a', size: 1024 ** 3 }]),
      bigZip: fails(250 * 1024 ** 2 + 1, []),
      bigUnzipped: fails(1, [{ name: 'a', size: 1024 ** 3 }, { name: 'b', size: 1 }]),
    };
  });
  expect(r.roles).toEqual(['color', 'color', 'color', 'normal', 'normal', 'ao', 'gloss', 'roughness', 'metalness', 'metalness', null, null, null, null]);
  expect(r.words).toEqual(['poliigon', 'stone', 'quartzite', '8060', 'basecolor', 'jpg']);
  expect(r).toMatchObject({ ok: 'ok', bigZip: 'This zip is over 250 MB.', bigUnzipped: 'This zip unpacks to more than 1 GB.' });
});
