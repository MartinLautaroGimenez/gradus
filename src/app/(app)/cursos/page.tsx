import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { COURSE_VIEW_ROLES, MANAGE_ROLES } from "@/lib/auth/permissions";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { SHIFT_LABELS } from "@/lib/format";
import { courseLabel, fullName } from "@/lib/utils";
import { createCourse } from "./actions";
import { CourseForm } from "./course-form";

export const metadata: Metadata = { title: "Cursos" };

export default async function CursosPage({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  const user = await requireRole(COURSE_VIEW_ROLES);
  const canManage = hasAnyRole(user, MANAGE_ROLES);
  const { ciclo } = await searchParams;

  const years = await db.academicYear.findMany({ orderBy: { year: "desc" } });
  const year = years.find((y) => y.id === ciclo) ?? years.find((y) => y.active) ?? years[0];

  if (!year) {
    return (
      <div>
        <PageHeader title="Cursos" />
        <Card className="text-sm text-muted">
          Todavía no hay ciclos lectivos. Creá uno desde <Link href="/configuracion" className="text-primary underline">Configuración</Link>.
        </Card>
      </div>
    );
  }

  const [courses, preceptors] = await Promise.all([
    db.course.findMany({
      where: { academicYearId: year.id, ...(canManage ? {} : { preceptorId: user.id }) },
      include: {
        preceptor: true,
        _count: { select: { enrollments: { where: { status: "ACTIVA" } }, subjects: true } },
      },
      orderBy: [{ grade: "asc" }, { division: "asc" }],
    }),
    canManage
      ? db.user.findMany({
          where: { roles: { has: "PRECEPTOR" }, active: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      : [],
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cursos"
        description={
          <span className="flex flex-wrap items-center gap-2">
            Ciclo lectivo
            {years.map((y) => (
              <Link
                key={y.id}
                href={`/cursos?ciclo=${y.id}`}
                className={
                  y.id === year.id
                    ? "rounded-full bg-primary-soft px-2 py-0.5 font-medium text-primary"
                    : "rounded-full px-2 py-0.5 hover:bg-surface-muted"
                }
              >
                {y.year}
              </Link>
            ))}
          </span>
        }
      />

      {courses.length === 0 ? (
        <Card className="text-sm text-muted">
          {canManage ? "No hay cursos en este ciclo. Creá el primero abajo." : "No tenés cursos asignados en este ciclo."}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Link key={course.id} href={`/cursos/${course.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-xl">{courseLabel(course)}</CardTitle>
                  <span className="text-xs text-muted">{SHIFT_LABELS[course.shift]}</span>
                </div>
                <CardDescription className="mt-2">
                  {course._count.enrollments} alumnos · {course._count.subjects} materias
                </CardDescription>
                <CardDescription>
                  {course.preceptor ? `Preceptor/a: ${fullName(course.preceptor)}` : "Sin preceptor asignado"}
                </CardDescription>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {canManage && (
        <Card>
          <CardTitle className="mb-3">Nuevo curso en {year.year}</CardTitle>
          <CourseForm
            action={createCourse.bind(null, year.id)}
            preceptors={preceptors.map((p) => ({ id: p.id, name: fullName(p) }))}
            submitLabel="Crear curso"
          />
        </Card>
      )}
    </div>
  );
}
