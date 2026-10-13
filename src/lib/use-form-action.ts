"use client";

import { startTransition, useActionState } from "react";

/**
 * Como useActionState, pero el formulario se envía con onSubmit en lugar de
 * `action`. React 19 vacía los formularios con `action` después de cada envío:
 * si había un error de validación, la persona perdía todo lo que había escrito
 * (y la importación perdía el archivo elegido entre la vista previa y la
 * confirmación).
 */
export function useFormAction<State>(
  action: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initialState: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return [state, onSubmit, pending] as const;
}
