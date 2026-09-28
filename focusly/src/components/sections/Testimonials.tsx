import { useEffect, useRef, useState } from 'react';
import { Quote } from 'lucide-react';
import { TESTIMONIALS } from '../../data/testimonials';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';
import { StarRating } from '../ui/StarRating';

export function Testimonials() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Solo es un carrusel desplazable por debajo de md: ahí debe poder enfocarse con teclado.
  const isCarousel = !useMediaQuery('(min-width: 768px)');

  // En móvil los testimonios forman un carrusel deslizable; los puntos indican la posición.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof IntersectionObserver === 'undefined') return;
    const items = Array.from(track.children);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveIndex(items.indexOf(entry.target));
        }
      },
      { root: track, threshold: 0.6 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const goTo = (index: number) => {
    const item = trackRef.current?.children[index];
    if (!item) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    item.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <section
      id="opiniones"
      aria-labelledby="testimonials-title"
      className="border-y border-line bg-surface/60 py-20 outline-none sm:py-28"
    >
      <Container>
        <SectionHeader
          id="testimonials-title"
          eyebrow="Opiniones"
          title="Personas que ya trabajan con más calma"
          description="Más de 12.000 personas usan Focusly cada día. Esto es lo que dicen algunas de ellas."
        />
      </Container>

      <Reveal className="mt-12 lg:mt-16">
        <Container className="px-0 sm:px-6">
          {/* Un contenedor con scroll debe ser enfocable para poder desplazarlo con las flechas (WCAG 2.1.1). */}
          <ul
            ref={trackRef}
            aria-label="Testimonios"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={isCarousel ? 0 : undefined}
            className="no-scrollbar focus-visible:outline-offset-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-0 sm:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible"
          >
            {TESTIMONIALS.map((testimonial) => (
              <li key={testimonial.name} className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-auto">
                <figure className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-soft transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-card sm:p-7">
                  <div className="flex items-center justify-between">
                    <StarRating rating={testimonial.rating} />
                    <Quote className="size-6 text-line-strong" aria-hidden="true" />
                  </div>
                  <blockquote className="mt-5 flex-1 text-[15px] leading-relaxed text-fg">
                    <p>“{testimonial.quote}”</p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                    <Avatar name={testimonial.name} />
                    <div>
                      <p className="text-sm font-semibold text-fg">{testimonial.name}</p>
                      <p className="text-sm text-fg-muted">{testimonial.role}</p>
                    </div>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Container>

        {/* Indicadores del carrusel (solo móvil y tableta pequeña) */}
        <div className="mt-6 flex justify-center gap-2 md:hidden">
          {TESTIMONIALS.map((testimonial, index) => (
            <button
              key={testimonial.name}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Ver opinión ${index + 1} de ${TESTIMONIALS.length}: ${testimonial.name}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              className="grid size-6 place-items-center rounded-full"
            >
              <span
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  activeIndex === index ? 'w-6 bg-accent' : 'w-2 bg-line-strong hover:bg-fg-subtle',
                )}
              />
            </button>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
