"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

export function SignForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="comment" className="text-sm font-medium">
        Comentario o descargo <span className="font-normal text-muted">(opcional)</span>
      </label>
      <textarea
        id="comment"
        name="comment"
        rows={3}
        maxLength={2000}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingText="Firmando…">
          Firmar notificación
        </SubmitButton>
      </div>
      <p className="text-xs text-muted">Firmar confirma que te notificaste. Queda registrado con tu nombre, fecha y hora.</p>
    </form>
  );
}
