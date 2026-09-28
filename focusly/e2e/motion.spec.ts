import { expect, isMobile, test } from './fixtures';

// Con animaciones reales (sin «reducir movimiento»).
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test('scroll suave hasta cada sección y animaciones de entrada', async ({ page }) => {
  test.skip(isMobile(page), 'La navegación de escritorio basta para el scroll suave');
  await page.goto('/');
  const hidden = page.locator('#precios .reveal[data-visible="false"]');
  expect(await hidden.count()).toBeGreaterThan(0);

  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Precios' }).click();
  // Durante el scroll suave la sección todavía no está arriba del todo…
  await expect(page.locator('#precios')).toBeInViewport({ timeout: 5000 });
  // …y al llegar, los bloques aparecen con su animación.
  await expect(page.locator('#precios .reveal[data-visible="true"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('smooth');
});
