"use client";

import type { Shift } from "@prisma/client";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { SHIFT_LABELS } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

type Option = { id: string; name: string };

export function CourseForm({
  action,
  preceptors,
  course,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  preceptors: Option[];
  course?: { grade: number; division: string; shift: Shift; preceptorId: string | null };
  submitLabel: string;
}) {
  const [state, onSubmit, pending] = useFormAction(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[110px_110px_1fr_1.5fr]">
        <Field label="Año" htmlFor="grade" error={errors.grade}>
          <Select id="grade" name="grade" defaultValue={course?.grade ?? 1} disabled={!!course}>
            {[1, 2, 3, 4, 5, 6, 7].map((grade) => (
              <option key={grade} value={grade}>
                {grade}°
              </option>
            ))}
          </Select>
        </Field>
        <Field label="División" htmlFor="division" error={errors.division}>
          <Input id="division" name="division" defaultValue={course?.division} placeholder="A" required maxLength={3} />
        </Field>
        <Field label="Turno" htmlFor="shift" error={errors.shift}>
          <Select id="shift" name="shift" defaultValue={course?.shift ?? "MANANA"}>
            {Object.entries(SHIFT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preceptor/a" htmlFor="preceptorId" error={errors.preceptorId}>
          <Select id="preceptorId" name="preceptorId" defaultValue={course?.preceptorId ?? ""}>
            <option value="">Sin asignar</option>
            {preceptors.map((preceptor) => (
              <option key={preceptor.id} value={preceptor.id}>
                {preceptor.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
