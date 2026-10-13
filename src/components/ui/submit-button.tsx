"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  confirm,
  pending,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & {
  pendingText?: string;
  confirm?: string;
  /** Para formularios con useFormAction (useFormStatus sólo ve los que usan `action`). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const isPending = pending ?? status.pending;
  return (
    <Button
      {...props}
      type="submit"
      disabled={isPending || disabled}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
        onClick?.(event);
      }}
    >
      {isPending ? pendingText : children}
    </Button>
  );
}
