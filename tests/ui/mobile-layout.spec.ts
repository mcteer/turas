import { expect, test } from '@playwright/test';
import { signIn } from '../fixtures/ui';

// Run against the owned disposable workspace app, with WebKit iPhone profiles.
test('date controls and the open customer picker stay inside their containers', async ({ page }, info) => {
  await signIn(page, 'mcteer');
  const widths = info.project.use.isMobile || info.project.name.includes('mobile') ? [320, 375, 390, 667] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 844 });
    for (const path of ['/staffing', '/product-gaps', '/portfolio']) {
      await page.goto(path);
      const dates = page.locator('input[type="date"], input[type="datetime-local"]');
      await expect(dates.first()).toBeVisible();
      for (const date of await dates.all()) {
        for (const value of ['', await date.getAttribute('type') === 'date' ? '2026-11-03' : '2026-11-03T12:30']) {
          await date.fill(value);
          expect(await date.evaluate(el => {
            const box = el.getBoundingClientRect(), parent = el.parentElement!.getBoundingClientRect();
            return box.left >= parent.left && box.right <= parent.right + 1 && box.right <= innerWidth;
          }), `${path} date at ${width}px`).toBe(true);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/s');
    const composer = page.locator('.chat-composer');
    const before = await composer.boundingBox();
    const trigger = page.getByRole('button', { name: 'Customer', exact: true });
    await trigger.click();
    const search = page.getByRole('combobox', { name: 'Search customers' });
    await expect(search).toBeFocused();
    const menu = await page.locator('.customer-picker-popover').boundingBox();
    const after = await composer.boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    expect(after!.width).toBeCloseTo(before!.width, 0);
    expect(after!.x).toBeCloseTo(before!.x, 0);
    if (width < 768) expect(await search.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await search.fill('No matching synthetic customer');
    await expect(page.getByRole('status').filter({ hasText: 'No customers found.' })).toBeVisible();
    await search.fill('');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger).toBeFocused();
    await trigger.click();
    if (width === 390) await page.screenshot({ path: `local-artifacts/mobile-${info.project.name}.png` });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});
