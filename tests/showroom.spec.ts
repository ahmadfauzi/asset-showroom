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

test('a model that fails to load does not stop the room', async ({ page }) => {
  await page.route('**/models/**', (route) => route.fulfill({ status: 404 }));
  const errors = await open(page);
  await expect(page.locator('#toast')).toContainText("Couldn't load");
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
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
  // Records every hash the app writes, so the test can tell if the Bedroom ever showed.
  await page.evaluate(() => {
    const written: string[] = ((window as any).hashesWritten = []);
    const replace = history.replaceState.bind(history);
    history.replaceState = (data, unused, url) => {
      written.push(String(url));
      replace(data, unused, url);
    };
  });
  // Both clicks run in one go in the page. Two Playwright clicks can land more than the 250 ms fade apart on a
  // slow machine, and then the first switch has already finished.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('#rooms button')];
    for (const name of ['Bedroom', 'Bathroom']) buttons.find((button) => button.textContent === name)!.click();
  });
  await expect(page.locator('#fade')).not.toHaveClass(/on/);
  await expect.poll(() => hash(page)).toContain('room=bathroom');
  await expect(page.locator('#rooms button[aria-pressed="true"]')).toHaveText(['Bathroom']);
  await expect(slot(page, 'Shower wall')).toBeVisible();
  await expect(slot(page, 'Bedding')).toHaveCount(0);
  const written: string[] = await page.evaluate(() => (window as any).hashesWritten);
  expect(written.filter((url) => url.includes('room=bedroom'))).toEqual([]);
});

test('the bathroom has its six surfaces and its mirror', async ({ page }) => {
  const mirror = page.waitForResponse((response) => response.url().endsWith('/models/ornate_mirror_01.glb') && response.ok(), { timeout: 20_000 });
  await open(page, '#v=2&room=bathroom');
  for (const name of ['Floor', 'Walls', 'Shower wall', 'Vanity', 'Countertop', 'Towels']) await expect(slot(page, name)).toBeVisible();
  await expect(slot(page, 'Rugs')).toHaveCount(0);
  expect(await hash(page)).toContain('showerWall=concrete-fixture');
  await mirror;
  await expect(page.locator('#toast')).not.toContainText("Couldn't load");
});

const GARDEN_MODELS = ['rock_07', 'rock_09', 'shrub_02', 'shrub_03', 'planter_box_01', 'outdoor_table_chair_set_01'];

