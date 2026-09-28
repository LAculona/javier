import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import type { PlanId } from '../../types';
import { PLANS } from '../../data/pricing';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return 'Introduce tu correo electrónico.';
  if (!EMAIL_PATTERN.test(email)) return 'Introduce un correo válido, por ejemplo nombre@empresa.com.';
  return null;
}

type Status = 'idle' | 'submitting' | 'success';

export function SignupDialog({ plan, onClose }: { plan: PlanId | null; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('free');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const timeout = useRef<number | undefined>(undefined);
  const successButton = useRef<HTMLButtonElement>(null);
  const emailId = useId();
  const errorId = useId();
  const open = plan !== null;

  // Al cerrar se limpia el formulario; al abrir se preselecciona el plan elegido.
  useEffect(() => {
    if (plan) {
      setSelectedPlan(plan);
      return;
    }
    window.clearTimeout(timeout.current);
    setEmail('');
    setError(null);
    setTouched(false);
    setStatus('idle');
  }, [plan]);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  // Al terminar, el foco pasa al botón principal para no quedarse en un elemento que ya no existe.
  useEffect(() => {
    if (status === 'success') successButton.current?.focus();
  }, [status]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = validateEmail(email);
    setTouched(true);
    setError(message);
    if (message) {
      document.getElementById(emailId)?.focus();
      return;
    }
    setStatus('submitting');
    // Simula la llamada a un servidor.
    timeout.current = window.setTimeout(() => {
      setStatus('success');
      const planName = PLANS.find((item) => item.id === selectedPlan)?.name ?? '';
      toast({ title: 'Cuenta creada', description: `Plan ${planName} · ${email.trim()}` });
    }, 900);
  };

  const planName = PLANS.find((item) => item.id === selectedPlan)?.name;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={status === 'success' ? '¡Todo listo!' : 'Crea tu cuenta de Focusly'}
      description={status === 'success' ? undefined : 'Sin tarjeta de crédito. Puedes cambiar de plan cuando quieras.'}
    >
      {status === 'success' ? (
        <div className="text-center" role="status">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft">
            <CircleCheck className="size-7 text-success" aria-hidden="true" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            Hemos enviado un enlace de acceso a <strong className="font-semibold text-fg">{email.trim()}</strong> para activar tu
            plan <strong className="font-semibold text-fg">{planName}</strong>.
          </p>
          <p className="mt-2 text-xs text-fg-subtle">Es una demo: no se ha enviado ningún correo real.</p>
          <Button ref={successButton} className="mt-6" fullWidth onClick={onClose}>
            Ir a mi espacio
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-fg">Plan</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PLANS.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    selectedPlan === item.id
                      ? 'border-accent bg-accent-soft text-accent-text'
                      : 'border-line text-fg-muted hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={item.id}
                    checked={selectedPlan === item.id}
                    onChange={() => setSelectedPlan(item.id)}
                    className="sr-only"
                    disabled={status === 'submitting'}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={emailId} className="text-sm font-medium text-fg">
              Correo electrónico
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              data-autofocus
              placeholder="nombre@empresa.com"
              value={email}
              disabled={status === 'submitting'}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                if (touched) setError(validateEmail(event.target.value));
              }}
              onBlur={() => {
                if (email.trim()) {
                  setTouched(true);
                  setError(validateEmail(email));
                }
              }}
              className={cn(
                'mt-2 h-11 w-full rounded-xl border bg-surface px-3.5 text-sm text-fg placeholder:text-fg-subtle',
                'transition-colors focus-visible:outline-2',
                error ? 'border-danger focus-visible:outline-danger' : 'border-line hover:border-line-strong',
                'disabled:opacity-60',
              )}
            />
            {error && (
              <p id={errorId} className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          <Button type="submit" fullWidth size="lg" disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
            {status === 'submitting' ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Creando cuenta…
              </>
            ) : selectedPlan === 'free' ? (
              'Crear cuenta gratis'
            ) : (
              `Empezar con ${planName}`
            )}
          </Button>
          <p className="text-center text-xs text-fg-subtle">
            Al continuar aceptas los términos del servicio. Esto es una demo: no se guarda ningún dato.
          </p>
        </form>
      )}
    </Dialog>
  );
}
