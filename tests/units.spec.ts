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
