"use client";

import { useState } from "react";
import type { IncidentKind } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { INCIDENT_LABELS, signatureByDefault } from "@/lib/discipline";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { createIncident } from "../actions";

export function IncidentForm({
  students,
  kinds,
  today,
  preselected,
}: {
  students: { enrollmentId: string; name: string }[];
  kinds: IncidentKind[];
  today: string;
  preselected?: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(createIncident, {});
  const [kind, setKind] = useState<IncidentKind>(kinds.includes("OBSERVACION") ? "OBSERVACION" : kinds[0]);
  const [requiresSignature, setRequiresSignature] = useState(signatureByDefault(kind));
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Alumno" htmlFor="enrollmentId" error={errors.enrollmentId} className="sm:col-span-2">
          <Select id="enrollmentId" name="enrollmentId" required defaultValue={preselected ?? ""}>
            <option value="" disabled>
              Elegí un alumno…
            </option>
            {students.map((s) => (
              <option key={s.enrollmentId} value={s.enrollmentId}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" htmlFor="date" error={errors.date}>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
      </div>
      <Field label="Tipo" htmlFor="kind" error={errors.kind}>
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as IncidentKind;
            setKind(next);
            setRequiresSignature(signatureByDefault(next));
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {INCIDENT_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Qué pasó" htmlFor="description" error={errors.description}>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          maxLength={4000}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
        />
      </Field>
      <Field label="Medidas o acciones reparadoras" htmlFor="measures" error={errors.measures} hint="Opcional">
        <textarea
          id="measures"
          name="measures"
          rows={3}
          maxLength={4000}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="requiresSignature"
          checked={requiresSignature}
          onChange={(e) => setRequiresSignature(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          Pedir la firma de la familia
          <span className="block text-xs text-muted">La familia confirma que se notificó y puede dejar un comentario.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <div>
        <SubmitButton pending={pending}>Registrar</SubmitButton>
      </div>
    </form>
  );
}
