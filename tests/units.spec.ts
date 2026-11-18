import { readFileSync } from 'node:fs';
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
      hash: s.toHash('garden', { textures: { ground: 'grass-fixture', floor: 'oak-fixture' }, time: 18.5, snow: true, models: [], sky: null }),
      v1: s.fromHash('#v=1&floor=concrete-fixture&bedding=linen-fixture&t=18.5'),
      v2: s.fromHash('#v=2&room=bathroom&towels=velvet-fixture&ground=grass-fixture&snow=1&t=9'),
      attic: s.fromHash('#v=2&room=attic&floor=nope&t=30'),
      snowIndoors: s.toHash('living', { textures: {}, time: 12, snow: true, models: [], sky: null }),
      gardenSnow: s.fromHash('#v=2&room=garden&snow=1'),
      wrongCategory: s.fromHash('#v=2&room=living&floor=linen-fixture'),
    };
  });
  expect(r.hash).toBe('#v=2&room=garden&ground=grass-fixture&t=18.5&snow=1');
  expect(r.v1).toEqual({ room: 'living', textures: { floor: 'concrete-fixture' }, time: 18.5, snow: false, missing: 0, models: [], sky: null, uploadsMissing: 0 });
  expect(r.v2).toEqual({ room: 'bathroom', textures: { towels: 'velvet-fixture' }, time: 9, snow: false, missing: 0, models: [], sky: null, uploadsMissing: 0 });
  expect(r.attic).toEqual({ room: 'living', textures: {}, snow: false, missing: 1, models: [], sky: null, uploadsMissing: 0 });
  expect(r.snowIndoors).toBe('#v=2&room=living&t=12');
  expect(r.gardenSnow).toEqual({ room: 'garden', textures: {}, snow: true, missing: 0, models: [], sky: null, uploadsMissing: 0 });
  expect(r.wrongCategory).toEqual({ room: 'living', textures: {}, snow: false, missing: 0, models: [], sky: null, uploadsMissing: 0 });
});

