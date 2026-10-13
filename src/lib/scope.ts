import "server-only";
import type { Role } from "@prisma/client";
import { STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { courseLabel } from "@/lib/utils";

type Actor = { id: string; roles: Role[] };

/**
 * Cursos del ciclo activo que una persona gestiona: todos para el personal;
 * los suyos para preceptores y docentes.
 */
export async function managedCourses(actor: Actor) {
  const staff = hasAnyRole(actor, STAFF_ROLES);
  if (!staff && !hasAnyRole(actor, ["PRECEPTOR", "DOCENTE"])) return [];
  return db.course.findMany({
    where: {
      academicYear: { active: true },
      ...(staff ? {} : { OR: [{ preceptorId: actor.id }, { subjects: { some: { teacherId: actor.id } } }] }),
    },
    orderBy: [{ grade: "asc" }, { division: "asc" }],
  });
}

export type ViewerCourse = { id: string; label: string; /** Para familias: de qué hijo es. */ who?: string };

/** Cursos que una persona ve: los que gestiona, el propio (alumno) y los de sus hijos (familia). */
export async function viewerCourses(actor: Actor): Promise<{ all: boolean; courses: ViewerCourse[] }> {
  const all = hasAnyRole(actor, STAFF_ROLES);
  const result = new Map<string, ViewerCourse>();
  for (const course of await managedCourses(actor)) result.set(course.id, { id: course.id, label: courseLabel(course) });

  const enrollments = await db.enrollment.findMany({
    where: {
      status: "ACTIVA",
      course: { academicYear: { active: true } },
      student: { OR: [{ userId: actor.id }, { guardians: { some: { guardianId: actor.id } } }] },
    },
    include: { course: true, student: { include: { user: { select: { id: true, firstName: true } } } } },
  });
  for (const e of enrollments) {
    const who = e.student.user.id === actor.id ? undefined : e.student.user.firstName;
    const existing = result.get(e.courseId);
    if (existing) {
      if (who) existing.who = existing.who ? `${existing.who}, ${who}` : who;
    } else {
      result.set(e.courseId, { id: e.courseId, label: courseLabel(e.course), who });
    }
  }
  return { all, courses: [...result.values()] };
}
