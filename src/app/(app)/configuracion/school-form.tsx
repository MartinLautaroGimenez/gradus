"use client";

import type { School } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { updateSchool } from "./actions";

type SchoolData = Pick<School, "name" | "shortName" | "gradeDecimals" | "maxAbsences"> & { passingGrade: number };

export function SchoolForm({ school }: { school: SchoolData | null }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(updateSchool, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" htmlFor="name" error={errors.name} className="sm:col-span-2">
        <Input id="name" name="name" defaultValue={school?.name} required />
      </Field>
      <Field label="Sigla" htmlFor="shortName" error={errors.shortName}>
        <Input id="shortName" name="shortName" defaultValue={school?.shortName} required />
      </Field>
      <Field label="Nota de aprobación" htmlFor="passingGrade" error={errors.passingGrade} hint="Escala de 1 a 10">
        <Input
          id="passingGrade"
          name="passingGrade"
          type="number"
          step="0.01"
          min={1}
          max={10}
          defaultValue={school?.passingGrade ?? 7}
          required
        />
      </Field>
      <Field label="Decimales en los promedios" htmlFor="gradeDecimals" error={errors.gradeDecimals}>
        <Select id="gradeDecimals" name="gradeDecimals" defaultValue={school?.gradeDecimals ?? 2}>
          <option value={0}>Sin decimales (7)</option>
          <option value={1}>Uno (7,5)</option>
          <option value={2}>Dos (7,50)</option>
        </Select>
      </Field>
      <Field
        label="Tope de inasistencias"
        htmlFor="maxAbsences"
        error={errors.maxAbsences}
        hint="Por ciclo lectivo"
      >
        <Input id="maxAbsences" name="maxAbsences" type="number" min={1} defaultValue={school?.maxAbsences ?? 20} required />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>Guardar</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
