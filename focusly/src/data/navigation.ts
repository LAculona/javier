export interface NavItem {
  id: string;
  label: string;
}

/** Secciones enlazadas desde el menú principal (ids de los <section>). */
export const NAV_ITEMS: NavItem[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'funciones', label: 'Funciones' },
  { id: 'precios', label: 'Precios' },
  { id: 'opiniones', label: 'Opiniones' },
];
