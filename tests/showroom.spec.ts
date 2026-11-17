import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// App tests from PRD section 12, against the fixture set. Defaults: floor oak-fixture, time 12:00.

const open = async (page: Page, hash = '') => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(`/${hash}`);
  await expect(page.locator('#loader')).toHaveClass(/done/);
  return errors;
};
const hash = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));
const slot = (page: Page, name: string) => page.locator('.slot', { hasText: name });
const tab = (page: Page, name: string) => page.locator('#tabs button', { hasText: name });
const clock = (page: Page) => page.locator('#daylight .clock');
const room = (page: Page, name: string) => page.locator('#rooms button', { hasText: name });

test('loads and renders the room', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#scene')).toBeVisible();
  expect(await hash(page)).toContain('v=2&room=living');
  expect(await hash(page)).toContain('floor=oak-fixture');
  expect(await hash(page)).toContain('t=12');
  expect(errors).toEqual([]);
});

test('selecting a slot dims the tabs it does not accept', async ({ page }) => {
  await open(page);
  await slot(page, 'Floor').click();
  await expect(tab(page, 'Wood')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Stone and tiles')).toBeEnabled();
  await expect(tab(page, 'Fabric and leather')).toBeDisabled();
  await expect(tab(page, 'Wall finishes')).toBeDisabled();
  await expect(page.locator('#chip')).toContainText('for the floor');

  await slot(page, 'Upholstery').click();
  await expect(tab(page, 'Fabric and leather')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Wood')).toBeDisabled();
});

test('applying a swatch updates the hash and the card', async ({ page }) => {
  await open(page);
  await slot(page, 'Floor').click();
  await tab(page, 'Stone and tiles').click();
  await page.getByRole('button', { name: 'Marble Fixture' }).click();
  await expect.poll(() => hash(page)).toContain('floor=marble-fixture');
  await expect(page.locator('#card .name')).toHaveText('Marble Fixture');
  await expect(page.locator('#card .size')).toHaveText('200 × 200 cm');
});

test('opening a link restores the room', async ({ page }) => {
  await open(page, '#v=1&floor=concrete-fixture&walls=clay-fixture&t=18.5');
  await expect(clock(page)).toHaveText('18:30');
  expect(await hash(page)).toContain('room=living');
  await slot(page, 'Floor').click();
  await expect(page.locator('#card .name')).toHaveText('Concrete Fixture');
  await slot(page, 'Walls').click();
  await expect(page.locator('#card .name')).toHaveText('Clay Fixture');
});

test('an unknown slug falls back to the default and shows a toast', async ({ page }) => {
  await open(page, '#v=1&floor=not-in-this-set&woodwork=marble-fixture&t=banana');
  await expect(page.locator('#toast')).toContainText("aren't available");
  expect(await hash(page)).toContain('floor=oak-fixture');
  expect(await hash(page)).toContain('woodwork=marble-fixture');
  await expect(clock(page)).toHaveText('12:00');
});

test('undo and redo cover texture and time changes', async ({ page }) => {
  await open(page);
  const undo = page.locator('#toolbar [data-action="undo"]');
  const redo = page.locator('#toolbar [data-action="redo"]');
  await expect(undo).toBeDisabled();

  await slot(page, 'Floor').click();
  await tab(page, 'Stone and tiles').click();
  await page.getByRole('button', { name: 'Marble Fixture' }).click();
  await page.getByRole('button', { name: 'Night' }).click();
  await expect.poll(() => hash(page)).toContain('t=21');

  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toContain('t=12');
  expect(await hash(page)).toContain('floor=marble-fixture');
  await undo.click();
  await expect.poll(() => hash(page)).toContain('floor=oak-fixture');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => hash(page)).toContain('floor=marble-fixture');
  await redo.click();
  await expect.poll(() => hash(page)).toContain('t=21');
  await expect(redo).toBeDisabled();
});

test('keys from PRD 6.10', async ({ page }) => {
  await open(page);

  // [ ] step the time one hour.
  await page.keyboard.press('[');
  await expect(clock(page)).toHaveText('11:00');
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await expect(clock(page)).toHaveText('13:00');

  // / hides and shows the interface.
  await page.keyboard.press('/');
  await expect(page.locator('#tray')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('Press / to show it');
  await page.keyboard.press('/');
  await expect(page.locator('#tray')).toBeVisible();

  // ? opens help, Esc closes it.
  await page.keyboard.press('?');
  await expect(page.locator('#help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).toBeHidden();

  // Esc clears the selection.
  await slot(page, 'Floor').click();
  await expect(page.locator('#chip')).toContainText('for the floor');
  await page.keyboard.press('Escape');
  await expect(page.locator('#chip')).toContainText('Select a surface');

  // R puts the camera back after a drag.
  const cameraPosition = () =>
    page.evaluate(() => (window as unknown as { showroom: { camera: { position: object } } }).showroom.camera.position);
  const start = await cameraPosition();
  const canvas = page.locator('#scene');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(cameraPosition).not.toEqual(start);
  await page.keyboard.press('r');
  await expect.poll(cameraPosition).toEqual(start);

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z are covered in the undo test above.
});

test('switching rooms shows its surfaces and updates the hash', async ({ page }) => {
  await open(page);
  await room(page, 'Bedroom').click();
  await expect(room(page, 'Bedroom')).toHaveAttribute('aria-pressed', 'true');
  await expect(slot(page, 'Bedding')).toBeVisible();
  await expect(slot(page, 'Slat wall')).toHaveCount(0);
  await expect.poll(() => hash(page)).toContain('room=bedroom');
  expect(await hash(page)).toContain('bedding=linen-fixture');
});

test('a v2 link opens its room and time', async ({ page }) => {
  await open(page, '#v=2&room=bedroom&bedding=velvet-fixture&t=8');
  await expect(room(page, 'Bedroom')).toHaveAttribute('aria-pressed', 'true');
  await expect(clock(page)).toHaveText('08:00');
  await slot(page, 'Bedding').click();
  await expect(page.locator('#card .name')).toHaveText('Velvet Fixture');
});

test('each room keeps its own textures, time and undo', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Night' }).click();          // living: t=21
  await room(page, 'Bedroom').click();
  await expect(clock(page)).toHaveText('12:00');
  await expect(page.locator('#toolbar [data-action="undo"]')).toBeDisabled();
  await page.keyboard.press(']');                                      // bedroom: t=13
  await room(page, 'Living room').click();
  await expect.poll(() => hash(page)).toContain('t=21');
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).toContain('t=12');
  await room(page, 'Bedroom').click();
  await expect(clock(page)).toHaveText('13:00');
});

test('a texture that loads after a switch stays on its own room', async ({ page }) => {
  // Only the maps are delayed. The thumbnail is not, so the loader isn't held up.
  await page.route('**/textures/marble-fixture/*.ktx2', async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await open(page);
  await slot(page, 'Floor').click();
  await tab(page, 'Stone and tiles').click();
  await page.getByRole('button', { name: 'Marble Fixture' }).click();
  await room(page, 'Bedroom').click();
  await page.waitForTimeout(3500);
  const floorMap = () => page.evaluate(() => (window as any).showroom.materials().floor.map?.name);
  expect(await floorMap()).toBe('oak-fixture');                         // the bedroom's own material
  await slot(page, 'Floor').click();
  await expect(page.locator('#card .name')).toHaveText('Oak Fixture');
  await room(page, 'Living room').click();
  await expect.poll(floorMap).toBe('marble-fixture');
});

test('the last room clicked wins', async ({ page }) => {
  await open(page);
  await room(page, 'Bedroom').click();
  await room(page, 'Living room').click();                              // straight away, during the switch
  await expect.poll(() => hash(page)).toContain('room=living');
  await expect(slot(page, 'Slat wall')).toBeVisible();
  await expect(slot(page, 'Bedding')).toHaveCount(0);
});

test('default room screenshot, fixture set', async ({ page }) => {
  await open(page);
  // GTAO may switch itself off part-way through on a slow machine, so turn it off for a steady picture.
  // Page screenshots hang on the WebGL canvas in headless Chromium, so this uses Save picture, which renders
  // one frame without the HUD and downloads it.
  await page.evaluate(() => {
    (window as unknown as { showroom: { gtao: { enabled: boolean } } }).showroom.gtao.enabled = false;
  });
  await page.waitForTimeout(1000);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#toolbar [data-action="save"]').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^asset-showroom-\d{4}-\d{2}-\d{2}\.png$/);
  const picture = readFileSync(await download.path());
  expect(picture).toMatchSnapshot('default-room-fixture.png', { maxDiffPixelRatio: 0.02 });
});
