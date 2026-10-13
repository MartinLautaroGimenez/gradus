import type { Metadata } from "next";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { SummaryStats } from "@/components/students/summary-stats";
import { Card } from "@/components/ui/card";
import { addDays, formatAbsences, todayInMendoza } from "@/lib/attendance";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { EVENT_LABELS } from "@/lib/calendar";
import { loadCalendarItems } from "@/lib/calendar-server";
import { db } from "@/lib/db";
import { formatGrade } from "@/lib/grades";
import { isAtRisk, loadSchoolReport } from "@/lib/reports";
import { managedCourses, viewerCourses } from "@/lib/scope";
import { studentSummaries } from "@/lib/student-summary";
import { courseLabel, fullName, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("es-AR", { hour: "numeric", hour12: false, timeZone: "America/Argentina/Mendoza" }).format(new Date()),
  );
  if (hour < 12) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function todayLabel() {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Mendoza",
  });
}

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ contrasena?: string }> }) {
  const user = await requireUser();
  const { contrasena } = await searchParams;
  const year = await db.academicYear.findFirst({ where: { active: true } });
  const is = (roles: Role[]) => hasAnyRole(user, roles);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[13px] font-medium text-muted first-letter:uppercase">{todayLabel()}</p>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">
          {greeting()}, {user.firstName}
        </h1>
      </header>

      {contrasena && (
        <p role="status" className="rounded-2xl bg-success-soft px-4 py-3 text-[15px] text-success">
          Listo, tu contraseña se actualizó.
        </p>
      )}

      {!year && <Card className="text-[15px] text-muted">Todavía no hay un ciclo lectivo activo.</Card>}

      <Pending userId={user.id} />
      {year && is(["TUTOR"]) && <Children userId={user.id} yearId={year.id} />}
      {year && is(["ALUMNO"]) && <OwnSummary userId={user.id} yearId={year.id} />}
      {year && <Upcoming user={user} />}
      {year && is(["SUPERADMIN", "DIRECTIVO", "PRECEPTOR"]) && <StudentsToWatch user={user} />}
      {year && is(STAFF_ROLES) && <SchoolOverview yearId={year.id} />}
      {year && is(["PRECEPTOR"]) && <PreceptorCourses userId={user.id} yearId={year.id} />}
      {year && is(["DOCENTE"]) && <TeacherAssignments userId={user.id} yearId={year.id} />}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Lista agrupada con flecha, como en Ajustes de iOS. */
function RowList({ rows }: { rows: { href: string; title: React.ReactNode; subtitle?: React.ReactNode; trailing?: React.ReactNode }[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.href}>
            <Link href={row.href} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/60">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{row.title}</span>
                {row.subtitle && <span className="block truncate text-[13px] text-muted">{row.subtitle}</span>}
              </span>
              {row.trailing && <span className="shrink-0 text-[14px] text-muted">{row.trailing}</span>}
              <ChevronRight className="size-4 shrink-0 text-muted/70" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
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

  const rows = [
    ...announcements.map((a) => ({ href: `/comunicados/${a.announcement.id}`, title: a.announcement.title, subtitle: "Confirmá que lo leíste" })),
    ...incidents.map((i) => ({
      href: `/convivencia/${i.id}`,
      title: `Registro de convivencia de ${i.enrollment.student.user.firstName}`,
      subtitle: "Falta tu firma",
    })),
    ...unanswered.map((a) => ({ href: `/autorizaciones/${a.id}`, title: a.title, subtitle: "Autorización sin responder" })),
  ];
  if (rows.length === 0) return null;
  return (
    <Section title="Para hacer">
      <RowList rows={rows} />
    </Section>
  );
}

/** Una tarjeta por hijo con lo esencial y acceso directo a notas y asistencia. */
async function Children({ userId, yearId }: { userId: string; yearId: string }) {
  const links = await db.studentGuardian.findMany({
    where: { guardianId: userId },
    include: {
      student: {
        include: {
          user: true,
          enrollments: { where: { status: "ACTIVA", course: { academicYearId: yearId } }, include: { course: true } },
        },
      },
    },
    orderBy: { student: { user: { firstName: "asc" } } },
  });
  if (links.length === 0) {
    return (
      <Section title="Tus hijos">
        <Card className="text-[15px] text-muted">No hay alumnos vinculados a tu cuenta. Consultá en preceptoría.</Card>
      </Section>
    );
  }
  const summaries = await studentSummaries(links.flatMap((l) => l.student.enrollments.map((e) => e.id)));

  return (
    <Section title={links.length === 1 ? "Tu hijo" : "Tus hijos"}>
      <div className="grid gap-4 lg:grid-cols-2">
        {links.map(({ student }) => {
          const enrollment = student.enrollments[0];
          const summary = enrollment ? summaries.get(enrollment.id) : undefined;
          return (
            <Card key={student.id} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-[15px] font-semibold text-primary">
                  {initials(student.user)}
                </span>
                <div>
                  <p className="text-[17px] font-semibold tracking-tight">
                    {student.user.firstName} {student.user.lastName}
                  </p>
                  <p className="text-[13px] text-muted">{enrollment ? courseLabel(enrollment.course) : "Sin matrícula este ciclo"}</p>
                </div>
              </div>
              {summary && <SummaryStats summary={summary} compact />}
              <div className="flex gap-2">
                <Link href={`/notas?alumno=${student.id}`} className="flex-1 rounded-full bg-surface-muted py-2.5 text-center text-[15px] font-medium text-primary">
                  Notas
                </Link>
                <Link
                  href={`/asistencia?alumno=${student.id}`}
                  className="flex-1 rounded-full bg-surface-muted py-2.5 text-center text-[15px] font-medium text-primary"
                >
                  Asistencia
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

async function OwnSummary({ userId, yearId }: { userId: string; yearId: string }) {
  const enrollment = await db.enrollment.findFirst({
    where: { student: { userId }, status: "ACTIVA", course: { academicYearId: yearId } },
    include: { course: { include: { preceptor: true } } },
  });
  if (!enrollment) return <Card className="text-[15px] text-muted">No estás matriculado en ningún curso este ciclo.</Card>;
  const summary = (await studentSummaries([enrollment.id])).get(enrollment.id)!;
  return (
    <Section
      title={`Tu curso · ${courseLabel(enrollment.course)}`}
      action={
        <Link href="/notas" className="text-[15px] text-primary">
          Ver notas
        </Link>
      }
    >
      <SummaryStats summary={summary} compact />
      {enrollment.course.preceptor && <p className="text-[13px] text-muted">Preceptor/a: {fullName(enrollment.course.preceptor)}</p>}
    </Section>
  );
}

/** Eventos y evaluaciones de las próximas dos semanas. */
async function Upcoming({ user }: { user: { id: string; roles: Role[] } }) {
  const today = todayInMendoza();
  const viewer = await viewerCourses(user);
  const items = await loadCalendarItems({
    courseIds: viewer.all ? null : viewer.courses.map((c) => c.id),
    from: today,
    to: addDays(today, 14),
  });
  if (items.length === 0) return null;
  return (
    <Section
      title="Próximos días"
      action={
        <Link href="/calendario" className="text-[15px] text-primary">
          Calendario
        </Link>
      }
    >
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {items.slice(0, 6).map((item) => {
            const date = new Date(`${item.start}T12:00:00Z`);
            return (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-muted/60">
                  <span className="w-10 shrink-0 text-center">
                    <span className="block text-[11px] font-medium text-danger uppercase">
                      {date.toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }).replace(".", "")}
                    </span>
                    <span className="block text-[20px] leading-none font-semibold">{date.getUTCDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{item.title}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {EVENT_LABELS[item.kind]}
                      {item.time && ` · ${item.time}`}
                      {item.courses.length ? ` · ${item.courses.join(", ")}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </Section>
  );
}

/** Alumnos en riesgo (muchas materias abajo o muchas faltas), con acceso a su ficha. */
async function StudentsToWatch({ user }: { user: { id: string; roles: Role[] } }) {
  const director = hasAnyRole(user, ["SUPERADMIN", "DIRECTIVO"]);
  const scope = director ? undefined : (await managedCourses(user)).filter((c) => c.preceptorId === user.id).map((c) => c.id);
  if (scope && scope.length === 0) return null;
  const report = await loadSchoolReport(scope);
  if (!report) return null;
  const risky = report.students
    .filter(isAtRisk)
    .sort((a, b) => b.failing.length - a.failing.length || b.absences - a.absences);
  if (risky.length === 0) return null;
  return (
    <Section
      title="Alumnos para seguir"
      action={
        <Link href="/reportes#riesgo" className="text-[15px] text-primary">
          Ver todos ({risky.length})
        </Link>
      }
    >
      <RowList
        rows={risky.slice(0, 5).map((s) => ({
          href: `/alumnos/${s.studentId}`,
          title: s.name,
          subtitle: [
            s.course,
            s.failing.length ? `${s.failing.length} materias abajo` : null,
            s.attendance !== "OK" ? `${formatAbsences(s.absences)} faltas` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          trailing: s.average === null ? "—" : formatGrade(s.average, report.decimals),
        }))}
      />
    </Section>
  );
}

async function SchoolOverview({ yearId }: { yearId: string }) {
  const [students, teachers, courses] = await Promise.all([
    db.enrollment.count({ where: { status: "ACTIVA", course: { academicYearId: yearId } } }),
    db.user.count({ where: { active: true, roles: { has: "DOCENTE" } } }),
    db.course.count({ where: { academicYearId: yearId } }),
  ]);
  const stats = [
    { label: "Alumnos", value: students, href: "/personas?rol=ALUMNO" },
    { label: "Docentes", value: teachers, href: "/personas?rol=DOCENTE" },
    { label: "Cursos", value: courses, href: "/cursos" },
  ];
  return (
    <Section
      title="La escuela"
      action={
        <Link href="/reportes" className="text-[15px] text-primary">
          Reportes
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="rounded-2xl bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted/60">
            <p className="text-[13px] text-muted">{stat.label}</p>
            <p className="text-[28px] font-semibold tracking-tight tabular-nums">{stat.value}</p>
          </Link>
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
  if (courses.length === 0) return null;
  return (
    <Section title="Tus cursos">
      <RowList
        rows={courses.map((course) => ({
          href: `/cursos/${course.id}`,
          title: courseLabel(course),
          trailing: `${course._count.enrollments} alumnos`,
        }))}
      />
    </Section>
  );
}

async function TeacherAssignments({ userId, yearId }: { userId: string; yearId: string }) {
  const assignments = await db.courseSubject.findMany({
    where: { teacherId: userId, course: { academicYearId: yearId } },
    include: { subject: true, course: true },
    orderBy: [{ course: { grade: "asc" } }, { course: { division: "asc" } }, { subject: { name: "asc" } }],
  });
  if (assignments.length === 0) return null;
  return (
    <Section title="Tus planillas">
      <RowList
        rows={assignments.map((a) => ({
          href: `/notas/${a.id}`,
          title: a.subject.name,
          trailing: courseLabel(a.course),
        }))}
      />
    </Section>
  );
}
