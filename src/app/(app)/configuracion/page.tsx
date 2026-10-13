import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { CONFIG_ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { NewYearForm } from "./new-year-form";
import { SchoolForm } from "./school-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  await requireRole(CONFIG_ROLES);
  const [school, years] = await Promise.all([
    db.school.findFirst(),
    db.academicYear.findMany({ orderBy: { year: "desc" }, include: { _count: { select: { courses: true } } } }),
  ]);
  const latest = years[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configuración" description="Datos de la escuela y ciclos lectivos" />

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Escuela</CardTitle>
          <CardDescription>Estos valores se usan en el cálculo de promedios y en las alertas de asistencia.</CardDescription>
        </div>
        <SchoolForm
          school={
            school
              ? {
                  ...school,
                  passingGrade: Number(school.passingGrade),
                  lateValue: Number(school.lateValue),
                  earlyLeaveValue: Number(school.earlyLeaveValue),
                }
              : null
          }
        />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ciclos lectivos</h2>
        {years.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Ciclo</Th>
                <Th>Inicio</Th>
                <Th>Fin</Th>
                <Th>Cursos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year.id}>
                  <Td className="font-medium">
                    {year.year} {year.active && <Badge tone="success">Activo</Badge>}
                  </Td>
                  <Td>{formatDate(year.startDate)}</Td>
                  <Td>{formatDate(year.endDate)}</Td>
                  <Td className="tabular-nums">{year._count.courses}</Td>
                  <Td className="text-right">
                    <Link href={`/configuracion/ciclos/${year.id}`} className="text-sm font-medium text-primary hover:underline">
                      Editar
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Card>
          <CardTitle className="mb-3">Nuevo ciclo lectivo</CardTitle>
          <NewYearForm
            suggestedYear={(latest?.year ?? new Date().getFullYear() - 1) + 1}
            copySource={latest ? { id: latest.id, year: latest.year } : undefined}
          />
        </Card>
      </section>
    </div>
  );
}
