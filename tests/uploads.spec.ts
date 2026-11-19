import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Upload tests from PRD section 16, against the fixture set. Each test has its own browser context, so its own
// IndexedDB.

const open = async (page: Page, hash = '') => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // In a git worktree, Vite refuses the font from the parent node_modules with a 403.
  page.on('console', (message) => message.type() === 'error' && !message.location().url.includes('@fontsource') && errors.push(message.text()));
  await page.goto(`/${hash}`);
  await expect(page.locator('#loader')).toHaveClass(/done/);
  return errors;
};
const hash = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

const fixture = (name: string) => `tests/fixtures/uploads/${name}`;
const upload = async (page: Page, name: string) => {
  await page.locator('#upload-input').setInputFiles(fixture(name));
};
const uploadsTab = (page: Page) => page.locator('#tabs button', { hasText: 'Uploads' });
const uploadButton = (page: Page) => page.locator('#toolbar [data-action="upload"]');
const swatches = (page: Page) => page.locator('.upload-swatch');
// On SwiftShader the frame loop and canvas encodes can stall for 20 to 40 s while the other rooms load, so an
// upload can take over a minute.
const done = { timeout: 150_000 };
// Every test that waits for an upload gets three times the usual time.
const waitsForUpload = () => test.slow();

// Makes each image encode take `ms`, so an upload stays busy for a while.
const slowEncode = (page: Page, ms: number) =>
  page.addInitScript((ms) => {
    const original = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = async function (options) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return original.call(this, options);
    };
  }, ms);

test('an uploaded texture zip shows in the Uploads tab', async ({ page }) => {
  waitsForUpload();
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await expect(swatches(page)).toHaveAttribute('title', 'texture-metal');
  await expect(swatches(page).getByRole('img', { name: 'Texture' })).toBeVisible();

  await page.reload();
  await expect(page.locator('#loader')).toHaveClass(/done/);
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1);
  await expect(swatches(page)).toHaveAttribute('title', 'texture-metal');
  expect(errors).toEqual([]);
});

test('a blend zip and an empty zip show their messages', async ({ page }) => {
  await open(page);
  await upload(page, 'blend.zip');
  await expect(page.locator('#toast')).toHaveText('Export it as .glb or .fbx first.');
  await expect(uploadButton(page)).toBeEnabled();
  await upload(page, 'nothing.zip');
  await expect(page.locator('#toast')).toHaveText('This zip has no texture, model or HDRI we can read.');
  await expect(uploadButton(page)).toBeEnabled();
});

test('a zip over 250 MB is refused', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const input = document.getElementById('upload-input') as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(250 * 1024 ** 2 + 1)], 'big.zip'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
  await expect(page.locator('#toast')).toHaveText('This zip is over 250 MB.');
  await expect(uploadButton(page)).toBeEnabled();
});

test('one upload at a time', async ({ page }) => {
  waitsForUpload();
  await slowEncode(page, 2000);
  await open(page);
  await upload(page, 'texture-metal.zip');
  await expect(uploadButton(page)).toBeDisabled();
  await expect(uploadButton(page)).toHaveText('Uploading…');
  await uploadsTab(page).click();
  await expect(page.locator('#upload-swatches progress')).toBeVisible();

  const bytes = [...readFileSync(fixture('texture-gloss.zip'))];
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'texture-gloss.zip'));
    return transfer;
  }, bytes);
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect(page.locator('#toast')).toHaveText('Wait for the current upload to finish.');

  await expect(uploadButton(page)).toBeEnabled(done);
  await expect(uploadButton(page)).toHaveText('Upload');
  await expect(swatches(page)).toHaveCount(1);
  await expect(page.locator('#upload-swatches progress')).toHaveCount(0);
});

