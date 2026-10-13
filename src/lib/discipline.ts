import type { IncidentKind, Role } from "@prisma/client";
import { hasAnyRole } from "@/lib/auth/roles";

export const INCIDENT_LABELS: Record<IncidentKind, string> = {
  RECONOCIMIENTO: "Reconocimiento",
  OBSERVACION: "Observación",
  LLAMADO_ATENCION: "Llamado de atención",
  APERCIBIMIENTO: "Apercibimiento",
  ACTA: "Acta",
  SUSPENSION: "Suspensión",
};

export const INCIDENT_TONE: Record<IncidentKind, "success" | "neutral" | "warning" | "danger"> = {
  RECONOCIMIENTO: "success",
  OBSERVACION: "neutral",
  LLAMADO_ATENCION: "warning",
  APERCIBIMIENTO: "warning",
  ACTA: "danger",
  SUSPENSION: "danger",
};

/** Las sanciones piden la firma de la familia por defecto; observaciones y reconocimientos no. */
export function signatureByDefault(kind: IncidentKind) {
  return kind !== "OBSERVACION" && kind !== "RECONOCIMIENTO";
}

type Actor = { id: string; roles: Role[] };
type CourseRefs = { preceptorId: string | null; teacherIds: string[] };

/**
 * Qué puede registrar cada uno (según lo que definió la escuela, las sanciones
 * las aplican preceptores y directivos):
 * - Dirección: cualquier tipo, en cualquier curso.
 * - Preceptor del curso: cualquier tipo.
 * - Docente del curso: sólo observaciones y reconocimientos.
 */
export function allowedKinds(actor: Actor, course: CourseRefs): IncidentKind[] {
  const all = Object.keys(INCIDENT_LABELS) as IncidentKind[];
  if (hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO"]) || course.preceptorId === actor.id) return all;
  if (course.teacherIds.includes(actor.id)) return ["RECONOCIMIENTO", "OBSERVACION"];
  return [];
}

/** Ven el registro del curso: personal, preceptor y docentes del curso. */
export function canViewCourseIncidents(actor: Actor, course: CourseRefs) {
  return (
    hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]) ||
    course.preceptorId === actor.id ||
    course.teacherIds.includes(actor.id)
  );
}
