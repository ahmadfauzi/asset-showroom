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
