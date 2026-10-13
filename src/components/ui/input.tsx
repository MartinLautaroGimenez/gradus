import { cn } from "@/lib/utils";

/** Campo "relleno" (Material 3 / iOS): fondo gris suave, sin borde hasta enfocar. */
export const fieldClass =
  "w-full rounded-xl border border-transparent bg-surface-muted px-3.5 text-[15px] text-foreground " +
  "placeholder:text-muted/80 focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/15 " +
  "disabled:opacity-60";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-11", fieldClass, className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-muted", className)} {...props} />;
}
