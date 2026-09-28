import type { ComponentType, SVGProps } from 'react';
import { useDialogs } from '../../context/DialogsContext';
import type { LegalDocId } from '../../data/legal';
import { GitHubIcon, InstagramIcon, LinkedInIcon, XIcon } from '../icons/SocialIcons';
import { Container } from '../ui/Container';
import { Logo } from '../ui/Logo';
import { SectionLink } from '../ui/SectionLink';

const LINK_GROUPS: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: 'Producto',
    links: [
      { label: 'Funciones', to: 'funciones' },
      { label: 'Demostración', to: 'demo' },
      { label: 'Estadísticas', to: 'estadisticas' },
      { label: 'Precios', to: 'precios' },
    ],
  },
  {
    title: 'Recursos',
    links: [
      { label: 'Opiniones', to: 'opiniones' },
      { label: 'Preguntas frecuentes', to: 'faq' },
      { label: 'Empezar', to: 'inicio' },
    ],
  },
];

const LEGAL_LINKS: Array<{ label: string; doc: LegalDocId }> = [
  { label: 'Política de privacidad', doc: 'privacy' },
  { label: 'Términos', doc: 'terms' },
  { label: 'Cookies', doc: 'cookies' },
];

const SOCIAL_LINKS: Array<{ label: string; href: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { label: 'X (Twitter)', href: 'https://x.com', icon: XIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com', icon: LinkedInIcon },
  { label: 'Instagram', href: 'https://www.instagram.com', icon: InstagramIcon },
  { label: 'GitHub', href: 'https://github.com', icon: GitHubIcon },
];

const linkClass = 'rounded text-sm text-fg-muted transition-colors hover:text-fg';

export function Footer() {
  const { openLegal } = useDialogs();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface">
      <Container className="py-14 lg:py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <SectionLink to="inicio" className="inline-flex rounded-lg" aria-label="Focusly, volver al inicio">
              <Logo />
            </SectionLink>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              La forma más tranquila de organizar tus tareas y recuperar el foco cada día.
            </p>
            <ul className="mt-6 flex gap-2" aria-label="Redes sociales">
              {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Focusly en ${label} (se abre en una pestaña nueva)`}
                    title={label}
                    className="grid size-10 place-items-center rounded-xl border border-line text-fg-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:text-fg"
                  >
                    <Icon className="size-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold text-fg">{group.title}</h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <SectionLink to={link.to} className={linkClass}>
                      {link.label}
                    </SectionLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Legal">
            <h2 className="text-sm font-semibold text-fg">Legal</h2>
            <ul className="mt-4 space-y-3">
              {LEGAL_LINKS.map((link) => (
                <li key={link.doc}>
                  <button type="button" onClick={() => openLegal(link.doc)} className={linkClass}>
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col-reverse items-center justify-between gap-4 border-t border-line pt-8 sm:flex-row">
          <p className="text-sm text-fg-subtle">© {year} Focusly. Todos los derechos reservados.</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <li>
              <button type="button" onClick={() => openLegal('privacy')} className={linkClass}>
                Privacidad
              </button>
            </li>
            <li>
              <button type="button" onClick={() => openLegal('terms')} className={linkClass}>
                Términos
              </button>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
