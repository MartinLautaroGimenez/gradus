"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

const option =
  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary";

export function ResponseForm({
  action,
  enrollmentId,
  name,
  current,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  enrollmentId: string;
  name: string;
  current?: { authorized: boolean; comment: string | null };
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <div className="flex gap-2" role="radiogroup" aria-label={`Respuesta para ${name}`}>
        <label className={option}>
          <input type="radio" name="authorized" value="si" defaultChecked={current?.authorized === true} required className="size-4" />
          Autorizo a {name}
        </label>
        <label className={option}>
          <input type="radio" name="authorized" value="no" defaultChecked={current?.authorized === false} className="size-4" />
          No autorizo
        </label>
      </div>
      <textarea
        name="comment"
        rows={2}
        maxLength={1000}
        defaultValue={current?.comment ?? ""}
        placeholder="Comentario (opcional): alergias, quién lo retira, etc."
        aria-label="Comentario"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
      />
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending}>{current ? "Cambiar respuesta" : "Enviar respuesta"}</SubmitButton>
      </div>
    </form>
  );
}
