"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { createAuthorization } from "../actions";

export function AuthorizationForm({ courses }: { courses: { id: string; label: string }[] }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(createAuthorization, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Título" htmlFor="title" error={errors.title}>
        <Input id="title" name="title" maxLength={120} required placeholder="Salida al Museo de Ciencias" />
      </Field>
      <Field label="Detalle" htmlFor="description" error={errors.description} hint="Día, horario, lugar, qué llevar, costo…">
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la actividad" htmlFor="eventDate" error={errors.eventDate} hint="Opcional">
          <Input id="eventDate" name="eventDate" type="date" />
        </Field>
        <Field label="Responder hasta" htmlFor="deadline" error={errors.deadline} hint="Opcional">
          <Input id="deadline" name="deadline" type="date" />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Cursos</legend>
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary-soft"
            >
              <input type="checkbox" name="courseIds" value={c.id} className="size-4" />
              {c.label}
            </label>
          ))}
        </div>
        {errors.courseIds && <p className="text-xs text-danger">{errors.courseIds[0]}</p>}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="addToCalendar" defaultChecked className="size-4" />
        Agregar la actividad al calendario de esos cursos
      </label>
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingText="Enviando…">
          Pedir autorización a las familias
        </SubmitButton>
      </div>
    </form>
  );
}
