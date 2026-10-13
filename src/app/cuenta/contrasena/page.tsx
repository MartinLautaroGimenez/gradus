import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { getCurrentUser } from "@/lib/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Cambiar contraseña" };

export default async function ContrasenaPage() {
  // No usa requireUser(): esa función redirige acá y armaría un bucle.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const firstTime = user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="text-2xl" />
          <h1 className="text-lg font-semibold">{firstTime ? `¡Hola, ${user.firstName}!` : "Cambiar contraseña"}</h1>
          {firstTime && (
            <p className="text-sm text-muted">Es tu primer ingreso. Elegí una contraseña nueva para continuar.</p>
          )}
        </div>
        <div className="rounded-2xl bg-surface p-6 shadow-card">
          <PasswordForm firstTime={firstTime} />
        </div>
        <div className="mt-6 text-center text-sm">
          {firstTime ? (
            <form action={logout}>
              <button type="submit" className="text-muted hover:text-foreground hover:underline">
                Salir
              </button>
            </form>
          ) : (
            <Link href="/inicio" className="text-muted hover:text-foreground hover:underline">
              Volver
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
