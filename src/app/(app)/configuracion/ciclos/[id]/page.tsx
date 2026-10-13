import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { CONFIG_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { activateAcademicYear, updateAcademicYear, updatePeriod } from "../../actions";
import { PeriodForm, YearDatesForm } from "./year-forms";

export const metadata: Metadata = { title: "Ciclo lectivo" };

export default async function CicloPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(CONFIG_ROLES);
  const { id } = await params;
  const year = await db.academicYear.findUnique({
    where: { id },
    include: { periods: { orderBy: { order: "asc" } } },
  });
  if (!year) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Ciclo lectivo ${year.year}`}
        back={{ href: "/configuracion", label: "Configuración" }}
        actions={
          year.active ? (
            <Badge tone="success" className="h-8 px-3 text-sm">
              Ciclo activo
            </Badge>
          ) : (
            <form action={activateAcademicYear.bind(null, year.id)}>
              <SubmitButton
                pendingText="Activando…"
                confirm={`¿Activar el ciclo ${year.year}? Todas las pantallas pasan a mostrar este ciclo.`}
              >
                Marcar como activo
              </SubmitButton>
            </form>
          )
        }
      />

      <Card className="flex flex-col gap-4">
        <CardTitle>Fechas del ciclo</CardTitle>
        <YearDatesForm
          action={updateAcademicYear.bind(null, year.id)}
          startDate={toDateInput(year.startDate)}
          endDate={toDateInput(year.endDate)}
        />
      </Card>

      <Card>
        <CardTitle>Períodos</CardTitle>
        <CardDescription>
          Los períodos regulares cuentan para el promedio anual. Los compensatorios son las instancias de diciembre y
          febrero. Un período cerrado ya no admite cambios de notas.
        </CardDescription>
        <div className="mt-2">
          {year.periods.map((period) => (
            <PeriodForm
              key={period.id}
              action={updatePeriod.bind(null, period.id)}
              period={{
                id: period.id,
                name: period.name,
                kind: period.kind,
                startDate: toDateInput(period.startDate),
                endDate: toDateInput(period.endDate),
                closed: period.closed,
              }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
