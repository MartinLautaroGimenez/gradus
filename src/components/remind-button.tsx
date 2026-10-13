"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

export function RemindButton({ action, pendingCount }: { action: () => Promise<FormState>; pendingCount: number }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <SubmitButton
        variant="secondary"
        pending={pending}
        pendingText="Enviando…"
        disabled={pendingCount === 0}
        confirm={`¿Enviar un recordatorio a ${pendingCount} ${pendingCount === 1 ? "persona" : "personas"}?`}
      >
        Recordar a quienes faltan ({pendingCount})
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
