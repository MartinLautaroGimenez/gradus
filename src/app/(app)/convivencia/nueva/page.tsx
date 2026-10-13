import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { todayInMendoza } from "@/lib/attendance";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { allowedKinds } from "@/lib/discipline";
import { cn, courseLabel, fullName } from "@/lib/utils";
import { IncidentForm } from "./incident-form";

export const metadata: Metadata = { title: "Registrar en convivencia" };

export default async function NuevaPage({ searchParams }: { searchParams: Promise<{ curso?: string; alumno?: string }> }) {
  const user = await requireUser();
  const { curso, alumno } = await searchParams;
  const director = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]);
  const courses = await db.course.findMany({
    where: {
      academicYear: { active: true },
      ...(director ? {} : { OR: [{ preceptorId: user.id }, { subjects: { some: { teacherId: user.id } } }] }),
    },
    include: {
      subjects: { select: { teacherId: true } },
      enrollments: { where: { status: "ACTIVA" }, include: { student: { include: { user: true } } }, orderBy: { listNumber: "asc" } },
    },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });
  if (courses.length === 0) redirect("/convivencia");
  const course = courses.find((c) => c.id === curso) ?? (courses.length === 1 ? courses[0] : null);
  const kinds = course
    ? allowedKinds(user, { preceptorId: course.preceptorId, teacherIds: course.subjects.flatMap((s) => (s.teacherId ? [s.teacherId] : [])) })
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Registrar en convivencia" back={{ href: "/convivencia", label: "Convivencia" }} />
      <nav className="flex flex-wrap gap-2" aria-label="Curso">
        {courses.map((c) => (
          <Link
            key={c.id}
            href={`/convivencia/nueva?curso=${c.id}`}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              c.id === course?.id ? "bg-primary font-medium text-primary-foreground" : "border border-border bg-surface hover:bg-surface-muted",
            )}
          >
            {courseLabel(c)}
          </Link>
        ))}
      </nav>
      {!course ? (
        <Card className="text-sm text-muted">Elegí el curso.</Card>
      ) : (
        <Card>
          <IncidentForm
            key={course.id}
            students={course.enrollments.map((e) => ({ enrollmentId: e.id, name: fullName(e.student.user) }))}
            kinds={kinds}
            today={todayInMendoza()}
            preselected={course.enrollments.find((e) => e.id === alumno)?.id}
          />
        </Card>
      )}
    </div>
  );
}
