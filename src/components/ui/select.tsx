import { cn } from "@/lib/utils";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground",
        "focus:border-primary focus:outline-2 focus:outline-primary-soft disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