test('state: uploads, models and sky in the link', async ({ page }) => {
  const r = await run(page, async () => {
    const s = await import('/src/state.ts');
    const known = new Set(['u-0000000a', 'u-0000000b', 'u-0000000c']);
    const state = { textures: { ground: 'u-0000000a' }, time: 12, snow: false, models: [{ id: 'u-0000000b', x: 1.2, y: 0.75, z: -0.456, turn: 90 }], sky: { id: 'u-0000000c', turn: 135 } };
    const m = (i: number) => `m=u-0000000b,${i},0,0,0`;
    return {
      garden: s.toHash('garden', state),
      living: s.toHash('living', { ...state, textures: { floor: 'u-0000000a' } }),
      back: s.fromHash('#v=2&room=garden&ground=u-0000000a&m=u-0000000b,1.20,0.75,-0.46,90&t=12&sky=u-0000000c&sr=135', known),
      stranger: s.fromHash('#v=2&room=garden&ground=u-0000000a&m=u-0000000b,1,0,0,0&sky=u-0000000c&floor=nope'),
      bad: s.fromHash('#v=2&room=living&m=u-0000000b,NaN,0,0,0&m=u-0000000b,99,0,0,0&m=u-0000000b,0,0,0,10&m=x,0,0,0,0&m=u-0000000b,0,0,0', known),
      eleven: s.fromHash(`#v=2&room=living&${Array.from({ length: 11 }, (_, i) => m(i)).join('&')}`, known).models.length,
      skyIndoors: s.fromHash('#v=2&room=living&sky=u-0000000c', known).sky,
      sr: ['5', '7', '360', '0x2D', '1.5e1', '%2045'].map((sr) => s.fromHash(`#v=2&room=garden&sky=u-0000000c&sr=${sr}`, known).sky),
      negZero: s.toHash('living', { ...state, models: [{ id: 'u-0000000b', x: -0.001, y: 0, z: 0, turn: 0 }] }),
    };
  });
  expect(r.garden).toBe('#v=2&room=garden&ground=u-0000000a&m=u-0000000b%2C1.20%2C0.75%2C-0.46%2C90&t=12&sky=u-0000000c&sr=135');
  expect(r.living).toBe('#v=2&room=living&floor=u-0000000a&m=u-0000000b%2C1.20%2C0.75%2C-0.46%2C90&t=12');
  expect(r.back).toMatchObject({ room: 'garden', textures: { ground: 'u-0000000a' }, models: [{ id: 'u-0000000b', x: 1.2, y: 0.75, z: -0.46, turn: 90 }], sky: { id: 'u-0000000c', turn: 135 }, missing: 0, uploadsMissing: 0 });
  expect(r.stranger).toMatchObject({ textures: {}, models: [], sky: null, missing: 0, uploadsMissing: 3 });
  expect(r.bad.models).toEqual([]);
  expect(r.eleven).toBe(10);
  expect(r.skyIndoors).toBeNull();
  expect(r.sr).toEqual([5, 0, 0, 0, 0, 0].map((turn) => ({ id: 'u-0000000c', turn })));
  expect(r.negZero).toBe('#v=2&room=living&m=u-0000000b%2C0.00%2C0.00%2C0.00%2C0&t=12');
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

test('uploads: store round trip, newest first, delete', async ({ page }) => {
  const r = await run(page, async () => {
    const s = await import('/src/uploads/store.ts');
    const blob = new Blob(['x']);
    const upload = (id: string, created: number) => ({ id, kind: 'texture' as const, name: id, created, bytes: 3, thumb: blob, sizeCm: [100, 100] as [number, number], files: { color: blob, normal: blob, orm: blob } });
    await s.putUpload(upload('u-00000001', 1));
    await s.putUpload(upload('u-00000002', 2));
    await s.setSize('u-00000001', [50, 75]);
    const listed = (await s.listUploads()).map((m) => [m.id, m.sizeCm]);
    const files = await s.getFiles('u-00000002');
    await s.deleteUpload('u-00000002');
    return { listed, hasFiles: !!files && 'color' in files, after: (await s.listUploads()).map((m) => m.id), gone: await s.getFiles('u-00000002'), id: s.newId() };
  });
  expect(r.listed).toEqual([['u-00000002', [100, 100]], ['u-00000001', [50, 75]]]);
  expect(r.hasFiles).toBe(true);
  expect(r.after).toEqual(['u-00000001']);
  expect(r.gone).toBeUndefined();
  expect(r.id).toMatch(/^u-[0-9a-f]{8}$/);
});

test('uploads: a full quota gives the PRD message and leaves nothing behind', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === 'files') throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  const r = await run(page, async () => {
    const s = await import('/src/uploads/store.ts');
    const blob = new Blob(['x']);
    const message = await s.putUpload({ id: 'u-0000000a', kind: 'model', name: 'a', created: 1, bytes: 1, thumb: blob, files: { glb: blob } }).then(() => 'stored', (error: Error) => error.message);
    return { message, listed: (await s.listUploads()).length };
  });
  expect(r).toEqual({ message: 'Your browser is out of space for uploads. Delete some in Uploads and try again.', listed: 0 });
});

test('uploads: texture processing packs ORM and flips DX normals', async ({ page }) => {
  const zip = (name: string) => [...readFileSync(`tests/fixtures/uploads/${name}`)];
  const r = await run(page, async () => {}).then(() => page.evaluate(async ([metal, gloss]) => {
    const z = await import('/src/uploads/zip.ts');
    const t = await import('/src/uploads/texture.ts');
    const d = await import('/src/uploads/detect.ts');
    const pixel = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const process = async (bytes: number[]) => {
      const data = new Uint8Array(bytes);
      const names = z.listZip(data).map((e) => e.name).filter((n) => d.mapRole(n));
      const { files, thumb } = await t.processTexture(await z.readZip(data, names));
      return { orm: await pixel(files.orm), normal: await pixel(files.normal), color: await pixel(files.color), thumb: (await createImageBitmap(thumb)).width };
    };
    return { metal: await process(metal), gloss: await process(gloss) };
  }, [zip('texture-metal.zip'), zip('texture-gloss.zip')]));
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
  expect(near(r.metal.orm, [255, 64, 255])).toBe(true);
  expect(near(r.metal.normal, [128, 127, 255])).toBe(true); // green 128 flipped is 127
  expect(near(r.metal.color, [200, 100, 50])).toBe(true);
  expect(near(r.gloss.orm, [255, 63, 0])).toBe(true); // roughness = 255 - 192
  expect(r.metal.thumb).toBe(64); // never scaled up past the source
});
