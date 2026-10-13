"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { navItemsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ roles, onNavigate }: { roles: Role[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Principal">
      {navItemsFor(roles).map(({ href, label, icon: Icon, available }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium";

        if (!available) {
          return (
            <span key={href} className={cn(base, "cursor-default text-muted/70")} aria-disabled="true">
              <Icon className="size-4.5" aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide">Pronto</span>
            </span>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              base,
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
