"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { RELATIONSHIP_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function StudentFileForm({
  action,
  student,
}: {
  action: Action;
  student: { fileNumber: string; birthDate: string; address: string | null; notes: string | null };
}) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Legajo" htmlFor="fileNumber" error={errors.fileNumber}>
        <Input id="fileNumber" name="fileNumber" defaultValue={student.fileNumber} required />
      </Field>
      <Field label="Fecha de nacimiento" htmlFor="birthDate" error={errors.birthDate}>
        <Input id="birthDate" name="birthDate" type="date" defaultValue={student.birthDate} />
      </Field>
      <Field label="Domicilio" htmlFor="address" error={errors.address} className="sm:col-span-2">
        <Input id="address" name="address" defaultValue={student.address ?? ""} />
      </Field>
      <Field label="Observaciones" htmlFor="notes" error={errors.notes} className="sm:col-span-2" hint="Visibles sólo para el personal">
        <textarea
          id="notes"
          name="notes"
          defaultValue={student.notes ?? ""}
          rows={3}
          className="w-full rounded-xl border border-transparent bg-surface-muted px-3.5 py-2.5 text-[15px] focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/15"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>Guardar legajo</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function AddGuardianForm({ action }: { action: Action }) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="DNI" htmlFor="g-dni" error={errors.dni}>
          <Input id="g-dni" name="dni" required inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Vínculo" htmlFor="g-relationship" error={errors.relationship}>
          <Select id="g-relationship" name="relationship" defaultValue="MADRE">
            {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2 pb-2.5">
          <input id="g-isPrimary" name="isPrimary" type="checkbox" className="size-4" defaultChecked />
          <Label htmlFor="g-isPrimary" className="font-normal">
            Responsable principal
          </Label>
        </div>
      </div>
      <details className="rounded-2xl bg-surface-muted p-4" open={!!errors.firstName}>
        <summary className="cursor-pointer text-sm text-muted">
          Si todavía no está registrado, completá sus datos para crear su cuenta
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Apellido" htmlFor="g-lastName" error={errors.lastName}>
            <Input id="g-lastName" name="lastName" autoComplete="off" />
          </Field>
          <Field label="Nombre" htmlFor="g-firstName" error={errors.firstName}>
            <Input id="g-firstName" name="firstName" autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="g-email" error={errors.email}>
            <Input id="g-email" name="email" type="email" autoComplete="off" />
          </Field>
          <Field label="Teléfono" htmlFor="g-phone" error={errors.phone}>
            <Input id="g-phone" name="phone" type="tel" autoComplete="off" />
          </Field>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary">Vincular</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ResetPasswordForm({ action }: { action: () => Promise<FormState> }) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div>
        <SubmitButton pending={pending}
          variant="secondary"
          pendingText="Restableciendo…"
          confirm="¿Restablecer la contraseña? Volverá a ser el DNI y se cerrarán sus sesiones abiertas."
        >
          Restablecer contraseña
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
