import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/inicio");

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <svg viewBox="0 0 32 32" className="size-16 drop-shadow-sm" aria-hidden>
            <rect width="32" height="32" rx="8" className="fill-primary" />
            <path d="M21.5 12.2A7 7 0 1 0 23 17h-6.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Ingresá a Gradus</h1>
            <p className="mt-1 text-[15px] text-muted">Con tu DNI o tu email</p>
          </div>
        </div>
        <LoginForm />
        <p className="mt-8 text-center text-[13px] text-muted">¿Olvidaste tu contraseña? Pedí en preceptoría que la restablezcan.</p>
      </div>
    </main>
  );
}
