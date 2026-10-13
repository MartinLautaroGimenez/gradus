import "server-only";
import type { Role } from "@prisma/client";
import { hasAnyRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { type AttendanceSettings, type AttendanceTotals, DEFAULT_ATTENDANCE_SETTINGS, attendanceTotals } from "./attendance";

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const school = await db.school.findFirst();
  if (!school) return DEFAULT_ATTENDANCE_SETTINGS;
  return {
    maxAbsences: school.maxAbsences,
    lateValue: Number(school.lateValue),
    earlyLeaveValue: Number(school.earlyLeaveValue),
    justifiedCount: school.justifiedCount,
  };
}

type Actor = { id: string; roles: Role[] };

/** Toman lista: el preceptor del curso y el personal de conducción y administración. */
export function canTakeAttendance(actor: Actor, course: { preceptorId: string | null }) {
  return course.preceptorId === actor.id || hasAnyRole(actor, ["SUPERADMIN", "DIRECTIVO", "ADMINISTRATIVO"]);
}

/** Totales del ciclo por matrícula. */
export async function totalsByEnrollment(enrollmentIds: string[], settings: AttendanceSettings) {
  const records = await db.attendanceRecord.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    select: { enrollmentId: true, status: true, justified: true },
  });
  const totals = new Map<string, AttendanceTotals>();
  for (const id of enrollmentIds) {
    totals.set(id, attendanceTotals(records.filter((r) => r.enrollmentId === id), settings));
  }
  return totals;
}
