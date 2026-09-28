import { ArrowRight } from 'lucide-react';
import { useDialogs } from '../../context/DialogsContext';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { scrollToSection } from '../../lib/scroll';

export function CtaBanner() {
  const { openSignup } = useDialogs();
  return (
    <section aria-labelledby="cta-title" className="pb-20 sm:pb-28">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-14 text-center shadow-lifted sm:px-12 sm:py-16 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-16 lg:text-left dark:bg-surface dark:ring-1 dark:ring-line">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.08)_1px,transparent_1px)] [background-size:20px_20px]"
            />
            <div className="relative max-w-xl">
              <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
                Tu próximo gran día empieza con una lista clara
              </h2>
              <p className="mt-4 text-base text-zinc-400 sm:text-lg">
                Crea tu cuenta en segundos. Gratis para siempre, sin tarjeta.
              </p>
            </div>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
              <Button size="lg" variant="inverse" onClick={() => openSignup('free')} className="group">
                Empezar gratis
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Button>
              <Button size="lg" variant="inverse-ghost" onClick={() => scrollToSection('precios')}>
                Comparar planes
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
