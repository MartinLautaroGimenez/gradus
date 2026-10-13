"use client";

import { useEffect, useRef } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/lib/use-form-action";
import type { FormState } from "@/lib/validation";

/** Caja para escribir. Enter envía; Shift+Enter hace un salto de línea. */
export function Composer({ action, placeholder = "Escribí un mensaje…" }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; placeholder?: string }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok && textRef.current) {
      textRef.current.value = "";
      textRef.current.focus();
    }
  }, [state]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
      <textarea
        ref={textRef}
        name="body"
        rows={1}
        required
        maxLength={4000}
        placeholder={placeholder}
        aria-label="Mensaje"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-2 focus:outline-primary-soft"
      />
      <Button type="submit" disabled={pending} aria-label="Enviar" className="px-3">
        <SendHorizontal className="size-4" aria-hidden />
      </Button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
