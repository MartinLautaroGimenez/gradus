"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { changePassword } from "./actions";

export function PasswordForm({ firstTime }: { firstTime: boolean }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(changePassword, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label={firstTime ? "Contraseña inicial (la que te dio la escuela)" : "Contraseña actual"}
        htmlFor="current"
        error={errors.current}
      >
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Contraseña nueva" htmlFor="password" error={errors.password} hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Puede ser una frase: \"mate con tostadas\".`}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </Field>
      <Field label="Repetí la contraseña nueva" htmlFor="confirm" error={errors.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Cambiar contraseña</SubmitButton>
    </form>
  );
}
