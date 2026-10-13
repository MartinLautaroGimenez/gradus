import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { initials } from "@/lib/utils";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
        {initials(user)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {user.firstName} {user.lastName}
        </p>
        <p className="truncate text-xs text-muted">{user.roles.map((role) => ROLE_LABELS[role]).join(" · ")}</p>
      </div>
      <Link
        href="/cuenta/contrasena"
        title="Cambiar contraseña"
        className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-foreground"
      >
        <KeyRound className="size-4" aria-hidden />
        <span className="sr-only">Cambiar contraseña</span>
      </Link>
      <form action={logout}>
        <button
          type="submit"
          title="Cerrar sesión"
          className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}
