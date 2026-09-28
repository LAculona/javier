import { expect, test } from './fixtures';

const VIEWPORTS = [
  { name: 'móvil pequeño', width: 320, height: 640 },
  { name: 'móvil', width: 390, height: 844 },
  { name: 'tableta', width: 768, height: 1024 },
  { name: 'portátil', width: 1280, height: 800 },
  { name: 'monitor grande', width: 1920, height: 1080 },
];

test.describe('diseño responsive', () => {
  test.skip(({ isMobile }) => isMobile, 'Se controla el tamaño de ventana manualmente');

  for (const viewport of VIEWPORTS) {
    test(`sin scroll horizontal en ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const hamburger = page.getByRole('button', { name: 'Abrir menú' });
      if (viewport.width < 768) await expect(hamburger).toBeVisible();
      else await expect(hamburger).toBeHidden();
    });
  }

  test('el dashboard reorganiza sus columnas según el ancho', async ({ page }) => {
    const progress = page.locator('#demo').getByRole('region', { name: 'Progreso total' });
    const list = page.locator('#demo').getByRole('list', { name: 'Tareas' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    let [p, l] = await Promise.all([progress.boundingBox(), list.boundingBox()]);
    expect(p!.y).toBeLessThan(l!.y); // móvil: progreso encima de la lista

    await page.setViewportSize({ width: 1440, height: 900 });
    [p, l] = await Promise.all([progress.boundingBox(), list.boundingBox()]);
    expect(p!.x).toBeGreaterThan(l!.x + l!.width); // escritorio: progreso a la derecha
  });

  test('el menú móvil se cierra al pasar a escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.locator('#mobile-menu')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('#mobile-menu')).toBeHidden();
    await expect(page.locator('html')).not.toHaveClass(/overflow-hidden/);
  });
});
