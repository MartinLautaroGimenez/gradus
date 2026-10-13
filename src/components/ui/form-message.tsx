import type { FormState } from "@/lib/validation";
import { cn } from "@/lib/utils";

/** Muestra el resultado general de una server action. */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (state.error) {
    return (
      <p role="alert" className={cn("rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger", className)}>
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className={cn("rounded-lg bg-success-soft px-3 py-2 text-sm text-success", className)}>
        {state.message}
      </p>
    );
  }
  return null;
}
