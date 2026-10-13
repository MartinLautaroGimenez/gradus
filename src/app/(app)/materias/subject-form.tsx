"use client";

import { useRef } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

type SubjectValues = { name: string; shortName: string | null; grade: number; weeklyHours: number | null };

export function SubjectForm({
  action,
  subject,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  subject?: SubjectValues;
  submitLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    // Al crear, se limpia el nombre para cargar la siguiente materia rápido.
    if (result.ok && !subject) {
      const name = formRef.current?.elements.namedItem("name") as HTMLInputElement | null;
      if (name) {
        name.value = "";
        name.focus();
      }
    }
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[110px_2fr_1fr_110px]">
        <Field label="Año" htmlFor="grade" error={errors.grade}>
          <Select id="grade" name="grade" defaultValue={subject?.grade ?? 1}>
            {[1, 2, 3, 4, 5, 6, 7].map((grade) => (
              <option key={grade} value={grade}>
                {grade}° año
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" defaultValue={subject?.name} placeholder="Matemática" required />
        </Field>
        <Field label="Abreviatura" htmlFor="shortName" error={errors.shortName}>
          <Input id="shortName" name="shortName" defaultValue={subject?.shortName ?? ""} placeholder="MAT" />
        </Field>
        <Field label="Hs. semanales" htmlFor="weeklyHours" error={errors.weeklyHours}>
          <Input id="weeklyHours" name="weeklyHours" type="number" min={1} defaultValue={subject?.weeklyHours ?? ""} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
