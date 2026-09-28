import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { useDialogs } from '../../context/DialogsContext';
import { scrollToSection } from '../../lib/scroll';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { StarRating } from '../ui/StarRating';
import { AppPreview } from './AppPreview';

const SOCIAL_PROOF = ['Ana Beltrán', 'Pablo Gil', 'Sara Molina', 'Diego Torres'];

export function Hero() {
  const { openSignup } = useDialogs();

  return (
    <section
      id="inicio"
      aria-labelledby="hero-title"
      className="relative overflow-hidden pt-10 pb-20 outline-none sm:pt-16 lg:pt-20 lg:pb-28"
    >
      {/* Trama de puntos muy sutil para dar profundidad sin recurrir a degradados llamativos */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] [background-size:22px_22px] opacity-60"
      />
      <Container className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 xl:gap-20">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-xs font-medium text-fg-muted shadow-soft">
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-text">
              <Sparkles className="size-3" aria-hidden="true" />
              Nuevo
            </span>
            Modo concentración 2.0<span className="hidden sm:inline"> ya disponible</span>
          </p>

          <h1
            id="hero-title"
            className="mt-6 animate-fade-up text-4xl font-semibold tracking-tight text-balance text-fg [animation-delay:60ms] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05] 2xl:text-6xl"
          >
            Menos ruido. <span className="text-fg-subtle">Más foco.</span> Termina lo que de verdad importa.
          </h1>

          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-pretty text-fg-muted [animation-delay:120ms] lg:mx-0">
            Focusly reúne tus tareas, prioridades y hábitos en un espacio tranquilo. Planifica tu día en dos minutos y descubre
            cómo trabajas mejor.
          </p>

          <div className="mt-8 flex animate-fade-up flex-col justify-center gap-3 [animation-delay:180ms] sm:flex-row lg:justify-start">
            <Button size="lg" onClick={() => openSignup('free')} className="group">
              Empezar gratis
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => scrollToSection('demo')} className="group">
              <Play className="size-4 fill-current text-accent-text" aria-hidden="true" />
              Ver demostración
            </Button>
          </div>

          <div className="mt-10 flex animate-fade-up flex-col items-center gap-3 [animation-delay:240ms] sm:flex-row sm:justify-center lg:justify-start">
            <div className="flex -space-x-1.5">
              {SOCIAL_PROOF.map((name) => (
                <Avatar key={name} name={name} size="sm" />
              ))}
            </div>
            <div className="flex flex-col items-center gap-0.5 text-sm text-fg-muted sm:items-start">
              <StarRating rating={5} />
              <p>
                <strong className="font-semibold text-fg">+12.000 personas</strong> organizan su día con Focusly
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl animate-fade-up [animation-delay:200ms] lg:max-w-none">
          <AppPreview />
        </div>
      </Container>
    </section>
  );
}
