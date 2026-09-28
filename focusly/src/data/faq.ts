export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: '¿Focusly es realmente gratis?',
    answer:
      'Sí. El plan Gratis no caduca e incluye hasta 50 tareas activas, prioridades, filtros y estadísticas básicas. Solo pagas si necesitas funciones avanzadas.',
  },
  {
    question: '¿Puedo cambiar de plan o cancelar cuando quiera?',
    answer:
      'Por supuesto. Puedes subir, bajar o cancelar tu plan desde los ajustes en cualquier momento. Si cancelas, conservas el acceso hasta el final del periodo pagado.',
  },
  {
    question: '¿Qué ventajas tiene la facturación anual?',
    answer:
      'Con la facturación anual ahorras un 20 % respecto al pago mensual. El importe se cobra una vez al año y puedes volver al pago mensual al renovar.',
  },
  {
    question: '¿Mis datos están seguros?',
    answer:
      'Tus datos se cifran en tránsito y en reposo, y se alojan en servidores de la Unión Europea. Nunca vendemos tu información ni la usamos con fines publicitarios.',
  },
  {
    question: '¿Funciona sin conexión a internet?',
    answer:
      'Sí. Puedes crear y completar tareas sin conexión; Focusly sincroniza los cambios automáticamente en cuanto vuelves a estar en línea.',
  },
  {
    question: '¿Cómo funciona la demo de esta página?',
    answer:
      'La demo es una versión reducida de Focusly que funciona en tu navegador. Las tareas se guardan en el almacenamiento local, así que siguen ahí aunque recargues la página.',
  },
];
