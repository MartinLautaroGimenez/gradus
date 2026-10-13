"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

type PersonValues = {
  firstName: string;
  lastName: string;
  dni: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
};

export function PersonForm({
  action,
  person,
  assignableRoles,
  rolesLocked = false,
  courses,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  person?: PersonValues;
  assignableRoles: Role[];
  /** Al editarse a uno mismo los roles no se pueden cambiar. */
  rolesLocked?: boolean;
  /** Sólo al crear: cursos del ciclo activo para matricular al alumno. */
  courses?: { id: string; label: string }[];
  submitLabel: string;
}) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  const [roles, setRoles] = useState<Role[]>(person?.roles ?? []);
  const errors = state.fieldErrors ?? {};
  const isNew = !person;

  function toggle(role: Role, checked: boolean) {
    setRoles((current) => (checked ? [...current, role] : current.filter((r) => r !== role)));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Apellido" htmlFor="lastName" error={errors.lastName}>
          <Input id="lastName" name="lastName" defaultValue={person?.lastName} required autoComplete="off" />
        </Field>
        <Field label="Nombre" htmlFor="firstName" error={errors.firstName}>
          <Input id="firstName" name="firstName" defaultValue={person?.firstName} required autoComplete="off" />
        </Field>
        <Field
          label="DNI"
          htmlFor="dni"
          error={errors.dni}
          hint={isNew ? "También es la contraseña inicial" : undefined}
        >
          <Input id="dni" name="dni" defaultValue={person?.dni} required inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email} hint="Opcional">
          <Input id="email" name="email" type="email" defaultValue={person?.email ?? ""} autoComplete="off" />
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={errors.phone} hint="Opcional">
          <Input id="phone" name="phone" type="tel" defaultValue={person?.phone ?? ""} autoComplete="off" />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Roles</legend>
        <div className="flex flex-wrap gap-2">
          {assignableRoles.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft has-disabled:cursor-default has-disabled:opacity-70"
            >
              <input
                type="checkbox"
                name="roles"
                value={role}
                checked={roles.includes(role)}
                onChange={(event) => toggle(role, event.target.checked)}
                disabled={rolesLocked}
                className="size-4"
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        {rolesLocked && <p className="text-xs text-muted">No podés cambiar tus propios roles.</p>}
        {errors.roles && <p className="text-xs text-danger">{errors.roles[0]}</p>}
      </fieldset>

      {isNew && roles.includes("ALUMNO") && (
        <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Datos del alumno</legend>
          <Field label="Legajo" htmlFor="fileNumber" error={errors.fileNumber} hint="Si queda vacío se usa el DNI">
            <Input id="fileNumber" name="fileNumber" />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="birthDate" error={errors.birthDate}>
            <Input id="birthDate" name="birthDate" type="date" />
          </Field>
          <Field label="Curso" htmlFor="courseId" error={errors.courseId}>
            <Select id="courseId" name="courseId" defaultValue="">
              <option value="">Sin matricular</option>
              {courses?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.label}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
