"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { Logo } from "@/components/logo";
import { NAV_ITEMS, TAB_BAR_HREFS, isActive, navItemsFor } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { CountBadge, NavLinks } from "./nav-links";

/**
 * En el celular: barra superior mínima y barra de pestañas abajo (al alcance
 * del pulgar), como las apps de iOS y Android. Lo que no entra va en "Más".
 */
export function MobileNav({
  roles,
  badges,
  footer,
  bell,
}: {
  roles: Role[];
  badges: Record<string, number>;
  footer: React.ReactNode;
  bell: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const visible = navItemsFor(roles);
  const tabs = TAB_BAR_HREFS.map((href) => NAV_ITEMS.find((i) => i.href === href)!).filter((tab) => visible.includes(tab));
  const moreActive = !tabs.some((t) => isActive(pathname, t.href)) && !open;

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between bg-background/80 px-4 backdrop-blur-xl md:hidden">
        <Logo />
        {bell}
      </header>

      <nav
        aria-label="Principal"
        className="hairline fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium", active ? "text-primary" : "text-muted")}
                >
                  <Icon className="size-6" strokeWidth={active ? 2 : 1.6} aria-hidden />
                  {label}
                  <CountBadge count={badges[href]} className="absolute top-1 left-1/2 ml-1.5" />
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn("flex w-full flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium", moreActive ? "text-primary" : "text-muted")}
            >
              <Ellipsis className="size-6" strokeWidth={1.6} aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Más opciones">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 rounded-t-3xl bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-float">
            <div className="mx-auto h-1 w-9 rounded-full bg-border" aria-hidden />
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold tracking-tight">Más</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full bg-surface-muted text-muted"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto">
              <NavLinks roles={roles} badges={badges} exclude={tabs.map((t) => t.href)} onNavigate={() => setOpen(false)} />
            </div>
            <div className="rounded-2xl bg-surface p-3 shadow-card">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
