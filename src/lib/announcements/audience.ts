import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";

/** Destinatarios posibles de un comunicado, en el orden en que se muestran. */
export const AUDIENCE_ROLES: Role[] = ["TUTOR", "ALUMNO", "DOCENTE", "PRECEPTOR", "ADMINISTRATIVO", "DIRECTIVO"];

export const AUDIENCE_LABELS: Partial<Record<Role, string>> = {
  TUTOR: "Familias",
  ALUMNO: "Alumnos",
  DOCENTE: "Docentes",
  PRECEPTOR: "Preceptores",
  ADMINISTRATIVO: "Administración",
  DIRECTIVO: "Directivos",
};

type Actor = { id: string; roles: Role[] };

/**
 * Qué puede enviar cada uno:
 * - Dirección y administración: a cualquiera, toda la escuela o por curso.
 * - Preceptores: a familias y alumnos de sus cursos.
 * - Docentes: a familias y alumnos de los cursos donde dan clase.
 */
export async function sendingScope(actor: Actor) {
  const year = await db.academicYear.findFirst({ where: { active: true } });
  if (!year) return null;
  const staff = hasAnyRole(actor, STAFF_ROLES);
  if (!staff && !hasAnyRole(actor, ["PRECEPTOR", "DOCENTE"])) return null;

  const courses = await db.course.findMany({
    where: {
      academicYearId: year.id,
      ...(staff ? {} : { OR: [{ preceptorId: actor.id }, { subjects: { some: { teacherId: actor.id } } }] }),
    },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });
  return {
    yearId: year.id,
    staff,
    courses,
    roles: staff ? AUDIENCE_ROLES : (["TUTOR", "ALUMNO"] as Role[]),
    /** Sólo el personal puede enviar a toda la escuela. */
    canSendSchoolWide: staff,
  };
}

/** Calcula los usuarios destinatarios. Sin cursos = toda la escuela. */
export async function resolveRecipients({
  roles,
  courseIds,
  yearId,
}: {
  roles: Role[];
  courseIds: string[];
  yearId: string;
}) {
  const courseFilter: Prisma.CourseWhereInput = courseIds.length
    ? { id: { in: courseIds } }
    : { academicYearId: yearId };
  const activeEnrollment: Prisma.EnrollmentWhereInput = { status: "ACTIVA", course: courseFilter };
  const ids = new Set<string>();
  const add = (users: { id: string }[]) => users.forEach((u) => ids.add(u.id));

  if (roles.includes("ALUMNO")) {
    add(await db.user.findMany({ where: { active: true, studentProfile: { enrollments: { some: activeEnrollment } } }, select: { id: true } }));
  }
  if (roles.includes("TUTOR")) {
    add(
      await db.user.findMany({
        where: { active: true, guardianOf: { some: { student: { enrollments: { some: activeEnrollment } } } } },
        select: { id: true },
      }),
    );
  }
  if (roles.includes("DOCENTE")) {
    add(
      await db.user.findMany({
        where: courseIds.length
          ? { active: true, teachingAssignments: { some: { course: courseFilter } } }
          : { active: true, roles: { has: "DOCENTE" } },
        select: { id: true },
      }),
    );
  }
  if (roles.includes("PRECEPTOR")) {
    add(
      await db.user.findMany({
        where: courseIds.length
          ? { active: true, preceptorOfCourses: { some: courseFilter } }
          : { active: true, roles: { has: "PRECEPTOR" } },
        select: { id: true },
      }),
    );
  }
  for (const role of ["ADMINISTRATIVO", "DIRECTIVO"] as Role[]) {
    if (roles.includes(role)) add(await db.user.findMany({ where: { active: true, roles: { has: role } }, select: { id: true } }));
  }
  return [...ids];
}

/** Ver el seguimiento, recordar y borrar: quien lo escribió o el personal. */
export function canManageAnnouncement(user: Actor, authorId: string | null) {
  return authorId === user.id || hasAnyRole(user, STAFF_ROLES);
}
