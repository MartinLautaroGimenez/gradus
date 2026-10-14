import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { initials } from "@/lib/utils";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-white">
        {initials(user)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">
          {user.firstName} {user.lastName}
        </p>
        <p className="truncate text-[12px] text-muted">{user.roles.map((role) => ROLE_LABELS[role]).join(" · ")}</p>
      </div>
      <Link
        href="/cuenta/seguridad"
        title="Seguridad de la cuenta"
        className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
      >
        <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Seguridad de la cuenta</span>
      </Link>
      <form action={logout}>
        <button
          type="submit"
          title="Cerrar sesión"
          className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}
