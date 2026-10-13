import { cn } from "@/lib/utils";
import { fieldClass } from "./input";

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-11 pr-8", fieldClass, className)} {...props} />;
}
