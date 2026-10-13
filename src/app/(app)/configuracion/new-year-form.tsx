"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { createAcademicYear } from "./actions";

export function NewYearForm({ suggestedYear, copySource }: { suggestedYear: number; copySource?: { id: string; year: number } }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(createAcademicYear, {});

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Año" htmlFor="year" error={state.fieldErrors?.year} className="w-32">
          <Input id="year" name="year" type="number" defaultValue={suggestedYear} required />
        </Field>
        <SubmitButton pending={pending} pendingText="Creando…">Crear ciclo</SubmitButton>
      </div>
      {copySource && (
        <div className="flex items-center gap-2">
          <input id="copyFrom" type="checkbox" name="copyFrom" value={copySource.id} defaultChecked className="size-4" />
          <Label htmlFor="copyFrom" className="font-normal">
            Copiar cursos, preceptores, materias y docentes del ciclo {copySource.year}
          </Label>
        </div>
      )}
      <p className="text-xs text-muted">
        Se crean dos cuatrimestres y las instancias de diciembre y febrero. Las fechas se ajustan después.
      </p>
      <FormMessage state={state} />
    </form>
  );
}
