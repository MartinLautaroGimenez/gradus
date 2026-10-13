import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

export const buttonVariants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-surface-muted text-foreground hover:bg-border/70",
  ghost: "text-primary hover:bg-primary-soft",
};

export const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
  "disabled:pointer-events-none disabled:opacity-50 active:opacity-80";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}
