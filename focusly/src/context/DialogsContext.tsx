import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PlanId } from '../types';
import type { LegalDocId } from '../data/legal';
import { SignupDialog } from '../components/dialogs/SignupDialog';
import { LegalDialog } from '../components/dialogs/LegalDialog';

interface DialogsContextValue {
  openSignup: (plan?: PlanId) => void;
  openLegal: (doc: LegalDocId) => void;
}

const DialogsContext = createContext<DialogsContextValue | null>(null);

/** Centraliza los diálogos globales para que cualquier botón pueda abrirlos. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [signupPlan, setSignupPlan] = useState<PlanId | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  const openSignup = useCallback((plan: PlanId = 'free') => setSignupPlan(plan), []);
  const openLegal = useCallback((doc: LegalDocId) => setLegalDoc(doc), []);
  const value = useMemo(() => ({ openSignup, openLegal }), [openSignup, openLegal]);

  return (
    <DialogsContext.Provider value={value}>
      {children}
      <SignupDialog plan={signupPlan} onClose={() => setSignupPlan(null)} />
      <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsContextValue {
  const context = useContext(DialogsContext);
  if (!context) throw new Error('useDialogs debe usarse dentro de <DialogsProvider>');
  return context;
}
