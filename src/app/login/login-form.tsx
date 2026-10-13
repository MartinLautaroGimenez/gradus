"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Input
        id="identifier"
        name="identifier"
        autoComplete="username"
        placeholder="DNI o email"
        aria-label="DNI o email"
        defaultValue={state.identifier}
        required
        autoFocus
        className="h-12 text-[17px]"
      />
      <Input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Contraseña"
        aria-label="Contraseña"
        required
        className="h-12 text-[17px]"
      />
      {state.error && (
        <p role="alert" className="text-center text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2 h-12 text-[17px]">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
