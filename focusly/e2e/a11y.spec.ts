import AxeBuilder from '@axe-core/playwright';
import { demo, expect, gotoFresh, test } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`sin infracciones WCAG 2.1 AA detectables (modo ${theme === 'light' ? 'claro' : 'oscuro'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await gotoFresh(page);
    // Fuerza la aparición de todos los bloques animados antes del análisis.
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.setAttribute('data-visible', 'true')));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(summary).toEqual([]);
  });
}

test('el diálogo de registro también es accesible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Empezar gratis' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const results = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test('al eliminar con teclado el foco pasa a la siguiente tarea', async ({ page }) => {
  await gotoFresh(page);
  const section = demo(page);
  const remove = section.getByRole('button', { name: 'Eliminar «Revisar el feedback del equipo de diseño»' });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(section.getByText('Revisar el feedback del equipo de diseño')).toHaveCount(0);
  await expect(section.getByRole('checkbox', { name: 'Planificar el sprint de la próxima semana' })).toBeFocused();
});
