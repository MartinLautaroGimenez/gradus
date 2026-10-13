"use client";

import type { PeriodKind } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { PERIOD_KIND_LABELS } from "@/lib/periods";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function YearDatesForm({ action, startDate, endDate }: { action: Action; startDate: string; endDate: string }) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Field label="Inicio" htmlFor="startDate" error={state.fieldErrors?.startDate}>
        <Input id="startDate" name="startDate" type="date" defaultValue={startDate} required />
      </Field>
      <Field label="Fin" htmlFor="endDate" error={state.fieldErrors?.endDate}>
        <Input id="endDate" name="endDate" type="date" defaultValue={endDate} required />
      </Field>
      <SubmitButton pending={pending}>Guardar fechas</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function PeriodForm({
  action,
  period,
}: {
  action: Action;
  period: { id: string; name: string; kind: PeriodKind; startDate: string; endDate: string; closed: boolean };
}) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  const errors = state.fieldErrors ?? {};
  const id = (field: string) => `${field}-${period.id}`;

  return (
    <form onSubmit={onSubmit} className="grid items-end gap-3 border-b border-border py-4 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
      <Field label="Nombre" htmlFor={id("name")} error={errors.name}>
        <Input id={id("name")} name="name" defaultValue={period.name} required />
      </Field>
      <Field label="Tipo" htmlFor={id("kind")} error={errors.kind}>
        <Select id={id("kind")} name="kind" defaultValue={period.kind}>
          {Object.entries(PERIOD_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Inicio" htmlFor={id("startDate")} error={errors.startDate}>
        <Input id={id("startDate")} name="startDate" type="date" defaultValue={period.startDate} required />
      </Field>
      <Field label="Fin" htmlFor={id("endDate")} error={errors.endDate}>
        <Input id={id("endDate")} name="endDate" type="date" defaultValue={period.endDate} required />
      </Field>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input id={id("closed")} name="closed" type="checkbox" defaultChecked={period.closed} className="size-4" />
          <Label htmlFor={id("closed")} className="font-normal">
            Cerrado
          </Label>
        </div>
        <SubmitButton pending={pending} variant="secondary">Guardar</SubmitButton>
      </div>
      {(state.error || state.ok) && <FormMessage state={state} className="sm:col-span-5" />}
    </form>
  );
}
