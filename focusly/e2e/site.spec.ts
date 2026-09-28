import { expect, isMobile, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('el header permanece visible al hacer scroll', async ({ page }) => {
  const header = page.locator('header').first();
  await page.evaluate(() => window.scrollTo(0, 3000));
  await expect(header).toBeInViewport();
  const box = await header.boundingBox();
  expect(box?.y).toBe(0);
});

test('los enlaces del menú llevan a su sección', async ({ page }) => {
  test.skip(isMobile(page), 'En móvil se prueba el menú hamburguesa');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  for (const [label, id] of [
    ['Precios', 'precios'],
    ['Opiniones', 'opiniones'],
    ['Funciones', 'funciones'],
    ['Inicio', 'inicio'],
  ] as const) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'true');
  }
});

test('menú hamburguesa en móvil', async ({ page }) => {
  test.skip(!isMobile(page), 'Solo aplica en móvil');
  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  const menu = page.locator('#mobile-menu');

  await expect(page.getByRole('navigation', { name: 'Principal', exact: true })).toBeHidden();
  await expect(menu).toBeHidden();

  await toggle.click();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Inicio' })).toBeFocused();

  // Escape cierra y devuelve el foco al botón
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused();

  // Un enlace cierra el menú y navega
  await toggle.click();
  await menu.getByRole('link', { name: 'Precios' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#precios')).toBeInViewport();

  // El botón de registro dentro del menú abre el diálogo
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await menu.getByRole('button', { name: 'Empezar gratis' }).click();
  await expect(page.getByRole('dialog', { name: 'Crea tu cuenta de Focusly' })).toBeVisible();
});

test('modo oscuro: cambia y se recuerda al recargar', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(html).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('focusly:theme'))).toBe('dark');
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bgDark).not.toBe(bgLight);

  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Activar modo claro' }).click();
  await expect(html).not.toHaveClass(/dark/);
  await page.reload();
  await expect(html).not.toHaveClass(/dark/);
});

test('respeta la preferencia del sistema si no hay elección guardada', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await context.close();
});

test('el selector mensual/anual cambia los precios', async ({ page }) => {
  const pricing = page.locator('#precios');
  const price = (plan: string) => pricing.getByTestId(`plan-${plan}`).getByTestId('plan-price');
  const normalize = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

  expect(normalize(await price('free').textContent())).toBe('0 €');
  expect(normalize(await price('pro').textContent())).toBe('8 €');
  expect(normalize(await price('team').textContent())).toBe('14 €');

  await pricing.getByRole('radio', { name: /Anual/ }).click();
  await expect(pricing.getByRole('radio', { name: /Anual/ })).toHaveAttribute('aria-checked', 'true');
  await expect(price('pro')).toHaveText(/6,40\s€/);
  await expect(price('team')).toHaveText(/11,20\s€/);
  await expect(pricing.getByTestId('plan-pro')).toContainText(/76,80\s€ al año/);

  // Teclado: las flechas vuelven a mensual
  await page.keyboard.press('ArrowLeft');
  await expect(price('pro')).toHaveText(/^8\s€$/);
});

test('el plan Pro aparece destacado como recomendado', async ({ page }) => {
  const pro = page.getByTestId('plan-pro');
  await expect(pro.getByText('Recomendado')).toBeVisible();
  // En móvil el plan recomendado se muestra el primero
  const [proBox, freeBox] = await Promise.all([pro.boundingBox(), page.getByTestId('plan-free').boundingBox()]);
  if (isMobile(page)) expect(proBox!.y).toBeLessThan(freeBox!.y);
  else expect(proBox!.x).toBeGreaterThan(freeBox!.x);
});

test('registro simulado con validación', async ({ page }) => {
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Empezar gratis' }).first().click();
  } else {
    await page.locator('header').getByRole('button', { name: 'Empezar gratis' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Crea tu cuenta de Focusly' });
  await expect(dialog).toBeVisible();
  const email = dialog.getByLabel('Correo electrónico');
  await expect(email).toBeFocused();

  await dialog.getByRole('button', { name: 'Crear cuenta gratis' }).click();
  await expect(dialog.getByText('Introduce tu correo electrónico.')).toBeVisible();
  await email.fill('correo-no-valido');
  await expect(dialog.getByText(/Introduce un correo válido/)).toBeVisible();

  await dialog.getByText('Pro', { exact: true }).click();
  await email.fill('ana@empresa.com');
  const submit = dialog.getByRole('button', { name: 'Empezar con Pro' });
  await submit.click();
  await expect(dialog.getByRole('button', { name: /Creando cuenta/ })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '¡Todo listo!' })).toContainText('ana@empresa.com');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('los botones de los planes abren el registro con el plan elegido', async ({ page }) => {
  await page.getByTestId('plan-team').getByRole('button', { name: 'Crear espacio de equipo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crea tu cuenta de Focusly' });
  await expect(dialog.getByRole('radio', { name: 'Equipo' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
});

test('«Ver demostración» lleva a la demo', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver demostración' }).click();
  await expect(page.locator('#demo')).toBeInViewport();
});

test('FAQ: acordeones con ratón y teclado', async ({ page }) => {
  const faq = page.locator('#faq');
  const questions = faq.getByRole('button');
  await expect(questions).toHaveCount(6);
  await expect(questions.first()).toHaveAttribute('aria-expanded', 'true');

  const second = faq.getByRole('button', { name: '¿Puedo cambiar de plan o cancelar cuando quiera?' });
  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(questions.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(faq.getByText(/Puedes subir, bajar o cancelar/)).toBeVisible();

  await second.click();
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  await expect(faq.getByText(/Puedes subir, bajar o cancelar/)).toBeHidden();

  await second.focus();
  await page.keyboard.press('ArrowDown');
  await expect(faq.getByRole('button', { name: '¿Qué ventajas tiene la facturación anual?' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(questions.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(questions.last()).toHaveAttribute('aria-expanded', 'true');
});

test('opiniones: tres testimonios con valoración', async ({ page }) => {
  const list = page.getByRole('list', { name: 'Testimonios' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByRole('img', { name: /Valoración: \d de 5 estrellas/ })).toHaveCount(3);
});

test('footer: textos legales, enlaces y redes', async ({ page }) => {
  const footer = page.locator('footer');
  await footer.getByRole('button', { name: 'Política de privacidad' }).click();
  await expect(page.getByRole('dialog', { name: 'Política de privacidad' })).toBeVisible();
  await page.getByRole('button', { name: 'Entendido' }).click();
  await footer.getByRole('button', { name: 'Términos' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Términos del servicio' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(footer.getByRole('link', { name: /Focusly en/ })).toHaveCount(4);
  await expect(footer).toContainText(`© ${new Date().getFullYear()} Focusly`);
  await footer.getByRole('link', { name: 'Preguntas frecuentes' }).click();
  await expect(page.locator('#faq')).toBeInViewport();
});

test('navegación con teclado: enlace para saltar al contenido', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
});

test('toda la interfaz es alcanzable con Tab y muestra el foco', async ({ page }) => {
  test.skip(isMobile(page), 'Teclado físico en escritorio');
  const seen = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '', outline: style.outlineStyle };
    });
    if (info) {
      expect(info.outline, `Foco visible en «${info.label}»`).not.toBe('none');
      seen.add(info.label);
    }
  }
  expect(seen).toContain('Activar modo oscuro');
  expect([...seen].some((label) => label.includes('Empezar gratis'))).toBe(true);
});
