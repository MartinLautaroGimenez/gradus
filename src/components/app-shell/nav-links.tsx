"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { NAV_GROUP_LABELS, type NavItem, isActive, navItemsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function CountBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Menú lateral (escritorio) y lista del "Más" (celular), agrupado por sección. */
export function NavLinks({
  roles,
  badges = {},
  exclude = [],
  onNavigate,
}: {
  roles: Role[];
  /** Contadores por ruta (por ejemplo, mensajes sin leer). */
  badges?: Record<string, number>;
  exclude?: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = navItemsFor(roles).filter((i) => !exclude.includes(i.href));
  const groups = (Object.keys(NAV_GROUP_LABELS) as NavItem["group"][])
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="flex flex-col gap-5" aria-label="Principal">
      {groups.map(({ group, items }) => (
        <div key={group} className="flex flex-col gap-0.5">
          {NAV_GROUP_LABELS[group] && <p className="px-3 pb-1 text-[12px] font-medium text-muted">{NAV_GROUP_LABELS[group]}</p>}
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors",
                  active ? "bg-surface font-medium text-foreground shadow-card" : "text-foreground/80 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                )}
              >
                <Icon className={cn("size-[18px]", active ? "text-primary" : "text-muted")} strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{label}</span>
                <CountBadge count={badges[href]} />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
