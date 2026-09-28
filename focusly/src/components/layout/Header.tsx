import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_ITEMS } from '../../data/navigation';
import { useDialogs } from '../../context/DialogsContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useScrolled } from '../../hooks/useScrolled';
import { useScrollSpy } from '../../hooks/useScrollSpy';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { Logo } from '../ui/Logo';
import { SectionLink } from '../ui/SectionLink';
import { ThemeToggle } from './ThemeToggle';

const SECTION_IDS = NAV_ITEMS.map((item) => item.id);
const MOBILE_MENU_ID = 'mobile-menu';

export function Header() {
  const { openSignup } = useDialogs();
  const scrolled = useScrolled();
  const active = useScrollSpy(SECTION_IDS);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // El menú móvil no tiene sentido en escritorio: se cierra al ensanchar la ventana.
  useEffect(() => {
    if (isDesktop) setMenuOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    root.classList.add('overflow-hidden');
    firstLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      root.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          'sticky top-[env(safe-area-inset-top,0px)] z-50 border-b transition-[background-color,border-color,box-shadow] duration-300',
          scrolled || menuOpen ? 'border-line bg-canvas/85 shadow-soft backdrop-blur-lg' : 'border-transparent bg-canvas/0',
        )}
        onBlur={(event) => {
          // Si el foco sale del header (Tab tras el último enlace), se cierra el menú.
          if (menuOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu();
        }}
      >
        <Container className="flex h-16 items-center justify-between gap-4">
          <SectionLink to="inicio" onNavigate={() => closeMenu()} className="rounded-lg" aria-label="Focusly, ir al inicio">
            <Logo />
          </SectionLink>

          <nav aria-label="Principal" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <SectionLink
                    to={item.id}
                    aria-current={active === item.id ? 'true' : undefined}
                    className={cn(
                      'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active === item.id ? 'text-fg' : 'text-fg-muted hover:bg-subtle hover:text-fg',
                    )}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-300',
                        active === item.id ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </SectionLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button className="hidden md:inline-flex" onClick={() => openSignup('free')}>
              Empezar gratis
            </Button>
            <button
              ref={toggleRef}
              type="button"
              className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-fg shadow-soft transition-colors hover:bg-subtle md:hidden"
              aria-expanded={menuOpen}
              aria-controls={MOBILE_MENU_ID}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>
        </Container>

        <div
          id={MOBILE_MENU_ID}
          hidden={!menuOpen}
          className="absolute inset-x-0 top-full border-b border-line bg-canvas shadow-card md:hidden"
        >
          <nav aria-label="Principal (móvil)">
            <Container className="animate-fade-up py-4">
              <ul className="flex flex-col">
                {NAV_ITEMS.map((item, index) => (
                  <li key={item.id}>
                    <SectionLink
                      ref={index === 0 ? firstLinkRef : undefined}
                      to={item.id}
                      onNavigate={() => closeMenu()}
                      aria-current={active === item.id ? 'true' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-xl px-3 py-3.5 text-base font-medium transition-colors',
                        active === item.id ? 'bg-accent-soft text-accent-text' : 'text-fg hover:bg-subtle',
                      )}
                    >
                      {item.label}
                    </SectionLink>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                fullWidth
                className="mt-4"
                onClick={() => {
                  closeMenu();
                  openSignup('free');
                }}
              >
                Empezar gratis
              </Button>
            </Container>
          </nav>
        </div>
      </header>

      {/* Fondo semitransparente del menú móvil: un clic fuera lo cierra. */}
      <div
        aria-hidden="true"
        onClick={() => closeMenu()}
        className={cn(
          'fixed inset-0 top-16 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 md:hidden dark:bg-black/50',
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
    </>
  );
}
