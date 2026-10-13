import type { Role } from "@prisma/client";
import { hasAnyRole } from "@/lib/auth/roles";

type Actor = { id: string; roles: Role[] };
type Sheet = { teacherId: string | null; course: { preceptorId: string | null } };

/** Pueden cargar notas: el docente de la materia y la dirección (para correcciones). */
export function canEditGrades(actor: Actor, sheet: Sheet) {
  return sheet.teacherId === actor.id || hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO"]);
}

/** Pueden ver la planilla completa del curso: además, administración y el preceptor del curso. */
export function canViewGrades(actor: Actor, sheet: Sheet) {
  return (
    canEditGrades(actor, sheet) ||
    hasAnyRole(actor, ["ADMINISTRATIVO"]) ||
    sheet.course.preceptorId === actor.id
  );
}
