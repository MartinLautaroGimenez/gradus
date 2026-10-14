"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALERT_LABELS, attendanceAlert, formatAbsences } from "@/lib/attendance";
import { canTakeAttendance, getAttendanceSettings, totalsByEnrollment } from "@/lib/attendance-server";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications/notify";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { parseDate } from "@/lib/validation";

const rowsSchema = z
  .array(
    z.object({
      enrollmentId: z.string(),
      status: z.enum(["PRESENTE", "AUSENTE", "TARDE", "RETIRO"]),
      justified: z.boolean(),
      note: z.string().trim().max(200).nullable(),
    }),
  )
  .max(200);

type Result = { ok: true } | { ok: false; error: string };

async function authorize(courseId: string, isoDate: string) {
  const user = await requireUser();
  const course = await db.course.findUnique({ where: { id: courseId }, include: { academicYear: true } });
  if (!course || !canTakeAttendance(user, course)) return { ok: false as const, error: "No tenés permiso para tomar lista en este curso" };
  const date = parseDate(isoDate);
  if (!date) return { ok: false as const, error: "Fecha inválida" };
  if (date < course.academicYear.startDate || date > course.academicYear.endDate) {
    return { ok: false as const, error: "La fecha está fuera del ciclo lectivo" };
  }
  return { ok: true as const, user, course, date };
}

export async function saveAttendance(
  courseId: string,
  isoDate: string,
  rawRows: z.input<typeof rowsSchema>,
): Promise<Result> {
  const auth = await authorize(courseId, isoDate);
  if (!auth.ok) return auth;
  const parsed = rowsSchema.safeParse(rawRows);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const valid = new Set(
    (
      await db.enrollment.findMany({
        where: { courseId, status: "ACTIVA", id: { in: parsed.data.map((r) => r.enrollmentId) } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  if (parsed.data.some((r) => !valid.has(r.enrollmentId))) {
    return { ok: false, error: "La lista cambió mientras la cargabas. Recargá la página." };
  }

  const settings = await getAttendanceSettings();
  const enrollmentIds = parsed.data.map((r) => r.enrollmentId);
  const [previous, totalsBefore] = await Promise.all([
    db.attendanceRecord.findMany({ where: { date: auth.date, enrollmentId: { in: enrollmentIds } } }),
    totalsByEnrollment(enrollmentIds, settings),
  ]);

  await db.$transaction(
    parsed.data.map((row) => {
      // Un presente no lleva justificación ni nota.
      const data = {
        status: row.status,
        justified: row.status === "PRESENTE" ? false : row.justified,
        note: row.status === "PRESENTE" ? null : row.note || null,
        recordedById: auth.user.id,
      };
      return db.attendanceRecord.upsert({
        where: { enrollmentId_date: { enrollmentId: row.enrollmentId, date: auth.date } },
        update: data,
        create: { enrollmentId: row.enrollmentId, date: auth.date, ...data },
      });
    }),
  );
  // Auditoría: sólo las correcciones de una lista ya tomada (la primera carga no).
  const corrected = parsed.data.flatMap((row) => {
    const old = previous.find((p) => p.enrollmentId === row.enrollmentId);
    if (!old) return [];
    const justified = row.status === "PRESENTE" ? false : row.justified;
    return old.status !== row.status || old.justified !== justified
      ? [{ enrollmentId: row.enrollmentId, before: { status: old.status, justified: old.justified }, after: { status: row.status, justified } }]
      : [];
  });
  await audit({
    actorId: auth.user.id,
    action: corrected.length ? "asistencia.corregir" : "asistencia.tomar",
    entity: "Course",
    entityId: courseId,
    summary: corrected.length
      ? `Corrigió la asistencia del ${isoDate} (${corrected.length} alumnos)`
      : `Tomó lista del ${isoDate} (${parsed.data.length} alumnos)`,
    details: corrected.length ? { date: isoDate, changes: corrected } : { date: isoDate },
  });
  await notifyFamilies(parsed.data, previous, totalsBefore, settings, isoDate);
  revalidatePath("/asistencia", "layout");
  return { ok: true };
}

/**
 * Avisa a las familias (y al alumno) cuando un alumno queda ausente ese día y
 * cuando cruza un umbral de inasistencias. Al corregir una lista ya tomada
 * no se repiten los avisos de quienes ya estaban ausentes.
 */
async function notifyFamilies(
  rows: z.infer<typeof rowsSchema>,
  previous: { enrollmentId: string; status: string }[],
  totalsBefore: Awaited<ReturnType<typeof totalsByEnrollment>>,
  settings: Awaited<ReturnType<typeof getAttendanceSettings>>,
  isoDate: string,
) {
  const enrollmentIds = rows.map((r) => r.enrollmentId);
  const totalsAfter = await totalsByEnrollment(enrollmentIds, settings);
  const people = await db.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: {
      id: true,
      student: { select: { userId: true, user: { select: { firstName: true } }, guardians: { select: { guardianId: true } } } },
    },
  });
  const day = new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });

  for (const person of people) {
    const row = rows.find((r) => r.enrollmentId === person.id)!;
    const guardians = person.student.guardians.map((g) => g.guardianId);
    const name = person.student.user.firstName;
    const wasAbsent = previous.some((p) => p.enrollmentId === person.id && p.status === "AUSENTE");
    if (row.status === "AUSENTE" && !wasAbsent) {
      await notify(guardians, {
        kind: "ASISTENCIA",
        title: `${name} estuvo ausente hoy (${day})`,
        body: row.justified ? "La inasistencia figura como justificada." : "Si corresponde, podés justificarla en preceptoría.",
        link: "/asistencia",
      });
    }
    const before = attendanceAlert(totalsBefore.get(person.id)!.total, settings.maxAbsences);
    const after = attendanceAlert(totalsAfter.get(person.id)!.total, settings.maxAbsences);
    const order = ["OK", "ATENCION", "CRITICO", "LIBRE"];
    if (order.indexOf(after) > order.indexOf(before)) {
      await notify([...guardians, person.student.userId], {
        kind: "ASISTENCIA",
        title: `Inasistencias de ${name}: ${ALERT_LABELS[after].toLowerCase()}`,
        body: `Lleva ${formatAbsences(totalsAfter.get(person.id)!.total)} de ${settings.maxAbsences} inasistencias permitidas.`,
        link: "/asistencia",
      });
    }
  }
}

/** Borra la lista de un día (por si se tomó en la fecha equivocada). */
export async function deleteAttendanceDay(courseId: string, isoDate: string): Promise<Result> {
  const auth = await authorize(courseId, isoDate);
  if (!auth.ok) return auth;
  const { count } = await db.attendanceRecord.deleteMany({ where: { date: auth.date, enrollment: { courseId } } });
  await audit({ actorId: auth.user.id, action: "asistencia.borrar_dia", entity: "Course", entityId: courseId, summary: `Borró la lista del ${isoDate} (${count} registros)` });
  revalidatePath("/asistencia", "layout");
  return { ok: true };
}
