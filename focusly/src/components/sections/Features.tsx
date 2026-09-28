import { Check } from 'lucide-react';
import { FEATURES } from '../../data/features';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';

export function Features() {
  return (
    <section
      id="funciones"
      aria-labelledby="features-title"
      className="border-y border-line bg-surface/60 py-20 outline-none sm:py-28"
    >
      <Container>
        <SectionHeader
          id="features-title"
          eyebrow="Funciones"
          title="Todo lo que necesitas para avanzar, nada que te distraiga"
          description="Focusly combina las herramientas esenciales de productividad en una experiencia rápida y silenciosa."
        />
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
          {FEATURES.map(({ title, description, icon: Icon, highlights }, index) => (
            <Reveal as="li" key={title} delay={(index % 3) * 80}>
              <article className="group flex h-full gap-4 rounded-2xl border border-line bg-surface p-6 shadow-soft transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-card sm:block sm:p-7">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-accent-soft text-accent-text transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg sm:mt-5 font-semibold tracking-tight text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{description}</p>
                  <ul className="mt-5 hidden space-y-2 border-t border-line pt-5 sm:block">
                    {highlights.map((highlight) => (
                      <li key={highlight} className="flex items-center gap-2 text-sm text-fg-muted">
                        <Check className="size-4 text-accent-text" aria-hidden="true" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
