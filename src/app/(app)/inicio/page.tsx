import type { Metadata } from "next";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { addDays, attendanceAlert, ALERT_LABELS, formatAbsences, todayInMendoza } from "@/lib/attendance";
import { getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { EVENT_LABELS, EVENT_STYLE } from "@/lib/calendar";
import { loadCalendarItems } from "@/lib/calendar-server";
import { viewerCourses } from "@/lib/scope";
import { cn, courseLabel, fullName } from "@/lib/utils";

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

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ contrasena?: string }> }) {
  const user = await requireUser();
  const { contrasena } = await searchParams;
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

      {contrasena && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Listo, tu contraseña se actualizó.
        </p>
      )}

      <Pending userId={user.id} />
      {year && <UpcomingEvents user={user} />}
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

/** Lo que la persona tiene que hacer: notificarse, firmar, responder. */
async function Pending({ userId }: { userId: string }) {
  const today = todayInMendoza();
  const [announcements, incidents, children] = await Promise.all([
    db.announcementRecipient.findMany({
      where: { userId, acknowledgedAt: null, announcement: { requiresAck: true } },
      include: { announcement: { select: { id: true, title: true } } },
    }),
    db.incident.findMany({
      where: {
        requiresSignature: true,
        enrollment: { student: { guardians: { some: { guardianId: userId } } } },
        signatures: { none: { userId } },
      },
      include: { enrollment: { include: { student: { include: { user: true } } } } },
    }),
    db.enrollment.findMany({
      where: { status: "ACTIVA", course: { academicYear: { active: true } }, student: { guardians: { some: { guardianId: userId } } } },
      select: { id: true, courseId: true },
    }),
  ]);
  const authorizations = children.length
    ? await db.authorizationRequest.findMany({
        where: {
          courses: { some: { courseId: { in: children.map((c) => c.courseId) } } },
          OR: [{ deadline: null }, { deadline: { gte: new Date(`${today}T00:00:00Z`) } }],
        },
        include: { courses: true, responses: { where: { enrollmentId: { in: children.map((c) => c.id) } } } },
      })
    : [];
  const unanswered = authorizations.filter((a) =>
    children.some((c) => a.courses.some((ac) => ac.courseId === c.courseId) && !a.responses.some((r) => r.enrollmentId === c.id)),
  );

  const items = [
    ...announcements.map((a) => ({ href: `/comunicados/${a.announcement.id}`, text: `Notificarte: ${a.announcement.title}` })),
    ...incidents.map((i) => ({ href: `/convivencia/${i.id}`, text: `Firmar: registro de convivencia de ${i.enrollment.student.user.firstName}` })),
    ...unanswered.map((a) => ({ href: `/autorizaciones/${a.id}`, text: `Responder autorización: ${a.title}` })),
  ];
  if (items.length === 0) return null;
  return (
    <Section title="Pendientes">
      <Card className="border-warning/40 p-0">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-muted">
                <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/** Eventos y evaluaciones de las próximas dos semanas. */
async function UpcomingEvents({ user }: { user: { id: string; roles: Role[] } }) {
  const today = todayInMendoza();
  const viewer = await viewerCourses(user);
  const items = await loadCalendarItems({
    courseIds: viewer.all ? null : viewer.courses.map((c) => c.id),
    from: today,
    to: addDays(today, 14),
  });
  if (items.length === 0) return null;
  return (
    <Section title="Próximos 14 días">
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-muted">
                <span className="w-20 shrink-0 text-muted first-letter:uppercase">
                  {new Date(`${item.start}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </span>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", EVENT_STYLE[item.kind])}>
                  {EVENT_LABELS[item.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="hidden shrink-0 text-xs text-muted sm:inline">{item.courses.join(", ") || "Toda la escuela"}</span>
              </Link>
            </li>
          ))}
        </ul>
        {items.length > 8 && (
          <Link href="/calendario" className="block border-t border-border px-5 py-2 text-sm text-primary hover:underline">
            Ver calendario ({items.length - 8} más)
          </Link>
        )}
      </Card>
    </Section>
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
            <Link key={assignment.id} href={`/notas/${assignment.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{assignment.subject.name}</CardTitle>
                  <Badge tone="primary">{courseLabel(assignment.course)}</Badge>
                </div>
                <CardDescription className="mt-1">
                  {assignment.course._count.enrollments} alumnos · Abrir planilla de notas
                </CardDescription>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

async function GuardianChildren({ userId, yearId }: { userId: string; yearId: string }) {
  const settings = await getAttendanceSettings();
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

  const totals = await totalsByEnrollment(
    links.flatMap((l) => l.student.enrollments.map((e) => e.id)),
    settings,
  );

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
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{fullName(student.user)}</CardTitle>
                  <Link href={`/notas?alumno=${student.id}`} className="text-sm font-medium text-primary hover:underline">
                    Ver notas
                  </Link>
                </div>
                <CardDescription className="mt-1">
                  {enrollment ? `${courseLabel(enrollment.course)} · Legajo ${student.fileNumber}` : "Sin matrícula este ciclo"}
                </CardDescription>
                {enrollment && (
                  <Link href={`/asistencia?alumno=${student.id}`} className="mt-2 flex items-center gap-2 text-sm hover:underline">
                    {formatAbsences(totals.get(enrollment.id)!.total)} / {settings.maxAbsences} inasistencias
                    {attendanceAlert(totals.get(enrollment.id)!.total, settings.maxAbsences) !== "OK" && (
                      <Badge tone="warning">{ALERT_LABELS[attendanceAlert(totals.get(enrollment.id)!.total, settings.maxAbsences)]}</Badge>
                    )}
                  </Link>
                )}
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
      <p className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        {course.preceptor && (
          <span>
            Preceptor/a: <span className="text-foreground">{fullName(course.preceptor)}</span>
          </span>
        )}
        <Link href="/notas" className="font-medium text-primary hover:underline">
          Ver mis notas
        </Link>
      </p>
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
