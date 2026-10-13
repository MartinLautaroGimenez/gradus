import "server-only";
import type { Role } from "@prisma/client";
import { cache } from "react";
import { ROLE_LABELS, STAFF_ROLES, hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { courseLabel } from "@/lib/utils";

export type Contact = { id: string; firstName: string; lastName: string; details: string[] };

type Actor = { id: string; roles: Role[] };

/**
 * A quién le puede escribir cada persona:
 * - Dirección y administración: a cualquiera.
 * - Docentes y preceptores: al personal, a otros docentes y preceptores, y a
 *   los alumnos (y sus familias) de sus cursos.
 * - Familias: a los docentes y preceptores de sus hijos y a dirección/administración.
 * - Alumnos: a sus docentes y a su preceptor.
 * Nunca entre familias ni entre alumnos.
 */
export const contactsFor = cache(async (actor: Actor): Promise<Contact[]> => {
  const year = await db.academicYear.findFirst({ where: { active: true } });
  const contacts = new Map<string, Contact>();
  const add = (user: { id: string; firstName: string; lastName: string }, detail: string) => {
    if (user.id === actor.id) return;
    const existing = contacts.get(user.id);
    if (existing) {
      if (!existing.details.includes(detail)) existing.details.push(detail);
    } else {
      contacts.set(user.id, { id: user.id, firstName: user.firstName, lastName: user.lastName, details: [detail] });
    }
  };
  const roleDetail = (roles: Role[]) =>
    roles.filter((r) => r !== "SUPERADMIN").map((r) => ROLE_LABELS[r]).join(" · ") || ROLE_LABELS.SUPERADMIN;
  const select = { id: true, firstName: true, lastName: true, roles: true } as const;

  if (hasAnyRole(actor, STAFF_ROLES)) {
    const everyone = await db.user.findMany({ where: { active: true }, select });
    everyone.forEach((u) => add(u, roleDetail(u.roles)));
    return sortContacts(contacts);
  }

  const isStaffLike = hasAnyRole(actor, ["DOCENTE", "PRECEPTOR"]);
  if (isStaffLike) {
    const colleagues = await db.user.findMany({
      where: { active: true, roles: { hasSome: ["DIRECTIVO", "ADMINISTRATIVO", "DOCENTE", "PRECEPTOR"] } },
      select,
    });
    colleagues.forEach((u) => add(u, roleDetail(u.roles.filter((r) => r !== "TUTOR" && r !== "ALUMNO"))));
  }

  if (year && isStaffLike) {
    const courses = await db.course.findMany({
      where: { academicYearId: year.id, OR: [{ preceptorId: actor.id }, { subjects: { some: { teacherId: actor.id } } }] },
      include: {
        enrollments: {
          where: { status: "ACTIVA" },
          include: {
            student: {
              include: {
                user: { select },
                guardians: { where: { guardian: { active: true } }, include: { guardian: { select } } },
              },
            },
          },
        },
      },
    });
    for (const course of courses) {
      for (const { student } of course.enrollments) {
        if (student.user) add(student.user, `Alumno de ${courseLabel(course)}`);
        for (const g of student.guardians) add(g.guardian, `Familia de ${student.user.firstName} (${courseLabel(course)})`);
      }
    }
  }

  // Familias y alumnos: docentes y preceptores del curso, y la conducción (sólo familias).
  const childLinks = hasAnyRole(actor, ["TUTOR"])
    ? await db.studentGuardian.findMany({ where: { guardianId: actor.id }, select: { studentId: true, student: { select: { user: { select: { firstName: true } } } } } })
    : [];
  const ownStudent = hasAnyRole(actor, ["ALUMNO"]) ? await db.student.findUnique({ where: { userId: actor.id } }) : null;
  const studentIds = [...childLinks.map((l) => l.studentId), ...(ownStudent ? [ownStudent.id] : [])];
  if (year && studentIds.length) {
    const enrollments = await db.enrollment.findMany({
      where: { studentId: { in: studentIds }, status: "ACTIVA", course: { academicYearId: year.id } },
      include: {
        student: { include: { user: { select: { firstName: true } } } },
        course: {
          include: {
            preceptor: { select },
            subjects: { where: { teacher: { active: true } }, include: { subject: true, teacher: { select } } },
          },
        },
      },
    });
    for (const { course, student } of enrollments) {
      const forWhom = student.id === ownStudent?.id ? courseLabel(course) : `${student.user.firstName}, ${courseLabel(course)}`;
      if (course.preceptor) add(course.preceptor, `Preceptor/a (${forWhom})`);
      for (const cs of course.subjects) if (cs.teacher) add(cs.teacher, `${cs.subject.name} (${forWhom})`);
    }
  }
  if (childLinks.length) {
    const management = await db.user.findMany({ where: { active: true, roles: { hasSome: ["DIRECTIVO", "ADMINISTRATIVO"] } }, select });
    management.forEach((u) => add(u, roleDetail(u.roles.filter((r) => r === "DIRECTIVO" || r === "ADMINISTRATIVO"))));
  }

  return sortContacts(contacts);
});

function sortContacts(contacts: Map<string, Contact>) {
  return [...contacts.values()].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "es"));
}

export async function canMessage(actor: Actor, recipientId: string) {
  return (await contactsFor(actor)).some((c) => c.id === recipientId);
}

/** Mensajes sin leer de la persona en todas sus conversaciones. */
export async function unreadMessageCount(userId: string) {
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM "Message" m
    JOIN "ConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."senderId" IS DISTINCT FROM ${userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")`;
  return Number(rows[0]?.count ?? 0);
}
