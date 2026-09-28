export interface Testimonial {
  name: string;
  role: string;
  rating: number;
  quote: string;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Lucía Fernández',
    role: 'Diseñadora de producto',
    rating: 5,
    quote:
      'Probé decenas de apps de tareas y siempre acababa volviendo al papel. Focusly es la primera que uso a diario: rápida, limpia y sin ruido.',
  },
  {
    name: 'Marcos Ortega',
    role: 'Desarrollador full-stack',
    rating: 5,
    quote:
      'El modo concentración me ha cambiado las mañanas. Encadeno tres bloques de 25 minutos y a mediodía ya he cerrado lo importante.',
  },
  {
    name: 'Elena Ruiz',
    role: 'Fundadora de un estudio de marketing',
    rating: 4,
    quote:
      'Usamos el plan Equipo con seis personas. Ver las prioridades de todos en un vistazo nos ahorra una reunión cada semana.',
  },
];
