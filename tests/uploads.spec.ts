import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Upload tests from PRD section 16, against the fixture set. Each test has its own browser context, so its own
// IndexedDB.

const open = async (page: Page, hash = '') => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Missing files are the v2 tests' job. In a git worktree, Vite also refuses the font from the parent node_modules.
  page.on('console', (message) => message.type() === 'error' && !message.text().startsWith('Failed to load resource') && errors.push(message.text()));
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
  test.slow();
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
  test.slow();
  await slowEncode(page, 1000);
  const errors = await open(page);
  await upload(page, 'texture-metal.zip');
  await expect(uploadButton(page)).toBeDisabled();
  await page.locator('#rooms button', { hasText: 'Garden' }).click();
  await expect.poll(() => hash(page)).toContain('room=garden');
  await uploadsTab(page).click();
  await expect(swatches(page)).toHaveCount(1, done);
  expect(await hash(page)).not.toContain('=u-');
  expect(errors).toEqual([]);
});

test('the first upload asks the browser to keep uploads', async ({ page }) => {
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
  // The longest text the Upload button shows.
  await uploadButton(page).evaluate((button) => (button.textContent = 'Uploading…'));
  const right = await page.locator('#toolbar button').evaluateAll((buttons) => Math.max(...buttons.map((b) => b.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(375 - 8);
});
