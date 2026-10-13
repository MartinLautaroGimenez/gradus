import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonBase, buttonVariants } from "./button";

export function LinkButton({
  className,
  variant = "primary",
  ...props
}: React.ComponentProps<typeof Link> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <Link className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}
