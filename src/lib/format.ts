import type { EnrollmentStatus, GuardianRelationship, Shift } from "@prisma/client";

export const SHIFT_LABELS: Record<Shift, string> = {
  MANANA: "Mañana",
  TARDE: "Tarde",
  VESPERTINO: "Vespertino",
  NOCHE: "Noche",
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  ACTIVA: "Activa",
  PASE: "Pase",
  BAJA: "Baja",
  EGRESADO: "Egresado",
};

export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  MADRE: "Madre",
  PADRE: "Padre",
  TUTOR_LEGAL: "Tutor legal",
  OTRO: "Otro",
};

/** Fecha guardada como @db.Date → "dd/mm/aaaa". Se formatea en UTC para no correrse un día. */
export function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return value.toLocaleDateString("es-AR", { timeZone: "UTC" });
}

/** Fecha → valor para <input type="date"> (aaaa-mm-dd). */
export function toDateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** 40123456 → "40.123.456" */
export function formatDni(dni: string) {
  return dni.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
