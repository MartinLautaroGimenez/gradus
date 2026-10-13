"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { createAnnouncement } from "../actions";

const chip =
  "flex cursor-pointer items-center gap-2 rounded-full bg-surface-muted px-4 py-2 text-[14px] has-checked:bg-primary-soft has-checked:text-primary";

export function AnnouncementForm({
  roles,
  roleLabels,
  courses,
  canSendSchoolWide,
}: {
  roles: Role[];
  roleLabels: Partial<Record<Role, string>>;
  courses: { id: string; label: string }[];
  canSendSchoolWide: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(createAnnouncement, {});
  const [scope, setScope] = useState<"escuela" | "cursos">(canSendSchoolWide ? "escuela" : "cursos");
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="Título" htmlFor="title" error={errors.title}>
        <Input id="title" name="title" maxLength={120} required placeholder="Reunión de padres de 1° año" />
      </Field>
      <Field label="Mensaje" htmlFor="body" error={errors.body}>
        <textarea
          id="body"
          name="body"
          rows={8}
          required
          maxLength={10000}
          className="w-full rounded-xl border border-transparent bg-surface-muted px-3.5 py-2.5 text-[15px] focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/15"
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">¿Para quién es?</legend>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <label key={role} className={chip}>
              <input type="checkbox" name="roles" value={role} defaultChecked={role === "TUTOR"} className="size-4" />
              {roleLabels[role]}
            </label>
          ))}
        </div>
        {errors.roles && <p className="text-xs text-danger">{errors.roles[0]}</p>}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">¿De qué cursos?</legend>
        {canSendSchoolWide && (
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
        )}
        {!canSendSchoolWide && <input type="hidden" name="scope" value="cursos" />}
        {scope === "cursos" && (
          <div className="flex flex-wrap gap-2">
            {courses.map((course) => (
              <label key={course.id} className={chip}>
                <input type="checkbox" name="courseIds" value={course.id} className="size-4" />
                {course.label}
              </label>
            ))}
          </div>
        )}
        {errors.courseIds && <p className="text-xs text-danger">{errors.courseIds[0]}</p>}
      </fieldset>

      <Field label="Adjuntos" htmlFor="files" error={errors.files} hint="Hasta 5 archivos de 10 MB (PDF, imágenes, Word, Excel)">
        <input
          id="files"
          name="files"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
        />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="requiresAck" className="mt-0.5 size-4" />
        <span>
          Pedir que se notifiquen
          <span className="block text-xs text-muted">Cada destinatario tiene que tocar “Me notifico”. Vas a ver quién falta.</span>
        </span>
      </label>

      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending} pendingText="Enviando…">
          Enviar comunicado
        </SubmitButton>
      </div>
    </form>
  );
}