test('switching rooms during an upload still stores it', async ({ page }) => {
  waitsForUpload();
  await slowEncode(page, 1000);
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await expect(uploadButton(page)).toBeDisabled();
  await page.locator('#rooms button', { hasText: 'Garden' }).click();
  await expect.poll(() => hash(page)).toContain('room=garden');
  // The Garden's link while the upload still runs.
  const before = await hash(page);
  await expect(uploadButton(page)).toBeDisabled();
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await expect(uploadButton(page)).toBeEnabled(done);
  // No surface key changed, and no upload id went into the link.
  expect(await hash(page)).toBe(before);
  expect(before).not.toContain('u-');
  expect(errors).toEqual([]);
});

test('the first upload asks the browser to keep uploads', async ({ page }) => {
  waitsForUpload();
  await page.addInitScript(() => {
    const counted = window as unknown as { persistCalls: number };
    counted.persistCalls = 0;
    StorageManager.prototype.persist = async () => {
      counted.persistCalls++;
      return true;
    };
  });
  await open(page);
  await upload(page, 'texture-metal.zip');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await upload(page, 'texture-gloss.zip');
  await expect(swatches(page)).toHaveCount(2, done);
  expect(await page.evaluate(() => (window as unknown as { persistCalls: number }).persistCalls)).toBe(1);
});

