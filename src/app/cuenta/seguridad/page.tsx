import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { getCurrentUser, listSessions } from "@/lib/auth/session";
import { remainingRecoveryCodes } from "@/lib/auth/two-factor";
import { db } from "@/lib/db";
import { describeDevice } from "@/lib/device";
import { closeOtherSessions, closeSession } from "./actions";
import { DisableTwoFactor, RecoveryCodesCard, TwoFactorSetup } from "./two-factor";

export const metadata: Metadata = { title: "Seguridad de la cuenta" };

const dateTime = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Mendoza",
});

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ obligatorio?: string }> }) {
  // No usa requireUser(): esa función redirige acá cuando falta activar la verificación.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/cuenta/contrasena");
  const required = user.needsTwoFactorSetup || (await searchParams).obligatorio === "1";

  const [sessions, remaining, activity, account] = await Promise.all([
    listSessions(user.id),
    user.twoFactorEnabled ? remainingRecoveryCodes(user.id) : Promise.resolve(0),
    db.auditLog.findMany({
      where: { OR: [{ actorId: user.id }, { entity: "User", entityId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, summary: true, ip: true, createdAt: true },
    }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordChangedAt: true, totpEnabledAt: true } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        {user.needsTwoFactorSetup ? (
          <form action={logout}>
            <button type="submit" className="text-[15px] text-primary">Salir</button>
          </form>
        ) : (
          <Link href="/inicio" className="text-[15px] text-primary">Listo</Link>
        )}
      </div>
      <h1 className="text-[28px] font-bold tracking-tight">Seguridad de la cuenta</h1>
      {required && !user.twoFactorEnabled && (
        <p role="alert" className="mt-3 rounded-2xl bg-primary-soft px-4 py-3 text-[15px]">
          La escuela pide que quienes gestionan datos de todos los alumnos activen la verificación en dos pasos. Es una
          sola vez y lleva un minuto.
        </p>
      )}

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Verificación en dos pasos</h2>
        <Card>
          {user.twoFactorEnabled ? (
            <div className="flex flex-col gap-4">
              <div>
                <CardTitle>Activada</CardTitle>
                <CardDescription>
                  Desde el {dateTime.format(account.totpEnabledAt!)}. Además de la contraseña, se pide el código de la app.
                  Te quedan {remaining} códigos de recuperación.
                </CardDescription>
              </div>
              <RecoveryCodesCard />
              <DisableTwoFactor />
            </div>
          ) : (
            <TwoFactorSetup />
          )}
        </Card>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Contraseña</h2>
        <Link href="/cuenta/contrasena" className="flex items-center justify-between rounded-2xl bg-surface p-5 shadow-card">
          <span>
            <span className="block text-[17px] font-medium">Cambiar contraseña</span>
            <span className="block text-sm text-muted">
              {account.passwordChangedAt ? `Último cambio: ${dateTime.format(account.passwordChangedAt)}` : "Nunca la cambiaste desde acá"}
            </span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-semibold">Dispositivos con la sesión abierta</h2>
          {sessions.length > 1 && (
            <form action={closeOtherSessions}>
              <button type="submit" className="text-[15px] text-primary">Cerrar las demás</button>
            </form>
          )}
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">
                  {describeDevice(session.userAgent)}
                  {session.current && <span className="ml-2 text-sm font-normal text-success">Este dispositivo</span>}
                </p>
                <p className="truncate text-sm text-muted">
                  Último uso {dateTime.format(session.lastUsedAt)}
                  {session.ip ? ` · IP ${session.ip}` : ""}
                </p>
              </div>
              {!session.current && (
                <form action={closeSession}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button type="submit" className="text-[15px] text-danger">Cerrar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Actividad reciente</h2>
        <p className="text-sm text-muted">Si ves algo que no hiciste, cambiá la contraseña y avisá en la escuela.</p>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {activity.length === 0 && <li className="px-5 py-3 text-sm text-muted">Sin actividad registrada.</li>}
          {activity.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <p className="text-[15px]">{entry.summary}</p>
              <p className="text-sm text-muted">
                {dateTime.format(entry.createdAt)}
                {entry.ip ? ` · IP ${entry.ip}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
