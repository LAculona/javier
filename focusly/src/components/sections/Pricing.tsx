import { useState } from 'react';
import { Check } from 'lucide-react';
import type { BillingCycle } from '../../types';
import { PLANS, YEARLY_DISCOUNT_LABEL, type Plan } from '../../data/pricing';
import { useDialogs } from '../../context/DialogsContext';
import { formatPrice } from '../../lib/format';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Container } from '../ui/Container';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';
import { SegmentedControl } from '../ui/SegmentedControl';

function PlanCard({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const { openSignup } = useDialogs();
  const price = plan.price[cycle];
  const monthly = plan.price.monthly;
  const yearlyTotal = Math.round(price * 12 * 100) / 100;
  const savings = Math.round((monthly - price) * 12 * 100) / 100;
  const titleId = `plan-${plan.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      data-testid={`plan-${plan.id}`}
      className={cn(
        'relative flex h-full flex-col rounded-3xl border bg-surface p-6 transition-[box-shadow,transform] duration-300 sm:p-8',
        plan.recommended
          ? 'border-accent shadow-lifted ring-1 ring-accent lg:-my-4 lg:py-12'
          : 'border-line shadow-soft hover:-translate-y-1 hover:shadow-card',
      )}
    >
      {plan.recommended && (
        <p className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold whitespace-nowrap text-on-accent shadow-soft">
          Recomendado
        </p>
      )}
      <h3 id={titleId} className="text-lg font-semibold text-fg">
        {plan.name}
      </h3>
      <p className="mt-1.5 text-sm text-fg-muted">{plan.description}</p>

      <div className="mt-6 flex items-baseline gap-1.5">
        {/* La clave fuerza la animación de entrada cada vez que cambia el precio. */}
        <span
          key={`${cycle}-${price}`}
          className="animate-fade-up text-4xl font-semibold tracking-tight text-fg tabular-nums sm:text-5xl"
          data-testid="plan-price"
        >
          {formatPrice(price)}
        </span>
        <span className="text-sm text-fg-muted">{plan.unit}</span>
      </div>
      <p className="mt-2 min-h-5 text-sm text-fg-subtle">
        {price === 0
          ? 'Gratis para siempre'
          : cycle === 'yearly'
            ? `${formatPrice(yearlyTotal)} al año · ahorras ${formatPrice(savings)}`
            : 'Facturado mensualmente'}
      </p>

      <Button
        size="lg"
        variant={plan.recommended ? 'primary' : 'secondary'}
        fullWidth
        className="mt-6"
        onClick={() => openSignup(plan.id)}
        aria-describedby={titleId}
      >
        {plan.cta}
      </Button>

      <ul className="mt-8 space-y-3 border-t border-line pt-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-fg-muted">
            <span
              className={cn(
                'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
                plan.recommended ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-text',
              )}
            >
              <Check className="size-2.5" strokeWidth={4} aria-hidden="true" />
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <section id="precios" aria-labelledby="pricing-title" className="py-20 outline-none sm:py-28">
      <Container>
        <SectionHeader
          id="pricing-title"
          eyebrow="Precios"
          title="Un plan para cada forma de trabajar"
          description="Empieza gratis y mejora cuando lo necesites. Sin permanencia y con 14 días de prueba en Pro."
        />

        <div className="mt-10 flex flex-col items-center gap-3">
          <SegmentedControl
            label="Periodo de facturación"
            value={cycle}
            onChange={setCycle}
            options={[
              { value: 'monthly', label: 'Mensual' },
              {
                value: 'yearly',
                ariaLabel: `Anual, ahorra un 20 %`,
                label: (
                  <>
                    Anual
                    <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success">
                      {YEARLY_DISCOUNT_LABEL}
                    </span>
                  </>
                ),
              },
            ]}
          />
          <p className="sr-only" aria-live="polite">
            {cycle === 'yearly' ? 'Mostrando precios con facturación anual' : 'Mostrando precios con facturación mensual'}
          </p>
        </div>

        {/* En móvil el plan recomendado aparece primero; en escritorio, en el centro. */}
        <ul className="mx-auto mt-12 grid max-w-md grid-cols-1 gap-6 lg:mt-16 lg:max-w-none lg:grid-cols-3 lg:items-center lg:gap-8">
          {PLANS.map((plan, index) => (
            <Reveal
              as="li"
              key={plan.id}
              delay={index * 80}
              className={cn('h-full', plan.recommended && '-order-1 lg:order-none')}
            >
              <PlanCard plan={plan} cycle={cycle} />
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