test('deleting an upload asks first', async ({ page }) => {
  waitsForUpload();
  await open(page);
  await upload(page, 'texture-metal.zip');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  let asked = '';
  page.once('dialog', (dialog) => {
    asked = dialog.message();
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete texture-metal' }).click();
  await expect(swatches(page)).toHaveCount(0);
  expect(asked).toBe('Delete texture-metal?');

  await page.reload();
  await expect(page.locator('#loader')).toHaveClass(/done/);
  await uploadsTab(page).click();
  await expect(page.locator('#upload-swatches')).toBeVisible();
  await expect(swatches(page)).toHaveCount(0);
});

test('the empty Uploads tab says what to upload', async ({ page }) => {
  await open(page);
  await uploadsTab(page).click();
  await expect(uploadsTab(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#upload-swatches')).toHaveText('Upload a .zip with a texture, a model or an HDRI. It stays in this browser.');
  await expect(page.locator('#swatches')).toBeHidden();

  // Selecting a surface keeps the Uploads tab, since uploaded textures fit every surface.
  await page.locator('.slot', { hasText: 'Upholstery' }).click();
  await expect(uploadsTab(page)).toBeEnabled();
  await expect(uploadsTab(page)).toHaveAttribute('aria-pressed', 'true');
});

test('at 375 px the toolbar fits while uploading', async ({ page }) => {
  // A worktree can't serve the font from the parent node_modules, so serve it here: the fit depends on it.
  await page.route('**/inter-latin-wght-normal.woff2', (route) =>
    route.fulfill({ path: createRequire(import.meta.url).resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), contentType: 'font/woff2' }));
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  // The longest text the Upload button shows.
  await uploadButton(page).evaluate((button) => (button.textContent = 'Uploading…'));
  const right = await page.locator('#toolbar button').evaluateAll((buttons) => Math.max(...buttons.map((b) => b.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375 - 8);
});

const slot = (page: Page, name: string) => page.locator('.slot', { hasText: name });
const floorMap = (page: Page) => page.evaluate(() => (window as any).showroom.materials().floor.map?.name);
const floorRepeat = (page: Page) => page.evaluate(() => (window as any).showroom.materials().floor.map.repeat.toArray());
const uploadId = async (page: Page, key: string) => (await hash(page)).match(new RegExp(`${key}=(u-[0-9a-f]{8})`))?.[1];

// A point on the canvas where the named surface shows, found by asking the hover tooltip.
const surfacePoint = (page: Page, name: string) =>
  page.evaluate((name) => {
    const canvas = document.getElementById('scene')!;
    const title = document.querySelector('#tooltip > div')!;
    for (let y = innerHeight - 40; y > 40; y -= 20) {
      for (let x = 40; x < innerWidth - 40; x += 20) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
        if (title.textContent!.startsWith(`${name} ·`)) return { x, y };
      }
    }
    throw new Error(`No ${name} on screen`);
  }, name);

// One upload, used in turn by each test in this group (PRD 16.7 and 16.10).
test.describe('an uploaded texture', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let errors: string[];
  let id = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(() => page.close());

  test('an uploaded texture fits any surface and is in the link', async () => {
    waitsForUpload();
    errors = await open(page);
    await upload(page, 'texture-metal.zip');
    await slot(page, 'Upholstery').click();
    await uploadsTab(page).click();
    await expect(swatches(page)).toHaveCount(1, done);
    await swatches(page).locator('.swatch').click();
    await expect.poll(() => uploadId(page, 'upholstery')).toMatch(/^u-/);
    id = (await uploadId(page, 'upholstery'))!;
    await expect(page.locator('#card .category')).toHaveText('Uploaded texture');
    await expect(page.locator('#card a')).toBeHidden();
    await expect(page.getByLabel('Width (cm)')).toHaveValue('100');
    await expect(page.getByLabel('Height (cm)')).toHaveValue('100');

    await slot(page, 'Floor').click();
    await swatches(page).locator('.swatch').dragTo(page.locator('#scene'), { targetPosition: await surfacePoint(page, 'Floor') });
    await expect.poll(() => hash(page)).toContain(`floor=${id}`);
    await expect.poll(() => floorMap(page)).toBe(id);
    expect(errors).toEqual([]);
  });

  test('an uploaded texture comes back after a reload', async () => {
    const before = await hash(page);
    await page.reload();
    await expect(page.locator('#loader')).toHaveClass(/done/);
    expect(await hash(page)).toBe(before);
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    expect(await floorMap(page)).toBe(id);
    expect(errors).toEqual([]);
  });

  test('the size fields change the repeat', async () => {
    const before = await hash(page);
    const undo = page.locator('#toolbar [data-action="undo"]');
    const couldUndo = await undo.isEnabled();
    await slot(page, 'Floor').click();
    await page.getByLabel('Width (cm)').fill('50');
    await page.getByLabel('Width (cm)').press('Tab');
    await expect.poll(() => floorRepeat(page)).toEqual([2, 1]);
    expect(await hash(page)).toBe(before);
    expect(await undo.isEnabled()).toBe(couldUndo);

    // Out of range is clamped.
    await page.getByLabel('Height (cm)').fill('5');
    await page.getByLabel('Height (cm)').press('Tab');
    await expect(page.getByLabel('Height (cm)')).toHaveValue('10');
    await expect.poll(() => floorRepeat(page)).toEqual([2, 10]);
  });

  test('copy link warns when the room uses uploads', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#toolbar [data-action="copy"]').click();
    await expect(page.locator('#toast')).toHaveText('Link copied. Uploads only show in this browser.');
  });

  test('undo and redo cover uploaded textures', async () => {
    await slot(page, 'Walls').click();
    await uploadsTab(page).click();
    await swatches(page).locator('.swatch').click();
    await expect.poll(() => hash(page)).toContain(`walls=${id}`);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toContain('walls=plaster-fixture');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => hash(page)).toContain(`walls=${id}`);
    expect(errors).toEqual([]);
  });

  test('keys typed in a size field stay in the field', async () => {
    await slot(page, 'Floor').click();
    await expect(page.locator('#card .category')).toHaveText('Uploaded texture');
    const before = await hash(page);
    const undo = page.locator('#toolbar [data-action="undo"]');
    const couldUndo = await undo.isEnabled();
    const width = page.getByLabel('Width (cm)');
    await width.click();
    await width.press('End');
    await width.press('5');
    await width.press('Control+z');
    await width.press(']');
    await width.press('Escape');
    expect(await hash(page)).toBe(before);
    expect(await undo.isEnabled()).toBe(couldUndo);
    await expect(page.locator('#card')).toBeVisible();
    await expect(slot(page, 'Floor')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a link with uploads in a fresh browser shows the defaults and one toast', async ({ browser }) => {
    const link = await hash(page);
    // While one room renders on SwiftShader, a second page in the same browser doesn't finish loading, so the
    // upload's page closes first. This test is last for that reason.
    await page.close();
    const context = await browser.newContext();
    const other = await context.newPage();
    const otherErrors = await open(other, link);
    expect(await hash(other)).toContain('floor=oak-fixture');
    expect(await hash(other)).toContain('upholstery=linen-fixture');
    await expect(other.locator('#toast')).toHaveText("This link uses uploads that are only on the sender's computer, so you see the defaults.");
    expect(otherErrors).toEqual([]);
    await context.close();
  });
});

test('an uploaded texture picked before a room switch stays on its room', async ({ page }) => {
  waitsForUpload();
  // Reading an upload's maps takes 1 s longer: the transaction reports complete 1 s late.
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
      const request = get.call(this, key);
      if (this.name === 'files') {
        const tx = this.transaction;
        const complete = tx.oncomplete;
        tx.oncomplete = (event) => setTimeout(() => complete?.call(tx, event), 1000);
      }
      return request;
    };
  });
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await slot(page, 'Floor').click();
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  // Both clicks in one go, so the switch starts before the maps are read.
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('.upload-swatch .swatch')!.click();
    [...document.querySelectorAll<HTMLButtonElement>('#rooms button')].find((button) => button.textContent === 'Bedroom')!.click();
  });
  await expect.poll(() => hash(page)).toContain('room=bedroom');
  await page.waitForTimeout(3000);
  expect(await floorMap(page)).toBe('oak-fixture');
  expect(await hash(page)).toContain('floor=oak-fixture');
  await page.locator('#rooms button', { hasText: 'Living room' }).click();
  await expect.poll(() => hash(page)).toMatch(/room=living.*floor=u-[0-9a-f]{8}/);
  await expect.poll(() => floorMap(page)).toMatch(/^u-[0-9a-f]{8}$/);
  expect(errors).toEqual([]);
});

