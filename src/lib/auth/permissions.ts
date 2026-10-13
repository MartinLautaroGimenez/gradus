import type { Role } from "@prisma/client";
import { STAFF_ROLES, hasAnyRole } from "./roles";

/** Configuración de la escuela y ciclos lectivos. */
export const CONFIG_ROLES: Role[] = ["SUPERADMIN", "DIRECTIVO"];
/** Alta y edición de personas, cursos y materias. */
export const MANAGE_ROLES: Role[] = STAFF_ROLES;
/** Ven cursos (el preceptor sólo los suyos). */
export const COURSE_VIEW_ROLES: Role[] = [...STAFF_ROLES, "PRECEPTOR"];

type Actor = { id: string; roles: Role[] };

/** Roles que una persona puede otorgar o quitar. */
export function assignableRoles(actor: Actor): Role[] {
  const all: Role[] = ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO", "PRECEPTOR", "DOCENTE", "TUTOR", "ALUMNO"];
  if (hasAnyRole(actor, ["SUPERADMIN"])) return all;
  if (hasAnyRole(actor, ["DIRECTIVO"])) return all.filter((role) => role !== "SUPERADMIN");
  return all.filter((role) => role !== "SUPERADMIN" && role !== "DIRECTIVO");
}

/** Sólo se puede editar a alguien si se le pueden otorgar todos sus roles. */
export function canManageUser(actor: Actor, target: { roles: Role[] }) {
  if (!hasAnyRole(actor, MANAGE_ROLES)) return false;
  const allowed = assignableRoles(actor);
  return target.roles.every((role) => allowed.includes(role));
}

export function canViewCourse(actor: Actor, course: { preceptorId: string | null }) {
  return hasAnyRole(actor, MANAGE_ROLES) || course.preceptorId === actor.id;
}
