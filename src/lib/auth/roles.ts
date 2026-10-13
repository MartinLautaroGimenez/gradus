import type { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Administrador del sistema",
  DIRECTIVO: "Directivo",
  ADMINISTRATIVO: "Administrativo",
  PRECEPTOR: "Preceptor",
  DOCENTE: "Docente",
  TUTOR: "Familia",
  ALUMNO: "Alumno",
};

/** Roles con acceso a la gestión de toda la escuela. */
export const STAFF_ROLES: Role[] = ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"];

export function hasAnyRole(user: { roles: Role[] }, roles: Role[]) {
  return user.roles.some((role) => roles.includes(role));
}
