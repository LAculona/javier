# Focusly

Landing page y demo funcional de **Focusly**, una aplicación ficticia para organizar tareas y mejorar la productividad personal. No hay backend: los datos se simulan en el frontend y se guardan en `localStorage`.

## Puesta en marcha

```bash
cd focusly
npm install
npm run dev        # http://localhost:5173
```

| Script             | Qué hace                                                           |
| ------------------ | ------------------------------------------------------------------ |
| `npm run dev`      | Servidor de desarrollo con recarga en caliente                     |
| `npm run build`    | Comprobación de tipos + build de producción en `dist/`             |
| `npm run preview`  | Sirve el build de producción                                       |
| `npm run lint`     | ESLint (TypeScript, reglas de hooks y de accesibilidad `jsx-a11y`) |
| `npm test`         | Tests unitarios (Vitest)                                           |
| `npm run test:e2e` | Tests end-to-end en Chromium, escritorio y móvil (Playwright)      |
| `npm run check`    | Lint + tipos + tests unitarios + build                             |

El build usa rutas relativas (`base: './'`), así que `dist/` se puede subir a cualquier hosting estático o subcarpeta.

## Tecnología

React 19 · TypeScript (estricto) · Tailwind CSS 4 · Vite · Lucide (iconos) · Geist (tipografía, autoalojada).

## Estructura

```
src/
├── App.tsx                  Composición de la página y proveedores
├── index.css                Tokens de diseño (claro/oscuro), base y animaciones
├── types/                   Tipos de dominio (Task, Priority, Plan…)
├── data/                    Contenido: tareas de ejemplo, funciones, planes, FAQ, textos legales
├── lib/                     Lógica pura: estadísticas, validación, fechas, almacenamiento seguro
├── state/tasksReducer.ts    Reducer de tareas + validación de datos guardados
├── context/                 Tema, tareas, avisos (toasts) y diálogos globales
├── hooks/                   useTaskActions, useInView, useScrollSpy, useFocusTimer…
└── components/
    ├── ui/                  Piezas reutilizables: Button, Dialog, SegmentedControl, ProgressBar…
    ├── layout/              Header (con menú móvil), Footer, ThemeToggle
    ├── hero/                Hero y vista previa interactiva de la app
    ├── dashboard/           Demo: formulario, filtros, lista, progreso, temporizador
    ├── sections/            Estadísticas, Funciones, Precios, Opiniones, FAQ, CTA
    └── dialogs/             Registro simulado y textos legales
e2e/                         Tests Playwright (funcionalidad, responsive, accesibilidad)
```

## Qué incluye

- **Header fijo** con resaltado de la sección visible, menú hamburguesa en móvil (Escape, clic fuera, foco gestionado, bloqueo de scroll) y botón de tema.
- **Hero** con una réplica de la app **conectada a los mismos datos que la demo**: marcar una tarea ahí actualiza el progreso y las estadísticas.
- **Dashboard**: crear (con validación: vacío, longitud, duplicados, límite de 50), completar, cambiar prioridad, eliminar con **Deshacer**, filtrar (todas / pendientes / completadas), limpiar completadas, restablecer la demo, porcentaje y barra de progreso, desglose por prioridad y temporizador Pomodoro. Persistencia en `localStorage`, validada al leer, con sincronización entre pestañas.
- **Estadísticas** calculadas en vivo: completadas, pendientes, productividad semanal (cerradas en 7 días frente a la carga de la semana) y racha de días consecutivos.
- **Precios** con selector mensual/anual (radiogroup accesible con flechas) y plan Pro destacado; en móvil el plan recomendado aparece primero.
- **Opiniones** en rejilla en escritorio y carrusel deslizable con indicadores en móvil.
- **FAQ** con acordeones según el patrón WAI-ARIA (flechas, Inicio, Fin).
- **Modo oscuro** que se recuerda, sigue al sistema si no se ha elegido y se aplica antes del primer pintado (sin parpadeo).
- **Accesibilidad**: enlace para saltar al contenido, foco visible, etiquetas en todos los controles, avisos en regiones `aria-live`, diálogos nativos `<dialog>`, contraste AA verificado y soporte de `prefers-reduced-motion`.

## Verificación

- 19 tests unitarios de la lógica (estadísticas, rachas, validación, reducer, formato).
- 67 tests end-to-end en Chromium (escritorio 1440 px y móvil Pixel 7) que cubren todos los botones, filtros, menú móvil, modo oscuro, selector de precios, sistema de tareas, `localStorage`, ausencia de scroll horizontal de 320 px a 1920 px y análisis automático WCAG 2.1 AA con axe en ambos temas. Cada test falla si aparece cualquier error o aviso en la consola.
