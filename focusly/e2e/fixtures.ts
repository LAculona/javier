import { test as base, expect, type Page } from '@playwright/test';

/**
 * Falla cualquier test si aparece un error o aviso en la consola
 * o una excepción no capturada en la página.
 */
export const test = base.extend<{ consoleMessages: string[] }>({
  consoleMessages: [
    async ({ page }, use) => {
      const messages: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`);
      });
      page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
      await use(messages);
      expect(messages, 'La consola no debe mostrar errores ni avisos').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const demo = (page: Page) => page.locator('#demo');

export async function gotoFresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(demo(page).getByTestId('task-item')).toHaveCount(8);
}

export function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1440) < 768;
}
