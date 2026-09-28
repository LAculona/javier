import { demo, expect, gotoFresh, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await gotoFresh(page);
});

test('carga las tareas de ejemplo con su progreso', async ({ page }) => {
  const section = demo(page);
  await expect(section.getByTestId('completion-percent')).toHaveText('50%');
  await expect(section.getByRole('progressbar', { name: 'Porcentaje de tareas completadas' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  );
  await expect(section.getByRole('radio', { name: /Todas \(8\)/ })).toHaveAttribute('aria-checked', 'true');
});

test('valida el formulario antes de crear una tarea', async ({ page }) => {
  const section = demo(page);
  const input = section.getByLabel('Título de la tarea');
  const submit = section.getByRole('button', { name: 'Añadir' });

  await expect(submit).toBeDisabled();
  await input.fill('   ');
  await expect(submit).toBeDisabled();

  await input.fill('ab');
  await submit.click();
  await expect(section.getByText('El título debe tener al menos 3 caracteres.')).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  await input.fill('preparar la PRESENTACIÓN trimestral');
  await submit.click();
  await expect(section.getByText('Ya tienes una tarea pendiente con ese título.')).toBeVisible();
  await expect(section.getByTestId('task-item')).toHaveCount(8);
});

test('crea una tarea con prioridad y actualiza el progreso', async ({ page }) => {
  const section = demo(page);
  await section.getByLabel('Título de la tarea').fill('Escribir el informe mensual');
  await section.getByLabel('Prioridad de la nueva tarea').selectOption('high');
  await section.getByLabel('Título de la tarea').press('Enter');

  const first = section.getByTestId('task-item').first();
  await expect(first).toContainText('Escribir el informe mensual');
  await expect(first.getByRole('combobox')).toHaveValue('high');
  await expect(section.getByLabel('Título de la tarea')).toHaveValue('');
  await expect(section.getByTestId('task-item')).toHaveCount(9);
  // 4 de 9 = 44 %
  await expect(section.getByTestId('completion-percent')).toHaveText('44%');
  await expect(page.getByRole('status').or(page.getByText('Tarea creada')).first()).toBeVisible();
});

test('marca, cambia prioridad y elimina (con deshacer)', async ({ page }) => {
  const section = demo(page);
  const checkbox = section.getByRole('checkbox', { name: 'Preparar la presentación trimestral' });

  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(section.getByTestId('completion-percent')).toHaveText('63%');
  await expect(section.getByRole('progressbar', { name: 'Porcentaje de tareas completadas' })).toHaveAttribute(
    'aria-valuenow',
    '63',
  );
  await checkbox.uncheck();
  await expect(section.getByTestId('completion-percent')).toHaveText('50%');

  const priority = section.getByLabel('Prioridad de «Llamar al proveedor de hosting»');
  await priority.selectOption('high');
  await expect(priority).toHaveValue('high');
  await expect(page.getByText('Prioridad cambiada a alta')).toBeVisible();

  // Las tareas completadas no permiten cambiar la prioridad
  await expect(section.getByLabel('Prioridad de «Enviar la factura de septiembre»')).toBeDisabled();

  await section.getByRole('button', { name: 'Eliminar «Llamar al proveedor de hosting»' }).click();
  await expect(section.getByText('Llamar al proveedor de hosting')).toHaveCount(0);
  await expect(section.getByTestId('task-item')).toHaveCount(7);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(8);
  await expect(section.getByTestId('task-item').nth(3)).toContainText('Llamar al proveedor de hosting');
});

test('filtra entre todas, pendientes y completadas', async ({ page }) => {
  const section = demo(page);
  await section.getByRole('radio', { name: /Pendientes/ }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(4);
  await expect(section.locator('[data-testid="task-item"][data-completed="true"]')).toHaveCount(0);

  await section.getByRole('radio', { name: /Completadas/ }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(4);
  await expect(section.locator('[data-testid="task-item"][data-completed="false"]')).toHaveCount(0);

  // Al reabrir una tarea desde «Completadas» desaparece de esa vista
  // (click en vez de uncheck: la casilla sale de la vista filtrada al instante)
  await section.getByRole('checkbox', { name: 'Enviar la factura de septiembre' }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(3);
  await expect(section.getByRole('radio', { name: /Pendientes \(5\)/ })).toBeVisible();

  // Navegación por teclado dentro del grupo de filtros
  await section.getByRole('radio', { name: /Completadas/ }).focus();
  await page.keyboard.press('Home');
  await expect(section.getByRole('radio', { name: /Todas/ })).toHaveAttribute('aria-checked', 'true');
  await expect(section.getByTestId('task-item')).toHaveCount(8);
});

test('limpia completadas y muestra el estado vacío', async ({ page }) => {
  const section = demo(page);
  const clear = section.getByRole('button', { name: 'Limpiar completadas' });
  await clear.click();
  await expect(section.getByTestId('task-item')).toHaveCount(4);
  await expect(clear).toBeDisabled();

  await section.getByRole('radio', { name: /Completadas/ }).click();
  await expect(section.getByText('Aún no has completado tareas')).toBeVisible();
});

test('guarda las tareas en localStorage y las recupera al recargar', async ({ page }) => {
  const section = demo(page);
  await section.getByLabel('Título de la tarea').fill('Tarea persistente');
  await section.getByRole('button', { name: 'Añadir' }).click();
  await section.getByRole('checkbox', { name: 'Tarea persistente' }).check();
  await section.getByRole('button', { name: 'Eliminar «Ordenar las notas de la reunión»' }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(8);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('focusly:tasks:v1') ?? '[]'));
  expect(stored).toHaveLength(8);
  expect(stored[0]).toMatchObject({ title: 'Tarea persistente', completed: true });

  await page.reload();
  await expect(section.getByTestId('task-item')).toHaveCount(8);
  await expect(section.getByRole('checkbox', { name: 'Tarea persistente' })).toBeChecked();
  await expect(section.getByText('Ordenar las notas de la reunión')).toHaveCount(0);
});

test('se recupera de datos corruptos en localStorage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('focusly:tasks:v1', '{"roto":'));
  await page.reload();
  await expect(demo(page).getByTestId('task-item')).toHaveCount(8);
});

test('las estadísticas reaccionan a las tareas', async ({ page }) => {
  await expect(page.getByTestId('stat-completed')).toHaveText('4');
  await expect(page.getByTestId('stat-pending')).toHaveText('4');
  await expect(page.getByTestId('stat-weekly')).toHaveText('50%');
  await expect(page.getByTestId('stat-streak')).toHaveText('4días');

  await demo(page).getByRole('checkbox', { name: 'Preparar la presentación trimestral' }).check();

  await expect(page.getByTestId('stat-completed')).toHaveText('5');
  await expect(page.getByTestId('stat-pending')).toHaveText('3');
  // 5 cerradas en 7 días frente a 5 + 3 pendientes
  await expect(page.getByTestId('stat-weekly')).toHaveText('63%');
  // Completar hoy extiende la racha
  await expect(page.getByTestId('stat-streak')).toHaveText('5días');
});

test('la vista previa del hero está conectada a la demo', async ({ page }) => {
  const preview = page.getByRole('figure', { name: 'Vista previa interactiva de la aplicación Focusly' });
  await preview.getByRole('checkbox', { name: 'Llamar al proveedor de hosting' }).check({ force: true });
  await expect(demo(page).getByRole('checkbox', { name: 'Llamar al proveedor de hosting' })).toBeChecked();
  await expect(preview.getByText('63%')).toBeVisible();
});

test('restablece la demo y permite deshacerlo', async ({ page }) => {
  const section = demo(page);
  await section.getByRole('button', { name: 'Limpiar completadas' }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(4);
  await section.getByRole('button', { name: 'Restablecer demo' }).click();
  await expect(section.getByTestId('task-item')).toHaveCount(8);
  // El aviso más reciente es el del restablecimiento
  await page.getByRole('button', { name: 'Deshacer' }).last().click();
  await expect(section.getByTestId('task-item')).toHaveCount(4);
});

test('el temporizador de concentración arranca, pausa y se reinicia', async ({ page }) => {
  const timerCard = demo(page).getByRole('region', { name: 'Modo concentración' });
  const reset = timerCard.getByRole('button', { name: 'Reiniciar temporizador' });
  await expect(reset).toBeDisabled();
  await timerCard.getByRole('button', { name: 'Empezar' }).click();
  await page.waitForTimeout(1300);
  await timerCard.getByRole('button', { name: 'Pausar' }).click();
  await expect(timerCard.getByRole('timer')).not.toHaveText('25:00');
  await expect(timerCard.getByRole('button', { name: 'Reanudar' })).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(timerCard.getByRole('timer')).toHaveText('25:00');
  await timerCard.getByRole('radio', { name: /Descanso/ }).click();
  await expect(timerCard.getByRole('timer')).toHaveText('05:00');
});
