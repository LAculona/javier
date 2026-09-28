import { useEffect, useState } from 'react';
import { LEGAL_DOCS, type LegalDocId } from '../../data/legal';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export function LegalDialog({ doc, onClose }: { doc: LegalDocId | null; onClose: () => void }) {
  // Conserva el último documento mientras el diálogo se cierra.
  const [current, setCurrent] = useState<LegalDocId>('privacy');
  useEffect(() => {
    if (doc) setCurrent(doc);
  }, [doc]);
  const content = LEGAL_DOCS[doc ?? current];

  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title={content.title}
      description={`Última actualización: ${content.updated}`}
      className="max-w-lg"
    >
      <div className="space-y-5">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="text-sm font-semibold text-fg">{section.heading}</h3>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{section.body}</p>
          </section>
        ))}
        <p className="rounded-xl bg-subtle p-3 text-xs text-fg-subtle">
          Focusly es un producto ficticio creado como demostración.
        </p>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Entendido
        </Button>
      </div>
    </Dialog>
  );
}
