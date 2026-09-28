export type LegalDocId = 'privacy' | 'terms' | 'cookies';

export interface LegalDoc {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string }>;
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    title: 'Política de privacidad',
    updated: '1 de septiembre de 2026',
    sections: [
      {
        heading: 'Qué datos tratamos',
        body: 'Solo los necesarios para prestar el servicio: tu correo electrónico, las tareas que creas y datos técnicos básicos de uso.',
      },
      {
        heading: 'Para qué los usamos',
        body: 'Para sincronizar tu cuenta entre dispositivos, mejorar el producto y enviarte avisos que tú hayas activado. Nunca los vendemos.',
      },
      {
        heading: 'Tus derechos',
        body: 'Puedes acceder, rectificar, exportar o eliminar tus datos en cualquier momento desde los ajustes de tu cuenta.',
      },
    ],
  },
  terms: {
    title: 'Términos del servicio',
    updated: '1 de septiembre de 2026',
    sections: [
      {
        heading: 'Uso del servicio',
        body: 'Focusly se ofrece para uso personal y profesional. Te comprometes a no utilizarlo para actividades ilícitas ni a interferir en su funcionamiento.',
      },
      {
        heading: 'Planes y pagos',
        body: 'Los planes de pago se renuevan automáticamente según el ciclo elegido. Puedes cancelar en cualquier momento sin penalización.',
      },
      {
        heading: 'Tu contenido',
        body: 'Las tareas y notas que creas son tuyas. Solo las procesamos para prestarte el servicio.',
      },
    ],
  },
  cookies: {
    title: 'Política de cookies',
    updated: '1 de septiembre de 2026',
    sections: [
      {
        heading: 'Cookies técnicas',
        body: 'Usamos almacenamiento local para recordar tus preferencias, como el modo oscuro, y las tareas de esta demo.',
      },
      {
        heading: 'Sin rastreo publicitario',
        body: 'Focusly no utiliza cookies de publicidad ni comparte información con redes publicitarias.',
      },
    ],
  },
};
