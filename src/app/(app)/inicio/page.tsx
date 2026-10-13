import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { courseLabel, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("es-AR", { hour: "numeric", hour12: false, timeZone: "America/Argentina/Mendoza" }).format(
      new Date(),
    ),
  );
  if (hour < 12) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function InicioPage() {
  const user = await requireUser();
  const year = await db.academicYear.findFirst({ where: { active: true } });
  const is = (roles: Role[]) => hasAnyRole(user, roles);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {user.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {year ? `Ciclo lectivo ${year.year}` : "No hay un ciclo lectivo activo"}
        </p>
      </header>

      {year && is(STAFF_ROLES) && <SchoolOverview yearId={year.id} />}
      {year && is(["PRECEPTOR"]) && <PreceptorCourses userId={user.id} yearId={year.id} />}
      {year && is(["DOCENTE"]) && <TeacherAssignments userId={user.id} yearId={year.id} />}
      {year && is(["TUTOR"]) && <GuardianChildren userId={user.id} yearId={year.id} />}
      {year && is(["ALUMNO"]) && <StudentCourse userId={user.id} yearId={year.id} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <Card className="text-sm text-muted">{children}</Card>;
}

async function SchoolOverview({ yearId }: { yearId: string }) {
  const [students, teachers, courses] = await Promise.all([
    db.enrollment.count({ where: { status: "ACTIVA", course: { academicYearId: yearId } } }),
    db.user.count({ where: { active: true, roles: { has: "DOCENTE" } } }),
    db.course.count({ where: { academicYearId: yearId } }),
  ]);

  const stats = [
    { label: "Alumnos matriculados", value: students },
    { label: "Docentes", value: teachers },
    { label: "Cursos", value: courses },
  ];

  return (
    <Section title="La escuela">
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-3xl font-semibold tabular-nums">{stat.value}</p>
            <CardDescription className="mt-1">{stat.label}</CardDescription>
          </Card>
        ))}
      </div>
    </Section>
  );
}

async function PreceptorCourses({ userId, yearId }: { userId: string; yearId: string }) {
  const courses = await db.course.findMany({
    where: { preceptorId: userId, academicYearId: yearId },
    include: { _count: { select: { enrollments: { where: { status: "ACTIVA" } } } } },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });

  return (
    <Section title="Mis cursos como preceptor">
      {courses.length === 0 ? (
        <EmptyState>No tenés cursos asignados este ciclo.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id}>
              <CardTitle>{courseLabel(course)}</CardTitle>
              <CardDescription>{course._count.enrollments} alumnos</CardDescription>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}

async function TeacherAssignments({ userId, yearId }: { userId: string; yearId: string }) {
  const assignments = await db.courseSubject.findMany({
    where: { teacherId: userId, course: { academicYearId: yearId } },
    include: {
      subject: true,
      course: { include: { _count: { select: { enrollments: { where: { status: "ACTIVA" } } } } } },
    },
    orderBy: [{ course: { grade: "asc" } }, { course: { division: "asc" } }],
  });

  return (
    <Section title="Mis materias">
      {assignments.length === 0 ? (
        <EmptyState>No tenés materias asignadas este ciclo.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((assignment) => (
            <Card key={assignment.id}>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{assignment.subject.name}</CardTitle>
                <Badge tone="primary">{courseLabel(assignment.course)}</Badge>
              </div>
              <CardDescription className="mt-1">{assignment.course._count.enrollments} alumnos</CardDescription>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}

async function GuardianChildren({ userId, yearId }: { userId: string; yearId: string }) {
  const links = await db.studentGuardian.findMany({
    where: { guardianId: userId },
    include: {
      student: {
        include: {
          user: true,
          enrollments: { where: { course: { academicYearId: yearId } }, include: { course: true } },
        },
      },
    },
  });

  return (
    <Section title="Mis hijos">
      {links.length === 0 ? (
        <EmptyState>No hay alumnos vinculados a tu cuenta. Consultá en preceptoría.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map(({ student }) => {
            const enrollment = student.enrollments[0];
            return (
              <Card key={student.id}>
                <CardTitle>{fullName(student.user)}</CardTitle>
                <CardDescription className="mt-1">
                  {enrollment ? `${courseLabel(enrollment.course)} · Legajo ${student.fileNumber}` : "Sin matrícula este ciclo"}
                </CardDescription>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

async function StudentCourse({ userId, yearId }: { userId: string; yearId: string }) {
  const enrollment = await db.enrollment.findFirst({
    where: { student: { userId }, course: { academicYearId: yearId } },
    include: {
      course: {
        include: {
          preceptor: true,
          subjects: { include: { subject: true, teacher: true }, orderBy: { subject: { name: "asc" } } },
        },
      },
    },
  });

  if (!enrollment) {
    return (
      <Section title="Mi curso">
        <EmptyState>No estás matriculado en ningún curso este ciclo.</EmptyState>
      </Section>
    );
  }

  const { course } = enrollment;
  return (
    <Section title={`Mi curso · ${courseLabel(course)}`}>
      {course.preceptor && (
        <p className="text-sm text-muted">
          Preceptor/a: <span className="text-foreground">{fullName(course.preceptor)}</span>
        </p>
      )}
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {course.subjects.map(({ id, subject, teacher }) => (
            <li key={id} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="font-medium">{subject.name}</span>
              <span className="text-right text-sm text-muted">{teacher ? fullName(teacher) : "Sin docente asignado"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}
