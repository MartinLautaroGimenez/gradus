"use client";

import { useState } from "react";
import type { EventKind } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { EVENT_LABELS } from "@/lib/calendar";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

const chip =
  "flex cursor-pointer items-center gap-2 rounded-full bg-surface-muted px-4 py-2 text-[14px] has-checked:bg-primary-soft has-checked:text-primary";

export type EventValues = {
  title: string;
  description: string | null;
  kind: EventKind;
  startDate: string;
  endDate: string | null;
  time: string | null;
  location: string | null;
  courseIds: string[];
};

export function EventForm({
  action,
  kinds,
  courses,
  canSchoolWide,
  event,
  defaultDate,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  kinds: EventKind[];
  courses: { id: string; label: string }[];
  canSchoolWide: boolean;
  event?: EventValues;
  defaultDate: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [scope, setScope] = useState(event ? (event.courseIds.length ? "cursos" : "escuela") : canSchoolWide ? "escuela" : "cursos");
  const [multiDay, setMultiDay] = useState(!!event?.endDate);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Título" htmlFor="title" error={errors.title}>
          <Input id="title" name="title" defaultValue={event?.title} maxLength={120} required />
        </Field>
        <Field label="Tipo" htmlFor="kind" error={errors.kind}>
          <Select id="kind" name="kind" defaultValue={event?.kind ?? kinds[0]}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {EVENT_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={multiDay ? "Desde" : "Fecha"} htmlFor="startDate" error={errors.startDate}>
          <Input id="startDate" name="startDate" type="date" defaultValue={event?.startDate ?? defaultDate} required />
        </Field>
        {multiDay ? (
          <Field label="Hasta" htmlFor="endDate" error={errors.endDate}>
            <Input id="endDate" name="endDate" type="date" defaultValue={event?.endDate ?? ""} required />
          </Field>
        ) : (
          <Field label="Hora" htmlFor="time" error={errors.time} hint="Opcional">
            <Input id="time" name="time" type="time" defaultValue={event?.time ?? ""} />
          </Field>
        )}
        <Field label="Lugar" htmlFor="location" error={errors.location} hint="Opcional">
          <Input id="location" name="location" defaultValue={event?.location ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="size-4" />
        Dura varios días
      </label>
      <Field label="Detalle" htmlFor="description" error={errors.description} hint="Opcional">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
          className="w-full rounded-xl border border-transparent bg-surface-muted px-3.5 py-2.5 text-[15px] focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/15"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">¿Para quién?</legend>
        {canSchoolWide ? (
          <div className="flex flex-wrap gap-2">
            <label className={chip}>
              <input type="radio" name="scope" value="escuela" checked={scope === "escuela"} onChange={() => setScope("escuela")} className="size-4" />
              Toda la escuela
            </label>
            <label className={chip}>
              <input type="radio" name="scope" value="cursos" checked={scope === "cursos"} onChange={() => setScope("cursos")} className="size-4" />
              Cursos específicos
            </label>
          </div>
        ) : (
          <input type="hidden" name="scope" value="cursos" />
        )}
        {scope === "cursos" && (
          <div className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <label key={c.id} className={chip}>
                <input type="checkbox" name="courseIds" value={c.id} defaultChecked={event?.courseIds.includes(c.id)} className="size-4" />
                {c.label}
              </label>
            ))}
          </div>
        )}
        {errors.courseIds && <p className="text-xs text-danger">{errors.courseIds[0]}</p>}
      </fieldset>
      {!event && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked className="size-4" />
          Avisar a las familias y alumnos
        </label>
      )}
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending}>{event ? "Guardar cambios" : "Agregar al calendario"}</SubmitButton>
      </div>
    </form>
  );
}
