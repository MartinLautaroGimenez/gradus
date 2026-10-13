"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { Logo } from "@/components/logo";
import { NavLinks } from "./nav-links";

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

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          {bell}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface-muted"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-surface p-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted hover:bg-surface-muted"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks roles={roles} badges={badges} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
