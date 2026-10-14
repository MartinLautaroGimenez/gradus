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

type SchoolData = Pick<School, "name" | "shortName" | "gradeDecimals" | "maxAbsences" | "justifiedCount" | "require2faForStaff"> & {
  passingGrade: number;
  lateValue: number;
  earlyLeaveValue: number;
};

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
      <Field label="Llegada tarde equivale a" htmlFor="lateValue" error={errors.lateValue} hint="Fracción de falta (0,25 = un cuarto)">
        <Input id="lateValue" name="lateValue" inputMode="decimal" defaultValue={String(school?.lateValue ?? 0.25).replace(".", ",")} required />
      </Field>
      <Field label="Retiro anticipado equivale a" htmlFor="earlyLeaveValue" error={errors.earlyLeaveValue} hint="Fracción de falta (0,5 = media)">
        <Input
          id="earlyLeaveValue"
          name="earlyLeaveValue"
          inputMode="decimal"
          defaultValue={String(school?.earlyLeaveValue ?? 0.5).replace(".", ",")}
          required
        />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="justifiedCount" defaultChecked={school?.justifiedCount ?? true} className="size-4" />
        Las inasistencias justificadas suman para el tope
      </label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="require2faForStaff" defaultChecked={school?.require2faForStaff ?? false} className="mt-0.5 size-4" />
        <span>
          Exigir verificación en dos pasos a dirección, administración y administradores del sistema
          {errors.require2faForStaff && <span className="block text-danger">{errors.require2faForStaff[0]}</span>}
        </span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>Guardar</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
