import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Upload tests from PRD section 16, against the fixture set. Each test has its own browser context, so its own
// IndexedDB.

const open = async (page: Page, hash = '') => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
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
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  // The longest text the Upload button shows.
  await uploadButton(page).evaluate((button) => (button.textContent = 'Uploading…'));
  const right = await page.locator('#toolbar button').evaluateAll((buttons) => Math.max(...buttons.map((b) => b.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375 - 8);
});

test('at 375 px the Upload button and the Uploads tab fit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors = await open(page);
  await expect(uploadButton(page)).toBeVisible();
  await expect(uploadButton(page)).toBeInViewport({ ratio: 1 });
  await uploadsTab(page).click();
  await expect(uploadsTab(page)).toHaveAttribute('aria-pressed', 'true');
  // The tab row scrolls sideways and fades out over its last 12% (hud.css), so the tab must sit left of the fade.
  const row = (await page.locator('#tabs').boundingBox())!;
  const tab = (await uploadsTab(page).boundingBox())!;
  expect(tab.x).toBeGreaterThanOrEqual(row.x);
  expect(tab.x + tab.width).toBeLessThanOrEqual(row.x + row.width * 0.88);
  const tray = (await page.locator('#tray').boundingBox())!;
  for (const id of ['#toolbar', '#rooms']) {
    const other = (await page.locator(id).boundingBox())!;
    expect(other.y + other.height <= tray.y || tray.y + tray.height <= other.y, id).toBe(true);
  }
  expect(errors).toEqual([]);
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

// Where a point in the room shows on the canvas.
const pointOnScreen = (page: Page, x: number, y: number, z: number) =>
  page.evaluate(([x, y, z]) => {
    const { camera } = (window as any).showroom;
    // The camera's matrix is only brought up to date when a frame renders.
    camera.updateMatrixWorld();
    const point = camera.position.clone().set(x, y, z).project(camera);
    return { x: ((point.x + 1) / 2) * innerWidth, y: ((1 - point.y) / 2) * innerHeight };
  }, [x, y, z]);
const modelBar = (page: Page) => page.locator('#model-bar');

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
  const screenOf = (x: number, y: number, z: number) => pointOnScreen(page, x, y, z);
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

  test('a second pointer does not move a dragged model or end the drag', async () => {
    const before = await hash(page);
    const [first] = await placed();
    const from = await screenOf(first.x, first.y + 0.25, first.z);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // A second finger moves and lifts while the first still holds the model.
    await page.evaluate(({ x, y }) => {
      const other = { pointerId: 99, pointerType: 'touch', clientX: x + 100, clientY: y, bubbles: true };
      window.dispatchEvent(new PointerEvent('pointermove', other));
      window.dispatchEvent(new PointerEvent('pointerup', other));
    }, from);
    expect((await placed())[0]).toEqual(first);
    expect(await hash(page)).toBe(before);
    // The first pointer still drags, and the drag is one undo step.
    await page.mouse.move(from.x + 100, from.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await placed())[0].x).not.toBe(first.x);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test('a second pointer cannot drag another model while one drags', async () => {
    const before = await hash(page);
    const [first, second] = await placed();
    const from = await screenOf(first.x, first.y + 0.25, first.z);
    const other = await screenOf(second.x, second.y + 0.25, second.z);
    // Open floor in front of the first model.
    const to = await screenOf(first.x, 0, first.z + 0.4);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // A second finger presses the second model and drags it while the first pointer still holds the first model.
    await page.evaluate(([other, to]) => {
      const finger = { pointerId: 99, pointerType: 'touch', bubbles: true };
      document.getElementById('scene')!.dispatchEvent(new PointerEvent('pointerdown', { ...finger, clientX: other.x, clientY: other.y }));
      window.dispatchEvent(new PointerEvent('pointermove', { ...finger, clientX: to.x, clientY: to.y }));
      window.dispatchEvent(new PointerEvent('pointerup', { ...finger, clientX: to.x, clientY: to.y }));
    }, [other, to]);
    await page.mouse.up();
    expect((await placed())[1]).toEqual(second);
    expect(await hash(page)).toBe(before);
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

  // The m= values in the link, and the turn in each.
  const modelParams = async () => (await hash(page)).match(/&m=[^&]*/g) ?? [];
  const turns = async () => (await modelParams()).map((m) => Number(m.split(',')[4]));
  const modelButtons = () => page.locator('#slot-list .slot.model');

  test('keys move, turn and remove a selected model, one undo step each', async () => {
    // The Bedroom has no models yet.
    await page.locator('#rooms button', { hasText: 'Bedroom' }).click();
    await expect.poll(() => hash(page)).toContain('room=bedroom');
    await uploadsTab(page).click();
    await modelSwatch().click();
    await expect.poll(models).toBe(1);
    const hashes = [await hash(page)];
    const press = async (key: string) => {
      await page.keyboard.press(key);
      await expect.poll(() => hash(page)).not.toBe(hashes.at(-1));
      hashes.push(await hash(page));
    };
    const [start] = await placed();
    await press('ArrowUp');
    const [moved] = await placed();
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeCloseTo(0.1, 1);
    expect(await turns()).toEqual([0]);
    await press('e');
    expect(await turns()).toEqual([15]);
    await press('E');
    expect(await turns()).toEqual([30]);
    await press('q');
    expect(await turns()).toEqual([15]);
    await press('Delete');
    expect(await models()).toBe(0);
    // Five undo steps, one per key, then redo goes forward again.
    for (let i = hashes.length - 2; i >= 0; i--) {
      await page.keyboard.press('Control+z');
      await expect.poll(() => hash(page)).toBe(hashes[i]);
    }
    for (let i = 1; i < hashes.length; i++) {
      await page.keyboard.press('Control+Shift+z');
      await expect.poll(() => hash(page)).toBe(hashes[i]);
    }
    expect(errors).toEqual([]);
  });

  test('the model bar turns and removes', async () => {
    await modelSwatch().click();
    await expect.poll(models).toBe(1);
    await expect(modelBar(page)).toBeVisible();
    await modelBar(page).getByRole('button', { name: 'Turn right' }).click();
    await expect.poll(turns).toEqual([15]);
    await modelBar(page).getByRole('button', { name: 'Remove' }).click();
    await expect.poll(models).toBe(0);
    await expect(modelBar(page)).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('placed models are listed in the slot panel and can be picked with the keyboard', async () => {
    await modelSwatch().click();
    await expect.poll(models).toBe(1);
    await modelSwatch().click();
    await expect.poll(models).toBe(2);
    await expect(modelButtons()).toHaveText(['model-glb 1', 'model-glb 2']);
    await modelButtons().first().click();
    await expect(modelButtons().first()).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(modelButtons().nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(modelButtons().nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(modelButtons().first()).toHaveAttribute('aria-pressed', 'false');
    await expect(modelBar(page)).toBeVisible();
    await page.keyboard.press('e');
    await expect.poll(turns).toEqual([0, 15]);
    expect(errors).toEqual([]);
  });

  test("keys on the time slider don't move, turn or remove a selected model", async () => {
    await modelSwatch().click();
    await expect.poll(models).toBe(3);
    const before = await modelParams();
    const time = (await hash(page)).match(/t=[^&]*/)?.[0];
    const slider = page.getByRole('slider', { name: 'Time of day' });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect.poll(async () => (await hash(page)).match(/t=[^&]*/)?.[0]).not.toBe(time);
    expect(await modelParams()).toEqual(before);
    // The model keys don't act while focus is in the slider either.
    await slider.press('e');
    await slider.press('Backspace');
    await expect(slider).toBeFocused();
    expect(await modelParams()).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('Esc deselects the model', async () => {
    await modelButtons().first().click();
    await expect(modelBar(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modelBar(page)).toBeHidden();
    await expect(page.locator('#slot-list .slot.model[aria-pressed="true"]')).toHaveCount(0);
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

// One HDRI upload, used in turn by each test in this group (PRD 16.9 and 16.10).
test.describe('an HDRI sky', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let errors: string[];

  const background = () =>
    page.evaluate(() => {
      const { scene } = (window as any).showroom;
      return { hdri: scene.background?.isDataTexture === true, color: scene.background?.isColor === true, turn: [scene.backgroundRotation.y, scene.environmentRotation.y] };
    });
  // The stars are Points with a PointsMaterial. The snow flakes are Points too, with a ShaderMaterial.
  const starsShow = () =>
    page.evaluate(() => (window as any).showroom.scene.children.some((c: any) => c.isPoints && c.material.isPointsMaterial && c.visible));
  const sunDirection = () =>
    page.evaluate(() => {
      const sun = (window as any).showroom.scene.children.find((c: any) => c.isDirectionalLight);
      return sun.position.clone().normalize().toArray() as number[];
    });
  const turnSky = (degrees: number) =>
    page.getByRole('slider', { name: 'Turn sky' }).evaluate((input: HTMLInputElement, degrees) => {
      input.value = String(degrees);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, degrees);
  const presets = () => page.locator('#daylight .presets button');
  const garden = () => page.locator('#rooms button', { hasText: 'Garden' });
  const living = () => page.locator('#rooms button', { hasText: 'Living room' });

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(() => page.close());

  test('sky swatches are greyed out indoors', async () => {
    waitsForUpload();
    errors = await open(page);
    await upload(page, 'hdri-hdr.zip');
    await uploadsTab(page).click();
    await expect(swatches(page)).toHaveCount(1, done);
    await expect(swatches(page).getByRole('img', { name: 'Sky' })).toBeVisible();
    await expect(swatches(page).locator('.swatch')).toBeDisabled();
    await expect(swatches(page)).toHaveAttribute('title', 'Skies work in the Garden.');
    expect(errors).toEqual([]);
  });

  test('an HDRI becomes the garden sky and greys out the clock', async () => {
    await garden().click();
    await expect.poll(() => hash(page)).toContain('room=garden');
    await page.evaluate(() => ((window as any).showroom.gtao.enabled = false));
    await uploadsTab(page).click();
    await expect(swatches(page).locator('.swatch')).toBeEnabled();
    await swatches(page).locator('.swatch').click();
    await expect.poll(() => hash(page)).toMatch(/sky=u-[0-9a-f]{8}&sr=0/);
    for (const preset of await presets().all()) await expect(preset).toBeDisabled();
    await expect(page.getByText('The HDRI sets the light.')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Turn sky' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Time of day' })).toBeVisible();
    await expect.poll(async () => (await background()).hdri).toBe(true);
    expect(await starsShow()).toBe(false);
    expect(errors).toEqual([]);
  });

  test('turn sky is in the link and in undo', async () => {
    await turnSky(90);
    await expect.poll(() => hash(page)).toContain('sr=90');
    // The fixture's sun is at about (0, 0.707, -0.707). A quarter turn takes it to about (-0.707, 0.707, 0).
    const [x, y, z] = await sunDirection();
    expect(Math.abs(x + 0.707)).toBeLessThan(0.1);
    expect(Math.abs(y - 0.707)).toBeLessThan(0.1);
    expect(Math.abs(z)).toBeLessThan(0.1);
    expect((await background()).turn.map((r) => r.toFixed(3))).toEqual([(Math.PI / 2).toFixed(3), (Math.PI / 2).toFixed(3)]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toContain('sr=0');
    // The keyboard turns it too, 5 degrees a step.
    const slider = page.getByRole('slider', { name: 'Turn sky' });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect.poll(() => hash(page)).toContain('sr=5');
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toContain('sr=0');
    expect(errors).toEqual([]);
  });

  test('[ and ] do nothing while an HDRI shows', async () => {
    const before = await hash(page);
    await page.keyboard.press(']');
    await page.keyboard.press('[');
    expect(await hash(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test('the sky stays in the Garden across a room switch', async () => {
    await turnSky(90);
    await expect.poll(() => hash(page)).toContain('sr=90');
    await living().click();
    await expect.poll(() => hash(page)).toContain('room=living');
    await expect.poll(background).toEqual({ hdri: false, color: true, turn: [0, 0] });
    await garden().click();
    await expect.poll(() => hash(page)).toContain('room=garden');
    expect(await hash(page)).toContain('sr=90');
    await expect.poll(async () => (await background()).hdri).toBe(true);
    await page.waitForTimeout(1000);
    expect((await background()).hdri).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a link with a sky restores it after a reload, and snow still toggles with a sky on', async () => {
    const link = await hash(page);
    await page.reload();
    await expect(page.locator('#loader')).toHaveClass(/done/);
    expect(await hash(page)).toBe(link);
    expect((await background()).hdri).toBe(true);
    await expect(page.getByRole('slider', { name: 'Turn sky' })).toHaveValue('90');
    await page.evaluate(() => ((window as any).showroom.gtao.enabled = false));
    await page.locator('#snow').click();
    await expect.poll(() => hash(page)).toContain('snow=1');
    expect(await hash(page)).toMatch(/sky=u-[0-9a-f]{8}&sr=90/);
    expect((await background()).hdri).toBe(true);
    await page.locator('#snow').click();
    await expect.poll(() => hash(page)).not.toContain('snow=1');
    expect(errors).toEqual([]);
  });

  test('time of day goes back to the drawn sky', async () => {
    await page.getByRole('button', { name: 'Time of day' }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => hash(page)).not.toContain('sky=');
    for (const preset of await presets().all()) await expect(preset).toBeEnabled();
    await expect(page.getByRole('slider', { name: 'Time of day' })).toBeVisible();
    await expect(page.getByText('The HDRI sets the light.')).toBeHidden();
    await expect.poll(async () => (await background()).hdri).toBe(false);
    await page.keyboard.press('Control+z');
    await expect.poll(() => hash(page)).toContain('sky=u-');
    await expect.poll(async () => (await background()).hdri).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the HDRI sets the fill light at any time, and time of day puts it back', async () => {
    const fill = () => page.evaluate(() => (window as any).showroom.scene.children.find((c: any) => c.isHemisphereLight).intensity as number);
    const timeOfDay = page.getByRole('button', { name: 'Time of day' });
    const timeSlider = page.getByRole('slider', { name: 'Time of day' });
    // At 12:00.
    await expect.poll(() => hash(page)).toContain('t=12');
    expect(await fill()).toBe(0);
    await timeOfDay.click();
    await expect.poll(() => hash(page)).not.toContain('sky=');
    await expect(timeSlider).toBeFocused();
    const day = await fill();
    expect(day).toBeGreaterThan(0);
    // At 22:00.
    await timeSlider.press('End');
    await expect.poll(() => hash(page)).toContain('t=22');
    const night = await fill();
    expect(night).not.toBe(day);
    await uploadsTab(page).click();
    await swatches(page).locator('.swatch').click();
    await expect.poll(() => hash(page)).toContain('sky=u-');
    expect(await fill()).toBe(0);
    await timeOfDay.click();
    await expect.poll(() => hash(page)).not.toContain('sky=');
    expect(await fill()).toBe(night);
    expect(errors).toEqual([]);
  });
});

test.describe('on a narrow touch screen', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('on a narrow screen a tapped model shows the bar', async ({ page }) => {
    waitsForUpload();
    const errors = await open(page);
    await upload(page, 'model-glb.zip');
    await uploadsTab(page).click();
    await expect(swatches(page)).toHaveCount(1, done);
    await swatches(page).locator('.swatch').click();
    await expect.poll(() => page.evaluate(() => (window as any).showroom.placed().length)).toBe(1);
    // Placing selects the model, so clear that first.
    await page.keyboard.press('Escape');
    await expect(modelBar(page)).toBeHidden();
    const [model] = await page.evaluate(() => (window as any).showroom.placed());
    const at = await pointOnScreen(page, model.x, model.y + 0.1, model.z);
    // The model may still be loading, so tap until it is there.
    await expect(async () => {
      await page.touchscreen.tap(at.x, at.y);
      await expect(modelBar(page)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    const bar = (await modelBar(page).boundingBox())!;
    const tray = (await page.locator('#tray').boundingBox())!;
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.y).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.width).toBeLessThanOrEqual(375);
    expect(bar.y + bar.height).toBeLessThanOrEqual(812);
    expect(bar.y + bar.height <= tray.y || tray.y + tray.height <= bar.y).toBe(true);
    expect(errors).toEqual([]);
  });

  test('on a narrow screen the bar stays above the tray when the model is low on screen', async ({ page }) => {
    waitsForUpload();
    const errors = await open(page);
    await upload(page, 'model-glb.zip');
    await uploadsTab(page).click();
    await expect(swatches(page)).toHaveCount(1, done);
    await swatches(page).locator('.swatch').click();
    await expect(modelBar(page)).toBeVisible();
    const tray = (await page.locator('#tray').boundingBox())!;
    const placed = () => page.evaluate((): { id: string; x: number; y: number; z: number }[] => (window as any).showroom.placed());
    // Zoom all the way in, then drop the model on the floor near the bottom of the screen, behind the tray.
    await page.mouse.move(187, 300);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -500);
    await page.waitForTimeout(3000); // the zoom eases in
    const [{ id }] = await placed();
    for (const y of [790, 760, 730, 700]) {
      await page.evaluate(([id, y]) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/x-asset-showroom-model', id);
        document.getElementById('scene')!.dispatchEvent(new DragEvent('drop', { clientX: 187, clientY: y, dataTransfer, bubbles: true, cancelable: true }));
      }, [id, y] as const);
      const model = (await placed()).at(-1)!;
      if ((await pointOnScreen(page, model.x, model.y, model.z)).y > tray.y + 80) break;
    }
    const model = (await placed()).at(-1)!;
    expect((await pointOnScreen(page, model.x, model.y, model.z)).y).toBeGreaterThan(tray.y + 80);
    // The bar is moved each frame, so wait for it to settle.
    await page.waitForTimeout(500);
    await expect(modelBar(page)).toBeVisible();
    const bar = (await modelBar(page).boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(0);
    expect(bar.y + bar.height).toBeLessThanOrEqual(tray.y);
    expect(errors).toEqual([]);
  });
});

// Deleting an upload that is in use (PRD 16.6), and the help about uploads (PRD 16.3).
const roomButton = (page: Page, name: string) => page.locator('#rooms button', { hasText: name });
const goTo = async (page: Page, name: string, key: string) => {
  await roomButton(page, name).click();
  await expect.poll(() => hash(page)).toContain(`room=${key}`);
  await uploadsTab(page).click();
};
// Accepts the next confirm and gives its text.
const accept = (page: Page) =>
  new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    }),
  );

test('deleting a texture in use resets its surfaces in every room', async ({ page }) => {
  waitsForUpload();
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await slot(page, 'Floor').click();
  await swatches(page).locator('.swatch').click();
  await expect.poll(() => floorMap(page)).toMatch(/^u-/);
  await goTo(page, 'Bedroom', 'bedroom');
  await slot(page, 'Floor').click();
  await swatches(page).locator('.swatch').click();
  await expect.poll(() => floorMap(page)).toMatch(/^u-/);

  const asked = accept(page);
  await swatches(page).locator('.delete').click();
  expect(await asked).toBe('Used in 2 rooms. Delete it?');
  await expect(swatches(page)).toHaveCount(0);
  await expect.poll(() => floorMap(page)).toBe('oak-fixture');
  expect(await hash(page)).not.toContain('u-');
  await goTo(page, 'Living room', 'living');
  await expect.poll(() => floorMap(page)).toBe('oak-fixture');
  expect(await hash(page)).not.toContain('u-');
  expect(errors).toEqual([]);
});

test('deleting a placed model or the garden sky removes them', async ({ page }) => {
  waitsForUpload();
  const errors = await open(page);
  const placed = () => page.evaluate(() => (window as any).showroom.placed().length as number);
  const hdriShows = () => page.evaluate(() => (window as any).showroom.scene.background?.isDataTexture === true);
  const model = swatches(page).filter({ has: page.getByRole('img', { name: 'Model' }) });
  const sky = swatches(page).filter({ has: page.getByRole('img', { name: 'Sky' }) });
  await upload(page, 'model-glb.zip');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await upload(page, 'hdri-hdr.zip');
  await expect(swatches(page)).toHaveCount(2, done);
  // The model in the Living room and the Garden, the sky in the Garden.
  await model.locator('.swatch').click();
  await expect.poll(() => hash(page)).toContain('&m=u-');
  await goTo(page, 'Garden', 'garden');
  await model.locator('.swatch').click();
  await expect.poll(() => hash(page)).toContain('&m=u-');
  await sky.locator('.swatch').click();
  await expect.poll(() => hash(page)).toContain('sky=u-');
  await expect.poll(hdriShows).toBe(true);

  let asked = accept(page);
  await model.locator('.delete').click();
  expect(await asked).toBe('Used in 2 rooms. Delete it?');
  await expect(swatches(page)).toHaveCount(1);
  await expect.poll(() => hash(page)).not.toContain('&m=');
  expect(await placed()).toBe(0);
  await expect(page.locator('#model-bar')).toBeHidden();

  asked = accept(page);
  await sky.locator('.delete').click();
  expect(await asked).toBe('Used in 1 room. Delete it?');
  await expect(swatches(page)).toHaveCount(0);
  await expect.poll(() => hash(page)).not.toContain('sky=');
  await expect.poll(hdriShows).toBe(false);
  await expect(page.getByRole('slider', { name: 'Time of day' })).toBeVisible();

  await goTo(page, 'Living room', 'living');
  expect(await placed()).toBe(0);
  expect(await hash(page)).not.toContain('u-');
  expect(errors).toEqual([]);
});

// Puts a bundled texture on the floor of the room that shows. The Floor stays selected.
const floorTo = async (page: Page, tab: string, name: string, slug: string) => {
  await page.keyboard.press('Escape'); // clicking a selected slot clears it
  await slot(page, 'Floor').click();
  await page.locator('#tabs button', { hasText: tab }).click();
  await page.getByRole('button', { name }).click();
  await expect.poll(() => hash(page)).toContain(`floor=${slug}`);
};
const marbleFloor = (page: Page) => floorTo(page, 'Stone and tiles', 'Marble Fixture', 'marble-fixture');

test('undo in another room after a delete skips the upload', async ({ page }) => {
  waitsForUpload();
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await goTo(page, 'Bedroom', 'bedroom');
  const start = await hash(page); // the default oak floor at 12:00
  await marbleFloor(page);
  const marble = await hash(page);
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await swatches(page).locator('.swatch').click();
  await expect.poll(() => hash(page)).toContain('floor=u-');
  await page.keyboard.press(']');
  await expect.poll(() => hash(page)).toContain('t=13');

  await goTo(page, 'Living room', 'living');
  const asked = accept(page);
  await swatches(page).locator('.delete').click();
  expect(await asked).toBe('Used in 1 room. Delete it?');
  await expect(swatches(page)).toHaveCount(0);

  // Each undo changes the room: the upload's step at 12:00 with the default floor, then marble, then the start.
  await goTo(page, 'Bedroom', 'bedroom');
  expect(await hash(page)).toBe(start.replace('t=12', 't=13'));
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toBe(start);
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toBe(marble);
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toBe(start);
  await expect(page.locator('#toolbar [data-action="undo"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('undo after deleting an upload in its own room changes the room', async ({ page }) => {
  waitsForUpload();
  const errors = await open(page);
  const undoButton = page.locator('#toolbar [data-action="undo"]');
  const redoButton = page.locator('#toolbar [data-action="redo"]');
  await upload(page, 'texture-metal.zip');
  const start = await hash(page);
  // Marble, then the default oak again, then the upload.
  await marbleFloor(page);
  const marble = await hash(page);
  await floorTo(page, 'Wood', 'Oak Fixture', 'oak-fixture');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  await swatches(page).locator('.swatch').click();
  await expect.poll(() => hash(page)).toContain('floor=u-');

  const asked = accept(page);
  await swatches(page).locator('.delete').click();
  expect(await asked).toBe('Used in 1 room. Delete it?');
  await expect.poll(() => hash(page)).toContain('floor=oak-fixture');
  await expect(undoButton).toBeEnabled();

  // The step before the upload is the oak floor the room shows now, so one undo goes past it to marble.
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toBe(marble);
  await expect.poll(() => floorMap(page)).toBe('marble-fixture');
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toBe(start);
  await expect(undoButton).toBeDisabled();
  // Redo goes forward to marble, then to oak, and then has nothing left that changes the room.
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => hash(page)).toBe(marble);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => hash(page)).toBe(start);
  await expect(redoButton).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the help explains uploads', async ({ page }) => {
  await open(page);
  await page.locator('#toolbar [data-action="help"]').click();
  await expect(page.locator('#help')).toContainText('Uploads stay in this browser only.');
});
