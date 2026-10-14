"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/use-form-action";
import { verifyLogin, type VerifyState } from "../actions";

export function VerifyForm() {
  const [state, onSubmit, pending] = useFormAction<VerifyState>(verifyLogin, {});

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        id="code"
        name="code"
        inputMode="text"
        autoComplete="one-time-code"
        placeholder="Código"
        aria-label="Código de verificación"
        maxLength={20}
        required
        autoFocus
        className="h-12 text-center text-[20px] tracking-[0.3em]"
      />
      {state.error && (
        <p role="alert" className="text-center text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 h-12 text-[17px]">
        {pending ? "Verificando…" : "Continuar"}
      </Button>
    </form>
  );
}
