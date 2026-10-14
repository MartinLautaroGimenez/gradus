import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { challengeCookieName } from "@/lib/auth/challenge-cookie";
import { hashToken } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verificación" };

export default async function VerifyPage() {
  const token = (await cookies()).get(challengeCookieName())?.value;
  const challenge = token
    ? await db.loginChallenge.findUnique({ where: { tokenHash: hashToken(token) }, select: { expiresAt: true } })
    : null;
  if (!challenge || challenge.expiresAt < new Date()) redirect("/login");

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-bold tracking-tight">Verificación en dos pasos</h1>
          <p className="mt-2 text-[15px] text-muted">Escribí el código de 6 números que muestra tu app de autenticación.</p>
        </div>
        <VerifyForm />
        <p className="mt-8 text-center text-[13px] text-muted">
          ¿No tenés el teléfono? Usá uno de tus códigos de recuperación.{" "}
          <Link href="/login" className="text-primary">Volver</Link>
        </p>
      </div>
    </main>
  );
}
