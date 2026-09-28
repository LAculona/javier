import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { FAQ_ITEMS } from '../../data/faq';
import { cn } from '../../lib/cn';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';
import { SectionLink } from '../ui/SectionLink';

/**
 * Acordeón según el patrón de WAI-ARIA: cada cabecera es un botón con
 * aria-expanded/aria-controls y las flechas, Inicio y Fin mueven el foco.
 */
export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = FAQ_ITEMS.length - 1;
    const targets: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="py-20 outline-none sm:py-28">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            id="faq-title"
            eyebrow="Preguntas frecuentes"
            title="¿Tienes dudas? Tenemos respuestas"
            description={
              <>
                Si no encuentras lo que buscas, prueba la{' '}
                <SectionLink
                  to="demo"
                  className="font-medium text-accent-text underline decoration-accent-text/30 underline-offset-4 hover:decoration-accent-text"
                >
                  demo interactiva
                </SectionLink>{' '}
                o escríbenos a{' '}
                <a
                  href="mailto:hola@focusly.app"
                  className="font-medium text-accent-text underline decoration-accent-text/30 underline-offset-4 hover:decoration-accent-text"
                >
                  hola@focusly.app
                </a>
                .
              </>
            }
            align="left"
            className="mx-auto text-center lg:mx-0 lg:text-left"
          />
        </div>

        <Reveal>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-soft">
            {FAQ_ITEMS.map((item, index) => {
              const open = openIndex === index;
              const buttonId = `${baseId}-button-${index}`;
              const panelId = `${baseId}-panel-${index}`;
              return (
                <div key={item.question}>
                  <h3>
                    <button
                      ref={(element) => {
                        buttons.current[index] = element;
                      }}
                      id={buttonId}
                      type="button"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => setOpenIndex(open ? null : index)}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      className="group flex w-full items-center justify-between gap-4 px-5 py-5 text-left text-base font-medium text-fg transition-colors hover:text-accent-text focus-visible:-outline-offset-2 sm:px-6"
                    >
                      {item.question}
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full border border-line text-fg-muted transition-all duration-300',
                          'group-hover:border-accent group-hover:text-accent-text',
                          open && 'rotate-45 border-accent bg-accent text-on-accent group-hover:text-on-accent',
                        )}
                        aria-hidden="true"
                      >
                        <Plus className="size-4" />
                      </span>
                    </button>
                  </h3>
                  {/* grid-rows 0fr → 1fr anima la altura sin medir el contenido */}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    inert={!open}
                    className={cn(
                      'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out-soft',
                      open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted sm:px-6 sm:text-[15px]">{item.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