test('the garden has its surfaces and the Ground tab', async ({ page }) => {
  const models = GARDEN_MODELS.map((id) =>
    page.waitForResponse((response) => response.url().endsWith(`/models/${id}.glb`) && response.ok(), { timeout: 20_000 }),
  );
  // The errors catch a shader that fails to compile, such as the triplanar patch on the rocks or the Sky.
  const errors = await open(page, '#v=2&room=garden');
  await Promise.all(models);
  await expect(page.locator('#toast')).not.toContainText("Couldn't load");
  for (const name of ['Ground', 'Path', 'Deck', 'Fence', 'Rocks', 'Cushions']) await expect(slot(page, name)).toBeVisible();
  await slot(page, 'Ground').click();
  await expect(tab(page, 'Ground')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Wood')).toBeDisabled();
  await page.getByRole('button', { name: 'Snow Fixture' }).click();
  await expect.poll(() => hash(page)).toContain('ground=snow-fixture');

  // The rock models are the Rocks surface.
  const rocks = await page.evaluate(() => {
    let count = 0;
    (window as any).showroom.scene.traverse((object: any) => object.isMesh && object.userData.slot === 'rocks' && count++);
    return count;
  });
  expect(rocks).toBeGreaterThan(0);
  await slot(page, 'Rocks').click();
  await tab(page, 'Stone and tiles').click();
  await page.getByRole('button', { name: 'Marble Fixture' }).click();
  await expect.poll(() => hash(page)).toContain('rocks=marble-fixture');
  expect(errors).toEqual([]);
});

test('night in the garden lights the path lights', async ({ page }) => {
  const errors = await open(page, '#v=2&room=garden&t=21');
  const lit = await page.evaluate(() => (window as any).showroom.scene.children.filter((c: any) => c.isPointLight && c.intensity > 0).length);
  expect(lit).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('leaving the garden removes the sky and the stars', async ({ page }) => {
  // The sky shows as a background texture. Indoors the environment stays, as the generated room.
  const sky = () =>
    page.evaluate(() => {
      const { scene } = (window as any).showroom;
      return { sky: scene.background?.isTexture === true, environment: scene.environment !== null, stars: scene.children.some((c: any) => c.isPoints) };
    });
  const errors = await open(page, '#v=2&room=garden&t=21');
  await expect.poll(sky).toEqual({ sky: true, environment: true, stars: true });
  await room(page, 'Living room').click();
  await expect.poll(() => hash(page)).toContain('room=living');
  await expect.poll(sky).toEqual({ sky: false, environment: true, stars: false });
  expect(errors).toEqual([]);
});

test('snow is a garden switch in the link and in undo', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#snow')).toBeHidden();
  await room(page, 'Garden').click();
  // The Garden draws slowly in headless Chromium, so switch GTAO off on this page. The reload below starts a new page.
  await page.evaluate(() => ((window as any).showroom.gtao.enabled = false));
  await page.locator('#snow').click();
  await expect(page.locator('#snow')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hash(page)).toContain('snow=1');
  // The flakes are in the scene while snow is on and the Garden shows.
  const flakes = () => page.evaluate(() => (window as any).showroom.scene.children.filter((c: any) => c.isPoints && c.material.isShaderMaterial).length);
  await expect.poll(flakes).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(() => hash(page)).not.toContain('snow=1');
  await expect(page.locator('#snow')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(flakes).toBe(0);
  await page.goto('/#v=2&room=garden&snow=1'); // a hash edit reloads the page
  await expect(page.locator('#loader')).toHaveClass(/done/, { timeout: 120_000 });
  await expect(page.locator('#snow')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(flakes).toBe(1);
  await room(page, 'Living room').click();
  await expect(page.locator('#snow')).toBeHidden();
  await expect.poll(flakes).toBe(0);
  expect(errors).toEqual([]);
});

test('the snow switch works on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors = await open(page);
  await expect(page.locator('#snow')).toBeHidden();
  await room(page, 'Garden').click();
  await expect(page.locator('#snow')).toBeVisible();
  await expect(page.locator('#tray #snow')).toHaveCount(1);
  await page.locator('#snow').click();
  await expect(page.locator('#snow')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => hash(page)).toContain('snow=1');
  await page.locator('#snow').click();
  await expect(page.locator('#snow')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('at 375 px the room switcher does not overlap the tray', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const rooms = (await page.locator('#rooms').boundingBox())!;
  const tray = (await page.locator('#tray').boundingBox())!;
  expect(rooms.y + rooms.height <= tray.y || tray.y + tray.height <= rooms.y).toBe(true);
  await expect(page.locator('#rooms')).toBeVisible();
});

test('every HUD button has an accessible name', async ({ page }) => {
  await open(page);
  const unnamed = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())).length);
  expect(unnamed).toBe(0);
});

for (const key of ['living', 'bedroom', 'bathroom', 'garden']) {
  test(`${key} screenshot, fixture set`, async ({ page }) => {
    await open(page, `#v=2&room=${key}`);
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
    expect(picture).toMatchSnapshot(`${key}-fixture.png`, { maxDiffPixelRatio: 0.02 });
  });
}

test('with reduced motion, switching rooms never shows the fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page);
  await page.evaluate(() => {
    const fade = document.getElementById('fade')!;
    (window as any).fadeWasOn = fade.classList.contains('on');
    new MutationObserver(() => ((window as any).fadeWasOn ||= fade.classList.contains('on'))).observe(fade, { attributes: true });
  });
  await room(page, 'Bedroom').click();
  await expect(room(page, 'Bedroom')).toHaveAttribute('aria-pressed', 'true');
  await room(page, 'Garden').click();
  await expect(room(page, 'Garden')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).fadeWasOn)).toBe(false);
  expect(errors).toEqual([]);
});

test('the tray tab follows the room', async ({ page }) => {
  const errors = await open(page, '#v=2&room=garden');
  await tab(page, 'Ground').click();
  await expect(tab(page, 'Ground')).toHaveAttribute('aria-pressed', 'true');
  await room(page, 'Bedroom').click();
  await expect(room(page, 'Bedroom')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Wood')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
