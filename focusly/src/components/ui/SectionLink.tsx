import type { AnchorHTMLAttributes, MouseEvent, Ref } from 'react';
import { scrollToSection } from '../../lib/scroll';

interface SectionLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  onNavigate?: () => void;
  ref?: Ref<HTMLAnchorElement>;
}

/** Enlace a una sección de la página con scroll suave y gestión del foco. */
export function SectionLink({ to, onNavigate, onClick, ref, children, ...props }: SectionLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // Respeta Ctrl/Cmd+clic, clic central, etc.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate?.();
    // Espera un frame para que se liberen bloqueos de scroll (p. ej. el menú móvil).
    requestAnimationFrame(() => scrollToSection(to));
  };
  return (
    <a ref={ref} href={`#${to}`} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