// One model upload, used in turn by each test in this group (PRD 16.8 and 16.10).
test.describe('placed models', () => {
  test.describe.configure({ mode: 'serial' });
  type Placement = { id: string; x: number; y: number; z: number; turn: number };
  let page: Page;
  let errors: string[];

  const placed = () => page.evaluate((): Placement[] => (window as any).showroom.placed());
  const models = async () => (await hash(page)).match(/&m=/g)?.length ?? 0; // "room=" ends in m= too
  const modelSwatch = () => swatches(page).locator('.swatch');
  const undoButton = () => page.locator('#toolbar [data-action="undo"]');
  // Where a point in the room shows on the canvas.
  const screenOf = (x: number, y: number, z: number) =>
    page.evaluate(([x, y, z]) => {
      const { camera } = (window as any).showroom;
      // The camera's matrix is only brought up to date when a frame renders.
      camera.updateMatrixWorld();
      const point = camera.position.clone().set(x, y, z).project(camera);
      return { x: ((point.x + 1) / 2) * innerWidth, y: ((1 - point.y) / 2) * innerHeight };
    }, [x, y, z]);
  const cameraPosition = () => page.evaluate(() => (window as any).showroom.camera.position.toArray() as number[]);

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(() => page.close());

  test('a model swatch dragged onto the floor stands there', async () => {
    waitsForUpload();
    errors = await open(page);
    await upload(page, 'model-glb.zip');
    await uploadsTab(page).click();
    await expect(swatches(page)).toHaveCount(1, done);
    await expect(undoButton()).toBeDisabled();
    // Open floor in front of the sofa, clear of the rug and the pouf. The canvas fills the window.
    await modelSwatch().dragTo(page.locator('#scene'), { targetPosition: await screenOf(1, 0, 1.2) });
    await expect.poll(models).toBe(1);
    const [model] = await placed();
    expect(model.y).toBeCloseTo(0, 2);
    expect(model.x).toBeCloseTo(1, 1);
    expect(model.z).toBeCloseTo(1.2, 1);
    await expect(undoButton()).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('clicking a model swatch places it in the middle of the view, or on the floor', async () => {
    await modelSwatch().click();
    await expect.poll(models).toBe(2);
    // Look straight at the back wall, then click in the same task, before the orbit limits turn the camera back.
    await page.evaluate(() => {
      const { camera } = (window as any).showroom;
      camera.position.set(0, 1.5, 0);
      camera.lookAt(0, 1.5, -2.5);
      camera.updateMatrixWorld();
      document.querySelector<HTMLButtonElement>('.upload-swatch .swatch')!.click();
    });
    await expect.poll(models).toBe(3);
    const [, , third] = await placed();
    expect([third.x, third.y, third.z]).toEqual([0, 0, 0]);
    await page.keyboard.press('r');
    expect(errors).toEqual([]);
  });

  test('dragging a placed model moves it and orbit does not', async () => {
    const before = await hash(page);
    const [first] = await placed();
    const camera = await cameraPosition();
    const from = await screenOf(first.x, first.y + 0.25, first.z);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 100, from.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await placed())[0].x).not.toBe(first.x);
    const after = await cameraPosition();
    for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(camera[i], 3);
    // The whole drag is one undo step.
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test('undo removes a placement and redo puts it back', async () => {
    const before = await models();
    await modelSwatch().click();
    await expect.poll(models).toBe(before + 1);
    await page.keyboard.press('Control+z');
    await expect.poll(models).toBe(before);
    expect(await placed()).toHaveLength(before);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(models).toBe(before + 1);
    expect(await placed()).toHaveLength(before + 1);
    expect(errors).toEqual([]);
  });

  test('a link with m= restores the model after a reload', async () => {
    const link = await hash(page);
    const positions = await placed();
    // The loader waits for the link's models, so the room has the same meshes once it hides (PRD 16.11).
    const meshes = () => page.evaluate(() => {
      let count = 0;
      (window as any).showroom.scene.traverse((object: any) => object.isMesh && count++);
      return count;
    });
    const before = await meshes();
    await page.reload();
    await expect(page.locator('#loader')).toHaveClass(/done/);
    expect(await meshes()).toBe(before);
    expect(await hash(page)).toBe(link);
    expect(await placed()).toEqual(positions);
    expect(errors).toEqual([]);
  });

  test('dragging a model over the sky keeps it in place', async () => {
    await page.locator('#rooms button', { hasText: 'Garden' }).click();
    await expect.poll(() => hash(page)).toContain('room=garden');
    await uploadsTab(page).click();
    await modelSwatch().click();
    await expect.poll(models).toBe(1);
    const before = await hash(page);
    const [model] = await placed();
    const camera = await cameraPosition();
    const from = await screenOf(model.x, model.y + 0.25, model.z);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, 2);
    await page.mouse.up();
    expect(await placed()).toEqual([model]);
    // The press was on the model, so the camera didn't orbit.
    const after = await cameraPosition();
    for (let i = 0; i < 3; i++) expect(after[i]).toBeCloseTo(camera[i], 3);
    expect(await hash(page)).toBe(before);
    expect(before).not.toContain('NaN');
    expect(errors).toEqual([]);
  });

  test('the 11th model is refused', async () => {
    for (let n = (await models()) + 1; n <= 10; n++) {
      await modelSwatch().click();
      await expect.poll(models).toBe(n);
    }
    await modelSwatch().click();
    await expect(page.locator('#toast')).toHaveText('This room has 10 models. Remove one first.');
    expect(await models()).toBe(10);
    expect(await placed()).toHaveLength(10);
    expect(errors).toEqual([]);
  });
});
